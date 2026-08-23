import { OrderType, PaymentType, ZoneRelation, SurchargeMode } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/errorHandler";

export interface ChargeBreakdown {
  volumetricWeightKg: number;
  billableWeightKg: number;
  zoneRelation: ZoneRelation;
  baseCharge: number;
  weightCharge: number;
  codSurcharge: number;
  totalCharge: number;
  rateCardId: string;
}

// Volumetric divisor is the industry-standard 5000 (cm) as specified.
// Kept as a constant here (not a magic number scattered around) but is
// NOT admin-configurable per the spec's exact formula L*B*H/5000.
const VOLUMETRIC_DIVISOR = 5000;

export function calculateVolumetricWeight(lengthCm: number, breadthCm: number, heightCm: number): number {
  return (lengthCm * breadthCm * heightCm) / VOLUMETRIC_DIVISOR;
}

export function determineZoneRelation(pickupZoneId: string, dropZoneId: string): ZoneRelation {
  return pickupZoneId === dropZoneId ? ZoneRelation.INTRA : ZoneRelation.INTER;
}

/**
 * Core rate calculation engine.
 *
 * Steps (mirrors the spec exactly):
 *  1. Volumetric weight = L x B x H / 5000
 *  2. Billable weight = max(actual, volumetric)
 *  3. Zone relation = INTRA if pickup & drop resolve to the same zone, else INTER
 *  4. Look up the admin-configured RateCard row for (orderType, zoneRelation)
 *  5. weightCharge = ratePerKg * billableWeight; add baseCharge
 *  6. If paymentType === COD, add the admin-configured COD surcharge for
 *     this orderType (flat amount or percentage of the freight charge)
 *
 * All rates are read from the database (RateCard / CodSurchargeRule) —
 * nothing is hardcoded, so admins can retune pricing without a deploy.
 */
export async function calculateCharge(params: {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  orderType: OrderType;
  paymentType: PaymentType;
  pickupZoneId: string;
  dropZoneId: string;
}): Promise<ChargeBreakdown> {
  const { lengthCm, breadthCm, heightCm, actualWeightKg, orderType, paymentType, pickupZoneId, dropZoneId } = params;

  if (lengthCm <= 0 || breadthCm <= 0 || heightCm <= 0) {
    throw new ApiError(400, "Package dimensions must be positive numbers");
  }
  if (actualWeightKg <= 0) {
    throw new ApiError(400, "Actual weight must be a positive number");
  }

  const volumetricWeightKg = calculateVolumetricWeight(lengthCm, breadthCm, heightCm);
  const billableWeightKg = Math.max(actualWeightKg, volumetricWeightKg);
  const zoneRelation = determineZoneRelation(pickupZoneId, dropZoneId);

  const rateCard = await prisma.rateCard.findUnique({
    where: { orderType_zoneRelation: { orderType, zoneRelation } },
  });

  if (!rateCard || !rateCard.isActive) {
    throw new ApiError(
      422,
      `No active rate card configured for ${orderType} / ${zoneRelation}. Ask an admin to configure it.`
    );
  }

  const weightCharge = round2(rateCard.ratePerKg * billableWeightKg);
  const baseCharge = round2(rateCard.baseCharge);
  const freightCharge = round2(baseCharge + weightCharge);

  let codSurcharge = 0;
  if (paymentType === PaymentType.COD) {
    const rule = await prisma.codSurchargeRule.findUnique({ where: { orderType } });
    if (rule && rule.isActive) {
      codSurcharge =
        rule.mode === SurchargeMode.FLAT ? rule.value : round2((rule.value / 100) * freightCharge);
    }
  }
  codSurcharge = round2(codSurcharge);

  const totalCharge = round2(freightCharge + codSurcharge);

  return {
    volumetricWeightKg: round2(volumetricWeightKg),
    billableWeightKg: round2(billableWeightKg),
    zoneRelation,
    baseCharge,
    weightCharge,
    codSurcharge,
    totalCharge,
    rateCardId: rateCard.id,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
