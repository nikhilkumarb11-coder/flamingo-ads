/**
 * Flamingo Ads — Google Apps Script API
 *
 * Copy of the script that runs inside the Sheet: Extensions → Apps Script.
 * Requests are POST, Content-Type text/plain, JSON body:
 *   { action: "login" | "sync" | "batch", token, ... }
 * Replies: { ok: true, ... } or { ok: false, code, message }.
 *
 * Invoice numbers are assigned here, inside a lock.
 * GST and non-GST bills use different counters and never share a sequence.
 * Financial year is April–March: GST/2026-27/001 and BILL/2026-27/001.
 */
var API_VERSION = '0.2.0';
var TOKEN_DAYS = 30;
var SYNC_OVERLAP_MS = 15000;
var MAX_LOGIN_FAILS = 8;

var COMMON_FIELDS = ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'is_deleted'];

var SCHEMA = {
  Parties:       ['name', 'phone', 'gstin', 'state', 'address', 'opening_receivable', 'opening_payable', 'notes'],
  Services:      ['name', 'unit', 'rate', 'hsn', 'active'],
  Estimates:     ['estimate_no', 'party_id', 'date', 'status', 'job_id', 'notes', 'terms_text', 'subtotal', 'total'],
  EstimateItems: ['estimate_id', 'item_name', 'width', 'height', 'qty', 'unit', 'rate', 'amount', 'hsn', 'sort'],
  Jobs:          ['job_no', 'party_id', 'estimate_id', 'date', 'due_date', 'status', 'site_address', 'notes', 'subtotal', 'total'],
  JobItems:      ['job_id', 'item_name', 'width', 'height', 'qty', 'unit', 'rate', 'amount', 'hsn', 'sort'],
  Invoices:      ['invoice_no', 'tax_mode', 'job_id', 'party_id', 'buyer_name', 'buyer_phone', 'buyer_gstin', 'buyer_address', 'buyer_state', 'date', 'subtotal', 'gst_rate', 'cgst', 'sgst', 'igst', 'tax_amount', 'total', 'status', 'void_reason', 'notes'],
  InvoiceItems:  ['invoice_id', 'item_name', 'width', 'height', 'qty', 'unit', 'rate', 'amount', 'hsn', 'sort'],
  Receipts:      ['receipt_no', 'invoice_id', 'party_id', 'date', 'amount', 'account', 'note', 'status'],
  Materials:     ['name', 'unit', 'opening_qty', 'reorder_level', 'purchase_rate', 'active', 'notes'],
  Purchases:     ['purchase_no', 'party_id', 'date', 'subtotal', 'total', 'status', 'void_reason', 'notes'],
  PurchaseItems: ['purchase_id', 'material_id', 'item_name', 'qty', 'unit', 'rate', 'amount', 'sort'],
  PaymentsOut:   ['payment_no', 'purchase_id', 'party_id', 'date', 'amount', 'account', 'note', 'status'],
  Issues:        ['job_id', 'material_id', 'date', 'qty', 'note'],
  Expenses:      ['expense_no', 'date', 'category', 'account', 'amount', 'note', 'party_id'],
  Settings:      ['key', 'value']
};

var NUMERIC_FIELDS = {
  opening_receivable: 1, opening_payable: 1, rate: 1, width: 1, height: 1, qty: 1, amount: 1, sort: 1,
  subtotal: 1, total: 1, gst_rate: 1, cgst: 1, sgst: 1, igst: 1, tax_amount: 1,
  opening_qty: 1, reorder_level: 1, purchase_rate: 1
};
var BOOLEAN_FIELDS = { is_deleted: 1, active: 1 };

var AUTO_NUMBERS = {
  Estimates: 'estimate_no',
  Jobs: 'job_no',
  Invoices: 'invoice_no',
  Receipts: 'receipt_no',
  Purchases: 'purchase_no',
  PaymentsOut: 'payment_no',
  Expenses: 'expense_no'
};

var JOB_STATUSES = ['Confirmed', 'Design', 'Printing', 'Making', 'Installation', 'Done', 'Cancelled'];
var EST_STATUSES = ['Draft', 'Sent', 'Accepted', 'Lost'];

