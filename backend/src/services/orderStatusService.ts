import { OrderStatus, Role } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/errorHandler";
import { notifyOrderStatus } from "./notificationService";
import { releaseAgent } from "./assignmentService";

// Legal forward transitions for a normal (non-admin-override) status change.
// Admin overrides bypass this map entirely (see updateStatus adminOverride flag).
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  FAILED: ["RESCHEDULED"],
  RESCHEDULED: ["ASSIGNED"],
  CANCELLED: [],
};

export async function updateOrderStatus(params: {
  orderId: string;
  newStatus: OrderStatus;
  actorId: string;
  actorRole: Role;
  note?: string;
  adminOverride?: boolean;
}) {
  const { orderId, newStatus, actorId, actorRole, note, adminOverride } = params;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError(404, "Order not found");

  if (!adminOverride) {
    const allowed = ALLOWED_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new ApiError(
        409,
        `Illegal status transition: ${order.status} -> ${newStatus}. Allowed: ${allowed.join(", ") || "none"}`
      );
    }
  }

  const deliveredAt = newStatus === "DELIVERED" ? new Date() : order.deliveredAt;

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: newStatus, deliveredAt } }),
    // Append-only, immutable audit row — this table is never updated or
    // deleted, only inserted into, so the full history is always
    // reconstructable and tamper-evident.
    prisma.orderStatusEvent.create({
      data: { orderId, status: newStatus, actorId, actorRole, note: note || (adminOverride ? "Admin override" : undefined) },
    }),
  ]);

  // Free the agent once the delivery attempt reaches a terminal state.
  if (newStatus === "DELIVERED" || newStatus === "FAILED") {
    await releaseAgent(order.assignedAgentId);
  }

  // Email the customer on every status change (best-effort — failures are
  // logged, not thrown, so a broken mail provider never blocks the order
  // status update itself).
  try {
    await notifyOrderStatus(orderId, newStatus);
  } catch (err) {
    console.error("Notification failed:", err);
  }

  return prisma.order.findUnique({ where: { id: orderId } });
}

export async function getOrderTimeline(orderId: string) {
  return prisma.orderStatusEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { id: true, name: true, role: true } } },
  });
}

/**
 * Failed-delivery reschedule flow:
 *  1. Order must currently be FAILED.
 *  2. A Reschedule row is recorded (previous scheduled date -> new date,
 *     optional reason) — this is itself an immutable audit trail of every
 *     reschedule request.
 *  3. Order status moves FAILED -> RESCHEDULED and scheduledDate is updated.
 *  4. The order is explicitly un-assigned (assignedAgentId cleared) so
 *     that either a fresh auto-assignment or manual assignment call is
 *     required to pick an agent for the new attempt — this naturally
 *     supports re-assigning to a different agent than the one who failed.
 */
export async function rescheduleOrder(params: {
  orderId: string;
  requestedById: string;
  newDate: Date;
  reason?: string;
}) {
  const { orderId, requestedById, newDate, reason } = params;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError(404, "Order not found");
  if (order.status !== "FAILED") {
    throw new ApiError(409, "Only orders with status FAILED can be rescheduled");
  }

  await prisma.$transaction([
    prisma.reschedule.create({
      data: { orderId, requestedById, previousDate: order.scheduledDate, newDate, reason },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { scheduledDate: newDate, status: "RESCHEDULED", assignedAgentId: null },
    }),
    prisma.orderStatusEvent.create({
      data: {
        orderId,
        status: "RESCHEDULED",
        actorId: requestedById,
        actorRole: (await prisma.user.findUnique({ where: { id: requestedById } }))!.role,
        note: reason ? `Rescheduled: ${reason}` : "Rescheduled by customer",
      },
    }),
  ]);

  try {
    await notifyOrderStatus(orderId, "RESCHEDULED");
  } catch (err) {
    console.error("Notification failed:", err);
  }

  return prisma.order.findUnique({ where: { id: orderId } });
}
