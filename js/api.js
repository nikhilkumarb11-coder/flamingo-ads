/**
 * Talks to the Apps Script web app, or to the on-device books when no URL is set.
 * POST + text/plain avoids the CORS preflight Apps Script cannot answer.
 */
class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const Local = (() => {
  const PASS_KEY = 'fa_local_password';

  function pad(n) { return String(n).padStart(3, '0'); }

  async function nextSeq(key) {
    const counters = (await DB.getMeta('counters')) || {};
    const n = Number(counters[key] || 0) + 1;
    counters[key] = n;
    await DB.setMeta('counters', counters);
    return n;
  }

  function fail(message) {
    const e = new Error(message);
    e.code = 'INVALID';
    throw e;
  }

  async function assign(table, row) {
    const s = Store.settings();
    const fy = U.fy(row.date || U.today());
    const num = async (prefixKey, fallback, counter) => {
      const prefix = String(s[prefixKey] || fallback).trim() || fallback;
      row[{
        Estimates: 'estimate_no', Jobs: 'job_no', Invoices: 'invoice_no', Receipts: 'receipt_no',
        Purchases: 'purchase_no', PaymentsOut: 'payment_no', Expenses: 'expense_no'
      }[table]] = `${prefix}/${fy}/${pad(await nextSeq(counter + fy))}`;
    };
    if (table === 'Estimates') await num('prefix_est', 'EST', 'EST-');
    else if (table === 'Jobs') await num('prefix_job', 'JOB', 'JOB-');
    else if (table === 'Receipts') await num('prefix_rcpt', 'RCT', 'RCT-');
    else if (table === 'Purchases') await num('prefix_pur', 'PUR', 'PUR-');
    else if (table === 'PaymentsOut') await num('prefix_pay', 'PAY', 'PAY-');
    else if (table === 'Expenses') await num('prefix_exp', 'EXP', 'EXP-');
    else if (table === 'Invoices') {
      const gst = row.tax_mode === 'gst';
      await num(gst ? 'prefix_gst' : 'prefix_bill', gst ? 'GST' : 'BILL', gst ? 'GST-' : 'BILL-');
    }
  }

  function check(table, next, prev) {
    if (table === 'Parties') {
      if (!next.name) fail('Party name is required');
      if (next.phone && !U.isPhone(next.phone)) fail('Phone must be 10 digits');
      if (next.gstin && !U.isGstin(next.gstin)) fail('GSTIN does not look right');
    }
    if (table === 'Services') {
      if (!next.name) fail('Service name is required');
    }
    if (table === 'Estimates') {
      if (prev && prev.job_id && next.job_id && next.job_id !== prev.job_id) fail('This estimate is already linked to an order');
      if (next.status === 'Accepted' && !next.job_id) fail('An accepted estimate needs its order');
      if (!next.party_id) fail('Choose a party');
    }
    if (table === 'Jobs') {
      if (!next.party_id) fail('Choose a party');
      if (next.estimate_id) {
        const est = Store.get('Estimates', next.estimate_id);
        if (!est || est.is_deleted) fail('Estimate not found');
        if (est.job_id && est.job_id !== next.id) fail('That estimate already has an order');
      }
      if (prev && prev.estimate_id && next.estimate_id !== prev.estimate_id) fail('The estimate link cannot be changed');
    }
    if (table === 'Invoices') {
      if (prev) {
        if (prev.status === 'Void') fail('This invoice is already void');
        const allowed = ['status', 'void_reason', 'updated_at', 'updated_by'];
        Object.keys(next).forEach(k => {
          if (allowed.includes(k)) return;
          if (String(next[k] ?? '') !== String(prev[k] ?? '') && !k.startsWith('_')) fail("Invoices can't be edited. Void it and issue a new one.");
        });
        if (next.status !== 'Void') fail('An invoice can only be voided');
        if (!next.void_reason) fail('Give a reason for voiding');
        return;
      }
      if (next.tax_mode !== 'gst' && next.tax_mode !== 'none') fail('Choose with GST or without GST');
      if (!next.buyer_name) fail('Buyer name is required');
      if (!(Number(next.total) > 0)) fail('Invoice total must be more than 0');
      if (next.job_id) {
        const job = Store.get('Jobs', next.job_id);
        if (!job || job.is_deleted) fail('Order not found');
        if (job.status === 'Cancelled') fail('This order is cancelled');
        const other = Store.list('Invoices').find(i => i.job_id === next.job_id && i.status !== 'Void' && i.id !== next.id);
        if (other) fail('This order already has an invoice');
      }
      next.status = 'Issued';
    }
    if (table === 'Receipts') {
      if (prev) {
        if (prev.status === 'Void') fail('This receipt is already void');
        if (next.status !== 'Void') fail('A receipt can only be voided');
        return;
      }
      if (!next.invoice_id) fail('Receipt is missing its invoice');
      const inv = Store.get('Invoices', next.invoice_id);
      if (!inv || inv.is_deleted || inv.status === 'Void') fail('Invoice not found');
      if (!(Number(next.amount) > 0)) fail('Amount must be more than 0');
      const due = Books.invoiceDue(inv, next.id);
      if (Number(next.amount) > due + 0.001) fail('Amount is more than the balance of ' + U.inr(due));
      next.status = '';
    }
    if (table === 'Materials') {
      if (!next.name) fail('Material name is required');
    }
    if (table === 'Purchases') {
      if (prev) {
        if (prev.status === 'Void') fail('This purchase is already void');
        if (next.status !== 'Void') fail('A purchase can only be voided');
        if (!next.void_reason) fail('Give a reason for voiding');
        Books.items('PurchaseItems', 'purchase_id', next.id).forEach(it => {
          if (Books.onHand(it.material_id) < -0.001) fail('Material from this purchase is already issued to an order');
        });
        const paid = Books.paidForPurchase(next.id);
        if (paid > 0) fail('Void the payments on this purchase first');
        return;
      }
      if (!next.party_id) fail('Choose a supplier');
      if (!(Number(next.total) > 0)) fail('Purchase total must be more than 0');
      next.status = 'Issued';
    }
    if (table === 'PurchaseItems') {
      if (!next.purchase_id || !next.material_id) fail('Purchase line is incomplete');
      if (!(Number(next.qty) > 0)) fail('Quantity must be more than 0');
    }
    if (table === 'PaymentsOut') {
      if (prev) {
        if (prev.status === 'Void') fail('This payment is already void');
        if (next.status !== 'Void') fail('A payment can only be voided');
        return;
      }
      const purchase = Store.get('Purchases', next.purchase_id);
      if (!purchase || purchase.status === 'Void') fail('Purchase not found');
      if (!(Number(next.amount) > 0)) fail('Amount must be more than 0');
      const due = Books.purchaseDue(purchase, next.id);
      if (Number(next.amount) > due + 0.001) fail('Amount is more than the balance of ' + U.inr(due));
      next.status = '';
    }
    if (table === 'Issues') {
      if (next.is_deleted) return;
      if (!next.material_id) fail('Choose a material');
      if (!(Number(next.qty) > 0)) fail('Quantity must be more than 0');
      const have = Books.onHand(next.material_id, next.id);
      if (Number(next.qty) > have + 0.001) fail('Only ' + have + ' on hand');
    }
    if (table === 'Expenses') {
      if (next.is_deleted) return;
      if (!next.category) fail('Choose a category');
      if (!(Number(next.amount) > 0)) fail('Amount must be more than 0');
      if (!next.account) next.account = 'Cash';
    }
  }

  function publish(row) {
    const out = { ...row };
    delete out._pending;
    delete out._srv;
    return out;
  }

  async function apply(op) {
    const current = Store.get(op.table, op.id);
    const data = { ...(op.data || {}) };
    delete data.estimate_no;
    delete data.job_no;
    delete data.invoice_no;
    delete data.receipt_no;
    delete data.purchase_no;
    delete data.payment_no;
    delete data.expense_no;
    if (op.type === 'create') {
      if (current && current._srv && !current._pending) return publish(current);
      const row = { ...(current || {}), ...data, id: op.id, is_deleted: data.is_deleted === true };
      check(op.table, row, null);
      await assign(op.table, row);
      row.updated_at = U.nowIso();
      return publish(row);
    }
    if (op.type === 'update') {
      if (!current) fail('Record not found');
      const next = { ...current, ...data };
      check(op.table, next, current);
      next.updated_at = U.nowIso();
      return publish(next);
    }
    fail('Unknown op type');
  }

  return {
    async call(action, payload = {}) {
      if (action === 'login') {
        const pw = String(payload.password || '');
        const saved = localStorage.getItem(PASS_KEY);
        if (!saved) {
          if (pw.length < 4) throw new ApiError('WRONG_PASSWORD', 'Use at least 4 characters. This becomes the password on this device.');
          localStorage.setItem(PASS_KEY, pw);
        } else if (saved !== pw) {
          throw new ApiError('WRONG_PASSWORD', 'Wrong password');
        }
        return {
          ok: true,
          token: 'local',
          expiresAt: Date.now() + 30 * 86400000,
          sync: { ok: true, serverTime: U.nowIso(), full: true, tables: {} }
        };
      }
      if (action === 'sync' || action === 'ping') {
        return { ok: true, serverTime: U.nowIso(), full: !payload.since, tables: {} };
      }
      if (action === 'batch') {
        const results = [];
        for (const op of payload.ops || []) {
          try {
            results.push({ opId: op.opId, ok: true, row: await apply(op) });
          } catch (e) {
            results.push({ opId: op.opId, ok: false, code: e.code || 'INVALID', message: e.message });
          }
        }
        return { ok: true, serverTime: U.nowIso(), results };
      }
      throw new ApiError('BAD_REQUEST', 'Unknown action: ' + action);
    }
  };
})();

