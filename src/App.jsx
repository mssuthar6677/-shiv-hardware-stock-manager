
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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
  const [historySearch, setHistorySearch] = useState('');
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
  staffName: '',
  boxes: '',
  note: '',
});

  // PDF/report controls
  const [pdfCategory, setPdfCategory] = useState('all');
  const [pdfSupplier, setPdfSupplier] = useState('all');
  const [showParty, setShowParty] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [pdfOnlyAvailable, setPdfOnlyAvailable] = useState(false);
  const [editingStockIn, setEditingStockIn] = useState(null);
  const [editingStockOut, setEditingStockOut] = useState(null);

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

    // Build stock batches using product, supplier,
    // category and PCS-per-box.
    data.entries.forEach((entry) => {
      const product = entry.product || 'Unknown';
      const category = entry.category || '';
      const supplier = entry.supplier || '';
      const unit = entry.unit || 'PCS';
      const pcsPerBox = Math.max(1, num(entry.pcs) || 1);

      const key = [
        product,
        supplier,
        category,
        pcsPerBox,
      ].join('::');

      if (!map.has(key)) {
        map.set(key, {
          key,
          product,
          category,
          supplier,
          unit,
          pcsPerBox,
          incoming: 0,
          outgoing: 0,
          incomingPcs: 0,
          outgoingPcs: 0,
          price: num(entry.price),
        });
      }

      const row = map.get(key);
      const boxes = num(entry.boxes);

      row.incoming += boxes;
      row.incomingPcs += boxes * pcsPerBox;

      if (entry.price !== undefined) {
        row.price = num(entry.price);
      }
    });

    const batches = [...map.values()];

    // Deduct older Stock Out records by box quantity.
    data.outs.forEach((outEntry) => {
      let remainingBoxes = num(outEntry.boxes);

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
        if (remainingBoxes <= 0) break;

        const availableBoxes =
          batch.incoming - batch.outgoing;

        const usedBoxes = Math.min(
          Math.max(0, availableBoxes),
          remainingBoxes
        );

        batch.outgoing += usedBoxes;
        batch.outgoingPcs +=
          usedBoxes * batch.pcsPerBox;

        remainingBoxes -= usedBoxes;
      }
    });

    return batches.map((batch) => {
      const available = batch.incoming - batch.outgoing;
      const availablePcs =
        batch.incomingPcs - batch.outgoingPcs;

      return {
        ...batch,
        available,
        availablePcs,
        totalInAmount:
          batch.incomingPcs * batch.price,
        totalOutAmount:
          batch.outgoingPcs * batch.price,
        availableAmount:
          availablePcs * batch.price,
      };
    });
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
  staffName: out.staffName.trim(),
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
      staffName: '',
      boxes: '',
      note: '',
      });
    }
  }
    function startEditStockIn(record) {
    setEditingStockIn({
      ...record,
      product: record.product || '',
      category: record.category || '',
      supplier: record.supplier || '',
      unit: record.unit || 'PCS',
      pcs: record.pcs || 1,
      boxes: record.boxes || 1,
      price: record.price ?? '',
      note: record.note || '',
    });
  }

  function startEditStockOut(record) {
    setEditingStockOut({
      ...record,
      product: record.product || '',
      supplier: record.supplier || '',
      staffName: record.staffName || '',
      boxes: record.boxes || 1,
      note: record.note || '',
    });
  }

  async function saveEditedStockIn(event) {
    event.preventDefault();

    if (!editingStockIn) return;

    if (
      !editingStockIn.product.trim() ||
      num(editingStockIn.boxes) <= 0
    ) {
      return setNotice(
        'Product aur valid box quantity bharna zaroori hai'
      );
    }

    const updatedEntry = {
      ...editingStockIn,
      product: editingStockIn.product.trim(),
      category: editingStockIn.category.trim(),
      supplier: editingStockIn.supplier.trim(),
      unit: editingStockIn.unit || 'PCS',
      pcs: Math.max(1, num(editingStockIn.pcs)),
      boxes: num(editingStockIn.boxes),
      price: num(editingStockIn.price),
      note: editingStockIn.note || '',
    };

    const success = await save(
      {
        ...data,
        entries: data.entries.map((item) =>
          item.id === updatedEntry.id
            ? updatedEntry
            : item
        ),
      },
      'Stock In successfully updated'
    );

    if (success) {
      setEditingStockIn(null);
    }
  }

  async function saveEditedStockOut(event) {
    event.preventDefault();

    if (!editingStockOut) return;

    const quantity = num(editingStockOut.boxes);

    if (!editingStockOut.product || quantity <= 0) {
      return setNotice(
        'Product aur valid quantity select karein'
      );
    }

    const originalRecord = data.outs.find(
      (item) => item.id === editingStockOut.id
    );

    if (!originalRecord) {
      setEditingStockOut(null);
      return setNotice('Stock Out record nahi mila');
    }

    let available = 0;

    const sameProduct =
      originalRecord.product === editingStockOut.product;

    const sameSupplier =
      (originalRecord.supplier || '') ===
      (editingStockOut.supplier || '');

    if (sameProduct && sameSupplier) {
      available =
        availableForOut + num(originalRecord.boxes);
    } else {
      available = stock
        .filter((item) => {
          if (
            item.product !== editingStockOut.product
          ) {
            return false;
          }

          if (
            editingStockOut.supplier &&
            item.supplier !== editingStockOut.supplier
          ) {
            return false;
          }

          return true;
        })
        .reduce(
          (sum, item) => sum + item.available,
          0
        );
    }

    if (quantity > available) {
      return setNotice(
        `Available stock ${available} hai`
      );
    }

    const updatedOut = {
      ...editingStockOut,
      product: editingStockOut.product.trim(),
      supplier: editingStockOut.supplier.trim(),
      staffName: editingStockOut.staffName.trim(),
      boxes: quantity,
      note: editingStockOut.note || '',
    };

    const success = await save(
      {
        ...data,
        outs: data.outs.map((item) =>
          item.id === updatedOut.id
            ? updatedOut
            : item
        ),
      },
      'Stock Out successfully updated'
    );

    if (success) {
      setEditingStockOut(null);
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
// HISTORY SEARCH
// --------------------

const filteredHistoryEntries = useMemo(() => {
  const query = historySearch.trim().toLowerCase();

  if (!query) {
    return [...data.entries].reverse();
  }

  return [...data.entries]
    .reverse()
    .filter((item) => {
      const searchableText = [
        item.product,
        item.category,
        item.supplier,
        item.note,
        item.unit,
        item.price,
        item.boxes,
        item.createdAt,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
}, [data.entries, historySearch]);

const filteredHistoryOuts = useMemo(() => {
  const query = historySearch.trim().toLowerCase();

  if (!query) {
    return [...data.outs].reverse();
  }

  return [...data.outs]
    .reverse()
    .filter((item) => {
      const searchableText = [
        item.product,
        item.staffName,
        item.supplier,
        item.note,
        item.boxes,
        item.createdAt,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
}, [data.outs, historySearch]);

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
// --------------------
// MAIN LAYOUT
// --------------------

const exportExcel = () => {
  const headers = [
    'Product',
    'Category',
    'PCS / Box',
    'Available Stock',
    'Available PCS',
    ...(showPrice
      ? ['Rate / PCS', 'Total Amount']
      : []),
  ];

  const rows = pdfRows.map((item) => [
    item.product,
    item.category || '',
    item.pcsPerBox,
    item.available,
    item.availablePcs,
    ...(showPrice
      ? [item.price, item.availableAmount]
      : []),
  ]);

  const worksheetData = [headers, ...rows];

  const worksheet = XLSX.utils.aoa_to_sheet(
    worksheetData
  );

  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 20 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    ...(showPrice
      ? [
          { wch: 14 },
          { wch: 18 },
        ]
      : []),
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'Current Stock'
  );

  XLSX.writeFile(
    workbook,
    'Shiv-Hardware-Stock-Report.xlsx'
  );
};

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
                    <input
                      list="product-options"
                      value={form.product}
                      onChange={(event) => selectProductForStockIn(event.target.value)}
                      placeholder="Product name"
                      required
                    />
                    <datalist id="product-options">
                      {productList.map((item) => (
                        <option key={item.id} value={item.name} />
                      ))}
                    </datalist>
                  </label>
                  
<label>
  Category
  <input
    type="text"
    list="stock-in-category-options"
    placeholder="Type category name..."
    value={form.category}
    onChange={(event) =>
      setForm({
        ...form,
        category: event.target.value,
      })
    }
  />

  <datalist id="stock-in-category-options">
    {[...new Set(data.categories)]
      .sort()
      .map((item) => (
        <option key={item} value={item} />
      ))}
  </datalist>
</label>

                  <label>
                    PCS / Box
                    <input
                      type="number"
                      min="1"
                      value={form.pcs}
                      onChange={(event) => setForm({ ...form, pcs: event.target.value })}
                      required
                    />
                  </label>

                  <label>
                    Unit
                    <select
                      value={form.unit}
                      onChange={(event) => setForm({ ...form, unit: event.target.value })}
                    >
                      {data.units.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Price / PCS (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(event) => setForm({ ...form, price: event.target.value })}
                    />
                  </label>

                  <label>
                    Box
                    <input
                      type="number"
                      min="1"
                      value={form.boxes}
                      onChange={(event) => setForm({ ...form, boxes: event.target.value })}
                      required
                    />
                  </label>

                  <label>
                    Party
                    <input
                      type="text"
                      list="stock-in-party-options"
                      placeholder="Type party name..."
                      value={form.supplier}
                      onChange={(event) => setForm({ ...form, supplier: event.target.value })}
                    />
                    <datalist id="stock-in-party-options">
                      {[...new Set(data.suppliers)].sort().map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </label>

                  <button type="submit" disabled={busy}>
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
                    <input
                      type="text"
                      list="stock-out-product-options"
                      placeholder="Type product name..."
                      value={out.product}
                      onChange={(event) =>
                        setOut({
                          ...out,
                          product: event.target.value,
                          supplier: '',
                        })
                      }
                      required
                    />
                    <datalist id="stock-out-product-options">
                      {[...new Set(
                        stock
                          .filter((item) => item.available > 0)
                          .map((item) => item.product)
                      )].sort().map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </label>

                  
<label>
  Staff Name
  <input
    type="text"
    list="stock-out-staff-options"
    placeholder="Type staff name..."
    value={out.staffName}
    onChange={(event) =>
      setOut({
        ...out,
        staffName: event.target.value,
      })
    }
  />

  <datalist id="stock-out-staff-options">
    {[...new Set(
      data.outs
        .map((item) => item.staffName)
        .filter(Boolean)
    )]
      .sort()
      .map((item) => (
        <option key={item} value={item} />
      ))}
  </datalist>
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

                <StockTable
  rows={filteredStock}
  showParty={true}
  showPrice={true}
/>
              </section>
            )}

            {/* HISTORY */}

            {page === 'history' && (
  <section className="panel">

    <div className="history-header">
      <div>
        <h2>Stock History</h2>
        <p className="muted">
          Search your Stock In and Stock Out records
        </p>
      </div>

      <div className="history-search">
        <span>🔍</span>

        <input
          type="text"
          placeholder="Search product, staff, party, note..."
          value={historySearch}
          onChange={(event) =>
            setHistorySearch(event.target.value)
          }
        />

        {historySearch && (
          <button
            type="button"
            className="history-search-clear"
            onClick={() => setHistorySearch('')}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>
    </div>

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
                      {filteredHistoryEntries.map((item) => (
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
  type="button"
  className="history-edit-btn"
  onClick={() => startEditStockIn(item)}
>
  ✏️ Edit
</button>

<button
  type="button"
  className="history-delete-btn"
  onClick={() => deleteEntry(item)}
>
  🗑 Delete
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
                        <th>staffName</th>
                        <th>Qty</th>
                        <th>Note</th>
                        <th></th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredHistoryOuts.map((item) => (
                        <tr key={item.id}>
                          <td>{formatDate(item.createdAt)}</td>
                          <td>{item.product}</td>
                          <td>{item.staffName || '—'}</td>
                          <td>{item.boxes}</td>
                          <td>{item.note || '—'}</td>
                          <td>
                            <button
  type="button"
  className="history-edit-btn"
  onClick={() => startEditStockOut(item)}
>
  ✏️ Edit
</button>

<button
  type="button"
  className="history-delete-btn"
  onClick={() => deleteOut(item)}
>
  🗑 Delete
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
               <button
                  className="primary"
                  onClick={exportExcel}
                >
                  Export Excel
                </button>

               <div className="table-scroll">
  <StockTable
    rows={pdfRows}
    showPrice={showPrice}
  />
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
      <th>PCS / Box</th>
      <th>Box Quantity</th>
      <th>PCS Quantity</th>

      {showPrice && (
        <>
          <th>Rate / PCS</th>
          <th>Total Amount</th>
        </>
      )}
    </tr>
  </thead>

  <tbody>
    {pdfRows.map((item) => (
      <tr key={item.key}>
        <td>{item.product}</td>
        <td>{item.category || '—'}</td>
        <td>{item.pcsPerBox}</td>
        <td>{item.available}</td>
        <td>{item.availablePcs}</td>

        {showPrice && (
          <>
            <td>{money(item.price)}</td>
            <td>{money(item.availableAmount)}</td>
          </>
        )}
      </tr>
    ))}
  </tbody>
</table>

          
<div className="report-totals">
  <p>
    Total Boxes:{' '}
    {pdfRows.reduce(
      (sum, item) => sum + item.available,
      0
    )}
  </p>

  <p>
    Total PCS:{' '}
    {pdfRows.reduce(
      (sum, item) => sum + item.availablePcs,
      0
    )}
  </p>

  {showPrice && (
    <p>
      Total Amount:{' '}
      {money(
        pdfRows.reduce(
          (sum, item) => sum + item.availableAmount,
          0
        )
      )}
    </p>
  )}
</div>
        </section>
                {/* EDIT STOCK IN MODAL */}
        {editingStockIn && (
          <div className="edit-modal-backdrop">
            <form
              className="edit-modal"
              onSubmit={saveEditedStockIn}
            >
              <div className="edit-modal-header">
                <div>
                  <h2>Edit Stock In</h2>
                  <p>Stock In record update karein</p>
                </div>

                <button
                  type="button"
                  className="edit-close"
                  onClick={() => setEditingStockIn(null)}
                >
                  ×
                </button>
              </div>

              <div className="edit-form-grid">

                <label>
                  Product
                  <input
                    value={editingStockIn.product}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        product: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Category
                  <input
                    value={editingStockIn.category}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        category: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Party / Supplier
                  <input
                    value={editingStockIn.supplier}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        supplier: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Unit
                  <select
                    value={editingStockIn.unit}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        unit: event.target.value,
                      })
                    }
                  >
                    {data.units.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  PCS / Box
                  <input
                    type="number"
                    min="1"
                    value={editingStockIn.pcs}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        pcs: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Box Quantity
                  <input
                    type="number"
                    min="1"
                    value={editingStockIn.boxes}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        boxes: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Price / PCS (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingStockIn.price}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        price: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Note
                  <input
                    value={editingStockIn.note}
                    onChange={(event) =>
                      setEditingStockIn({
                        ...editingStockIn,
                        note: event.target.value,
                      })
                    }
                  />
                </label>

              </div>

              <div className="edit-modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditingStockIn(null)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="edit-save-btn"
                  disabled={busy}
                >
                  {busy ? 'Saving…' : '✓ Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* EDIT STOCK OUT MODAL */}
        {editingStockOut && (
          <div className="edit-modal-backdrop">
            <form
              className="edit-modal"
              onSubmit={saveEditedStockOut}
            >
              <div className="edit-modal-header">
                <div>
                  <h2>Edit Stock Out</h2>
                  <p>Stock Out record update karein</p>
                </div>

                <button
                  type="button"
                  className="edit-close"
                  onClick={() => setEditingStockOut(null)}
                >
                  ×
                </button>
              </div>

              <div className="edit-form-grid">

                <label>
                  Product
                  <input
                    value={editingStockOut.product}
                    onChange={(event) =>
                      setEditingStockOut({
                        ...editingStockOut,
                        product: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Party / Supplier
                  <input
                    value={editingStockOut.supplier}
                    onChange={(event) =>
                      setEditingStockOut({
                        ...editingStockOut,
                        supplier: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Staff Name
                  <input
                    value={editingStockOut.staffName}
                    onChange={(event) =>
                      setEditingStockOut({
                        ...editingStockOut,
                        staffName: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Box / Quantity
                  <input
                    type="number"
                    min="1"
                    value={editingStockOut.boxes}
                    onChange={(event) =>
                      setEditingStockOut({
                        ...editingStockOut,
                        boxes: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label className="edit-full-width">
                  Note
                  <input
                    value={editingStockOut.note}
                    onChange={(event) =>
                      setEditingStockOut({
                        ...editingStockOut,
                        note: event.target.value,
                      })
                    }
                  />
                </label>

              </div>

              <div className="edit-modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditingStockOut(null)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="edit-save-btn"
                  disabled={busy}
                >
                  {busy ? 'Saving…' : '✓ Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}
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


  function StockTable({ rows, showParty = true, showPrice = true }) {
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
              {showParty && <th>Supplier / Party</th>}
              <th>PCS / Box</th>
              <th>In Boxes</th>
              <th>In PCS</th>
              <th>Out Boxes</th>
              <th>Out PCS</th>
              <th>Available Boxes</th>
              <th>Available PCS</th>
              {showPrice && <th>PCS Rate</th>}
              {showPrice && <th>Available Amount</th>}
            </tr>
          </thead>

          <tbody>
            {rows.map((item) => (
              <tr key={item.key}>
                <td>{item.product}</td>
                <td>{item.category || '—'}</td>
                {showParty && (
                  <td>{item.supplier || '—'}</td>
                )}
                <td>{item.pcsPerBox}</td>
                <td>{item.incoming}</td>
                <td>{item.incomingPcs}</td>
                <td>{item.outgoing}</td>
                <td>{item.outgoingPcs}</td>
                <td>{item.available}</td>
                <td><b>{item.availablePcs}</b></td>
                {showPrice && (
                  <td>{money(item.price)}</td>
                )}
                {showPrice && (
                  <td>{money(item.availableAmount)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }