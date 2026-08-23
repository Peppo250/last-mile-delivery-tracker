# Last-Mile Delivery Tracker

A full-stack delivery management platform: customers place orders with an
auto-calculated charge, admins configure zones/rate cards and assign
delivery agents (manually or automatically), agents update delivery
status, and customers get emailed at every step with a full tracking
timeline and a reschedule flow for failed deliveries.

Stack: **Node.js + Express + TypeScript + Prisma** (backend) and
**React + TypeScript + Vite** (frontend), with **SQLite** as the default
zero-config database (Postgres-ready — see below).

---

## 1. Project structure

```
last-mile-delivery-tracker/
├── backend/                 Express API + Prisma schema
│   ├── prisma/
│   │   ├── schema.prisma    Full data model (see section 4)
│   │   └── seed.ts          Demo admin/agents/customer/zones/rates
│   └── src/
│       ├── config/          env.ts, prisma.ts
│       ├── middleware/      auth.ts (JWT + role guard), errorHandler.ts
│       ├── routes/          authRoutes, adminRoutes, orderRoutes, catalogRoutes
│       ├── services/        rateEngine, zoneService, assignmentService,
│       │                    orderStatusService, notificationService
│       ├── utils/           jwt.ts, orderCode.ts
│       ├── app.ts, server.ts
│   └── .env.example
├── frontend/                 React + Vite SPA
│   └── src/
│       ├── api/              client.ts (fetch wrapper), types.ts
│       ├── context/          AuthContext.tsx
│       ├── components/       Navbar, ProtectedRoute, StatusPill
│       └── pages/             Login/Register, PlaceOrder, OrdersList,
│                               OrderDetail, AgentDashboard, AdminOrders,
│                               AdminConfig (zones/areas/rates/COD), AdminAgents
│   └── .env.example
└── SYSTEM_DESIGN.md          800-word design write-up
```

---

## 2. Local setup

### Prerequisites
- Node.js 18+ and npm
- Internet access on first run (Prisma downloads a small query-engine
  binary from `binaries.prisma.sh` during `prisma generate` — this is a
  one-time download, not needed again after that)

### Backend

```bash
cd backend
cp .env.example .env          # defaults work out of the box (SQLite, no SMTP)
npm install
npx prisma generate
npx prisma migrate dev --name init   # creates dev.db and applies the schema
npm run seed                  # loads demo zones/rate cards/admin/agents/customer
npm run dev                   # starts the API on http://localhost:4000
```

Seeded logins (see `prisma/seed.ts`):

| Role     | Email                  | Password      |
|----------|-------------------------|---------------|
| Admin    | admin@lmd.local          | Admin@123     |
| Agent    | ravi.agent@lmd.local     | Agent@123     |
| Agent    | priya.agent@lmd.local    | Agent@123     |
| Customer | customer@lmd.local       | Customer@123  |

### Frontend

```bash
cd frontend
cp .env.example .env          # points at http://localhost:4000/api by default
npm install
npm run dev                   # starts the SPA on http://localhost:5173
```

Open `http://localhost:5173`, log in with a seeded account, and:
- as **admin**, go to *Zones & Rates* to review the seeded zones/areas/rate
  cards, and *Agents* to see the seeded delivery agents;
- as **customer**, go to *Place Order* to get a live quote and confirm an
  order;
- as **admin**, open the order under *All Orders* and click **Auto-assign**;
- as **agent**, log in as `ravi.agent@lmd.local` and walk the order through
  Picked Up → In Transit → Out for Delivery → Delivered/Failed;
- if **Failed**, log back in as the customer and use the **Reschedule**
  panel on the order page, then re-assign as admin.

### Switching to PostgreSQL for deployment