var VALIDATORS = {
  Parties: function (row) {
    if (row.is_deleted) return;
    if (!row.name) throw invalid_('Party name is required');
    if (row.phone && !/^\d{10}$/.test(String(row.phone))) throw invalid_('Phone must be 10 digits');
    if (row.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i.test(String(row.gstin))) throw invalid_('GSTIN does not look right');
  },
  Services: function (row) {
    if (row.is_deleted) return;
    if (!row.name) throw invalid_('Service name is required');
  },
  Estimates: function (row, prev, ctx) {
    if (prev && prev.job_id && row.job_id && row.job_id !== prev.job_id) throw invalid_('This estimate is already linked to a job');
    if (row.is_deleted) {
      if (prev && prev.status === 'Accepted') throw invalid_('An accepted estimate stays on record');
      return;
    }
    if (EST_STATUSES.indexOf(row.status) === -1) throw invalid_('Unknown estimate status');
    if (row.status === 'Accepted' && !row.job_id) throw invalid_('An accepted estimate needs its job');
    if (!row.party_id) throw invalid_('Choose a party');
    if (row.job_id && !findRow_(ctx, 'Jobs', row.job_id)) throw invalid_('Job not found');
  },
  EstimateItems: function (row, prev, ctx) { lineItem_(row, 'Estimates', 'estimate_id', ctx); },
  Jobs: function (row, prev, ctx) {
    if (row.is_deleted) return;
    if (!row.party_id) throw invalid_('Choose a party');
    if (JOB_STATUSES.indexOf(row.status) === -1) throw invalid_('Unknown job status');
    if (prev && prev.estimate_id && row.estimate_id !== prev.estimate_id) throw invalid_('The estimate link cannot be changed');
    if (row.estimate_id) {
      var est = findRow_(ctx, 'Estimates', row.estimate_id);
      if (!est || est.is_deleted) throw invalid_('Estimate not found');
      if (est.job_id && est.job_id !== row.id) throw invalid_('That estimate already has a job');
    }
  },
  JobItems: function (row, prev, ctx) { lineItem_(row, 'Jobs', 'job_id', ctx); },
  Invoices: function (row, prev, ctx) {
    if (prev) {
      if (prev.status === 'Void') throw invalid_('This invoice is already void');
      Object.keys(row).forEach(function (k) {
        if (['status', 'void_reason', 'updated_at', 'updated_by'].indexOf(k) !== -1) return;
        if (String(row[k] == null ? '' : row[k]) !== String(prev[k] == null ? '' : prev[k])) {
          throw invalid_("Invoices can't be edited. Void it and issue a new one.");
        }
      });
      if (row.status !== 'Void') throw invalid_('An invoice can only be voided');
      if (!row.void_reason) throw invalid_('Give a reason for voiding');
      return;
    }
    if (row.tax_mode !== 'gst' && row.tax_mode !== 'none') throw invalid_('Choose with GST or without GST');
    if (!row.buyer_name) throw invalid_('Buyer name is required');
    if (!(Number(row.total) > 0)) throw invalid_('Invoice total must be more than 0');
    row.status = 'Issued';
    row.void_reason = '';
    if (row.job_id) {
      var job = findRow_(ctx, 'Jobs', row.job_id);
      if (!job || job.is_deleted) throw invalid_('Job not found');
      if (job.status === 'Cancelled') throw invalid_('This job is cancelled');
      if (activeInvoiceForJob_(ctx, row.job_id)) throw invalid_('This job already has an invoice');
    }
    if (row.tax_mode === 'none') {
      row.cgst = 0; row.sgst = 0; row.igst = 0; row.tax_amount = 0; row.gst_rate = 0;
      row.total = round2_(row.subtotal);
    }
  },
  InvoiceItems: function (row, prev, ctx) {
    if (prev) throw invalid_("Invoice lines can't be changed");
    lineItem_(row, 'Invoices', 'invoice_id', ctx);
  },
  Receipts: function (row, prev, ctx) {
    if (prev) {
      if (prev.status === 'Void') throw invalid_('This receipt is already void');
      Object.keys(row).forEach(function (k) {
        if (['status', 'updated_at', 'updated_by'].indexOf(k) !== -1) return;
        if (String(row[k] == null ? '' : row[k]) !== String(prev[k] == null ? '' : prev[k])) {
          throw invalid_("A receipt can't be edited. Void it and record a new one.");
        }
      });
      if (row.status !== 'Void') throw invalid_('A receipt can only be voided');
      return;
    }
    if (!row.invoice_id) throw invalid_('Receipt is missing its invoice');
    var inv = findRow_(ctx, 'Invoices', row.invoice_id);
    if (!inv || inv.is_deleted || inv.status === 'Void') throw invalid_('Invoice not found');
    if (!(Number(row.amount) > 0)) throw invalid_('Amount must be more than 0');
    var due = round2_(Number(inv.total) - paidForInvoice_(ctx, row.invoice_id));
    if (Number(row.amount) > due + 0.001) throw invalid_('Amount is more than the balance of ₹' + due);
    if (!row.account) row.account = 'Cash';
    row.status = '';
  },
  Settings: function (row) {
    if (!row.key) throw invalid_('Setting key is required');
  },
  Materials: function (row) {
    if (row.is_deleted) return;
    if (!row.name) throw invalid_('Material name is required');
  },
  Purchases: function (row, prev, ctx) {
    if (prev) {
      if (prev.status === 'Void') throw invalid_('This purchase is already void');
      if (row.status !== 'Void') throw invalid_('A purchase can only be voided');
      if (!row.void_reason) throw invalid_('Give a reason for voiding');
      if (paidForPurchase_(ctx, row.id) > 0.001) throw invalid_('Void the payments on this purchase first');
      tableCtx_(ctx, 'PurchaseItems').rows.forEach(function (it) {
        if (it.is_deleted || it.purchase_id !== row.id) return;
        if (onHand_(ctx, it.material_id, row.id) < -0.001) throw invalid_('Material from this purchase is already issued to a job');
      });
      return;
    }
    if (!row.party_id) throw invalid_('Choose a supplier');
    if (!(Number(row.total) > 0)) throw invalid_('Purchase total must be more than 0');
    row.status = 'Issued';
    row.void_reason = '';
  },
  PurchaseItems: function (row, prev, ctx) {
    if (row.is_deleted) return;
    if (!row.purchase_id || !findRow_(ctx, 'Purchases', row.purchase_id)) throw invalid_('Purchase not found');
    if (!row.material_id) throw invalid_('Choose a material');
    if (!(Number(row.qty) > 0)) throw invalid_('Quantity must be more than 0');
  },
  PaymentsOut: function (row, prev, ctx) {
    if (prev) {
      if (prev.status === 'Void') throw invalid_('This payment is already void');
      if (row.status !== 'Void') throw invalid_('A payment can only be voided');
      return;
    }
    var purchase = findRow_(ctx, 'Purchases', row.purchase_id);
    if (!purchase || purchase.is_deleted || purchase.status === 'Void') throw invalid_('Purchase not found');
    if (!(Number(row.amount) > 0)) throw invalid_('Amount must be more than 0');
    var due = round2_(Number(purchase.total) - paidForPurchase_(ctx, row.purchase_id));
    if (Number(row.amount) > due + 0.001) throw invalid_('Amount is more than the balance');
    if (!row.account) row.account = 'Cash';
    row.status = '';
  },
  Issues: function (row, prev, ctx) {
    if (row.is_deleted) return;
    if (!row.material_id || !findRow_(ctx, 'Materials', row.material_id)) throw invalid_('Choose a material');
    if (!(Number(row.qty) > 0)) throw invalid_('Quantity must be more than 0');
    if (Number(row.qty) > onHand_(ctx, row.material_id) + 0.001) throw invalid_('Not enough on hand');
  },
  Expenses: function (row) {
    if (row.is_deleted) return;
    if (!row.category) throw invalid_('Choose a category');
    if (!(Number(row.amount) > 0)) throw invalid_('Amount must be more than 0');
    if (!row.account) row.account = 'Cash';
  }
};

