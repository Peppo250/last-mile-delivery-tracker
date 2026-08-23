import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="navbar">
      <Link className="brand" to="/">
        📦 Last-Mile Delivery Tracker
      </Link>
      <nav>
        {user.role === "CUSTOMER" && (
          <>
            <Link to="/orders/new">Place Order</Link>
            <Link to="/orders">My Orders</Link>
          </>
        )}
        {user.role === "AGENT" && <Link to="/agent">My Deliveries</Link>}
        {user.role === "ADMIN" && (
          <>
            <Link to="/admin/orders">All Orders</Link>
            <Link to="/admin/config">Zones & Rates</Link>
            <Link to="/admin/agents">Agents</Link>
            <Link to="/orders/new">New Order (for customer)</Link>
          </>
        )}
        <span className="role-badge">{user.role}</span>
        <span className="muted">{user.name}</span>
        <button className="secondary" onClick={handleLogout}>
          Log out
        </button>
      </nav>
    </div>
  );
}