1. In `backend/prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` in `.env` (or your host's env vars) to a Postgres
   connection string.
3. Run `npx prisma migrate deploy` (or `migrate dev` once locally to
   generate the migration) and `npm run seed` if you want demo data.

### Deploying

- **Backend**: Render / Railway (Node web service) — build command
  `npm install && npx prisma generate && npm run build`, start command
  `npm run prisma:deploy && npm start`. Set `DATABASE_URL` to a managed
  Postgres instance (Render/Railway both offer a free Postgres add-on),
  plus `JWT_SECRET`, `CORS_ORIGIN` (your frontend URL), and optionally
  `SMTP_*` for real emails.
- **Frontend**: Vercel / Netlify / Render static site — build command
  `npm run build`, publish directory `dist`, with `VITE_API_URL` set to
  the deployed backend's `/api` URL.

---

## 3. Rate calculation logic

Implemented in `backend/src/services/rateEngine.ts`, fully driven by
admin-configured database rows — nothing is hardcoded:

1. **Volumetric weight** = `(L × B × H) ÷ 5000` (cm, standard courier divisor).
2. **Billable weight** = `max(actualWeightKg, volumetricWeightKg)`.
3. **Zone detection**: the pickup and drop `Area` (a pre-registered
   locality/pincode) each resolve to a `Zone`. If both areas share a zone,
   the order is `INTRA`; otherwise `INTER`.
4. **Rate card lookup**: the admin maintains one `RateCard` row per
   `(orderType, zoneRelation)` pair — i.e. up to 4 rows (B2B/B2C ×
   intra/inter), each with a `baseCharge` and `ratePerKg`.
   `weightCharge = ratePerKg × billableWeight`; `freightCharge = baseCharge + weightCharge`.
5. **COD surcharge**: if `paymentType = COD`, the admin-configured
   `CodSurchargeRule` for that `orderType` is applied — either a flat
   rupee amount or a percentage of the freight charge.
6. **Total** = `freightCharge + codSurcharge`.

The full breakdown (`POST /api/orders/quote`) is returned to the customer
**before** they confirm the order, and the same numbers are persisted on
the `Order` row at creation time — so later rate-card edits never change
the price of an already-placed order.

## 4. Zone detection approach

Rather than parsing free-text addresses, every serviceable locality is
pre-registered by the admin as an `Area` (name + pincode) mapped to
exactly one `Zone`. The order stores `pickupAreaId`/`dropAreaId`
(selected from a dropdown), and the zone is looked up deterministically —
`O(1)`, fully admin-configurable, with no address-parsing ambiguity.

## 5. Auto-assignment logic

Implemented in `backend/src/services/assignmentService.ts`:

- Candidate pool = all `AgentProfile` rows with `isAvailable = true`.
- Ranking: prefer an agent whose home zone matches the **drop** zone;
  fall back to the **pickup** zone; fall back to any available agent (so
  orders never get stuck when the fleet is thin).
- If agents have live `currentLat`/`currentLng`, the same pool is
  re-ranked by haversine distance first — this is wired up and ready for
  when live GPS coordinates are fed in (e.g. via a mobile agent app).
- On assignment the agent is marked unavailable (single-order capacity
  model); they are freed automatically when the order reaches
  `DELIVERED` or `FAILED`.

## 6. Order status lifecycle & failed-delivery handling

`PLACED → ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`,
with `OUT_FOR_DELIVERY → FAILED → RESCHEDULED → ASSIGNED → …` as the retry
loop, and `CANCELLED` reachable early. Legal transitions are enforced by
an explicit map in `orderStatusService.ts`; **admin overrides bypass the
map entirely**, matching the requirement that admins can force any status.

Every transition inserts a row into `OrderStatusEvent` — an **append-only,
immutable audit table** (never updated or deleted) capturing status,
timestamp, and the acting user/role. The current `status` on `Order` is a
denormalized convenience field; the authoritative history always lives in
this table (`GET /api/orders/:id/timeline`).

On `FAILED`, the customer is notified and can call
`POST /api/orders/:id/reschedule` with a new date; this records a
`Reschedule` row (its own audit trail), moves the order to `RESCHEDULED`,
and **clears the assigned agent** so a fresh manual/auto assignment is
required for the new attempt.

## 7. Notifications

`notificationService.ts` sends an email via **nodemailer** on every status
change (any SMTP provider — Gmail app password, Mailtrap, Brevo free
tier, etc. — configured through `SMTP_*` env vars) and logs every attempt
(sent/failed/skipped) to `NotificationLog`. SMS is stubbed the same way
behind `SMS_*` env vars with a clear insertion point for a provider like
Twilio's free trial — with no credentials configured, the app still runs
end-to-end and simply logs `SKIPPED` instead of failing.

## 8. Database schema (summary)

See `backend/prisma/schema.prisma` for the full annotated schema.

| Model | Purpose |
|---|---|
| `User` | customer / agent / admin, role-based auth |
| `AgentProfile` | 1:1 with a `User` (role=AGENT); availability, home zone, optional live location |
| `Zone` | admin-defined delivery zone |
| `Area` | a serviceable locality/pincode mapped to one `Zone` — how zone detection works |
| `RateCard` | one row per `(orderType, zoneRelation)`; `baseCharge` + `ratePerKg` |
| `CodSurchargeRule` | one row per `orderType`; flat or percentage COD fee |
| `Order` | full order record incl. persisted charge breakdown, current status, assigned agent |
| `OrderStatusEvent` | immutable, append-only status audit trail |
| `Reschedule` | audit trail of reschedule requests after a failed delivery |
| `NotificationLog` | audit trail of every email/SMS attempt |

## 9. API reference

All endpoints are prefixed `/api`. Authenticated endpoints require
`Authorization: Bearer <token>` (obtained from `/auth/login` or
`/auth/register`).

**Auth**
| Method & path | Access | Purpose |
|---|---|---|
| `POST /auth/register` | public | Register a **customer** account |
| `POST /auth/login` | public | Log in, returns JWT |
| `GET /auth/me` | any | Current user profile |

**Admin — configuration**
| Method & path | Access | Purpose |
|---|---|---|
| `POST /admin/zones` | admin | Create a zone |
| `GET /admin/zones` | admin | List zones (with areas) |
| `DELETE /admin/zones/:id` | admin | Delete a zone |
| `POST /admin/areas` | admin | Register an area (name, pincode, zoneId) |
| `GET /admin/areas` | admin | List areas |
| `PATCH /admin/areas/:id` | admin | Edit / re-map an area to a different zone |
| `DELETE /admin/areas/:id` | admin | Delete an area |
| `POST /admin/rate-cards` | admin | Upsert a rate card `(orderType, zoneRelation)` |
| `GET /admin/rate-cards` | admin | List rate cards |
| `POST /admin/cod-surcharge` | admin | Upsert a COD surcharge rule per `orderType` |
| `GET /admin/cod-surcharge` | admin | List COD rules |
| `POST /admin/users` | admin | Provision an **agent** or **admin** account |
| `GET /admin/agents` | admin | List agent profiles |
| `PATCH /admin/agents/:id` | admin | Update availability / zone / location |

**Catalog (read-only, any authenticated role)**
| Method & path | Purpose |
|---|---|
| `GET /areas` | Areas for the pickup/drop pickers |
| `GET /zones` | Zones for filters |

**Orders**
| Method & path | Access | Purpose |
|---|---|---|
| `POST /orders/quote` | customer/admin | Compute the charge breakdown without saving |
| `POST /orders` | customer/admin | Create an order (admin may pass `customerId` to place on a customer's behalf) |
| `GET /orders` | any | List orders — customers see their own, agents see their assigned orders, admins see all and can filter with `?status=&zoneId=&agentId=` |
| `GET /orders/:id` | any (own/assigned/admin) | Order detail |
| `GET /orders/:id/timeline` | any (own/assigned/admin) | Immutable status history |
| `POST /orders/:id/assign` | admin | Manually assign an agent (`{ agentProfileId }`) |
| `POST /orders/:id/auto-assign` | admin | Auto-assign the nearest/zone-matched available agent |
| `PATCH /orders/:id/status` | agent (own order) / admin (any, override) | Advance or override status |
| `POST /orders/:id/reschedule` | customer (own, FAILED only) | Reschedule after a failed delivery |

---

## 10. Notes for evaluators

- The rate/zone/assignment/status engines are intentionally isolated in
  `backend/src/services/` so each can be read and evaluated independently
  of the HTTP layer.
- `OrderStatusEvent` and `Reschedule` are append-only by design (services
  only ever `create`, never `update`/`delete` on those tables) — this is
  what makes the tracking history immutable and auditable.
- No rate, weight-divisor, or surcharge value is hardcoded in application
  code except the `5000` volumetric divisor, which is fixed by the spec's
  exact formula; everything else is read from `RateCard` /
  `CodSurchargeRule` at request time.
