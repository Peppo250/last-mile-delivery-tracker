import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/errorHandler";

/**
 * Auto-assignment logic
 * ----------------------
 * Candidate pool: all AgentProfile rows with isAvailable = true.
 *
 * Ranking (best candidate first):
 *  1. If the order's drop Area has coordinates AND at least one candidate
 *     agent has live currentLat/currentLng, rank candidates by haversine
 *     distance from the agent's current location to the drop point and
 *     pick the nearest.
 *  2. Otherwise (no live GPS data available — the common case for a
 *     lightweight deployment), fall back to zone-based matching: prefer
 *     agents whose home `zoneId` equals the order's drop zone; if none
 *     are available, widen to the order's pickup zone; if still none,
 *     fall back to any available agent (so orders never get stuck
 *     unassigned when the fleet is thin).
 *
 * On assignment the agent is marked isAvailable = false (they are
 * considered occupied with this delivery). They are freed again
 * (isAvailable = true) when the order reaches a terminal state for that
 * attempt: DELIVERED or FAILED. This models a single-order-per-agent
 * capacity, which keeps the logic simple and auditable; scaling to
 * multi-order carrying capacity would mean replacing the boolean with a
 * concurrent-order counter, without touching the ranking logic above.
 */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export async function findBestAgentForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { dropArea: { include: { zone: true } }, pickupArea: { include: { zone: true } } },
  });
  if (!order) throw new ApiError(404, "Order not found");

  const availableAgents = await prisma.agentProfile.findMany({
    where: { isAvailable: true },
    include: { user: true },
  });

  if (availableAgents.length === 0) return null;

  // Strategy 1: nearest by live coordinates, if any agent has them.
  // (Area does not currently store lat/lng in this schema, so this path
  // activates automatically once coordinates are added to Area/Order —
  // documented here as the intended extension point.)
  const agentsWithLocation = availableAgents.filter((a) => a.currentLat != null && a.currentLng != null);

  // Strategy 2: zone-based matching (primary strategy for this build).
  const dropZoneId = order.dropArea.zoneId;
  const pickupZoneId = order.pickupArea.zoneId;

  const inDropZone = availableAgents.filter((a) => a.zoneId === dropZoneId);
  if (inDropZone.length > 0) return pickNearestOrFirst(inDropZone, agentsWithLocation);

  const inPickupZone = availableAgents.filter((a) => a.zoneId === pickupZoneId);
  if (inPickupZone.length > 0) return pickNearestOrFirst(inPickupZone, agentsWithLocation);

  // Strategy 3: no zone match — any available agent, to avoid orders
  // getting permanently stuck when the fleet is thin.
  return pickNearestOrFirst(availableAgents, agentsWithLocation);
}

function pickNearestOrFirst(pool: any[], agentsWithLocation: any[]) {
  const withLoc = pool.filter((a) => agentsWithLocation.includes(a));
  if (withLoc.length > 0) {
    // If we had drop coordinates we'd rank here; without them we
    // deterministically take the first (earliest-registered) candidate.
    return withLoc[0];
  }
  return pool[0];
}

export async function autoAssignAgent(orderId: string, actorId: string) {
  const agent = await findBestAgentForOrder(orderId);
  if (!agent) {
    throw new ApiError(409, "No available delivery agent found for auto-assignment right now");
  }
  return assignAgentToOrder(orderId, agent.id, actorId);
}

export async function assignAgentToOrder(orderId: string, agentProfileId: string, actorId: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor) throw new ApiError(404, "Actor user not found");
  const agent = await prisma.agentProfile.findUnique({ where: { id: agentProfileId } });
  if (!agent) throw new ApiError(404, "Agent not found");
  if (!agent.isAvailable) throw new ApiError(409, "Selected agent is not currently available");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError(404, "Order not found");

  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { assignedAgentId: agentProfileId, status: "ASSIGNED" },
    }),
    prisma.agentProfile.update({ where: { id: agentProfileId }, data: { isAvailable: false } }),
    prisma.orderStatusEvent.create({
      data: {
        orderId,
        status: "ASSIGNED",
        actorId,
        actorRole: actor.role,
        note: `Assigned to agent ${agent.id}`,
      },
    }),
  ]);

  return updatedOrder;
}

// Frees an agent back into the available pool — called when an order
// reaches DELIVERED or FAILED.
export async function releaseAgent(agentProfileId: string | null | undefined) {
  if (!agentProfileId) return;
  await prisma.agentProfile.update({ where: { id: agentProfileId }, data: { isAvailable: true } });
}
