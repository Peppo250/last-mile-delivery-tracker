import { prisma } from "../config/prisma";

// Generates a short, human-friendly, unique order reference like LMD-000123.
export async function generateOrderCode(): Promise<string> {
  const count = await prisma.order.count();
  const next = count + 1;
  const candidate = `LMD-${String(next).padStart(6, "0")}`;

  // Guard against a rare race where two orders are created concurrently.
  const exists = await prisma.order.findUnique({ where: { orderCode: candidate } });
  if (exists) {
    return `LMD-${Date.now()}`;
  }
  return candidate;
}
