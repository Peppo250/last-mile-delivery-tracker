import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Area, CodSurchargeRule, OrderType, RateCard, SurchargeMode, Zone, ZoneRelation } from "../api/types";

type Tab = "zones" | "areas" | "rates" | "cod";

export default function AdminConfigPage() {
  const [tab, setTab] = useState<Tab>("zones");
  const [zones, setZones] = useState<Zone[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [codRules, setCodRules] = useState<CodSurchargeRule[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  function refreshAll() {
    api.get<Zone[]>("/admin/zones").then(setZones).catch((e) => setError(e.message));
    api.get<Area[]>("/admin/areas").then(setAreas).catch(() => {});
    api.get<RateCard[]>("/admin/rate-cards").then(setRateCards).catch(() => {});
    api.get<CodSurchargeRule[]>("/admin/cod-surcharge").then(setCodRules).catch(() => {});
  }

  useEffect(refreshAll, []);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(""), 3000);
  }

  // --- Zones ---
  const [zoneName, setZoneName] = useState("");
  async function addZone(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/zones", { name: zoneName });
      setZoneName("");
      flash("Zone added.");
      refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }
  async function deleteZone(id: string) {
    setError("");
    try {
      await api.del(`/admin/zones/${id}`);
      flash("Zone removed.");
      refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // --- Areas ---
  const [areaForm, setAreaForm] = useState({ name: "", pincode: "", zoneId: "" });
  async function addArea(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/areas", areaForm);
      setAreaForm({ name: "", pincode: "", zoneId: "" });
      flash("Area added.");
      refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }
  async function deleteArea(id: string) {
    setError("");
    try {
      await api.del(`/admin/areas/${id}`);
      flash("Area removed.");
      refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // --- Rate cards ---
  const [rateForm, setRateForm] = useState({
    orderType: "B2C" as OrderType,
    zoneRelation: "INTRA" as ZoneRelation,
    baseCharge: "",
    ratePerKg: "",
  });
  async function saveRateCard(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/rate-cards", {
        orderType: rateForm.orderType,
        zoneRelation: rateForm.zoneRelation,
        baseCharge: Number(rateForm.baseCharge),
        ratePerKg: Number(rateForm.ratePerKg),
      });
      flash("Rate card saved.");
      refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // --- COD surcharge ---
  const [codForm, setCodForm] = useState({ orderType: "B2C" as OrderType, mode: "FLAT" as SurchargeMode, value: "" });
  async function saveCod(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/admin/cod-surcharge", {
        orderType: codForm.orderType,
        mode: codForm.mode,
        value: Number(codForm.value),
      });
      flash("COD surcharge rule saved.");
      refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <h1>Zones, Areas & Rate Configuration</h1>
      {error && <div className="error-box">{error}</div>}
      {msg && <div className="success-box">{msg}</div>}

      <div className="tabs">
        <button className={tab === "zones" ? "active" : ""} onClick={() => setTab("zones")}>Zones</button>
        <button className={tab === "areas" ? "active" : ""} onClick={() => setTab("areas")}>Areas</button>
        <button className={tab === "rates" ? "active" : ""} onClick={() => setTab("rates")}>Rate cards</button>
        <button className={tab === "cod" ? "active" : ""} onClick={() => setTab("cod")}>COD surcharge</button>
      </div>

      {tab === "zones" && (
        <div className="grid-2">
          <div className="card">
            <h2>Add zone</h2>
            <form onSubmit={addZone}>
              <label>Zone name</label>
              <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} required />
              <button type="submit">Add zone</button>
            </form>
          </div>
          <div className="card">
            <h2>Existing zones</h2>
            <table>
              <thead><tr><th>Name</th><th>Areas</th><th></th></tr></thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td>{z.name}</td>
                    <td>{z.areas?.length ?? 0}</td>
                    <td><button className="danger" onClick={() => deleteZone(z.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "areas" && (
        <div className="grid-2">
          <div className="card">
            <h2>Add area</h2>
            <form onSubmit={addArea}>
              <label>Area name</label>
              <input value={areaForm.name} onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })} required />
              <label>Pincode</label>
              <input value={areaForm.pincode} onChange={(e) => setAreaForm({ ...areaForm, pincode: e.target.value })} required />
              <label>Zone</label>
              <select value={areaForm.zoneId} onChange={(e) => setAreaForm({ ...areaForm, zoneId: e.target.value })} required>
                <option value="">Select zone</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
              <button type="submit">Add area</button>
            </form>
          </div>
          <div className="card">
            <h2>Existing areas</h2>
            <table>
              <thead><tr><th>Name</th><th>Pincode</th><th>Zone</th><th></th></tr></thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.pincode}</td>
                    <td>{a.zone?.name}</td>
                    <td><button className="danger" onClick={() => deleteArea(a.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "rates" && (
        <div className="grid-2">
          <div className="card">
            <h2>Set rate card</h2>
            <p className="muted">One row per (order type × zone relation) combination — set all 4 for full coverage.</p>
            <form onSubmit={saveRateCard}>
              <label>Order type</label>
              <select value={rateForm.orderType} onChange={(e) => setRateForm({ ...rateForm, orderType: e.target.value as OrderType })}>
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
              <label>Zone relation</label>
              <select value={rateForm.zoneRelation} onChange={(e) => setRateForm({ ...rateForm, zoneRelation: e.target.value as ZoneRelation })}>
                <option value="INTRA">Intra-zone (same zone)</option>
                <option value="INTER">Inter-zone (different zones)</option>
              </select>
              <label>Base charge (₹)</label>
              <input type="number" step="0.01" value={rateForm.baseCharge} onChange={(e) => setRateForm({ ...rateForm, baseCharge: e.target.value })} required />
              <label>Rate per kg (₹)</label>
              <input type="number" step="0.01" value={rateForm.ratePerKg} onChange={(e) => setRateForm({ ...rateForm, ratePerKg: e.target.value })} required />
              <button type="submit">Save rate card</button>
            </form>
          </div>
          <div className="card">
            <h2>Current rate cards</h2>
            <table>
              <thead><tr><th>Type</th><th>Zone</th><th>Base</th><th>Per kg</th></tr></thead>
              <tbody>
                {rateCards.map((r) => (
                  <tr key={r.id}>
                    <td>{r.orderType}</td>
                    <td>{r.zoneRelation}</td>
                    <td>₹{r.baseCharge}</td>
                    <td>₹{r.ratePerKg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "cod" && (
        <div className="grid-2">
          <div className="card">
            <h2>Set COD surcharge rule</h2>
            <form onSubmit={saveCod}>
              <label>Order type</label>
              <select value={codForm.orderType} onChange={(e) => setCodForm({ ...codForm, orderType: e.target.value as OrderType })}>
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
              <label>Mode</label>
              <select value={codForm.mode} onChange={(e) => setCodForm({ ...codForm, mode: e.target.value as SurchargeMode })}>
                <option value="FLAT">Flat amount (₹)</option>
                <option value="PERCENT">Percentage of freight charge</option>
              </select>
              <label>Value</label>
              <input type="number" step="0.01" value={codForm.value} onChange={(e) => setCodForm({ ...codForm, value: e.target.value })} required />
              <button type="submit">Save rule</button>
            </form>
          </div>
          <div className="card">
            <h2>Current COD rules</h2>
            <table>
              <thead><tr><th>Type</th><th>Mode</th><th>Value</th></tr></thead>
              <tbody>
                {codRules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.orderType}</td>
                    <td>{r.mode}</td>
                    <td>{r.mode === "FLAT" ? `₹${r.value}` : `${r.value}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
