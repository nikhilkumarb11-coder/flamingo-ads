/**
 * In-memory copy of every table, backed by IndexedDB, plus the outbox.
 * Screens read from here and never wait on the network.
 *   _srv      server updated_at, used for conflict checks
 *   _pending  true until the server confirms the local change
 */
const Store = (() => {
  const TABLES = ['Parties', 'Services', 'Estimates', 'EstimateItems', 'Jobs', 'JobItems',
    'Invoices', 'InvoiceItems', 'Receipts', 'Materials', 'Purchases', 'PurchaseItems',
    'PaymentsOut', 'Issues', 'Expenses', 'Settings'];

  const data = Object.fromEntries(TABLES.map(t => [t, new Map()]));
  let outbox = [];
  const listeners = new Set();
  let emitQueued = false;
  const changedTables = new Set();

  const isDeleted = r => r.is_deleted === true || r.is_deleted === 'TRUE';

  function emit(table) {
    changedTables.add(table);
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => {
      emitQueued = false;
      const tables = new Set(changedTables);
      changedTables.clear();
      listeners.forEach(fn => { try { fn(tables); } catch (e) { console.error(e); } });
    });
  }

  function pendingPatch(t, id) {
    let patch = null;
    outbox.forEach(op => { if (op.t === t && op.id === id) patch = Object.assign(patch || {}, op.data); });
    return patch;
  }

  async function load() {
    const [rows, ops] = await Promise.all([DB.allRows(), DB.outboxAll()]);
    rows.forEach(r => { if (data[r.t]) data[r.t].set(r.d.id, r.d); });
    outbox = ops.map(op => ({ ...op, inflight: false })).sort((a, b) => a.seq - b.seq);
    TABLES.forEach(emit);
  }

  function list(t, { includeDeleted = false } = {}) {
    const out = [];
    data[t].forEach(r => { if (includeDeleted || !isDeleted(r)) out.push(r); });
    return out;
  }

  function get(t, id) {
    return data[t].get(id) || null;
  }

  async function save(t, patch) {
    return (await saveMany([[t, patch]]))[0];
  }

  async function saveMany(entries) {
    const now = U.nowIso();
    const prepared = entries.map(([t, patch]) => {
      if (!data[t]) throw new Error('Unknown table ' + t);
      const id = patch.id || U.uuid();
      const current = data[t].get(id);
      const clean = { ...patch };
      delete clean.id;
      const row = { ...(current || {}), ...clean, id, updated_at: now, _pending: true };
      if (!current) {
        row.created_at = now;
        row.is_deleted = false;
      }
      data[t].set(id, row);
      return { t, id, row, type: current ? 'update' : 'create', clean };
    });
    const merged = new Set();
    const fresh = [];
    prepared.forEach(p => {
      const waiting = fresh.find(op => op.t === p.t && op.id === p.id)
        || outbox.find(op => op.t === p.t && op.id === p.id && !op.inflight);
      if (waiting) {
        Object.assign(waiting.data, p.clean);
        if (waiting.seq != null) merged.add(waiting);
      } else {
        fresh.push({ t: p.t, id: p.id, type: p.type, data: { ...p.clean }, at: now });
      }
    });
    const mergedOps = [...merged];
    const strip = op => { const { inflight, ...rest } = op; return rest; };
    const [, seqs] = await Promise.all([
      DB.putRows(prepared.map(p => [p.t, p.row])),
      DB.outboxPutMany([...mergedOps.map(strip), ...fresh])
    ]);
    fresh.forEach((op, i) => { op.seq = seqs[mergedOps.length + i]; op.inflight = false; outbox.push(op); });
    prepared.forEach(p => emit(p.t));
    Sync.kick();
    return prepared.map(p => p.row);
  }

  function remove(t, id) {
    return save(t, { id, is_deleted: true });
  }

  function takeOutbox(n) {
    const batch = outbox.filter(op => !op.inflight).slice(0, n);
    batch.forEach(op => { op.inflight = true; });
    return batch;
  }

  function releaseOutbox(ops) {
    ops.forEach(op => { op.inflight = false; });
  }

  async function finishOps(ops) {
    const done = new Set(ops.map(op => op.seq));
    outbox = outbox.filter(o => !done.has(o.seq));
    await DB.outboxDeleteMany([...done]);
  }

  async function applyServerTables(tables) {
    const writes = [];
    Object.entries(tables || {}).forEach(([t, rows]) => {
      if (!data[t] || !rows || !rows.length) return;
      rows.forEach(srv => {
        const patch = pendingPatch(t, srv.id);
        const row = { ...srv, ...(patch || {}), _srv: srv.updated_at, _pending: !!patch };
        data[t].set(srv.id, row);
        writes.push([t, row]);
      });
      emit(t);
    });
    await DB.putRows(writes);
  }

  async function discard(t, id) {
    data[t].delete(id);
    await DB.deleteRow(t, id);
    emit(t);
  }

  function settings() {
    const out = {};
    list('Settings').forEach(r => { out[r.key] = r.value; });
    return out;
  }

  async function reset() {
    TABLES.forEach(t => data[t].clear());
    outbox = [];
    await DB.clearAll();
    TABLES.forEach(emit);
  }

  return {
    TABLES, load, list, get, save, saveMany, remove, settings, reset,
    takeOutbox, releaseOutbox, finishOps, applyServerTables, discard,
    pendingCount: () => outbox.length,
    hasPending: () => outbox.length > 0,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
