/** Domain rules shared by every screen. Line maths here must match Code.gs. */
const Books = (() => {
  const JOB_STATUSES = ['Confirmed', 'Design', 'Printing', 'Making', 'Installation', 'Done', 'Cancelled'];
  const EST_STATUSES = ['Draft', 'Sent', 'Accepted', 'Lost'];
  const UNITS = ['sq.ft', 'rft', 'pcs'];
  const MATERIAL_UNITS = ['sheet', 'sq.ft', 'rft', 'pcs', 'roll', 'ltr', 'kg'];
  const EXPENSE_CATEGORIES = ['Rent', 'Wages', 'Fuel', 'Tea', 'Other'];
  const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];

  const DEFAULT_TERMS = [
    '50% advance confirms the order.',
    'Balance is due before installation.',
    'Printing starts after the artwork is approved.',
    'GST extra, unless the invoice says otherwise.'
  ].join('\n');

  function party(id) { return Store.get('Parties', id); }
  function partyName(id) { return (party(id) || {}).name || ''; }

  function items(table, fk, id) {
    return Store.list(table).filter(r => r[fk] === id)
      .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }

  /** sq.ft with width and height bills width × height × pieces. Everything else bills qty × rate. */
  function billQty(it) {
    const w = Number(it.width) || 0;
    const h = Number(it.height) || 0;
    const qty = Number(it.qty) || 0;
    if ((it.unit || 'pcs') === 'sq.ft' && w > 0 && h > 0) return U.round2(w * h * (qty || 1));
    return U.round2(qty);
  }

  function lineAmount(it) {
    return U.round2(billQty(it) * (Number(it.rate) || 0));
  }

  function sumItems(list) {
    return U.round2(list.reduce((s, it) => s + lineAmount(it), 0));
  }

  function childOps(table, fk, parentId, list, previous) {
    const keep = new Set();
    const ops = list.map((it, i) => {
      const id = it.id || U.uuid();
      keep.add(id);
      return [table, {
        id, [fk]: parentId, sort: i,
        item_name: it.item_name, width: it.width || 0, height: it.height || 0,
        qty: it.qty || 0, unit: it.unit || 'pcs', rate: it.rate || 0,
        amount: lineAmount(it), hsn: it.hsn || ''
      }];
    });
    (previous || []).forEach(old => {
      if (!keep.has(old.id)) ops.push([table, { id: old.id, is_deleted: true }]);
    });
    return ops;
  }

  function tax(subtotal, partyState, rateOverride) {
    const s = Store.settings();
    const rate = rateOverride != null && rateOverride !== '' ? Number(rateOverride) : (Number(s.gst_rate) || 18);
    const taxAmount = U.round2((Number(subtotal) || 0) * rate / 100);
    const shop = String(s.state || '').trim().toLowerCase();
    const who = String(partyState || '').trim().toLowerCase();
    const inter = !!(who && shop && who !== shop);
    if (inter) return { rate, cgst: 0, sgst: 0, igst: taxAmount, tax: taxAmount, inter: true };
    const cgst = U.round2(taxAmount / 2);
    return { rate, cgst, sgst: U.round2(taxAmount - cgst), igst: 0, tax: taxAmount, inter: false };
  }

  function paidForInvoice(invoiceId, exceptId) {
    return U.round2(Store.list('Receipts')
      .filter(r => r.invoice_id === invoiceId && !r.job_id && r.status !== 'Void' && r.id !== exceptId)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0));
  }

  /** Payments recorded on the order, plus older receipts that only named its invoice. */
  function orderReceipts(jobId, exceptId) {
    return Store.list('Receipts').filter(r => {
      if (r.status === 'Void' || r.id === exceptId) return false;
      if (r.job_id === jobId) return true;
      if (!r.job_id && r.invoice_id) {
        const inv = Store.get('Invoices', r.invoice_id);
        return !!(inv && inv.job_id === jobId);
      }
      return false;
    });
  }

  function paidForOrder(jobId, exceptId) {
    return U.round2(orderReceipts(jobId, exceptId).reduce((s, r) => s + (Number(r.amount) || 0), 0));
  }

  /** Order total, or the invoice total when GST makes the bill higher. */
  function collectable(job) {
    if (!job) return 0;
    const inv = activeInvoiceForJob(job.id);
    return U.round2(Math.max(Number(job.total) || 0, inv ? Number(inv.total) || 0 : 0));
  }

  function orderDue(job, exceptId) {
    if (!job || job.status === 'Cancelled') return 0;
    return U.round2(Math.max(0, collectable(job) - paidForOrder(job.id, exceptId)));
  }

  function receivedOnInvoice(inv) {
    if (!inv) return 0;
    return inv.job_id ? paidForOrder(inv.job_id) : paidForInvoice(inv.id);
  }

  function invoiceDue(inv, exceptId) {
    if (!inv || inv.status === 'Void') return 0;
    const paid = inv.job_id ? paidForOrder(inv.job_id, exceptId) : paidForInvoice(inv.id, exceptId);
    return U.round2(Math.max(0, (Number(inv.total) || 0) - paid));
  }

  function activeInvoiceForJob(jobId) {
    return Store.list('Invoices').find(i => i.job_id === jobId && i.status !== 'Void') || null;
  }

  function receivable() {
    const opening = Store.list('Parties').reduce((s, p) => s + (Number(p.opening_receivable) || 0), 0);
    const dues = Store.list('Invoices').reduce((s, i) => s + invoiceDue(i), 0);
    return U.round2(opening + dues);
  }

  function paidForPurchase(purchaseId, exceptId) {
    return U.round2(Store.list('PaymentsOut')
      .filter(r => r.purchase_id === purchaseId && r.status !== 'Void' && r.id !== exceptId)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0));
  }

  function purchaseDue(purchase, exceptId) {
    if (!purchase || purchase.status === 'Void') return 0;
    return U.round2(Math.max(0, (Number(purchase.total) || 0) - paidForPurchase(purchase.id, exceptId)));
  }

  function payable() {
    const opening = Store.list('Parties').reduce((s, p) => s + (Number(p.opening_payable) || 0), 0);
    const dues = Store.list('Purchases').reduce((s, p) => s + purchaseDue(p), 0);
    return U.round2(opening + dues);
  }

  function accountBalance(name) {
    const key = name === 'Cash' ? 'opening_cash' : 'opening_bank';
    const opening = Number(Store.settings()[key] || 0);
    const inn = Store.list('Receipts')
      .filter(r => r.status !== 'Void' && (r.account || 'Cash') === name)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const outPay = Store.list('PaymentsOut')
      .filter(r => r.status !== 'Void' && (r.account || 'Cash') === name)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const outExp = Store.list('Expenses')
      .filter(r => !r.is_deleted && (r.account || 'Cash') === name)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return U.round2(opening + inn - outPay - outExp);
  }

  /** On hand = opening + purchases still live − material issued to jobs. */
  function onHand(materialId, exceptIssueId) {
    const m = Store.get('Materials', materialId);
    let q = Number(m && m.opening_qty) || 0;
    Store.list('PurchaseItems').forEach(it => {
      if (it.material_id !== materialId) return;
      const p = Store.get('Purchases', it.purchase_id);
      if (!p || p.is_deleted || p.status === 'Void') return;
      q += Number(it.qty) || 0;
    });
    Store.list('Issues').forEach(it => {
      if (it.material_id !== materialId || it.id === exceptIssueId) return;
      q -= Number(it.qty) || 0;
    });
    return U.round2(q);
  }

  function lowStock() {
    return Store.list('Materials')
      .filter(m => m.active !== false && m.active !== 'FALSE')
      .map(m => ({ material: m, qty: onHand(m.id) }))
      .filter(r => r.qty <= (Number(r.material.reorder_level) || 0))
      .sort((a, b) => a.qty - b.qty);
  }

  function monthSales(month) {
    const list = Store.list('Invoices').filter(i => i.status !== 'Void' && String(i.date || '').startsWith(month));
    const total = U.round2(list.reduce((s, i) => s + (Number(i.total) || 0), 0));
    const gst = U.round2(list.filter(i => i.tax_mode === 'gst').reduce((s, i) => s + (Number(i.total) || 0), 0));
    return { total, gst, plain: U.round2(total - gst), count: list.length };
  }

  function dailySales(month) {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const buckets = Array.from({ length: days }, () => 0);
    Store.list('Invoices').forEach(i => {
      if (i.status === 'Void' || !String(i.date || '').startsWith(month)) return;
      const d = Number(String(i.date).slice(8, 10));
      if (d >= 1 && d <= days) buckets[d - 1] += Number(i.total) || 0;
    });
    return buckets;
  }

  function reminders() {
    const windowDays = APP_CONFIG.reminderDays || 5;
    return Store.list('Jobs')
      .filter(j => j.due_date && j.status !== 'Done' && j.status !== 'Cancelled')
      .map(j => ({ job: j, days: U.daysUntil(j.due_date) }))
      .filter(r => r.days <= windowDays)
      .sort((a, b) => a.days - b.days);
  }

  function partyStatement(partyId) {
    const p = party(partyId);
    let running = U.round2((Number(p && p.opening_receivable) || 0) - (Number(p && p.opening_payable) || 0));
    const rows = [];
    if (p && ((Number(p.opening_receivable) || 0) || (Number(p.opening_payable) || 0))) {
      rows.push({ date: '', label: 'Opening balance', debit: Number(p.opening_receivable) || 0, credit: Number(p.opening_payable) || 0, balance: running });
    }
    const events = [];
    Store.list('Invoices').forEach(i => {
      if (i.party_id === partyId && i.status !== 'Void') events.push({ date: i.date, label: `${i.tax_mode === 'gst' ? 'Tax invoice' : 'Invoice'} ${i.invoice_no || ''}`, debit: Number(i.total) || 0, credit: 0, href: `#/invoices/${i.id}` });
    });
    Store.list('Receipts').forEach(r => {
      if (r.party_id === partyId && r.status !== 'Void') events.push({ date: r.date, label: `Receipt ${r.receipt_no || ''}`, debit: 0, credit: Number(r.amount) || 0, href: `#/receipts/${r.id}` });
    });
    Store.list('Purchases').forEach(p => {
      if (p.party_id === partyId && p.status !== 'Void') events.push({ date: p.date, label: `Purchase ${p.purchase_no || ''}`, debit: 0, credit: Number(p.total) || 0, href: `#/purchases/${p.id}` });
    });
    Store.list('PaymentsOut').forEach(r => {
      if (r.party_id === partyId && r.status !== 'Void') events.push({ date: r.date, label: `Payment ${r.payment_no || ''}`, debit: Number(r.amount) || 0, credit: 0, href: `#/purchases/${r.purchase_id}` });
    });
    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    events.forEach(e => {
      running = U.round2(running + e.debit - e.credit);
      rows.push({ ...e, balance: running });
    });
    return { rows, balance: running };
  }

  const SERVICE_SEED = [
    ['svc-name-board', 'Name board', 'sq.ft'],
    ['svc-company-board', 'Company board', 'sq.ft'],
    ['svc-billboard', 'Billboard', 'sq.ft'],
    ['svc-flex', 'Flex printing', 'sq.ft'],
    ['svc-led', 'LED board', 'sq.ft'],
    ['svc-install', 'Installation', 'pcs']
  ];

  async function ensureSeed() {
    if (Store.settings().company_name) return;
    const settings = {
      company_name: 'Flamingo Ads',
      address: '',
      phone: '',
      email: '',
      gstin: '',
      state: '',
      gst_rate: '18',
      opening_cash: '0',
      opening_bank: '0',
      prefix_gst: 'GST',
      prefix_bill: 'BILL',
      prefix_est: 'EST',
      prefix_job: 'JOB',
      prefix_rcpt: 'RCT',
      prefix_pur: 'PUR',
      prefix_pay: 'PAY',
      prefix_exp: 'EXP',
      invoice_terms: DEFAULT_TERMS,
      doc_sign_name: 'Flamingo Ads'
    };
    const ops = Object.entries(settings).map(([key, value]) => ['Settings', { id: key, key, value }]);
    if (!Store.list('Services').length) {
      SERVICE_SEED.forEach(([id, name, unit]) => ops.push(['Services', { id, name, unit, rate: 0, hsn: '', active: true }]));
    }
    await Store.saveMany(ops);
  }

  const MATERIAL_SEED = [
    ['mat-sun-12x4', '12×4 sun board', 'sheet', 2],
    ['mat-sun-14x4', '14×4 sun board', 'sheet', 2],
    ['mat-sun-16x4', '16×4 sun board', 'sheet', 2],
    ['mat-vinyl', 'Vinyl roll', 'roll', 1],
    ['mat-ink', 'Ink', 'ltr', 1]
  ];

  async function ensureStock() {
    const ops = [];
    [['prefix_pur', 'PUR'], ['prefix_pay', 'PAY'], ['prefix_exp', 'EXP']].forEach(([key, value]) => {
      if (!Store.settings()[key]) ops.push(['Settings', { id: key, key, value }]);
    });
    if (String(Store.settings().materials_ready || '') !== '1') {
      ops.push(['Settings', { id: 'materials_ready', key: 'materials_ready', value: '1' }]);
      if (!Store.list('Materials').length) {
        MATERIAL_SEED.forEach(([id, name, unit, reorder]) => ops.push(['Materials', {
          id, name, unit, opening_qty: 0, reorder_level: reorder, purchase_rate: 0, active: true, notes: ''
        }]));
      }
    }
    if (ops.length) await Store.saveMany(ops);
  }

  function partyAlive(p) {
    return p && p.is_deleted !== true && p.is_deleted !== 'TRUE';
  }

  function partyByName(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return Store.list('Parties').find(p => String(p.name || '').trim().toLowerCase() === n) || null;
  }

  function partyRow(id, name) {
    return ['Parties', {
      id, name, phone: '', gstin: '', state: '', address: '',
      opening_receivable: 0, opening_payable: 0, notes: ''
    }];
  }

  /** Use an existing party when the name matches. Otherwise return a create op for this save. */
  function takeParty(input, hidden) {
    const name = input.value.trim();
    if (!name) return null;
    const selected = partyAlive(Store.get('Parties', hidden.value));
    if (selected && selected.name === name) return { id: selected.id };
    if (hidden.dataset.fresh === '1' && hidden.value && input.dataset.freshName === name) {
      return { id: hidden.value, op: partyRow(hidden.value, name) };
    }
    const found = partyByName(name);
    if (found) return { id: found.id };
    const id = U.uuid();
    return { id, op: partyRow(id, name) };
  }

  function mountParty(input, hidden, initialId, onPick) {
    if (initialId) {
      hidden.value = initialId;
      input.value = partyName(initialId);
    }
    if (!input.readOnly) input.placeholder = 'Type any name';
    const hint = document.createElement('div');
    hint.className = 'form-text';
    hint.textContent = 'New party. Phone, GSTIN and address can be updated later.';
    hint.hidden = true;

    function paintHint() {
      const name = input.value.trim();
      const selected = partyAlive(Store.get('Parties', hidden.value));
      const matched = selected && selected.name === name;
      hint.hidden = !name || matched || !!partyByName(name);
    }

    function acceptNew(name) {
      const found = partyByName(name);
      if (found) {
        hidden.value = found.id;
        delete hidden.dataset.fresh;
        delete input.dataset.freshName;
        input.value = found.name;
        if (onPick) onPick(found);
      } else {
        if (hidden.dataset.fresh !== '1' || !hidden.value) hidden.value = U.uuid();
        hidden.dataset.fresh = '1';
        input.dataset.freshName = name;
        input.value = name;
        if (onPick) onPick({ id: hidden.value, name, phone: '', gstin: '', state: '', address: '' });
      }
      paintHint();
    }

    Typeahead.attach(input, {
      minChars: 0,
      source: q => {
        const n = q.trim().toLowerCase();
        return Store.list('Parties')
          .filter(p => !n || String(p.name || '').toLowerCase().includes(n) || String(p.phone || '').includes(n))
          .slice(0, 8)
          .map(p => ({ label: p.name, sub: [p.phone, p.gstin].filter(Boolean).join(' · '), value: p }));
      },
      onPick: it => {
        hidden.value = it.value.id;
        delete hidden.dataset.fresh;
        delete input.dataset.freshName;
        input.value = it.value.name;
        paintHint();
        if (onPick) onPick(it.value);
      },
      onAdd: acceptNew,
      footer: q => {
        const name = q.trim();
        if (!name || partyByName(name)) return '';
        return `<button type="button" class="dropdown-item fw-semibold text-primary" data-typeahead-add>Add “${U.esc(name)}”</button>`;
      }
    });
    input.parentNode.appendChild(hint);
    input.addEventListener('input', () => {
      const name = input.value.trim();
      const selected = partyAlive(Store.get('Parties', hidden.value));
      if (selected && selected.name === name) {
        delete hidden.dataset.fresh;
      } else if (!(hidden.dataset.fresh === '1' && input.dataset.freshName === name)) {
        hidden.value = '';
        delete hidden.dataset.fresh;
        delete input.dataset.freshName;
      }
      paintHint();
    });
    paintHint();
  }

  function badge(status) {
    const color = {
      Draft: 'secondary', Sent: 'info', Accepted: 'success', Lost: 'danger',
      Confirmed: 'primary', Design: 'info', Printing: 'info', Making: 'warning',
      Installation: 'warning', Done: 'success', Cancelled: 'secondary',
      Issued: 'success', Void: 'danger', Partial: 'warning', Unpaid: 'danger', Paid: 'success'
    }[status] || 'secondary';
    return `<span class="badge bg-${color}">${U.esc(status || '')}</span>`;
  }

  function stateOptions(selected) {
    const cur = selected || '';
    return `<option value="">Select state</option>` + STATES.map(s => `<option${s === cur ? ' selected' : ''}>${U.esc(s)}</option>`).join('');
  }

  return {
    JOB_STATUSES, EST_STATUSES, UNITS, MATERIAL_UNITS, EXPENSE_CATEGORIES, STATES, DEFAULT_TERMS,
    party, partyName, items, billQty, lineAmount, sumItems, childOps, tax,
    paidForInvoice, orderReceipts, paidForOrder, collectable, orderDue, receivedOnInvoice, invoiceDue, activeInvoiceForJob, paidForPurchase, purchaseDue,
    receivable, payable, accountBalance, onHand, lowStock, monthSales, dailySales, reminders, partyStatement,
    ensureSeed, ensureStock, badge, stateOptions, mountParty, takeParty
  };
})();