function lineItem_(row, parentTable, fk, ctx) {
  if (row.is_deleted) return;
  if (!row[fk]) throw invalid_('Line is missing its document');
  var parent = findRow_(ctx, parentTable, row[fk]);
  if (!parent || parent.is_deleted) throw invalid_('Document not found');
  if (!row.item_name) throw invalid_('Every line needs a description');
}

function activeInvoiceForJob_(ctx, jobId) {
  return tableCtx_(ctx, 'Invoices').rows.some(function (i) {
    return i.job_id === jobId && !i.is_deleted && i.status !== 'Void';
  });
}

function paidForInvoice_(ctx, invoiceId) {
  var sum = tableCtx_(ctx, 'Receipts').rows.reduce(function (s, r) {
    if (r.invoice_id !== invoiceId || r.is_deleted || r.status === 'Void') return s;
    return s + (Number(r.amount) || 0);
  }, 0);
  return round2_(sum);
}

function paidForPurchase_(ctx, purchaseId) {
  var sum = tableCtx_(ctx, 'PaymentsOut').rows.reduce(function (s, r) {
    if (r.purchase_id !== purchaseId || r.is_deleted || r.status === 'Void') return s;
    return s + (Number(r.amount) || 0);
  }, 0);
  return round2_(sum);
}

