import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { AgentProfile, Order, OrderStatus, Zone } from "../api/types";
import StatusPill from "../components/StatusPill";

const STATUSES: OrderStatus[] = [
  "PLACED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RESCHEDULED", "CANCELLED",
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [status, setStatus] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<Zone[]>("/zones").then(setZones).catch(() => {});
    api.get<AgentProfile[]>("/admin/agents").then(setAgents).catch(() => {});
  }, []);

  useEffect(load, [status, zoneId, agentId]);

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (zoneId) params.set("zoneId", zoneId);
    if (agentId) params.set("agentId", agentId);
    api
      .get<Order[]>(`/orders?${params.toString()}`)
      .then(setOrders)
      .catch((e) => setError(e.message));
  }

  async function manualAssign(orderId: string) {
    const agentProfileId = assignChoice[orderId];
    if (!agentProfileId) return;
    setError("");
    setMsg("");
    try {
      await api.post(`/orders/${orderId}/assign`, { agentProfileId });
      setMsg("Agent assigned.");
      load();
    } catch (err: any) {
      setError(err.message || "Assignment failed");
    }
  }

  async function autoAssign(orderId: string) {
    setError("");
    setMsg("");
    try {
      await api.post(`/orders/${orderId}/auto-assign`);
      setMsg("Nearest available agent auto-assigned.");
      load();
    } catch (err: any) {
      setError(err.message || "Auto-assignment failed");
    }
  }

  return (
    <div className="container">
      <h1>All orders</h1>
      {error && <div className="error-box">{error}</div>}
      {msg && <div className="success-box">{msg}</div>}

      <div className="filters card">
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>Zone (pickup or drop)</label>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">All</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <div>
          <label>Agent</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">All</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.user.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Customer</th><th>Route</th><th>Type</th><th>Total</th><th>Status</th><th>Agent</th><th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/orders/${o.id}`}>{o.orderCode}</Link></td>
                <td>{o.customer?.name}</td>
                <td>{o.pickupArea?.name} → {o.dropArea?.name}</td>
                <td>{o.orderType}/{o.paymentType}</td>
                <td>₹{o.totalCharge}</td>
                <td><StatusPill status={o.status} /></td>
                <td>{o.assignedAgent?.user.name || "—"}</td>
                <td>
                  {!o.assignedAgentId && (
                    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                      <select
                        style={{ marginBottom: 0, minWidth: 120 }}
                        value={assignChoice[o.id] || ""}
                        onChange={(e) => setAssignChoice((s) => ({ ...s, [o.id]: e.target.value }))}
                      >
                        <option value="">Agent…</option>
                        {agents.filter((a) => a.isAvailable).map((a) => (
                          <option key={a.id} value={a.id}>{a.user.name}</option>
                        ))}
                      </select>
                      <button className="secondary" onClick={() => manualAssign(o.id)}>Assign</button>
                      <button className="secondary" onClick={() => autoAssign(o.id)}>Auto</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <p className="muted">No orders match these filters.</p>}
      </div>
    </div>
  );
}