const Api = (() => {
  async function call(action, payload = {}, { timeoutMs = 45000 } = {}) {
    const url = APP_CONFIG.apiUrl;
    if (!url) return Local.call(action, payload);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: Auth.token(), device: Auth.deviceName(), ...payload }),
        signal: ctrl.signal,
        redirect: 'follow',
        cache: 'no-store'
      });
    } catch (e) {
      throw new ApiError('NETWORK', navigator.onLine ? 'Could not reach the server' : 'You are offline');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) {
      const hint = /sign in|accounts\.google/i.test(text)
        ? 'Apps Script deployment must allow access to "Anyone".'
        : `Server returned an unexpected response (HTTP ${res.status}).`;
      throw new ApiError('BAD_RESPONSE', hint);
    }
    if (!json.ok) {
      if (json.code === 'AUTH') Auth.onExpired();
      throw new ApiError(json.code || 'ERROR', json.message || 'Request failed');
    }
    return json;
  }

  let warmedAt = 0;
  function warm() {
    const url = APP_CONFIG.apiUrl;
    if (!url || Date.now() - warmedAt < 120000) return;
    warmedAt = Date.now();
    fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  }

  return { call, warm, isLocal: () => !APP_CONFIG.apiUrl };
})();

const Auth = (() => {
  const TOKEN_KEY = 'fa_token';
  const EXP_KEY = 'fa_token_exp';
  const DEVICE_KEY = 'fa_device_name';

  return {
    token: () => localStorage.getItem(TOKEN_KEY) || '',

    isLoggedIn() {
      const exp = Number(localStorage.getItem(EXP_KEY) || 0);
      return !!localStorage.getItem(TOKEN_KEY) && exp > Date.now();
    },

    async login(password) {
      const res = await Api.call('login', { password, withData: true }, { timeoutMs: 90000 });
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(EXP_KEY, String(res.expiresAt));
      return res.sync || null;
    },

    async logout() {
      Sync.stop();
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      await Store.reset();
      history.replaceState(null, '', '#/home');
      App.showLogin();
    },

    onExpired() {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      Sync.stop();
      UI.toast('Session expired. Please log in again. Unsent changes stay on this device.', 'warning');
      App.showLogin();
    },

    deviceName: () => localStorage.getItem(DEVICE_KEY) || '',
    setDeviceName: name => localStorage.setItem(DEVICE_KEY, String(name || '').trim().slice(0, 40))
  };
})();

