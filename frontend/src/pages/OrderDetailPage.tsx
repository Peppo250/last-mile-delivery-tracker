import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { Order, OrderStatusEvent, OrderStatus } from "../api/types";
import { useAuth } from "../context/AuthContext";
import StatusPill from "../components/StatusPill";

const AGENT_NEXT_STATUS: Record<string, OrderStatus[]> = {
  ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
};

const ALL_STATUSES: OrderStatus[] = [
  "PLACED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RESCHEDULED",
  "CANCELLED",
];

export default function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [timeline, setTimeline] = useState<OrderStatusEvent[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<OrderStatus>("PLACED");

  function load() {
    if (!id) return;
    api.get<Order>(`/orders/${id}`).then(setOrder).catch((e) => setError(e.message));
    api.get<OrderStatusEvent[]>(`/orders/${id}/timeline`).then(setTimeline).catch(() => {});
  }

  useEffect(load, [id]);

  async function updateStatus(status: OrderStatus, note?: string) {
    if (!id) return;
    setError("");
    setMsg("");
    setBusy(true);
    try {
      await api.patch(`/orders/${id}/status`, { status, note });
      setMsg(`Status updated to ${status}`);
      load();
    } catch (err: any) {
      setError(err.message || "Could not update status");
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule() {
    if (!id || !rescheduleDate) return;
    setError("");
    setMsg("");
    setBusy(true);
    try {
      await api.post(`/orders/${id}/reschedule`, {
        newDate: new Date(rescheduleDate).toISOString(),
        reason: rescheduleReason || undefined,
      });
      setMsg("Order rescheduled. It now needs a new agent assignment.");
      setRescheduleDate("");
      setRescheduleReason("");
      load();
    } catch (err: any) {
      setError(err.message || "Could not reschedule");
    } finally {
      setBusy(false);
    }
  }

  async function autoAssign() {
    if (!id) return;
    setError("");
    setMsg("");
    setBusy(true);
    try {
      await api.post(`/orders/${id}/auto-assign`);
      setMsg("Nearest available agent auto-assigned.");
      load();
    } catch (err: any) {
      setError(err.message || "Auto-assignment failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) return <div className="container"><div className="error-box">{error}</div></div>;
  if (!order) return <div className="container muted">Loading...</div>;

  const agentActions = user?.role === "AGENT" ? AGENT_NEXT_STATUS[order.status] || [] : [];

  return (
    <div className="container">
      <h1>
        Order {order.orderCode} <StatusPill status={order.status} />
      </h1>
      {error && <div className="error-box">{error}</div>}
      {msg && <div className="success-box">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>Shipment details</h2>
          <p><b>Pickup:</b> {order.pickupAddress} ({order.pickupArea?.name}, {order.pickupArea?.zone?.name})</p>
          <p><b>Drop:</b> {order.dropAddress} ({order.dropArea?.name}, {order.dropArea?.zone?.name})</p>
          <p><b>Dimensions:</b> {order.lengthCm} × {order.breadthCm} × {order.heightCm} cm</p>
          <p><b>Actual weight:</b> {order.actualWeightKg} kg — <b>Volumetric:</b> {order.volumetricWeightKg} kg — <b>Billed:</b> {order.billableWeightKg} kg</p>
          <p><b>Order type:</b> {order.orderType} &nbsp; <b>Payment:</b> {order.paymentType} &nbsp; <b>Zone:</b> {order.zoneRelation}</p>
          {order.scheduledDate && <p><b>Scheduled date:</b> {new Date(order.scheduledDate).toLocaleDateString()}</p>}
          {order.assignedAgent && (
            <p><b>Assigned agent:</b> {order.assignedAgent.user.name} ({order.assignedAgent.user.phone || "no phone"})</p>
          )}
        </div>

        <div className="card">
          <h2>Charge breakdown</h2>
          <div className="charge-box">
            <div className="row"><span>Base charge</span><span>₹{order.baseCharge}</span></div>
            <div className="row"><span>Weight charge</span><span>₹{order.weightCharge}</span></div>
            <div className="row"><span>COD surcharge</span><span>₹{order.codSurcharge}</span></div>
            <div className="row total"><span>Total</span><span>₹{order.totalCharge}</span></div>
          </div>
        </div>
      </div>

      {user?.role === "AGENT" && agentActions.length > 0 && (
        <div className="card">
          <h2>Update delivery status</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {agentActions.map((s) => (
              <button key={s} disabled={busy} onClick={() => updateStatus(s)}>
                Mark as {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {user?.role === "ADMIN" && (
        <div className="card">
          <h2>Admin: assignment & override</h2>
          {!order.assignedAgentId && (
            <button disabled={busy} onClick={autoAssign} style={{ marginBottom: "0.75rem" }}>
              Auto-assign nearest available agent
            </button>
          )}
          <div className="grid-2">
            <div>
              <label>Override status to</label>
              <select value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value as OrderStatus)}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="secondary" disabled={busy} onClick={() => updateStatus(overrideStatus, "Admin override")}>
                Apply override
              </button>
            </div>
          </div>
        </div>
      )}

      {user?.role === "CUSTOMER" && order.status === "FAILED" && (
        <div className="card">
          <h2>Reschedule delivery</h2>
          <p className="muted">Your last delivery attempt failed. Choose a new date and we'll assign a fresh agent.</p>
          <label>New delivery date</label>
          <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
          <label>Reason (optional)</label>
          <input value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} />
          <button disabled={busy || !rescheduleDate} onClick={handleReschedule}>
            Confirm reschedule
          </button>
        </div>
      )}

      {user?.role === "ADMIN" && order.status === "RESCHEDULED" && !order.assignedAgentId && (
        <div className="card">
          <h2>Reassign after reschedule</h2>
          <button disabled={busy} onClick={autoAssign}>Auto-assign agent for new attempt</button>
        </div>
      )}

      <div className="card">
        <h2>Tracking timeline</h2>
        <ul className="timeline">
          {timeline.map((ev) => (
            <li key={ev.id}>
              <div>
                <StatusPill status={ev.status} />{" "}
                <span className="muted">{new Date(ev.createdAt).toLocaleString()}</span>
                <div className="muted">
                  by {ev.actor?.name} ({ev.actorRole}){ev.note ? ` — ${ev.note}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