function onHand_(ctx, materialId, exceptPurchaseId) {
  var m = findRow_(ctx, 'Materials', materialId);
  var q = m ? Number(m.opening_qty) || 0 : 0;
  tableCtx_(ctx, 'PurchaseItems').rows.forEach(function (it) {
    if (it.is_deleted || it.material_id !== materialId || it.purchase_id === exceptPurchaseId) return;
    var p = findRow_(ctx, 'Purchases', it.purchase_id);
    if (!p || p.is_deleted || p.status === 'Void') return;
    q += Number(it.qty) || 0;
  });
  tableCtx_(ctx, 'Issues').rows.forEach(function (it) {
    if (it.is_deleted || it.material_id !== materialId) return;
    q -= Number(it.qty) || 0;
  });
  return round2_(q);
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function tableCtx_(ctx, table) {
  if (!ctx[table]) ctx[table] = readTable_(table);
  return ctx[table];
}

function findRow_(ctx, table, id) {
  if (!id) return null;
  var t = tableCtx_(ctx, table);
  var idx = t.index[id];
  return idx == null ? null : t.rows[idx];
}

function doGet() {
  return json_({ ok: true, app: 'Flamingo Ads API', version: API_VERSION, features: { gstSeries: true, optionalJob: true, stock: true } });
}

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, code: 'BAD_REQUEST', message: 'Request body is not valid JSON' }); }
  try {
    if (req.action === 'login') {
      var res = login_(req.password);
      if (res.ok && req.withData) res.sync = sync_('');
      return json_(res);
    }
    verifyToken_(req.token);
    var user = String(req.device || 'app').slice(0, 40);
    switch (req.action) {
      case 'ping': return json_({ ok: true, serverTime: nowIso_() });
      case 'sync': return json_(sync_(req.since));
      case 'batch': {
        var ctx = {};
        var out = batch_(req.ops || [], user, ctx);
        if (req.since) out.sync = sync_(req.since, ctx);
        return json_(out);
      }
      default: return json_({ ok: false, code: 'BAD_REQUEST', message: 'Unknown action: ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, code: err.code || 'ERROR', message: String(err && err.message ? err.message : err) });
  }
}

var PROPS_ = null;
function props_() { return PROPS_ || (PROPS_ = PropertiesService.getScriptProperties().getProperties()); }

function login_(password) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('login_fails') || 0);
  if (fails >= MAX_LOGIN_FAILS) return { ok: false, code: 'LOCKED', message: 'Too many wrong attempts. Try again in 15 minutes.' };
  var salt = props_().PASSWORD_SALT;
  var hash = props_().PASSWORD_HASH;
  if (!salt || !hash) return { ok: false, code: 'NOT_SET_UP', message: 'App password not set. Open the Sheet → Flamingo Ads menu → Set app password.' };
  if (sha256Hex_(salt + String(password || '')) !== hash) {
    cache.put('login_fails', String(fails + 1), 15 * 60);
    return { ok: false, code: 'WRONG_PASSWORD', message: 'Wrong password' };
  }
  cache.remove('login_fails');
  var exp = Date.now() + TOKEN_DAYS * 24 * 3600 * 1000;
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ exp: exp }));
  return { ok: true, token: payload + '.' + sign_(payload), expiresAt: exp, serverTime: nowIso_() };
}

function verifyToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) throw error_('AUTH', 'Please log in again');
  var payload;
  try { payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); }
  catch (err) { throw error_('AUTH', 'Please log in again'); }
  if (!payload.exp || payload.exp < Date.now()) throw error_('AUTH', 'Session expired, please log in again');
}

function sign_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, getTokenSecret_()));
}

function getTokenSecret_() {
  var secret = props_().TOKEN_SECRET;
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('TOKEN_SECRET', secret);
    props_().TOKEN_SECRET = secret;
  }
  return secret;
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

function sync_(since, ctx) {
  if (!since) {
    var cached = fullCacheGet_();
    if (cached) return cached;
  }
  var serverTime = nowIso_();
  var cutoff = since ? new Date(new Date(since).getTime() - SYNC_OVERLAP_MS).toISOString() : '';
  var stored = props_();
  var tables = {};
  Object.keys(SCHEMA).forEach(function (table) {
    var lastWrite = stored['mod_' + table];
    if (cutoff && (!lastWrite || lastWrite < cutoff)) return;
    var t = (ctx && ctx[table]) || readTable_(table);
    var rows = t.rows.filter(function (r) { return !cutoff || String(r.updated_at) > cutoff; }).map(function (r) { return publicRow_(r); });
    if (rows.length) tables[table] = rows;
  });
  var res = { ok: true, serverTime: serverTime, full: !since, tables: tables };
  if (!since) fullCachePut_(res);
  return res;
}

