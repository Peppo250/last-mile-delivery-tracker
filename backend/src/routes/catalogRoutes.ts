import { Router } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth";

// Read-only endpoints any authenticated user (customer/agent/admin) can
// call — used to populate pickup/drop Area pickers when placing an order.
const router = Router();
router.use(authenticate);

router.get("/areas", async (_req, res) => {
  const areas = await prisma.area.findMany({ include: { zone: true }, orderBy: { name: "asc" } });
  res.json(areas);
});

router.get("/zones", async (_req, res) => {
  const zones = await prisma.zone.findMany({ orderBy: { name: "asc" } });
  res.json(zones);
});

export default router;
