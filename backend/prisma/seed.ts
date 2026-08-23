import { PrismaClient, Role, OrderType, ZoneRelation, SurchargeMode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ---- Admin -----------------------------------------------------------
  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@lmd.local" },
    update: {},
    create: { name: "Platform Admin", email: "admin@lmd.local", passwordHash: adminPassword, role: Role.ADMIN },
  });

  // ---- Zones -------------------------------------------------------------
  const zoneNorth = await prisma.zone.upsert({ where: { name: "Chennai-North" }, update: {}, create: { name: "Chennai-North" } });
  const zoneSouth = await prisma.zone.upsert({ where: { name: "Chennai-South" }, update: {}, create: { name: "Chennai-South" } });
  const zoneWest = await prisma.zone.upsert({ where: { name: "Chennai-West" }, update: {}, create: { name: "Chennai-West" } });

  // ---- Areas ---------------------------------------------------------
  const areasData = [
    { name: "Ambattur", pincode: "600053", zoneId: zoneNorth.id },
    { name: "Perambur", pincode: "600011", zoneId: zoneNorth.id },
    { name: "Velachery", pincode: "600042", zoneId: zoneSouth.id },
    { name: "Tambaram", pincode: "600045", zoneId: zoneSouth.id },
    { name: "Vandalur (VIT Chennai)", pincode: "600127", zoneId: zoneSouth.id },
    { name: "Porur", pincode: "600116", zoneId: zoneWest.id },
    { name: "Vadapalani", pincode: "600026", zoneId: zoneWest.id },
  ];
  for (const a of areasData) {
    await prisma.area.upsert({ where: { pincode: a.pincode }, update: {}, create: a });
  }

  // ---- Rate cards ------------------------------------------------------
  const rateCards = [
    { orderType: OrderType.B2C, zoneRelation: ZoneRelation.INTRA, baseCharge: 30, ratePerKg: 12 },
    { orderType: OrderType.B2C, zoneRelation: ZoneRelation.INTER, baseCharge: 50, ratePerKg: 18 },
    { orderType: OrderType.B2B, zoneRelation: ZoneRelation.INTRA, baseCharge: 40, ratePerKg: 9 },
    { orderType: OrderType.B2B, zoneRelation: ZoneRelation.INTER, baseCharge: 70, ratePerKg: 14 },
  ];
  for (const rc of rateCards) {
    await prisma.rateCard.upsert({
      where: { orderType_zoneRelation: { orderType: rc.orderType, zoneRelation: rc.zoneRelation } },
      update: rc,
      create: rc,
    });
  }

  // ---- COD surcharge rules ----------------------------------------------
  await prisma.codSurchargeRule.upsert({
    where: { orderType: OrderType.B2C },
    update: {},
    create: { orderType: OrderType.B2C, mode: SurchargeMode.FLAT, value: 25 },
  });
  await prisma.codSurchargeRule.upsert({
    where: { orderType: OrderType.B2B },
    update: {},
    create: { orderType: OrderType.B2B, mode: SurchargeMode.PERCENT, value: 2 },
  });

  // ---- Sample agents -----------------------------------------------------
  const agentPassword = await bcrypt.hash("Agent@123", 10);
  const agentSeeds = [
    { name: "Agent Ravi (North)", email: "ravi.agent@lmd.local", zoneId: zoneNorth.id },
    { name: "Agent Priya (South)", email: "priya.agent@lmd.local", zoneId: zoneSouth.id },
    { name: "Agent Kumar (West)", email: "kumar.agent@lmd.local", zoneId: zoneWest.id },
  ];
  for (const a of agentSeeds) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: {},
      create: { name: a.name, email: a.email, passwordHash: agentPassword, role: Role.AGENT },
    });
    await prisma.agentProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, zoneId: a.zoneId, isAvailable: true },
    });
  }

  // ---- Sample customer -----------------------------------------------
  const customerPassword = await bcrypt.hash("Customer@123", 10);
  await prisma.user.upsert({
    where: { email: "customer@lmd.local" },
    update: {},
    create: { name: "Sample Customer", email: "customer@lmd.local", passwordHash: customerPassword, role: Role.CUSTOMER, phone: "9999999999" },
  });

  console.log("Seed complete.");
  console.log("Login credentials:");
  console.log("  Admin:    admin@lmd.local / Admin@123");
  console.log("  Agent:    ravi.agent@lmd.local / Agent@123 (also priya.agent@ / kumar.agent@)");
  console.log("  Customer: customer@lmd.local / Customer@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