var FULL_CACHE_CHUNK = 90000;
var FULL_CACHE_MAX_CHUNKS = 60;

function fullCacheKey_() {
  var stored = props_();
  var sig = Object.keys(SCHEMA).map(function (t) { return stored['mod_' + t] || ''; }).join('|');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig);
  return 'full_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function fullCacheGet_() {
  try {
    var cache = CacheService.getScriptCache();
    var key = fullCacheKey_();
    var n = Number(cache.get(key) || 0);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + '_' + i);
    var parts = cache.getAll(keys);
    var json = '';
    for (var j = 0; j < n; j++) {
      if (parts[keys[j]] == null) return null;
      json += parts[keys[j]];
    }
    return JSON.parse(json);
  } catch (e) { return null; }
}

function fullCachePut_(res) {
  try {
    var json = JSON.stringify(res);
    var n = Math.ceil(json.length / FULL_CACHE_CHUNK);
    if (n > FULL_CACHE_MAX_CHUNKS) return;
    var key = fullCacheKey_();
    var values = {};
    for (var i = 0; i < n; i++) values[key + '_' + i] = json.slice(i * FULL_CACHE_CHUNK, (i + 1) * FULL_CACHE_CHUNK);
    var cache = CacheService.getScriptCache();
    cache.putAll(values, 21600);
    cache.put(key, String(n), 21600);
  } catch (e) { /* login reads the Sheet instead */ }
}

function batch_(ops, user, ctx) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw error_('BUSY', 'Server busy, will retry');
  try {
    var results = ops.map(function (op) {
      try { return applyOp_(op, ctx, user); }
      catch (err) {
        var res = { opId: op.opId, ok: false, code: err.code || 'INVALID', message: String(err.message || err) };
        var t = ctx[op.table];
        if (t && t.index[op.id] != null) res.row = publicRow_(t.rows[t.index[op.id]]);
        return res;
      }
    });
    var touched = Object.keys(ctx).filter(function (name) { return ctx[name].dirty; });
    touched.forEach(function (name) { writeTable_(ctx[name]); });
    if (touched.length) {
      SpreadsheetApp.flush();
      var now = nowIso_();
      var mods = {};
      touched.forEach(function (name) { mods['mod_' + name] = now; });
      PropertiesService.getScriptProperties().setProperties(mods);
      Object.assign(props_(), mods);
    }
    return { ok: true, serverTime: nowIso_(), results: results };
  } finally { lock.releaseLock(); }
}

function applyOp_(op, ctx, user) {
  var table = op.table;
  if (!SCHEMA[table]) throw error_('BAD_REQUEST', 'Unknown table: ' + table);
  if (!op.id) throw error_('BAD_REQUEST', 'Missing id');
  var t = tableCtx_(ctx, table);
  var idx = t.index[op.id];
  var now = nowIso_();
  var data = sanitize_(table, op.data || {});

  if (op.type === 'create') {
    if (idx != null) return { opId: op.opId, ok: true, row: publicRow_(t.rows[idx]) };
    var row = blankRow_(table);
    Object.keys(data).forEach(function (k) { row[k] = data[k]; });
    row.id = String(op.id);
    row.created_at = now;
    row.created_by = user;
    row.updated_at = now;
    row.updated_by = user;
    row.is_deleted = data.is_deleted === true;
    if (VALIDATORS[table]) VALIDATORS[table](row, null, ctx);
    assignNumber_(table, row, ctx);
    t.index[row.id] = t.rows.length;
    t.rows.push(row);
    t.appended.push(row);
    t.dirty = true;
    return { opId: op.opId, ok: true, row: publicRow_(row) };
  }

  if (op.type === 'update') {
    if (idx == null) throw error_('NOT_FOUND', 'Record not found');
    var prev = t.rows[idx];
    if (op.base && String(prev.updated_at) !== String(op.base)) {
      return { opId: op.opId, ok: false, code: 'CONFLICT', message: 'Changed on another device', row: publicRow_(prev) };
    }
    var next = {};
    Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
    Object.keys(data).forEach(function (k) { next[k] = data[k]; });
    next.updated_at = now;
    next.updated_by = user;
    if (VALIDATORS[table]) VALIDATORS[table](next, prev, ctx);
    t.rows[idx] = next;
    if (prev.__row) t.updatedIdx[idx] = true;
    else t.appended[t.appended.indexOf(prev)] = next;
    t.dirty = true;
    return { opId: op.opId, ok: true, row: publicRow_(next) };
  }
  throw error_('BAD_REQUEST', 'Unknown op type: ' + op.type);
}

