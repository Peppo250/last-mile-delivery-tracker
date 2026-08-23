export type Role = "CUSTOMER" | "AGENT" | "ADMIN";
export type OrderType = "B2B" | "B2C";
export type PaymentType = "PREPAID" | "COD";
export type ZoneRelation = "INTRA" | "INTER";
export type SurchargeMode = "FLAT" | "PERCENT";
export type OrderStatus =
  | "PLACED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RESCHEDULED"
  | "CANCELLED";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
}

export interface Zone {
  id: string;
  name: string;
  areas?: Area[];
}

export interface Area {
  id: string;
  name: string;
  pincode: string;
  zoneId: string;
  zone?: Zone;
}

export interface RateCard {
  id: string;
  orderType: OrderType;
  zoneRelation: ZoneRelation;
  baseCharge: number;
  ratePerKg: number;
  isActive: boolean;
}

export interface CodSurchargeRule {
  id: string;
  orderType: OrderType;
  mode: SurchargeMode;
  value: number;
  isActive: boolean;
}

export interface AgentProfile {
  id: string;
  userId: string;
  zoneId?: string | null;
  isAvailable: boolean;
  vehicleType?: string | null;
  user: { id: string; name: string; email: string; phone?: string | null };
  zone?: Zone | null;
}

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

export interface Order {
  id: string;
  orderCode: string;
  customerId: string;
  pickupAddress: string;
  dropAddress: string;
  pickupAreaId: string;
  dropAreaId: string;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  volumetricWeightKg: number;
  billableWeightKg: number;
  orderType: OrderType;
  paymentType: PaymentType;
  zoneRelation: ZoneRelation;
  baseCharge: number;
  weightCharge: number;
  codSurcharge: number;
  totalCharge: number;
  status: OrderStatus;
  assignedAgentId?: string | null;
  scheduledDate?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  pickupArea?: Area;
  dropArea?: Area;
  assignedAgent?: AgentProfile | null;
  customer?: { id: string; name: string; email: string; phone?: string | null };
}

export interface OrderStatusEvent {
  id: string;
  orderId: string;
  status: OrderStatus;
  note?: string | null;
  actorRole: Role;
  createdAt: string;
  actor: { id: string; name: string; role: Role };
}

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "PLACED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
