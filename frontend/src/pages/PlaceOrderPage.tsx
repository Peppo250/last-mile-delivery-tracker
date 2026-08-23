import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Area, ChargeBreakdown, OrderType, PaymentType } from "../api/types";
import { useAuth } from "../context/AuthContext";

const emptyForm = {
  pickupAddress: "",
  dropAddress: "",
  pickupAreaId: "",
  dropAreaId: "",
  lengthCm: "",
  breadthCm: "",
  heightCm: "",
  actualWeightKg: "",
  orderType: "B2C" as OrderType,
  paymentType: "PREPAID" as PaymentType,
  scheduledDate: "",
  customerEmail: "",
};

export default function PlaceOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [areas, setAreas] = useState<Area[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [quote, setQuote] = useState<ChargeBreakdown | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Area[]>("/areas").then(setAreas).catch((e) => setError(e.message));
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setQuote(null);
  }

  const canQuote =
    form.pickupAreaId && form.dropAreaId && form.lengthCm && form.breadthCm && form.heightCm && form.actualWeightKg;

  async function fetchQuote() {
    setError("");
    setQuoting(true);
    try {
      const q = await api.post<ChargeBreakdown>("/orders/quote", {
        pickupAreaId: form.pickupAreaId,
        dropAreaId: form.dropAreaId,
        lengthCm: Number(form.lengthCm),
        breadthCm: Number(form.breadthCm),
        heightCm: Number(form.heightCm),
        actualWeightKg: Number(form.actualWeightKg),
        orderType: form.orderType,
        paymentType: form.paymentType,
      });
      setQuote(q);
    } catch (err: any) {
      setError(err.message || "Could not calculate charge");
    } finally {
      setQuoting(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (!quote) return;
    setError("");
    setSubmitting(true);
    try {
      const payload: any = {
        pickupAddress: form.pickupAddress,
        dropAddress: form.dropAddress,
        pickupAreaId: form.pickupAreaId,
        dropAreaId: form.dropAreaId,
        lengthCm: Number(form.lengthCm),
        breadthCm: Number(form.breadthCm),
        heightCm: Number(form.heightCm),
        actualWeightKg: Number(form.actualWeightKg),
        orderType: form.orderType,
        paymentType: form.paymentType,
      };
      if (form.scheduledDate) payload.scheduledDate = new Date(form.scheduledDate).toISOString();
      if (user?.role === "ADMIN" && form.customerEmail) {
        // Admin placing an order on behalf of a customer: resolve email -> id server-side
        // via a lightweight lookup is out of scope for this simple form, so we
        // require the admin to paste the customer's user id here instead.
        payload.customerId = form.customerEmail;
      }
      const order = await api.post<{ id: string }>("/orders", payload);
      navigate(`/orders/${order.id}`);
    } catch (err: any) {
      setError(err.message || "Could not place order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container">
      <h1>Place a new order</h1>
      {error && <div className="error-box">{error}</div>}

      <form onSubmit={handleConfirm}>
        <div className="card">
          <h2>Addresses</h2>
          <div className="grid-2">
            <div>
              <label>Pickup address (free text)</label>
              <input value={form.pickupAddress} onChange={(e) => update("pickupAddress", e.target.value)} required />
              <label>Pickup service area</label>
              <select value={form.pickupAreaId} onChange={(e) => update("pickupAreaId", e.target.value)} required>
                <option value="">Select area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.pincode}) — {a.zone?.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Drop address (free text)</label>
              <input value={form.dropAddress} onChange={(e) => update("dropAddress", e.target.value)} required />
              <label>Drop service area</label>
              <select value={form.dropAreaId} onChange={(e) => update("dropAreaId", e.target.value)} required>
                <option value="">Select area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.pincode}) — {a.zone?.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Package details</h2>
          <div className="grid-3">
            <div>
              <label>Length (cm)</label>
              <input type="number" step="0.1" value={form.lengthCm} onChange={(e) => update("lengthCm", e.target.value)} required />
            </div>
            <div>
              <label>Breadth (cm)</label>
              <input type="number" step="0.1" value={form.breadthCm} onChange={(e) => update("breadthCm", e.target.value)} required />
            </div>
            <div>
              <label>Height (cm)</label>
              <input type="number" step="0.1" value={form.heightCm} onChange={(e) => update("heightCm", e.target.value)} required />
            </div>
          </div>
          <label>Actual weight (kg)</label>
          <input type="number" step="0.01" value={form.actualWeightKg} onChange={(e) => update("actualWeightKg", e.target.value)} required />
        </div>

        <div className="card">
          <h2>Order type & payment</h2>
          <div className="grid-2">
            <div>
              <label>Order type</label>
              <select value={form.orderType} onChange={(e) => update("orderType", e.target.value as OrderType)}>
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
            </div>
            <div>
              <label>Payment type</label>
              <select value={form.paymentType} onChange={(e) => update("paymentType", e.target.value as PaymentType)}>
                <option value="PREPAID">Prepaid</option>
                <option value="COD">Cash on Delivery</option>
              </select>
            </div>
          </div>
          <label>Preferred delivery date (optional)</label>
          <input type="date" value={form.scheduledDate} onChange={(e) => update("scheduledDate", e.target.value)} />

          {user?.role === "ADMIN" && (
            <>
              <label>Customer user ID (leave blank to place for yourself)</label>
              <input
                placeholder="Paste customer's user id from Admin > Agents/Users"
                value={form.customerEmail}
                onChange={(e) => update("customerEmail", e.target.value)}
              />
            </>
          )}
        </div>

        <div className="card">
          <h2>Charge preview</h2>
          <button type="button" className="secondary" disabled={!canQuote || quoting} onClick={fetchQuote}>
            {quoting ? "Calculating..." : "Calculate charge"}
          </button>

          {quote && (
            <div className="charge-box" style={{ marginTop: "1rem" }}>
              <div className="row"><span>Volumetric weight</span><span>{quote.volumetricWeightKg} kg</span></div>
              <div className="row"><span>Billable weight (higher of actual/volumetric)</span><span>{quote.billableWeightKg} kg</span></div>
              <div className="row"><span>Zone relation</span><span>{quote.zoneRelation}</span></div>
              <div className="row"><span>Base charge</span><span>₹{quote.baseCharge}</span></div>
              <div className="row"><span>Weight charge</span><span>₹{quote.weightCharge}</span></div>
              <div className="row"><span>COD surcharge</span><span>₹{quote.codSurcharge}</span></div>
              <div className="row total"><span>Total</span><span>₹{quote.totalCharge}</span></div>
            </div>
          )}

          <button type="submit" disabled={!quote || submitting}>
            {submitting ? "Placing order..." : "Confirm & place order"}
          </button>
        </div>
      </form>
    </div>
  );
}
