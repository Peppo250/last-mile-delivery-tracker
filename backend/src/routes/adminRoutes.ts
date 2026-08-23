import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { OrderType, ZoneRelation, SurchargeMode, Role } from "@prisma/client";

const router = Router();
router.use(authenticate, authorize(Role.ADMIN));

// ---------------------------------------------------------------- Zones ---
router.post("/zones", async (req, res) => {
  const schema = z.object({ name: z.string().min(1) });
  const { name } = schema.parse(req.body);
  const zone = await prisma.zone.create({ data: { name } });
  res.status(201).json(zone);
});

router.get("/zones", async (_req, res) => {
  const zones = await prisma.zone.findMany({ include: { areas: true }, orderBy: { name: "asc" } });
  res.json(zones);
});

router.delete("/zones/:id", async (req, res) => {
  await prisma.zone.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---------------------------------------------------------------- Areas ---
// Areas are how zone detection actually works: each pickup/drop location
// used in an order must reference a pre-registered Area mapped to a Zone.
router.post("/areas", async (req, res) => {
  const schema = z.object({ name: z.string().min(1), pincode: z.string().min(1), zoneId: z.string().min(1) });
  const data = schema.parse(req.body);
  const zone = await prisma.zone.findUnique({ where: { id: data.zoneId } });
  if (!zone) throw new ApiError(404, "Zone not found");
  const area = await prisma.area.create({ data });
  res.status(201).json(area);
});

router.get("/areas", async (_req, res) => {
  const areas = await prisma.area.findMany({ include: { zone: true }, orderBy: { name: "asc" } });
  res.json(areas);
});

router.patch("/areas/:id", async (req, res) => {
  const schema = z.object({ name: z.string().optional(), pincode: z.string().optional(), zoneId: z.string().optional() });
  const data = schema.parse(req.body);
  const area = await prisma.area.update({ where: { id: req.params.id }, data });
  res.json(area);
});

router.delete("/areas/:id", async (req, res) => {
  await prisma.area.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ------------------------------------------------------------ RateCards ---
router.post("/rate-cards", async (req, res) => {
  const schema = z.object({
    orderType: z.nativeEnum(OrderType),
    zoneRelation: z.nativeEnum(ZoneRelation),
    baseCharge: z.number().min(0),
    ratePerKg: z.number().min(0),
    isActive: z.boolean().optional(),
  });
  const data = schema.parse(req.body);
  const rateCard = await prisma.rateCard.upsert({
    where: { orderType_zoneRelation: { orderType: data.orderType, zoneRelation: data.zoneRelation } },
    update: { baseCharge: data.baseCharge, ratePerKg: data.ratePerKg, isActive: data.isActive ?? true },
    create: data,
  });
  res.status(201).json(rateCard);
});

router.get("/rate-cards", async (_req, res) => {
  const rateCards = await prisma.rateCard.findMany({ orderBy: [{ orderType: "asc" }, { zoneRelation: "asc" }] });
  res.json(rateCards);
});

router.delete("/rate-cards/:id", async (req, res) => {
  await prisma.rateCard.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ------------------------------------------------------- COD Surcharges ---
router.post("/cod-surcharge", async (req, res) => {
  const schema = z.object({
    orderType: z.nativeEnum(OrderType),
    mode: z.nativeEnum(SurchargeMode),
    value: z.number().min(0),
    isActive: z.boolean().optional(),
  });
  const data = schema.parse(req.body);
  const rule = await prisma.codSurchargeRule.upsert({
    where: { orderType: data.orderType },
    update: { mode: data.mode, value: data.value, isActive: data.isActive ?? true },
    create: data,
  });
  res.status(201).json(rule);
});

router.get("/cod-surcharge", async (_req, res) => {
  const rules = await prisma.codSurchargeRule.findMany();
  res.json(rules);
});

// ---------------------------------------------------- Agents & Admins  ---
// Admin-only user provisioning for AGENT and ADMIN roles (prevents
// self-registration into privileged roles via the public /auth endpoint).
router.post("/users", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().optional(),
    role: z.nativeEnum(Role),
    zoneId: z.string().optional(), // for AGENT role
  });
  const data = schema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, phone: data.phone, passwordHash, role: data.role },
  });

  if (data.role === Role.AGENT) {
    await prisma.agentProfile.create({ data: { userId: user.id, zoneId: data.zoneId, isAvailable: true } });
  }

  const { passwordHash: _drop, ...safeUser } = user;
  res.status(201).json(safeUser);
});

router.get("/agents", async (_req, res) => {
  const agents = await prisma.agentProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true, phone: true } }, zone: true },
  });
  res.json(agents);
});

router.patch("/agents/:id", async (req, res) => {
  const schema = z.object({
    isAvailable: z.boolean().optional(),
    zoneId: z.string().nullable().optional(),
    currentLat: z.number().nullable().optional(),
    currentLng: z.number().nullable().optional(),
    vehicleType: z.string().optional(),
  });
  const data = schema.parse(req.body);
  const agent = await prisma.agentProfile.update({ where: { id: req.params.id }, data });
  res.json(agent);
});

export default router;