const Sync = (() => {
  const BATCH_SIZE = 40;
  const BACKOFF_MS = [5000, 15000, 30000, 60000];
  let timer = null;
  let kickTimer = null;
  let running = false;
  let again = false;
  let failures = 0;
  let lastPullAt = 0;
  let status = { state: 'idle', message: '', lastSync: null };
  const listeners = new Set();

  function setStatus(patch) {
    status = { ...status, ...patch, pending: Store.pendingCount() };
    listeners.forEach(fn => fn(status));
  }

  async function applyPull(sync) {
    await Store.applyServerTables(sync.tables);
    await DB.setMeta('since', sync.serverTime);
    lastPullAt = Date.now();
  }

  async function push(withPull) {
    let pulled = false;
    while (Store.hasPending()) {
      const ops = Store.takeOutbox(BATCH_SIZE);
      if (!ops.length) break;
      setStatus({ state: 'saving' });
      const since = withPull && !pulled ? (await DB.getMeta('since')) || '' : '';
      let res;
      try {
        res = await Api.call('batch', {
          since: since || undefined,
          ops: ops.map(op => ({
            opId: op.seq,
            table: op.t,
            id: op.id,
            type: op.type,
            data: op.data,
            base: op.type === 'update' ? (Store.get(op.t, op.id) || {})._srv || null : null
          }))
        }, { timeoutMs: 90000 });
      } catch (e) {
        Store.releaseOutbox(ops);
        throw e;
      }
      const answered = [];
      const rows = {};
      const discards = [];
      const errors = new Set();
      let conflict = false;
      for (const result of res.results) {
        const op = ops.find(o => o.seq === result.opId);
        if (!op) continue;
        answered.push(op);
        if (result.row) (rows[op.t] = rows[op.t] || []).push(result.row);
        if (result.ok) continue;
        if (result.code === 'CONFLICT') conflict = true;
        else {
          if (!result.row && op.type === 'create') discards.push(op);
          errors.add(result.message);
        }
      }
      await Store.finishOps(answered);
      await Store.applyServerTables(rows);
      for (const op of discards) await Store.discard(op.t, op.id);
      if (res.sync) { await applyPull(res.sync); pulled = true; }
      if (conflict) UI.toast('Someone else changed this record first. Their version is shown. Please redo your edit.', 'warning');
      errors.forEach(msg => UI.toast(`Not saved: ${msg}`, 'danger'));
    }
    return pulled;
  }

  async function pull() {
    const since = (await DB.getMeta('since')) || '';
    const res = await Api.call('sync', { since }, { timeoutMs: 90000 });
    await applyPull(res);
  }

  async function run({ forcePull = false } = {}) {
    if (!Auth.isLoggedIn()) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const wantPull = forcePull || Date.now() - lastPullAt >= APP_CONFIG.syncIntervalMs - 1000;
      const pulled = await push(wantPull);
      if (wantPull && !pulled) {
        setStatus({ state: 'syncing' });
        await pull();
      }
      failures = 0;
      setStatus({ state: 'synced', message: '', lastSync: U.nowIso() });
    } catch (e) {
      failures++;
      const offline = e.code === 'NETWORK';
      setStatus({ state: offline ? 'offline' : 'error', message: e.message });
      if (e.code !== 'AUTH' && e.code !== 'NO_API') {
        clearTimeout(kickTimer);
        kickTimer = setTimeout(() => run(), BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]);
      }
    } finally {
      running = false;
      if (again) { again = false; run(); }
    }
  }

  function tick() {
    if (document.visibilityState === 'visible') run();
  }

  return {
    async initial(data) {
      await DB.setMeta('since', '');
      lastPullAt = 0;
      if (data && data.tables) await applyPull(data);
      else await pull();
      setStatus({ state: 'synced', lastSync: U.nowIso() });
    },
    start() {
      this.stop();
      timer = setInterval(tick, APP_CONFIG.syncIntervalMs);
      document.addEventListener('visibilitychange', tick);
      window.addEventListener('online', tick);
      run({ forcePull: Date.now() - lastPullAt > 5000 });
    },
    stop() {
      clearInterval(timer);
      clearTimeout(kickTimer);
      timer = null;
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    },
    kick() {
      clearTimeout(kickTimer);
      kickTimer = setTimeout(() => run(), 300);
    },
    now: () => run({ forcePull: true }),
    status: () => ({ ...status, pending: Store.pendingCount() }),
    onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
