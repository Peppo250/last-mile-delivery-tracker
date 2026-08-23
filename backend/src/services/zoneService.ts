import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/errorHandler";

/**
 * Zone detection approach:
 * Every serviceable locality is pre-registered by the admin as an `Area`
 * (name + pincode) and mapped to exactly one `Zone`. Rather than parsing
 * free-text addresses with fuzzy matching (unreliable and hard to audit),
 * the customer/admin selects a concrete `Area` for pickup and drop when
 * placing an order (typically via a searchable dropdown backed by
 * GET /api/areas). The order simply stores pickupAreaId/dropAreaId, and
 * the zone is looked up deterministically from that Area — this keeps
 * zone detection O(1), fully admin-configurable (add/re-map an Area any
 * time), and free of ambiguity from address text.
 */
export async function resolveAreaZone(areaId: string) {
  const area = await prisma.area.findUnique({ where: { id: areaId }, include: { zone: true } });
  if (!area) throw new ApiError(404, `Area ${areaId} not found`);
  return area;
}

export async function getZoneIdsForOrder(pickupAreaId: string, dropAreaId: string) {
  const [pickupArea, dropArea] = await Promise.all([
    resolveAreaZone(pickupAreaId),
    resolveAreaZone(dropAreaId),
  ]);
  return {
    pickupZoneId: pickupArea.zoneId,
    dropZoneId: dropArea.zoneId,
    pickupArea,
    dropArea,
  };
}