function sanitize_(table, data) {
  var out = {};
  var auto = AUTO_NUMBERS[table];
  SCHEMA[table].concat(['is_deleted']).forEach(function (f) {
    if (!(f in data)) return;
    if (auto && f === auto) return;
    var v = data[f];
    if (NUMERIC_FIELDS[f]) v = round2_(v);
    else if (BOOLEAN_FIELDS[f]) v = v === true || v === 'TRUE' || v === 'true';
    else v = v == null ? '' : String(v).trim();
    out[f] = v;
  });
  return out;
}

/** April–March. 2026-11-25 → 2026-27. Counter key ignores the display prefix. */
function fyKey_(ymd) {
  var s = String(ymd || '');
  var y = Number(s.slice(0, 4));
  var m = Number(s.slice(5, 7));
  if (!y || !m) {
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return fyKey_(today);
  }
  var start = m >= 4 ? y : y - 1;
  var end = String((start + 1) % 100);
  if (end.length === 1) end = '0' + end;
  return start + '-' + end;
}

function setting_(ctx, key, fallback) {
  var t = tableCtx_(ctx, 'Settings');
  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    if (r.key === key && !r.is_deleted && r.value) return String(r.value).trim();
  }
  return fallback;
}

function assignNumber_(table, row, ctx) {
  var field = AUTO_NUMBERS[table];
  if (!field) return;
  var fy = fyKey_(row.date);
  var prefix = 'DOC';
  var counter = table + '-' + fy;
  if (table === 'Estimates') { prefix = setting_(ctx, 'prefix_est', 'EST'); counter = 'EST-' + fy; }
  else if (table === 'Jobs') { prefix = setting_(ctx, 'prefix_job', 'JOB'); counter = 'JOB-' + fy; }
  else if (table === 'Receipts') { prefix = setting_(ctx, 'prefix_rcpt', 'RCT'); counter = 'RCT-' + fy; }
  else if (table === 'Purchases') { prefix = setting_(ctx, 'prefix_pur', 'PUR'); counter = 'PUR-' + fy; }
  else if (table === 'PaymentsOut') { prefix = setting_(ctx, 'prefix_pay', 'PAY'); counter = 'PAY-' + fy; }
  else if (table === 'Expenses') { prefix = setting_(ctx, 'prefix_exp', 'EXP'); counter = 'EXP-' + fy; }
  else if (table === 'Invoices') {
    var gst = row.tax_mode === 'gst';
    prefix = setting_(ctx, gst ? 'prefix_gst' : 'prefix_bill', gst ? 'GST' : 'BILL');
    counter = (gst ? 'GST-' : 'BILL-') + fy;
  }
  var seq = nextSeq_(counter);
  row[field] = prefix + '/' + fy + '/' + ('00' + seq).slice(-3);
}

function nextSeq_(key) {
  var sh = getSheet_('Counters');
  var last = sh.getLastRow();
  var values = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === key) {
      var seq = Number(values[i][1] || 0) + 1;
      sh.getRange(i + 2, 2).setValue(seq);
      return seq;
    }
  }
  sh.getRange(last + 1, 1, 1, 2).setNumberFormats([['@', '0']]).setValues([[key, 1]]);
  return 1;
}

function headersFor_(table) { return COMMON_FIELDS.concat(SCHEMA[table]); }

function getSheet_(name) {
  var sh = activeSpreadsheetOrThrow_().getSheetByName(name);
  if (!sh) throw error_('NOT_SET_UP', 'Sheet tab "' + name + '" missing. Run Flamingo Ads → Run setup.');
  return sh;
}

function ensureColumns_(sh, needed) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var raw = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h == null ? '' : h).trim(); });
  var n = raw.length;
  while (n > 0 && !raw[n - 1]) n--;
  var existing = raw.slice(0, n);
  var missing = needed.filter(function (h) { return existing.indexOf(h) === -1; });
  if (!missing.length) return { headers: existing.length ? existing : needed.slice(), added: [] };
  var start = existing.length + 1;
  sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#f8e8f4');
  return { headers: existing.concat(missing), added: missing };
}

