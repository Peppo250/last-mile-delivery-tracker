# System Design Write-Up — Last-Mile Delivery Tracker

## 1. Rate Calculation Engine

The rate engine (`services/rateEngine.ts`) is a pure, admin-driven pricing
function with no hardcoded business numbers. Given a package's
dimensions, actual weight, order type (B2B/B2C), payment type, and the
resolved pickup/drop zones, it computes:

1. **Volumetric weight** = `L × B × H ÷ 5000` — the fixed industry-standard
   divisor from the spec.
2. **Billable weight** = `max(actualWeight, volumetricWeight)`, so
   low-density-but-bulky packages are priced fairly.
3. **Zone relation** (`INTRA`/`INTER`) from comparing the pickup and drop
   zone IDs.
4. A **RateCard** lookup on the composite key `(orderType, zoneRelation)`
   — the admin maintains up to four rows (B2B/B2C × intra/inter), each
   with an independent `baseCharge` and `ratePerKg`. This directly
   satisfies "intra and inter-zone rates separately for B2B and B2C."
5. A **COD surcharge**, applied only when `paymentType = COD`, looked up
   per `orderType` as either a flat amount or a percentage of the
   freight charge — again fully admin-configurable via
   `CodSurchargeRule`.

The engine returns the full breakdown so the API can expose
`POST /orders/quote`, letting the frontend show the charge before the
customer confirms, without persisting anything. On actual order
creation, the same breakdown is computed once and **persisted** on the
`Order` row (base charge, weight charge, COD surcharge, total, billable
weight, zone relation). This is a deliberate design choice: it makes
historical orders immune to later rate-card edits, which matters for
billing correctness and dispute resolution — an admin retuning prices
next month must never retroactively change what a customer was already
charged.

Numeric correctness is protected with `Math.round(x * 100) / 100`
rounding at each stage to avoid floating-point drift compounding across
the base + weight + surcharge additions, and the engine throws a clear
`422` if no active rate card exists for a requested combination, rather
than silently defaulting to zero.

## 2. Zone Detection Approach

Free-text address parsing is unreliable and hard to audit, so zone
detection is deliberately **not** done by string-matching pickup/drop
addresses. Instead, the admin curates a catalog of `Area` records — each
a named locality with a pincode — and maps each one to exactly one
`Zone`. When placing an order, the customer (or admin) selects a
concrete pickup `Area` and drop `Area` from a dropdown (backed by
`GET /api/areas`), and the order stores `pickupAreaId`/`dropAreaId`
directly. Zone resolution is then a deterministic `O(1)` join —
`pickupArea.zoneId` vs `dropArea.zoneId` — with zero ambiguity. This also
makes zone administration self-service: the admin can add, remove, or
re-map any Area to a different Zone at any time from the Zones & Areas
config page, without touching code, and the effect is immediate on the
next quote/order.

The free-text `pickupAddress`/`dropAddress` fields are retained
separately purely for display and driver navigation — they play no role
in pricing or routing logic, keeping the two concerns cleanly separated.

## 3. Auto-Assignment Logic

`services/assignmentService.ts` treats every `AgentProfile` with
`isAvailable = true` as a candidate. Ranking follows a three-tier
fallback so that orders are never left unassignable when the fleet is
thin: prefer an agent whose registered home zone matches the order's
**drop** zone (the leg that actually needs a local courier); if none are
free, widen to the **pickup** zone; if still none, fall back to any
available agent system-wide. A haversine-distance ranking path is also
implemented and activates automatically once agents report live
`currentLat`/`currentLng` (the schema already carries these fields),
giving a clear upgrade path to true "nearest agent" assignment without
changing the calling code.

Agent capacity is modeled as a simple boolean rather than a counter — an
agent is either free or occupied with exactly one active delivery. This
keeps the concurrency story simple and auditable for a v1: assignment,
release-on-terminal-status, and manual override all just flip one field
inside a Prisma transaction alongside the order update and the audit-log
insert, so an agent can never end up double-booked or a status change
can never be recorded without updating availability atomically.

## 4. Failed Delivery Handling

Every status transition — including the terminal `FAILED` one — is
appended to `OrderStatusEvent`, an **immutable, insert-only** audit
table (the codebase never issues an `UPDATE` or `DELETE` against it),
so the full timeline is always reconstructable and tamper-evident
regardless of how many times an order is retried. On `FAILED`, the
assigned agent is automatically released back into the availability
pool, and the customer is emailed. The customer then calls
`POST /orders/:id/reschedule` with a new date and optional reason; this
inserts a `Reschedule` audit row (recording the previous and new date),
transitions the order to `RESCHEDULED`, and **explicitly clears
`assignedAgentId`**. Clearing the assignment is the key design decision:
it forces every rescheduled order back through the same manual/auto
assignment path used for brand-new orders, so a different (available)
agent can naturally be chosen for the retry, and the system can never
silently re-attempt with an agent who may no longer be free or nearby.
