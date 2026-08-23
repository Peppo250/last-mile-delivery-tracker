import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Order } from "../api/types";
import StatusPill from "../components/StatusPill";

export default function AgentDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Order[]>("/orders").then(setOrders).catch((e) => setError(e.message));
  }, []);

  const active = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const past = orders.filter((o) => ["DELIVERED", "CANCELLED"].includes(o.status));

  return (
    <div className="container">
      <h1>My deliveries</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h2>Active ({active.length})</h2>
        {active.length === 0 ? (
          <p className="muted">No active deliveries assigned right now.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Order</th><th>Route</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {active.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderCode}</td>
                  <td>{o.pickupArea?.name} → {o.dropArea?.name}</td>
                  <td><StatusPill status={o.status} /></td>
                  <td><Link to={`/orders/${o.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Completed history ({past.length})</h2>
        {past.length === 0 ? (
          <p className="muted">No completed deliveries yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Order</th><th>Route</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {past.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderCode}</td>
                  <td>{o.pickupArea?.name} → {o.dropArea?.name}</td>
                  <td><StatusPill status={o.status} /></td>
                  <td><Link to={`/orders/${o.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