function readTable_(table) {
  var ss = activeSpreadsheetOrThrow_();
  var sh = ss.getSheetByName(table);
  if (!sh) throw error_('NOT_SET_UP', 'Sheet tab "' + table + '" missing. Run Flamingo Ads → Run setup.');
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h || '').trim(); });
  var headerCount = headers.length;
  while (headerCount > 0 && !headers[headerCount - 1]) headerCount--;
  var useHeaders = headers.slice(0, headerCount);
  var rows = [];
  var index = {};
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var empty = true;
    for (var c = 0; c < useHeaders.length; c++) {
      var h = useHeaders[c];
      if (!h) continue;
      var v = values[r][c];
      if (Object.prototype.toString.call(v) === '[object Date]') {
        v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      if (v !== '' && v != null) empty = false;
      obj[h] = v;
    }
    if (empty || !obj.id) continue;
    obj.id = String(obj.id);
    obj.is_deleted = obj.is_deleted === true || obj.is_deleted === 'TRUE';
    obj.active = obj.active === true || obj.active === 'TRUE' || obj.active === '';
    index[obj.id] = rows.length;
    rows.push(obj);
    obj.__row = r + 1;
  }
  return { name: table, sheet: sh, headers: useHeaders, rows: rows, index: index, appended: [], updatedIdx: {}, dirty: false };
}

function writeTable_(t) {
  var toArray = function (row) {
    return t.headers.map(function (h) { return h && row[h] != null ? row[h] : ''; });
  };
  Object.keys(t.updatedIdx).forEach(function (i) {
    var row = t.rows[i];
    t.sheet.getRange(row.__row, 1, 1, t.headers.length).setValues([toArray(row)]);
  });
  if (t.appended.length) {
    var start = t.sheet.getLastRow() + 1;
    var formats = t.appended.map(function () { return t.headers.map(formatFor_); });
    t.sheet.getRange(start, 1, t.appended.length, t.headers.length).setNumberFormats(formats).setValues(t.appended.map(toArray));
  }
}

function formatFor_(header) {
  if (NUMERIC_FIELDS[header]) return '0.##';
  return '@';
}

function blankRow_(table) {
  var row = {};
  headersFor_(table).forEach(function (h) { row[h] = ''; });
  return row;
}

function publicRow_(row) {
  var out = {};
  Object.keys(row).forEach(function (k) { if (k.indexOf('__') !== 0) out[k] = row[k]; });
  return out;
}

function nowIso_() { return new Date().toISOString(); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function error_(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}
function invalid_(message) { return error_('INVALID', message); }

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Flamingo Ads')
    .addItem('Run setup (safe to re-run)', 'setup')
    .addItem('Repair missing columns', 'repairColumns')
    .addItem('Set app password', 'promptSetPassword')
    .addItem('Log out all devices', 'logoutAllDevices')
    .addToUi();
}

function activeSpreadsheetOrThrow_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('Open Apps Script from the Flamingo Ads spreadsheet. Extensions → Apps Script.');
}

