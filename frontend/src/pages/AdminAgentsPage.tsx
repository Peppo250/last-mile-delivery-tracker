import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { AgentProfile, Role, Zone } from "../api/types";

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: "AGENT" as Role, zoneId: "" });

  function refresh() {
    api.get<AgentProfile[]>("/admin/agents").then(setAgents).catch((e) => setError(e.message));
    api.get<Zone[]>("/admin/zones").then(setZones).catch(() => {});
  }
  useEffect(refresh, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const created: any = await api.post("/admin/users", {
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        role: form.role,
        zoneId: form.role === "AGENT" ? form.zoneId || undefined : undefined,
      });
      setMsg(`Created ${form.role.toLowerCase()} "${created.name}" — user id: ${created.id}`);
      setForm({ name: "", email: "", password: "", phone: "", role: "AGENT", zoneId: "" });
      refresh();
    } catch (err: any) {
      setError(err.message || "Could not create user");
    }
  }

  async function toggleAvailability(agent: AgentProfile) {
    setError("");
    try {
      await api.patch(`/admin/agents/${agent.id}`, { isAvailable: !agent.isAvailable });
      refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <h1>Agents & user provisioning</h1>
      {error && <div className="error-box">{error}</div>}
      {msg && <div className="success-box">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>Create agent or admin account</h2>
          <p className="muted">Customers self-register; agent/admin accounts are provisioned here.</p>
          <form onSubmit={createUser}>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <label>Password</label>
            <input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <label>Phone (for SMS)</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="AGENT">Delivery Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
            {form.role === "AGENT" && (
              <>
                <label>Home zone</label>
                <select value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </>
            )}
            <button type="submit">Create account</button>
          </form>
        </div>

        <div className="card">
          <h2>Delivery agents ({agents.length})</h2>
          <table>
            <thead><tr><th>Name</th><th>Zone</th><th>Available</th><th></th></tr></thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td>{a.user.name}<div className="muted">{a.user.email}</div></td>
                  <td>{a.zone?.name || "—"}</td>
                  <td>{a.isAvailable ? "Yes" : "No (on a delivery)"}</td>
                  <td>
                    <button className="secondary" onClick={() => toggleAvailability(a)}>
                      Mark {a.isAvailable ? "unavailable" : "available"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
