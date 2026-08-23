import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Order } from "../api/types";
import StatusPill from "../components/StatusPill";

export default function OrdersListPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    api
      .get<Order[]>("/orders")
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div className="container">
      <h1>My orders</h1>
      {error && <div className="error-box">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="muted">
          No orders yet. <Link to="/orders/new">Place your first order</Link>.
        </p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Route</th>
                <th>Type</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderCode}</td>
                  <td>
                    {o.pickupArea?.name} → {o.dropArea?.name}
                  </td>
                  <td>{o.orderType}</td>
                  <td>{o.paymentType}</td>
                  <td>₹{o.totalCharge}</td>
                  <td>
                    <StatusPill status={o.status} />
                  </td>
                  <td>
                    <Link to={`/orders/${o.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
