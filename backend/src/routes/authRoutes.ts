import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { signToken } from "../utils/jwt";
import { ApiError } from "../middleware/errorHandler";
import { authenticate } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  // Only customers can self-register through this endpoint. Agent and
  // Admin accounts are provisioned by an existing admin via
  // POST /api/admin/users to prevent privilege self-escalation.
});

router.post("/register", async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, phone: data.phone, passwordHash, role: Role.CUSTOMER },
  });

  const token = signToken({ id: user.id, role: user.role, email: user.email });
  res.status(201).json({ token, user: sanitize(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/login", async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) throw new ApiError(401, "Invalid email or password");

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Invalid email or password");

  const token = signToken({ id: user.id, role: user.role, email: user.email });
  res.json({ token, user: sanitize(user) });
});

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new ApiError(404, "User not found");
  res.json({ user: sanitize(user) });
});

function sanitize(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export default router;
