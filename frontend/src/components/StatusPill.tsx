import { OrderStatus } from "../api/types";

export default function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`status-pill status-${status}`}>{status.replace(/_/g, " ")}</span>;
}
