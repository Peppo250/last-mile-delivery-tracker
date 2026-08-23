import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(name, email, password, phone || undefined);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Create account</h1>
        <p className="muted">Customer accounts only — agent and admin accounts are created by an admin.</p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          <label>Phone (for SMS notifications)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label>Password (min 6 chars)</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} required />
          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Creating..." : "Create account"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
