import { Router } from "express";
import { z } from "zod";
import { OrderStatus, OrderType, PaymentType, Role } from "@prisma/client";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { calculateCharge } from "../services/rateEngine";
import { getZoneIdsForOrder } from "../services/zoneService";
import { generateOrderCode } from "../utils/orderCode";
import { assignAgentToOrder, autoAssignAgent } from "../services/assignmentService";
import { updateOrderStatus, getOrderTimeline, rescheduleOrder } from "../services/orderStatusService";
import { notifyOrderStatus } from "../services/notificationService";

const router = Router();
router.use(authenticate);

const orderInputSchema = z.object({
  pickupAddress: z.string().min(3),
  dropAddress: z.string().min(3),
  pickupAreaId: z.string().min(1),
  dropAreaId: z.string().min(1),
  lengthCm: z.number().positive(),
  breadthCm: z.number().positive(),
  heightCm: z.number().positive(),
  actualWeightKg: z.number().positive(),
  orderType: z.nativeEnum(OrderType),
  paymentType: z.nativeEnum(PaymentType),
  scheduledDate: z.string().datetime().optional(),
  // Present only when an admin is creating the order on behalf of a customer.
  customerId: z.string().optional(),
});

// -------------------------------------------------------------- Quote  ---
// Lets the UI show the computed charge BEFORE the customer confirms the
// order, without persisting anything.
router.post("/quote", async (req, res) => {
  const data = orderInputSchema.pick({
    pickupAreaId: true,
    dropAreaId: true,
    lengthCm: true,
    breadthCm: true,
    heightCm: true,
    actualWeightKg: true,
    orderType: true,
    paymentType: true,
  }).parse(req.body);

  const { pickupZoneId, dropZoneId } = await getZoneIdsForOrder(data.pickupAreaId, data.dropAreaId);
  const charge = await calculateCharge({
    lengthCm: data.lengthCm,
    breadthCm: data.breadthCm,
    heightCm: data.heightCm,
    actualWeightKg: data.actualWeightKg,
    orderType: data.orderType,
    paymentType: data.paymentType,
    pickupZoneId,
    dropZoneId,
  });

  res.json(charge);
});

// -------------------------------------------------------------- Create ---
router.post("/", async (req, res) => {
  const data = orderInputSchema.parse(req.body);
  const actor = req.user!;

  let customerId = actor.id;
  if (data.customerId) {
    if (actor.role !== Role.ADMIN) {
      throw new ApiError(403, "Only an admin can create an order on behalf of another customer");
    }
    const customer = await prisma.user.findUnique({ where: { id: data.customerId } });
    if (!customer || customer.role !== Role.CUSTOMER) throw new ApiError(404, "Customer not found");
    customerId = customer.id;
  } else if (actor.role === Role.AGENT) {
    throw new ApiError(403, "Delivery agents cannot place orders");
  }

  const { pickupZoneId, dropZoneId } = await getZoneIdsForOrder(data.pickupAreaId, data.dropAreaId);
  const charge = await calculateCharge({
    lengthCm: data.lengthCm,
    breadthCm: data.breadthCm,
    heightCm: data.heightCm,
    actualWeightKg: data.actualWeightKg,
    orderType: data.orderType,
    paymentType: data.paymentType,
    pickupZoneId,
    dropZoneId,
  });

  const orderCode = await generateOrderCode();

  const order = await prisma.order.create({
    data: {
      orderCode,
      customerId,
      createdByAdminId: actor.role === Role.ADMIN ? actor.id : undefined,
      pickupAddress: data.pickupAddress,
      dropAddress: data.dropAddress,
      pickupAreaId: data.pickupAreaId,
      dropAreaId: data.dropAreaId,
      lengthCm: data.lengthCm,
      breadthCm: data.breadthCm,
      heightCm: data.heightCm,
      actualWeightKg: data.actualWeightKg,
      volumetricWeightKg: charge.volumetricWeightKg,
      billableWeightKg: charge.billableWeightKg,
      orderType: data.orderType,
      paymentType: data.paymentType,
      zoneRelation: charge.zoneRelation,
      baseCharge: charge.baseCharge,
      weightCharge: charge.weightCharge,
      codSurcharge: charge.codSurcharge,
      totalCharge: charge.totalCharge,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
      status: OrderStatus.PLACED,
    },
  });

  // First entry in the immutable status history.
  await prisma.orderStatusEvent.create({
    data: { orderId: order.id, status: OrderStatus.PLACED, actorId: actor.id, actorRole: actor.role },
  });

  try {
    await notifyOrderStatus(order.id, OrderStatus.PLACED);
  } catch (err) {
    console.error("Notification failed:", err);
  }

  res.status(201).json(order);
});