function repairColumns() {
  var ss = activeSpreadsheetOrThrow_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  var lines = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var res = ensureColumns_(sh, headersFor_(name));
    lines.push(name + (res.added.length ? ': +' + res.added.join(', ') : ': OK'));
  });
  var counters = ss.getSheetByName('Counters') || ss.insertSheet('Counters');
  ensureColumns_(counters, ['key', 'last_seq']);
  SpreadsheetApp.flush();
  try { SpreadsheetApp.getUi().alert(lines.join('\n')); } catch (e) { Logger.log(lines.join('\n')); }
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  var tabs = Object.keys(SCHEMA).map(function (t) { return { name: t, headers: headersFor_(t) }; });
  tabs.push({ name: 'Counters', headers: ['key', 'last_seq'] });
  tabs.forEach(function (tab) {
    var sh = ss.getSheetByName(tab.name) || ss.insertSheet(tab.name);
    var res = ensureColumns_(sh, tab.headers);
    var headers = res.headers.length ? res.headers : tab.headers;
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f8e8f4');
    sh.setFrozenRows(1);
    headers.forEach(function (h, i) {
      var fmt = tab.name === 'Counters' ? (h === 'last_seq' ? '0' : '@') : formatFor_(h);
      sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(fmt);
    });
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  seedSettings_({
    company_name: 'Flamingo Ads',
    gst_rate: '18',
    prefix_gst: 'GST',
    prefix_bill: 'BILL',
    prefix_est: 'EST',
    prefix_job: 'JOB',
    prefix_rcpt: 'RCT',
    prefix_pur: 'PUR',
    prefix_pay: 'PAY',
    prefix_exp: 'EXP',
    opening_cash: '0',
    opening_bank: '0',
    invoice_terms: '50% advance confirms the job.\nBalance is due before installation.\nPrinting starts after the artwork is approved.\nGST extra, unless the invoice says otherwise.'
  });
  seedServices_();
  seedMaterials_();
  getTokenSecret_();
  SpreadsheetApp.flush();
  var tz = Session.getScriptTimeZone();
  ss.toast('Setup complete (API ' + API_VERSION + ').' +
    (tz !== 'Asia/Kolkata' ? ' Set the script time zone to Asia/Kolkata.' : '') +
    (PropertiesService.getScriptProperties().getProperty('PASSWORD_HASH') ? '' : ' Next: Flamingo Ads → Set app password.'),
    'Flamingo Ads', 15);
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function seedSettings_(defaults) {
  var t = readTable_('Settings');
  var now = nowIso_();
  Object.keys(defaults).forEach(function (key) {
    if (t.index[key] != null) return;
    var row = blankRow_('Settings');
    row.id = key; row.key = key; row.value = defaults[key];
    row.created_at = now; row.updated_at = now; row.created_by = 'setup'; row.updated_by = 'setup'; row.is_deleted = false;
    t.appended.push(row);
    t.rows.push(row);
    t.index[key] = t.rows.length - 1;
  });
  if (t.appended.length) {
    writeTable_(t);
    PropertiesService.getScriptProperties().setProperty('mod_Settings', now);
  }
}

function seedServices_() {
  var t = readTable_('Services');
  if (t.rows.length) return;
  var now = nowIso_();
  [
    ['svc-name-board', 'Name board', 'sq.ft'],
    ['svc-company-board', 'Company board', 'sq.ft'],
    ['svc-billboard', 'Billboard', 'sq.ft'],
    ['svc-flex', 'Flex printing', 'sq.ft'],
    ['svc-led', 'LED board', 'sq.ft'],
    ['svc-install', 'Installation', 'pcs']
  ].forEach(function (s) {
    var row = blankRow_('Services');
    row.id = s[0]; row.name = s[1]; row.unit = s[2]; row.rate = 0; row.hsn = ''; row.active = true;
    row.created_at = now; row.updated_at = now; row.created_by = 'setup'; row.updated_by = 'setup'; row.is_deleted = false;
    t.appended.push(row);
  });
  writeTable_(t);
  PropertiesService.getScriptProperties().setProperty('mod_Services', now);
}

function seedMaterials_() {
  var t = readTable_('Materials');
  if (t.rows.length) return;
  var now = nowIso_();
  [
    ['mat-sun-12x4', '12×4 sun board', 'sheet', 2],
    ['mat-sun-14x4', '14×4 sun board', 'sheet', 2],
    ['mat-sun-16x4', '16×4 sun board', 'sheet', 2],
    ['mat-vinyl', 'Vinyl roll', 'roll', 1],
    ['mat-ink', 'Ink', 'ltr', 1]
  ].forEach(function (s) {
    var row = blankRow_('Materials');
    row.id = s[0]; row.name = s[1]; row.unit = s[2]; row.opening_qty = 0; row.reorder_level = s[3];
    row.purchase_rate = 0; row.active = true; row.notes = '';
    row.created_at = now; row.updated_at = now; row.created_by = 'setup'; row.updated_by = 'setup'; row.is_deleted = false;
    t.appended.push(row);
  });
  writeTable_(t);
  PropertiesService.getScriptProperties().setProperty('mod_Materials', now);
}

function promptSetPassword() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Set app password', 'Password everyone will use to log in (min 6 characters):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pw = res.getResponseText();
  if (!pw || pw.length < 6) { ui.alert('Password must be at least 6 characters.'); return; }
  var salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    PASSWORD_SALT: salt,
    PASSWORD_HASH: sha256Hex_(salt + pw),
    TOKEN_SECRET: Utilities.getUuid() + Utilities.getUuid()
  });
  ui.alert('Password set. Every device must log in again.');
}

function logoutAllDevices() {
  PropertiesService.getScriptProperties().setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  try { SpreadsheetApp.getUi().alert('Done. Every device will need to log in again.'); } catch (e) {}
}
