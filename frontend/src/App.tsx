import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PlaceOrderPage from "./pages/PlaceOrderPage";
import OrdersListPage from "./pages/OrdersListPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import AgentDashboard from "./pages/AgentDashboard";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminConfigPage from "./pages/AdminConfigPage";
import AdminAgentsPage from "./pages/AdminAgentsPage";

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "CUSTOMER") return <Navigate to="/orders" replace />;
  if (user.role === "AGENT") return <Navigate to="/agent" replace />;
  return <Navigate to="/admin/orders" replace />;
}

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />

        <Route
          path="/orders/new"
          element={
            <ProtectedRoute roles={["CUSTOMER", "ADMIN"]}>
              <PlaceOrderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute roles={["CUSTOMER"]}>
              <OrdersListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ProtectedRoute roles={["CUSTOMER", "AGENT", "ADMIN"]}>
              <OrderDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/agent"
          element={
            <ProtectedRoute roles={["AGENT"]}>
              <AgentDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/orders"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/config"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/agents"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminAgentsPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