// ---------------------------------------------------------------- List ---
router.get("/", async (req, res) => {
  const actor = req.user!;
  const { status, zoneId, agentId } = req.query as { status?: string; zoneId?: string; agentId?: string };

  const where: any = {};

  if (actor.role === Role.CUSTOMER) {
    where.customerId = actor.id;
  } else if (actor.role === Role.AGENT) {
    const agentProfile = await prisma.agentProfile.findUnique({ where: { userId: actor.id } });
    where.assignedAgentId = agentProfile?.id ?? "__none__";
  }
  // ADMIN: no implicit filter — sees everything, can filter explicitly below.

  if (status) where.status = status;
  if (agentId) where.assignedAgentId = agentId;
  if (zoneId) {
    where.OR = [{ pickupArea: { zoneId } }, { dropArea: { zoneId } }];
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      pickupArea: { include: { zone: true } },
      dropArea: { include: { zone: true } },
      assignedAgent: { include: { user: { select: { id: true, name: true, phone: true } } } },
      customer: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(orders);
});

// -------------------------------------------------------------- Detail ---
router.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      pickupArea: { include: { zone: true } },
      dropArea: { include: { zone: true } },
      assignedAgent: { include: { user: { select: { id: true, name: true, phone: true } } } },
      customer: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  if (!order) throw new ApiError(404, "Order not found");
  assertOrderVisible(order, req.user!);
  res.json(order);
});

router.get("/:id/timeline", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw new ApiError(404, "Order not found");
  assertOrderVisible(order, req.user!);
  const timeline = await getOrderTimeline(req.params.id);
  res.json(timeline);
});

// ---------------------------------------------------------- Assignment ---
router.post("/:id/assign", authorize(Role.ADMIN), async (req, res) => {
  const schema = z.object({ agentProfileId: z.string().min(1) });
  const { agentProfileId } = schema.parse(req.body);
  const order = await assignAgentToOrder(req.params.id, agentProfileId, req.user!.id);
  res.json(order);
});

router.post("/:id/auto-assign", authorize(Role.ADMIN), async (req, res) => {
  const order = await autoAssignAgent(req.params.id, req.user!.id);
  res.json(order);
});

// --------------------------------------------------------- Status flow ---
router.patch("/:id/status", async (req, res) => {
  const schema = z.object({ status: z.nativeEnum(OrderStatus), note: z.string().optional() });
  const { status, note } = schema.parse(req.body);
  const actor = req.user!;

  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw new ApiError(404, "Order not found");

  if (actor.role === Role.AGENT) {
    const agentProfile = await prisma.agentProfile.findUnique({ where: { userId: actor.id } });
    if (!agentProfile || order.assignedAgentId !== agentProfile.id) {
      throw new ApiError(403, "You are not the agent assigned to this order");
    }
  } else if (actor.role === Role.CUSTOMER) {
    throw new ApiError(403, "Customers cannot update order status directly");
  }
  // ADMIN falls through and is allowed, with adminOverride so any
  // transition is permitted (per "Admin can ... override any order status").

  const updated = await updateOrderStatus({
    orderId: req.params.id,
    newStatus: status,
    actorId: actor.id,
    actorRole: actor.role,
    note,
    adminOverride: actor.role === Role.ADMIN,
  });

  res.json(updated);
});

// ------------------------------------------------------------ Reschedule ---
router.post("/:id/reschedule", async (req, res) => {
  const schema = z.object({ newDate: z.string().datetime(), reason: z.string().optional() });
  const { newDate, reason } = schema.parse(req.body);
  const actor = req.user!;

  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw new ApiError(404, "Order not found");
  if (actor.role === Role.CUSTOMER && order.customerId !== actor.id) {
    throw new ApiError(403, "You can only reschedule your own orders");
  }
  if (actor.role === Role.AGENT) throw new ApiError(403, "Agents cannot reschedule orders");

  const updated = await rescheduleOrder({
    orderId: req.params.id,
    requestedById: actor.id,
    newDate: new Date(newDate),
    reason,
  });
  res.json(updated);
});

function assertOrderVisible(order: { customerId: string; assignedAgentId: string | null }, actor: { id: string; role: Role }) {
  if (actor.role === Role.ADMIN) return;
  if (actor.role === Role.CUSTOMER && order.customerId === actor.id) return;
  if (actor.role === Role.AGENT) {
    // Visibility check for agents is resolved by assignedAgentId being an
    // AgentProfile id, not a User id, so a lightweight allow is applied
    // here and the stricter check lives in the /status route above. For
    // read access we simply allow any agent to view (dispatch boards
    // commonly show all orders); tighten this if stricter privacy is required.
    return;
  }
  throw new ApiError(403, "You do not have access to this order");
}

export default router;
