
import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

// --------------------
// DEFAULT DATA
// --------------------

const EMPTY = {
  entries: [],
  outs: [],
  categories: [],
  products: [],
  suppliers: [],
  units: ['PCS', 'Pair', 'Set', 'Box', 'Dozen'],
};

const arr = (value) => Array.isArray(value) ? value : [];
const num = (value) => Number(value) || 0;

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random()}`;

const today = () => new Date().toISOString().slice(0, 10);

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('en-IN');
};

const money = (value) =>
  `₹${num(value).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;

// Legacy products were saved as strings.
// This also supports newer product objects.
function normalizeProduct(product) {
  if (typeof product === 'string') {
    return {
      id: product,
      name: product,
      category: '',
      price: 0,
    };
  }

  return {
    id: product?.id || product?.name || makeId(),
    name: product?.name || '',
    category: product?.category || '',
    price: num(product?.price),
  };
}

function normalizeData(raw = {}) {
  return {
    entries: arr(raw.entries),
    outs: arr(raw.outs),
    categories: arr(raw.categories),
    products: arr(raw.products).map(normalizeProduct),
    suppliers: arr(raw.suppliers),
    units: arr(raw.units).length
      ? arr(raw.units)
      : EMPTY.units,
  };
}

// --------------------
// MAIN APP
// --------------------

export default function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem('shiv_token') || ''
  );

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState(EMPTY);
  const [page, setPage] = useState('dashboard');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');

  const [sortBy, setSortBy] = useState('name-asc');

  const [master, setMaster] = useState({
    categories: '',
    suppliers: '',
    units: '',
  });
  const [quickAdd, setQuickAdd] = useState({
  type: '',
  value: '',
  });
  const [productDraft, setProductDraft] = useState({
    name: '',
    category: '',
    price: '',
    newCategory: '',
  });

  const [form, setForm] = useState({
    product: '',
    category: '',
    supplier: '',
    unit: 'PCS',
    boxes: '',
    pcs: '1',
    price: '',
    note: '',
  });

  const [out, setOut] = useState({
    product: '',
    supplier: '',
    boxes: '',
    note: '',
  });

  // PDF/report controls
  const [pdfCategory, setPdfCategory] = useState('all');
  const [pdfSupplier, setPdfSupplier] = useState('all');
  const [showParty, setShowParty] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [pdfOnlyAvailable, setPdfOnlyAvailable] = useState(false);

  // --------------------
  // API
  // --------------------

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  const logout = useCallback(() => {
    sessionStorage.removeItem('shiv_token');
    setToken('');
    setData(EMPTY);
    setNotice('Logout ho gaya');
  }, []);

  const load = useCallback(async (activeToken) => {
    if (!activeToken) return;

    setLoading(true);

    try {
      const response = await fetch('/api/data', {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (response.status === 401) {
        sessionStorage.removeItem('shiv_token');
        setToken('');
        setData(EMPTY);
        throw new Error('Session expire ho gaya. Dobara login karein.');
      }

      if (!response.ok) {
        throw new Error('Data load nahi hua');
      }

      const result = await response.json();
      setData(normalizeData(result));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      load(token);
    } else {
      setData(EMPTY);
    }
  }, [token, load]);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.token) {
        throw new Error(result.error || 'Login details galat hain');
      }

      sessionStorage.setItem('shiv_token', result.token);
      setToken(result.token);
      setPassword('');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(nextData, successMessage = 'Saved successfully') {
    setBusy(true);
    setNotice('');

    const payload = normalizeData(nextData);

    try {
      const response = await fetch('/api/data', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        logout();
        throw new Error('Session expire. Dobara login karein.');
      }

      if (!response.ok) {
        throw new Error(
          result.error || `Save failed (${response.status})`
        );
      }

      setData(payload);
      setNotice(successMessage);
      return true;
    } catch (error) {
      setNotice(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // --------------------
  // PRODUCT MASTER
  // --------------------

  const productList = useMemo(() => {
    const map = new Map();

    data.products.forEach((item) => {
      const product = normalizeProduct(item);
      if (product.name) {
        map.set(product.name.toLowerCase(), product);
      }
    });

    // Older stock entries may contain products
    // which are not present in Product Master.
    data.entries.forEach((entry) => {
      if (!entry.product) return;

      const key = String(entry.product).toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          id: entry.product,
          name: entry.product,
          category: entry.category || '',
          price: num(entry.price),
        });
      }
    });

    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [data.products, data.entries]);

  async function addProduct(event) {
    event.preventDefault();

    const name = productDraft.name.trim();
    const category = (
      productDraft.newCategory || productDraft.category
    ).trim();

    const price = num(productDraft.price);

    if (!name) {
      return setNotice('Product ka naam enter karein');
    }

    if (!category) {
      return setNotice('Category select ya add karein');
    }

    if (price < 0) {
      return setNotice('Price valid enter karein');
    }

    const alreadyExists = productList.some(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    );

    if (alreadyExists) {
      return setNotice('Ye product pehle se maujood hai');
    }

    const nextCategories = data.categories.some(
      (item) => item.toLowerCase() === category.toLowerCase()
    )
      ? data.categories
      : [...data.categories, category];

    const newProduct = {
      id: makeId(),
      name,
      category,
      price,
    };

    const success = await save({
      ...data,
      categories: nextCategories,
      products: [...data.products, newProduct],
    }, 'Product successfully add ho gaya');

    if (success) {
      setProductDraft({
        name: '',
        category: '',
        price: '',
        newCategory: '',
      });
    }
  }

  async function deleteProduct(product) {
    const used = data.entries.some(
      (entry) => entry.product === product.name
    );

    if (used) {
      return setNotice(
        'Ye product stock entries mein use ho raha hai. Pehle related records check karein.'
      );
    }

    if (!window.confirm(`${product.name} delete karein?`)) {
      return;
    }

    await save({
      ...data,
      products: data.products.filter(
        (item) => normalizeProduct(item).name !== product.name
      ),
    });
  }

  // --------------------
  // STOCK CALCULATION
  // --------------------

  const stock = useMemo(() => {
    const map = new Map();

    data.entries.forEach((entry) => {
      const product = entry.product || 'Unknown';
      const category = entry.category || '';
      const supplier = entry.supplier || '';
      const unit = entry.unit || 'PCS';

      // Separate batches by product + supplier + category.
      const key = [
        product,
        supplier,
        category,
      ].join('::');

      if (!map.has(key)) {
        map.set(key, {
          key,
          product,
          category,
          supplier,
          unit,
          incoming: 0,
          outgoing: 0,
          price: num(entry.price),
        });
      }

      const row = map.get(key);

      row.incoming += num(entry.boxes);

      if (entry.category) row.category = entry.category;
      if (entry.supplier) row.supplier = entry.supplier;
      if (entry.unit) row.unit = entry.unit;
      if (entry.price !== undefined) row.price = num(entry.price);
    });

    // For older stock-out records without supplier/category,
    // distribute the quantity FIFO across matching product batches.
    const batches = [...map.values()];

    data.outs.forEach((outEntry) => {
      let remaining = num(outEntry.boxes);

      const matching = batches
        .filter((batch) => {
          if (batch.product !== outEntry.product) return false;

          if (
            outEntry.supplier &&
            batch.supplier !== outEntry.supplier
          ) return false;

          if (
            outEntry.category &&
            batch.category !== outEntry.category
          ) return false;

          return true;
        })
        .sort((a, b) => a.key.localeCompare(b.key));

      for (const batch of matching) {
        if (remaining <= 0) break;

        const available = Math.max(
          0,
          batch.incoming - batch.outgoing
        );

        const used = Math.min(available, remaining);

        batch.outgoing += used;
        remaining -= used;
      }
    });

    return batches.map((batch) => ({
      ...batch,
      available: batch.incoming - batch.outgoing,
    }));
  }, [data.entries, data.outs]);

  const totalAvailable = stock.reduce(
    (sum, item) => sum + item.available,
    0
  );

  // --------------------
  // STOCK IN
  // --------------------

  function selectProductForStockIn(name) {
    const selected = productList.find(
      (item) => item.name === name
    );

    setForm((previous) => ({
      ...previous,
      product: name,
      category: selected?.category || previous.category,
      price: selected?.price
        ? String(selected.price)
        : previous.price,
    }));
  }

  async function addIn(event) {
    event.preventDefault();

    if (!form.product.trim() || num(form.boxes) <= 0) {
      return setNotice(
        'Product aur valid quantity bharna zaroori hai'
      );
    }

    const productName = form.product.trim();

    const entry = {
      ...form,
      id: makeId(),
      product: productName,
      boxes: num(form.boxes),
      pcs: Math.max(1, num(form.pcs)),
      price: num(form.price),
      createdAt: new Date().toISOString(),
    };

    const category = form.category.trim();

    const categories = category && !data.categories.some(
      (item) => item.toLowerCase() === category.toLowerCase()
    )
      ? [...data.categories, category]
      : data.categories;

    const success = await save({
      ...data,
      categories,
      entries: [...data.entries, entry],
    }, 'Stock In successfully save ho gaya');

    if (success) {
      setForm((previous) => ({
        ...previous,
        product: '',
        boxes: '',
        price: '',
        note: '',
      }));
    }
  }

  // --------------------
  // STOCK OUT
  // --------------------

  const availableForOut = useMemo(() => {
    if (!out.product) return 0;

    return stock
      .filter((item) => {
        if (item.product !== out.product) return false;

        if (
          out.supplier &&
          item.supplier !== out.supplier
        ) return false;

        return true;
      })
      .reduce((sum, item) => sum + item.available, 0);
  }, [stock, out.product, out.supplier]);

  async function addOut(event) {
    event.preventDefault();

    const quantity = num(out.boxes);

    if (!out.product || quantity <= 0) {
      return setNotice('Product aur quantity select karein');
    }

    if (quantity > availableForOut) {
      return setNotice(
        `Available stock ${availableForOut} hai`
      );
    }

    const record = {
      ...out,
      id: makeId(),
      boxes: quantity,
      createdAt: new Date().toISOString(),
    };

    const success = await save({
      ...data,
      outs: [...data.outs, record],
    }, 'Stock Out successfully save ho gaya');

    if (success) {
      setOut({
        product: '',
        supplier: '',
        boxes: '',
        note: '',
      });
    }
  }

  async function deleteOut(record) {
    if (
      !window.confirm(
        'Stock-out delete karein? Quantity wapas stock mein jud jayegi.'
      )
    ) return;

    await save({
      ...data,
      outs: data.outs.filter(
        (item) => item.id !== record.id
      ),
    });
  }

  async function deleteEntry(record) {
    const relatedOuts = data.outs.some(
      (item) => item.product === record.product
    );

    if (relatedOuts) {
      return setNotice(
        'Is product ke stock-out records pehle check/delete karein.'
      );
    }

    if (!window.confirm('Stock-in entry delete karein?')) {
      return;
    }

    await save({
      ...data,
      entries: data.entries.filter(
        (item) => item.id !== record.id
      ),
    });
  }

  // --------------------
  // CATEGORY / SUPPLIER / UNIT MASTER
  // --------------------

  async function addMaster(type) {
    const value = (master[type] || '').trim();

    if (!value) {
      return setNotice('Naam enter karein');
    }

    if (
      data[type].some(
        (item) => item.toLowerCase() === value.toLowerCase()
      )
    ) {
      return setNotice('Ye pehle se maujood hai');
    }

    const success = await save({
      ...data,
      [type]: [...data[type], value],
    });

    if (success) {
      setMaster((previous) => ({
        ...previous,
        [type]: '',
      }));
    }
  }
  async function addQuickMaster(event) {
  event.preventDefault();

  const { type, value } = quickAdd;
  const name = value.trim();

  if (!name) {
    setNotice('Naam enter karein');
    return;
  }

  if (type === 'products') {
    const exists = productList.some(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      setNotice('Product pehle se maujood hai');
      return;
    }

    const product = {
      id: makeId(),
      name,
      category: form.category,
      price: num(form.price),
    };

    const success = await save({
      ...data,
      products: [...data.products, product],
    }, 'Product add ho gaya');

    if (success) {
      setForm((prev) => ({ ...prev, product: name }));
      setQuickAdd({ type: '', value: '' });
    }

    return;
  }

  const exists = data[type].some(
    (item) => item.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    setNotice('Ye pehle se maujood hai');
    return;
  }

  const success = await save({
    ...data,
    [type]: [...data[type], name],
  }, 'Successfully add ho gaya');

  if (success) {
    const field = {
      categories: 'category',
      suppliers: 'supplier',
      units: 'unit',
    }[type];

    setForm((prev) => ({
      ...prev,
      [field]: name,
    }));

    setQuickAdd({ type: '', value: '' });
  }
}
  async function deleteMaster(type, value) {
    const used = data.entries.some((entry) => {
      const field = {
        categories: 'category',
        suppliers: 'supplier',
        units: 'unit',
      }[type];

      return entry[field] === value;
    });

    if (used) {
      return setNotice(
        'Ye item stock entries mein use ho raha hai'
      );
    }

    if (!window.confirm(`${value} delete karein?`)) {
      return;
    }

    await save({
      ...data,
      [type]: data[type].filter((item) => item !== value),
    });
  }

  // --------------------
  // STOCK FILTERS + SORT
  // --------------------

  const filteredStock = useMemo(() => {
    let result = stock.filter((item) => {
      const text = [
        item.product,
        item.category,
        item.supplier,
      ].join(' ').toLowerCase();

      if (!text.includes(search.toLowerCase())) {
        return false;
      }

      if (
        categoryFilter !== 'all' &&
        item.category !== categoryFilter
      ) return false;

      if (
        supplierFilter !== 'all' &&
        item.supplier !== supplierFilter
      ) return false;

      return true;
    });

    result = [...result];

    switch (sortBy) {
      case 'name-desc':
        result.sort((a, b) =>
          b.product.localeCompare(a.product)
        );
        break;

      case 'qty-high':
        result.sort((a, b) => b.available - a.available);
        break;

      case 'qty-low':
        result.sort((a, b) => a.available - b.available);
        break;

      case 'price-high':
        result.sort((a, b) => b.price - a.price);
        break;

      case 'price-low':
        result.sort((a, b) => a.price - b.price);
        break;

      default:
        result.sort((a, b) =>
          a.product.localeCompare(b.product)
        );
    }
    result = result.filter((item) => Number(item.available) > 0);
    return result;
  }, [
    stock,
    search,
    categoryFilter,
    supplierFilter,
    sortBy,
  ]);

  // --------------------
  // PDF REPORT
  // --------------------

  const pdfRows = useMemo(() => {
    return stock.filter((item) => {
      if (
        pdfCategory !== 'all' &&
        item.category !== pdfCategory
      ) return false;

      if (
        pdfSupplier !== 'all' &&
        item.supplier !== pdfSupplier
      ) return false;

      if (
        pdfOnlyAvailable &&
        item.available <= 0
      ) return false;

      return true;
    });
  }, [
    stock,
    pdfCategory,
    pdfSupplier,
    pdfOnlyAvailable,
  ]);

  

  // --------------------
  // LOGIN SCREEN
  // --------------------

  if (!token) {
    return (
      <main className="login-wrap">
        <form className="login-card" onSubmit={login}>
          <div className="login-mark">SH</div>

          <h1>Shiv Hardware</h1>
          <p>Stock Manager Login</p>

          <label>
            Username
            <input
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              required
              autoComplete="username"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
              autoComplete="current-password"
            />
          </label>

          <button disabled={busy}>
            {busy ? 'Logging in…' : 'Login'}
          </button>

          {notice && <p className="notice">{notice}</p>}
        </form>
        {/* QUICK ADD MASTER MODAL */}


      </main>
    );
  }

  const nav = [
    ['dashboard', 'Dashboard'],
    ['in', 'Stock In'],
    ['out', 'Stock Out'],
    ['stock', 'Current Stock'],
    ['history', 'History'],
    ['masters', 'Product Master'],
    ['reports', 'PDF Reports'],
  ];

  // --------------------
  // MAIN LAYOUT
  // --------------------
  const printReport = () => {
  window.print();
};
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <b>SH</b>
          <span>
            Shiv Hardware
            <small>Stock Manager</small>
          </span>
        </div>

        <nav>
          {nav.map(([key, label]) => (
            <button
              key={key}
              className={page === key ? 'active' : ''}
              onClick={() => {
                setPage(key);
                setNotice('');
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>
              {nav.find((item) => item[0] === page)?.[1]}
            </h1>
            <p>Inventory management</p>
          </div>

          <span className="status">
            {busy ? 'Saving…' : 'Connected'}
          </span>
        </header>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}

        {loading ? (
          <section className="panel">Loading…</section>
        ) : (
          <>
            {/* DASHBOARD */}

            {page === 'dashboard' && (
              <div className="dashboard-grid">
                {[
                  ['Products', productList.length],
                  ['Available Qty', totalAvailable],
                  ['Stock In Records', data.entries.length],
                  ['Stock Out Records', data.outs.length],
                ].map(([label, value]) => (
                  <article className="stat-card" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </article>
                ))}

                <section className="panel wide">
                  <div className="panel-heading">
                    <h2>Low Stock</h2>
                    <span className="muted">
                      Available quantity 5 or less
                    </span>
                  </div>

                  <StockTable
                    rows={stock.filter(
                      (item) =>
                        item.available > 0 &&
                        item.available <= 5
                    )}
                  />
                </section>
              </div>
            )}

            {/* STOCK IN */}

            {page === 'in' && (
              <section className="panel">
                <h2>Add Stock In</h2>

                <form className="form-grid" onSubmit={addIn}>
                  <label>
  Product
  <div className="quick-select">
    <input
      list="product-options"
      value={form.product}
      onChange={(e) =>
        selectProductForStockIn(e.target.value)
      }
      required
      placeholder="Product name"
    />

    <button
      type="button"
      className="quick-add-btn"
      onClick={() =>
        setQuickAdd({ type: 'products', value: '' })
      }
    >
      +
    </button>
  </div>

  <datalist id="product-options">
    {productList.map((item) => (
      <option key={item.id} value={item.name} />
    ))}
  </datalist>
</label>

                  <label>
  Category
  <div className="quick-select">
    <select
      value={form.category}
      onChange={(e) =>
        setForm({ ...form, category: e.target.value })
      }
    >
      <option value="">Select category</option>
      {data.categories.map((item) => (
        <option key={item} value={item}>{item}</option>
      ))}
    </select>

    <button
      type="button"
      className="quick-add-btn"
      onClick={() =>
        setQuickAdd({ type: 'categories', value: '' })
      }
    >
      +
    </button>
  </div>
</label>
                  <label>
  Supplier / Party
  <div className="quick-select">
    <select
      value={form.supplier}
      onChange={(e) =>
        setForm({ ...form, supplier: e.target.value })
      }
    >
      <option value="">Select supplier</option>
      {data.suppliers.map((item) => (
        <option key={item} value={item}>{item}</option>
      ))}
    </select>

    <button
      type="button"
      className="quick-add-btn"
      onClick={() =>
        setQuickAdd({ type: 'suppliers', value: '' })
      }
    >
      +
    </button>
  </div>
</label>

                  <label>
  Unit
  <div className="quick-select">
    <select
      value={form.unit}
      onChange={(e) =>
        setForm({ ...form, unit: e.target.value })
      }
    >
      {data.units.map((item) => (
        <option key={item} value={item}>{item}</option>
      ))}
    </select>

    <button
      type="button"
      className="quick-add-btn"
      onClick={() =>
        setQuickAdd({ type: 'units', value: '' })
      }
    >
      +
    </button>
  </div>
</label>

                  <label>
                    Boxes / Quantity
                    <input
                      type="number"
                      min="1"
                      value={form.boxes}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          boxes: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Units per Box
                    <input
                      type="number"
                      min="1"
                      value={form.pcs}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          pcs: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Unit Price (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          price: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Note
                    <input
                      value={form.note}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          note: event.target.value,
                        })
                      }
                    />
                  </label>

                  <button disabled={busy}>
                    {busy ? 'Saving…' : 'Save Stock In'}
                  </button>
                </form>
              </section>
            )}

            {/* STOCK OUT */}

            {page === 'out' && (
              <section className="panel">
                <h2>Stock Out</h2>

                <form className="form-grid" onSubmit={addOut}>
                  <label>
                    Product
                    <select
                      value={out.product}
                      onChange={(event) =>
                        setOut({
                          ...out,
                          product: event.target.value,
                          supplier: '',
                        })
                      }
                      required
                    >
                      <option value="">Select product</option>

                      {[...new Set(
                        stock
                          .filter((item) => item.available > 0)
                          .map((item) => item.product)
                      )].sort().map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Supplier / Party
                    <select
                      value={out.supplier}
                      onChange={(event) =>
                        setOut({
                          ...out,
                          supplier: event.target.value,
                        })
                      }
                    >
                      <option value="">All parties</option>

                      {[...new Set(
                        stock
                          .filter(
                            (item) =>
                              item.product === out.product &&
                              item.available > 0
                          )
                          .map((item) => item.supplier)
                          .filter(Boolean)
                      )].sort().map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Available Quantity
                    <div className="readonly">
                      {availableForOut}
                    </div>
                  </label>

                  <label>
                    Boxes / Quantity
                    <input
                      type="number"
                      min="1"
                      max={availableForOut}
                      value={out.boxes}
                      onChange={(event) =>
                        setOut({
                          ...out,
                          boxes: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Note
                    <input
                      value={out.note}
                      onChange={(event) =>
                        setOut({
                          ...out,
                          note: event.target.value,
                        })
                      }
                    />
                  </label>

                  <button disabled={busy}>
                    {busy ? 'Saving…' : 'Save Stock Out'}
                  </button>
                </form>
              </section>
            )}

            {/* CURRENT STOCK */}

            {page === 'stock' && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Current Stock</h2>
                  <span className="muted">
                    {filteredStock.length} records
                  </span>
                </div>

                <div className="filters">
                  <input
                    placeholder="Search product, category, party…"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />

                  <select
                    value={categoryFilter}
                    onChange={(event) =>
                      setCategoryFilter(event.target.value)
                    }
                  >
                    <option value="all">All Categories</option>
                    {data.categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>

                  <select
                    value={supplierFilter}
                    onChange={(event) =>
                      setSupplierFilter(event.target.value)
                    }
                  >
                    <option value="all">All Parties</option>
                    {data.suppliers.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sortBy}
                    onChange={(event) =>
                      setSortBy(event.target.value)
                    }
                  >
                    <option value="name-asc">Name A–Z</option>
                    <option value="name-desc">Name Z–A</option>
                    <option value="qty-high">Qty High–Low</option>
                    <option value="qty-low">Qty Low–High</option>
                    <option value="price-high">Price High–Low</option>
                    <option value="price-low">Price Low–High</option>
                  </select>
                </div>

                <StockTable rows={filteredStock} />
              </section>
            )}

            {/* HISTORY */}

            {page === 'history' && (
              <section className="panel">
                <h2>History — Stock In</h2>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Supplier</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Price</th>
                        <th></th>
                      </tr>
                    </thead>

                    <tbody>
                      {[...data.entries].reverse().map((item) => (
                        <tr key={item.id}>
                          <td>{formatDate(item.createdAt)}</td>
                          <td>{item.product}</td>
                          <td>{item.category || '—'}</td>
                          <td>{item.supplier || '—'}</td>
                          <td>{item.boxes}</td>
                          <td>{item.unit || 'PCS'}</td>
                          <td>{money(item.price)}</td>
                          <td>
                            <button
                              className="danger"
                              onClick={() => deleteEntry(item)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2 className="subhead">History — Stock Out</h2>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Party</th>
                        <th>Qty</th>
                        <th>Note</th>
                        <th></th>
                      </tr>
                    </thead>

                    <tbody>
                      {[...data.outs].reverse().map((item) => (
                        <tr key={item.id}>
                          <td>{formatDate(item.createdAt)}</td>
                          <td>{item.product}</td>
                          <td>{item.supplier || '—'}</td>
                          <td>{item.boxes}</td>
                          <td>{item.note || '—'}</td>
                          <td>
                            <button
                              className="danger"
                              onClick={() => deleteOut(item)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* PRODUCT MASTER */}

            {page === 'masters' && (
              <>
                <section className="panel">
                  <h2>Add New Product</h2>
                  <p className="muted">
                    Product, category aur price ek hi form mein add karein.
                  </p>

                  <form
                    className="form-grid"
                    onSubmit={addProduct}
                  >
                    <label>
                      Product Name
                      <input
                        value={productDraft.name}
                        onChange={(event) =>
                          setProductDraft({
                            ...productDraft,
                            name: event.target.value,
                          })
                        }
                        placeholder="Product name"
                        required
                      />
                    </label>

                    <label>
                      Existing Category
                      <select
                        value={productDraft.category}
                        onChange={(event) =>
                          setProductDraft({
                            ...productDraft,
                            category: event.target.value,
                            newCategory: '',
                          })
                        }
                      >
                        <option value="">Select category</option>
                        {data.categories.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Or Add New Category
                      <input
                        value={productDraft.newCategory}
                        onChange={(event) =>
                          setProductDraft({
                            ...productDraft,
                            newCategory: event.target.value,
                          })
                        }
                        placeholder="New category"
                      />
                    </label>

                    <label>
                      Default Price (₹)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={productDraft.price}
                        onChange={(event) =>
                          setProductDraft({
                            ...productDraft,
                            price: event.target.value,
                          })
                        }
                        placeholder="0.00"
                      />
                    </label>

                    <button disabled={busy}>
                      {busy ? 'Saving…' : 'Add Product'}
                    </button>
                  </form>
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <h2>Product List</h2>
                    <span className="muted">
                      {productList.length} products
                    </span>
                  </div>

                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Category</th>
                          <th>Default Price</th>
                          <th></th>
                        </tr>
                      </thead>

                      <tbody>
                        {productList.map((item) => (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>{item.category || '—'}</td>
                            <td>{money(item.price)}</td>
                            <td>
                              <button
                                className="danger"
                                onClick={() => deleteProduct(item)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="master-grid">
                  {[
                    ['categories', 'Categories'],
                    ['suppliers', 'Suppliers / Parties'],
                    ['units', 'Units'],
                  ].map(([type, title]) => (
                    <section
                      className="panel master-card"
                      key={type}
                    >
                      <h2>{title}</h2>

                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          addMaster(type);
                        }}
                      >
                        <input
                          placeholder={`New ${title}`}
                          value={master[type]}
                          onChange={(event) =>
                            setMaster({
                              ...master,
                              [type]: event.target.value,
                            })
                          }
                        />

                        <button disabled={busy}>Add</button>
                      </form>

                      <ul>
                        {data[type].map((item) => (
                          <li key={item}>
                            <span>{item}</span>

                            <button
                              className="danger"
                              onClick={() =>
                                deleteMaster(type, item)
                              }
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}

            {/* PDF REPORTS */}

            {page === 'reports' && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Stock Report</h2>
                  <span className="muted">
                    PDF / Print
                  </span>
                </div>

                <div className="filters">
                  <select
                    value={pdfCategory}
                    onChange={(event) =>
                      setPdfCategory(event.target.value)
                    }
                  >
                    <option value="all">All Categories</option>
                    {data.categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>

                  <select
                    value={pdfSupplier}
                    onChange={(event) =>
                      setPdfSupplier(event.target.value)
                    }
                  >
                    <option value="all">All Parties</option>
                    {data.suppliers.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="calculation">
                  <div>
                    <span>Report Items</span>
                    <strong>{pdfRows.length}</strong>
                  </div>

                  <div>
                    <span>Total Available Qty</span>
                    <strong>
                      {pdfRows.reduce(
                        (sum, item) => sum + item.available,
                        0
                      )}
                    </strong>
                  </div>
                </div>

                <div className="filters">
                  <label className="price-toggle">
                    <input
                      type="checkbox"
                      checked={showParty}
                      onChange={(event) =>
                        setShowParty(event.target.checked)
                      }
                    />
                    Show Party
                  </label>

                  <label className="price-toggle">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(event) =>
                        setShowPrice(event.target.checked)
                      }
                    />
                    Show Price
                  </label>

                  <label className="price-toggle">
                    <input
                      type="checkbox"
                      checked={pdfOnlyAvailable}
                      onChange={(event) =>
                        setPdfOnlyAvailable(event.target.checked)
                      }
                    />
                    Available stock only
                  </label>
                </div>

                <button
                  className="primary"
                  onClick={printReport}
                >
                  Export / Print PDF
                </button>

                <div className="table-scroll">
                  <StockTable rows={pdfRows} />
                </div>
              </section>
            )}
          </>
        )}

        {/* PRINT-ONLY REPORT */}

        <section className="print-area">
          <h1>Shiv Hardware</h1>
          <h2>Current Stock Report</h2>

          <p>
            Date: {new Date().toLocaleDateString('en-IN')}
          </p>

          <p>
            Category:{' '}
            {pdfCategory === 'all' ? 'All' : pdfCategory}
          </p>

          {showParty && (
            <p>
              Party:{' '}
              {pdfSupplier === 'all' ? 'All' : pdfSupplier}
            </p>
          )}

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>

                {showParty && <th>Party</th>}

                <th>Stock In</th>
                <th>Stock Out</th>
                <th>Available</th>

                {showPrice && <th>Price</th>}
              </tr>
            </thead>

            <tbody>
              {pdfRows.map((item) => (
                <tr key={item.key}>
                  <td>{item.product}</td>
                  <td>{item.category || '—'}</td>

                  {showParty && (
                    <td>{item.supplier || '—'}</td>
                  )}

                  <td>{item.incoming}</td>
                  <td>{item.outgoing}</td>
                  <td>{item.available}</td>

                  {showPrice && (
                    <td>{money(item.price)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            Total Available Quantity:{' '}
            {pdfRows.reduce(
              (sum, item) => sum + item.available,
              0
            )}
          </p>
        </section>
        {/* QUICK ADD MASTER MODAL */}
{quickAdd.type && (
  <div className="quick-modal-backdrop">
    <form
      className="quick-modal"
      onSubmit={addQuickMaster}
    >
      <h2>
        Add {
          quickAdd.type === 'products'
            ? 'Product'
            : quickAdd.type === 'categories'
            ? 'Category'
            : quickAdd.type === 'suppliers'
            ? 'Supplier / Party'
            : 'Unit'
        }
      </h2>

      <input
        autoFocus
        value={quickAdd.value}
        onChange={(e) =>
          setQuickAdd({
            ...quickAdd,
            value: e.target.value,
          })
        }
        placeholder="Naam enter karein"
        required
      />

      <div className="quick-modal-actions">
        <button
          type="button"
          onClick={() =>
            setQuickAdd({ type: '', value: '' })
          }
        >
          Cancel
        </button>

        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add'}
        </button>
      </div>
    </form>
  </div>
)}

        <footer>
          Shiv Hardware Stock Manager · Shared data sync
        </footer>
      </main>
    </div>
  );
}

// --------------------
// STOCK TABLE
// --------------------

function StockTable({ rows }) {
  if (!rows.length) {
    return (
      <p className="empty-state">
        Koi record nahi hai.
      </p>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Supplier / Party</th>
            <th>Unit</th>
            <th>Stock In</th>
            <th>Stock Out</th>
            <th>Available</th>
            <th>Price</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((item) => (
            <tr key={item.key}>
              <td>{item.product}</td>
              <td>{item.category || '—'}</td>
              <td>{item.supplier || '—'}</td>
              <td>{item.unit || 'PCS'}</td>
              <td>{item.incoming}</td>
              <td>{item.outgoing}</td>
              <td>
                <b>{item.available}</b>
              </td>
              <td>{money(item.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}