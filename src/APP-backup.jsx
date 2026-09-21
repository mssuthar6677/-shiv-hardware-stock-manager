
import { useState } from "react";
import "./App.css";

export default function App() {
  const [product, setProduct] = useState("");
  const [pcs, setPcs] = useState("");
  const [boxes, setBoxes] = useState("");
  const [price, setPrice] = useState("");
  const [supplier, setSupplier] = useState("");

  const [entries, setEntries] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("shivStockEntries")) || [];
    } catch {
      return [];
    }
  });

  const totalPcs = Number(pcs || 0) * Number(boxes || 0);
  const totalPrice = totalPcs * Number(price || 0);

  function saveEntry(e) {
    e.preventDefault();

    if (!product.trim() || !pcs || !boxes || !price || !supplier.trim()) {
      alert("कृपया सभी 5 विकल्प भरें");
      return;
    }

    if (Number(pcs) <= 0 || Number(boxes) <= 0 || Number(price) <= 0) {
      alert("PCS, Box और Price शून्य से ज्यादा होने चाहिए");
      return;
    }

    const newEntry = {
      id: Date.now(),
      product: product.trim(),
      pcs: Number(pcs),
      boxes: Number(boxes),
      price: Number(price),
      supplier: supplier.trim(),
      totalPcs,
      totalPrice,
      date: new Date().toLocaleDateString("en-IN")
    };

    const updated = [newEntry, ...entries];

    setEntries(updated);
    localStorage.setItem("shivStockEntries", JSON.stringify(updated));

    setProduct("");
    setPcs("");
    setBoxes("");
    setPrice("");
    setSupplier("");
    alert("Stock Entry सेव हो गई!");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Shiv Hardware</h2>
        <p>Stock Manager</p>
        <p>📦 Stock Entry</p>
      </aside>

      <main className="main">
        <h1>Shiv Hardware Stock Manager</h1>
        <h2>नई Stock Entry</h2>

        <form className="product-form" onSubmit={saveEntry}>
          <label>Product</label>
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="जैसे: Telescopic Channel"
            required
          />

          <label>PCS in Box</label>
          <input
            type="number"
            min="1"
            value={pcs}
            onChange={(e) => setPcs(e.target.value)}
            placeholder="जैसे: 20"
            required
          />

          <label>Box</label>
          <input
            type="number"
            min="1"
            value={boxes}
            onChange={(e) => setBoxes(e.target.value)}
            placeholder="जैसे: 10"
            required
          />

          <label>Price (per PCS ₹)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="जैसे: 25"
            required
          />

          <label>Supplier</label>
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="जैसे: ABC Traders"
            required
          />

          <div className="summary">
            <p>कुल PCS: <strong>{totalPcs}</strong></p>
            <p>कुल खरीद कीमत: <strong>₹{totalPrice.toLocaleString("en-IN")}</strong></p>
          </div>

          <button type="submit">Stock Entry सेव करें</button>
        </form>

        <h2>Stock Entry History ({entries.length})</h2>

        <div style={{ overflowX: "auto" }}>
          <table className="product-table">
            <thead>
              <tr>
                <th>तारीख</th>
                <th>Product</th>
                <th>PCS/Box</th>
                <th>Box</th>
                <th>Price/PCS</th>
                <th>Supplier</th>
                <th>Total PCS</th>
                <th>Total ₹</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td>{item.product}</td>
                  <td>{item.pcs}</td>
                  <td>{item.boxes}</td>
                  <td>₹{item.price}</td>
                  <td>{item.supplier}</td>
                  <td>{item.totalPcs}</td>
                  <td>₹{item.totalPrice.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}