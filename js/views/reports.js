/** Sales register, GST register, daybook, outstanding, stock, and expenses. */
Views.reports = {
  title: 'Reports',
  refreshOn: ['Invoices', 'InvoiceItems', 'Receipts', 'Purchases', 'PaymentsOut', 'Expenses', 'Materials', 'PurchaseItems', 'Issues', 'Parties'],
  render(el, params) {
    const tab = params[0] || 'sales';
    const tabs = [
      ['sales', 'Sales'],
      ['gst', 'GST'],
      ['daybook', 'Daybook'],
      ['outstanding', 'Outstanding'],
      ['stock', 'Stock'],
      ['expenses', 'Expenses']
    ];
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">
      ${tabs.map(([id, label]) => `<a class="btn btn-sm ${id === tab ? 'btn-primary' : 'btn-outline-primary'}" href="#/reports/${id}">${label}</a>`).join('')}
    </div><div data-report></div>`;
    this[tab] ? this[tab](el.querySelector('[data-report]')) : this.sales(el.querySelector('[data-report]'));
  },
  sales(el) {
    const month = U.today().slice(0, 7);
    const draw = () => {
      const m = el.querySelector('[data-month]').value || month;
      const mode = el.querySelector('[data-mode]').value;
      const rows = Store.list('Invoices')
        .filter(i => i.status !== 'Void' && String(i.date || '').startsWith(m) && (mode === 'all' || i.tax_mode === mode))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const total = U.round2(rows.reduce((s, i) => s + (Number(i.total) || 0), 0));
      el.querySelector('[data-body]').innerHTML = `<div class="table-responsive table-fit"><table class="table">
        <thead><tr><th>No.</th><th>Date</th><th>Party</th><th>Series</th><th class="text-end">Taxable</th><th class="text-end">Tax</th><th class="text-end">Total</th></tr></thead>
        <tbody>${rows.map(i => `<tr>
          <td><a href="#/invoices/${i.id}">${U.esc(i.invoice_no || '')}</a></td>
          <td>${U.fmtDate(i.date)}</td><td>${U.esc(i.buyer_name || '')}</td>
          <td>${i.tax_mode === 'gst' ? 'GST' : 'Without GST'}</td>
          <td class="text-end">${U.inr(i.subtotal)}</td><td class="text-end">${U.inr(i.tax_amount)}</td><td class="text-end">${U.inr(i.total)}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="text-muted">No bills in this month.</td></tr>'}
        <tr><td colspan="6" class="text-end fw-bold">Total</td><td class="text-end fw-bold">${U.inr(total)}</td></tr>
        </tbody></table></div>`;
    };
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex flex-wrap gap-2 mb-3">
        <input class="form-control" style="max-width:12rem" type="month" data-month value="${month}">
        <select class="form-select" style="max-width:14rem" data-mode><option value="all">Both series</option><option value="gst">GST only</option><option value="none">Without GST</option></select>
      </div>
      <div data-body></div>
    </div></div>`;
    el.querySelector('[data-month]').addEventListener('change', draw);
    el.querySelector('[data-mode]').addEventListener('change', draw);
    draw();
  },
  gst(el) {
    const month = U.today().slice(0, 7);
    const draw = () => {
      const m = el.querySelector('[data-month]').value || month;
      const rows = Store.list('Invoices').filter(i => i.status !== 'Void' && i.tax_mode === 'gst' && String(i.date || '').startsWith(m))
        .sort((a, b) => String(a.invoice_no || '').localeCompare(String(b.invoice_no || '')));
      const sum = key => U.round2(rows.reduce((s, i) => s + (Number(i[key]) || 0), 0));
      el.querySelector('[data-body]').innerHTML = `<p class="small text-muted">Bills without GST are not in this register.</p>
        <div class="table-responsive table-fit"><table class="table">
        <thead><tr><th>No.</th><th>Date</th><th>Party</th><th>GSTIN</th><th class="text-end">Taxable</th><th class="text-end">CGST</th><th class="text-end">SGST</th><th class="text-end">IGST</th><th class="text-end">Total</th></tr></thead>
        <tbody>${rows.map(i => `<tr>
          <td>${U.esc(i.invoice_no || '')}</td><td>${U.fmtDate(i.date)}</td><td>${U.esc(i.buyer_name || '')}</td><td>${U.esc(i.buyer_gstin || '')}</td>
          <td class="text-end">${U.inr(i.subtotal)}</td><td class="text-end">${U.inr(i.cgst)}</td><td class="text-end">${U.inr(i.sgst)}</td><td class="text-end">${U.inr(i.igst)}</td><td class="text-end">${U.inr(i.total)}</td>
        </tr>`).join('') || '<tr><td colspan="9" class="text-muted">No tax invoices this month.</td></tr>'}
        <tr><td colspan="4" class="fw-bold">Total</td>
          <td class="text-end fw-bold">${U.inr(sum('subtotal'))}</td><td class="text-end fw-bold">${U.inr(sum('cgst'))}</td>
          <td class="text-end fw-bold">${U.inr(sum('sgst'))}</td><td class="text-end fw-bold">${U.inr(sum('igst'))}</td><td class="text-end fw-bold">${U.inr(sum('total'))}</td></tr>
        </tbody></table></div>`;
    };
    el.innerHTML = `<div class="card"><div class="card-body">
      <input class="form-control mb-3" style="max-width:12rem" type="month" data-month value="${month}">
      <div data-body></div></div></div>`;
    el.querySelector('[data-month]').addEventListener('change', draw);
    draw();
  },
  daybook(el) {
    const draw = () => {
      const day = el.querySelector('[data-day]').value || U.today();
      const rows = [];
      const on = (date, label, account, inn, out) => { if (String(date) === day) rows.push({ label, account, inn, out }); };
      Store.list('Receipts').forEach(r => { if (r.status === 'Void') return; on(r.date, `Receipt ${r.receipt_no || ''} · ${Books.partyName(r.party_id)}`, r.account, Number(r.amount) || 0, 0); });
      Store.list('PaymentsOut').forEach(r => { if (r.status === 'Void') return; on(r.date, `Payment ${r.payment_no || ''} · ${Books.partyName(r.party_id)}`, r.account, 0, Number(r.amount) || 0); });
      Store.list('Expenses').forEach(r => on(r.date, `Expense ${r.expense_no || ''} · ${r.category}`, r.account, 0, Number(r.amount) || 0));
      const bills = Store.list('Invoices').filter(i => i.status !== 'Void' && String(i.date) === day);
      const buys = Store.list('Purchases').filter(p => p.status !== 'Void' && String(p.date) === day);
      const inn = U.round2(rows.reduce((s, r) => s + r.inn, 0));
      const out = U.round2(rows.reduce((s, r) => s + r.out, 0));
      el.querySelector('[data-body]').innerHTML = `
        <h6>Money in and out</h6>
        <div class="table-responsive table-fit"><table class="table"><thead><tr><th>Particular</th><th>Account</th><th class="text-end">In</th><th class="text-end">Out</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${U.esc(r.label)}</td><td>${U.esc(r.account || '')}</td><td class="text-end">${r.inn ? U.inr(r.inn) : ''}</td><td class="text-end">${r.out ? U.inr(r.out) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">No cash or bank movement.</td></tr>'}
        <tr><td colspan="2" class="fw-bold">Total</td><td class="text-end fw-bold">${U.inr(inn)}</td><td class="text-end fw-bold">${U.inr(out)}</td></tr>
        </tbody></table></div>
        <h6 class="mt-3">Bills and purchases the same day</h6>
        ${bills.map(i => `<div><a href="#/invoices/${i.id}">${U.esc(i.invoice_no || 'Invoice')}</a> · ${U.esc(i.buyer_name || '')} · ${U.inr(i.total)}</div>`).join('') || '<div class="text-muted small">No invoices.</div>'}
        ${buys.map(p => `<div><a href="#/purchases/${p.id}">${U.esc(p.purchase_no || 'Purchase')}</a> · ${U.esc(Books.partyName(p.party_id))} · ${U.inr(p.total)}</div>`).join('') || '<div class="text-muted small">No purchases.</div>'}`;
    };
    el.innerHTML = `<div class="card"><div class="card-body">
      <input class="form-control mb-3" style="max-width:12rem" type="date" data-day value="${U.today()}">
      <div data-body></div></div></div>`;
    el.querySelector('[data-day]').addEventListener('change', draw);
    draw();
  },
  outstanding(el) {
    const rows = Store.list('Parties').map(p => ({ p, balance: Books.partyStatement(p.id).balance }))
      .filter(r => Math.abs(r.balance) > 0.001)
      .sort((a, b) => b.balance - a.balance);
    const oweUs = rows.filter(r => r.balance > 0);
    const weOwe = rows.filter(r => r.balance < 0);
    const list = (items, sign) => items.map(r => `<a class="d-flex justify-content-between py-1 text-body" href="#/parties/${r.p.id}"><span>${U.esc(r.p.name)}</span><span>${U.inr(sign * r.balance)}</span></a>`).join('') || '<div class="text-muted small">None.</div>';
    el.innerHTML = `<div class="row g-3">
      <div class="col-md-6"><div class="card"><div class="card-body"><h6>They owe you</h6>${list(oweUs, 1)}
        <div class="fw-bold mt-2">${U.inr(oweUs.reduce((s, r) => s + r.balance, 0))}</div></div></div></div>
      <div class="col-md-6"><div class="card"><div class="card-body"><h6>You owe them</h6>${list(weOwe, -1)}
        <div class="fw-bold mt-2">${U.inr(weOwe.reduce((s, r) => s + -r.balance, 0))}</div></div></div></div>
    </div>`;
  },
  stock(el) {
    const rows = Store.list('Materials').map(m => ({ m, qty: Books.onHand(m.id) })).sort((a, b) => String(a.m.name).localeCompare(String(b.m.name)));
    el.innerHTML = `<div class="card"><div class="card-body"><div class="table-responsive table-fit"><table class="table">
      <thead><tr><th>Material</th><th>Unit</th><th class="text-end">On hand</th><th class="text-end">Reorder</th><th></th></tr></thead>
      <tbody>${rows.map(({ m, qty }) => `<tr>
        <td><a href="#/materials/${m.id}">${U.esc(m.name)}</a></td><td>${U.esc(m.unit || '')}</td>
        <td class="text-end">${qty}</td><td class="text-end">${m.reorder_level || 0}</td>
        <td>${qty <= (Number(m.reorder_level) || 0) ? '<span class="badge bg-danger">Low</span>' : ''}</td>
      </tr>`).join('')}</tbody></table></div></div></div>`;
  },
  expenses(el) {
    const month = U.today().slice(0, 7);
    const draw = () => {
      const m = el.querySelector('[data-month]').value || month;
      const rows = Store.list('Expenses').filter(r => String(r.date || '').startsWith(m));
      const by = {};
      rows.forEach(r => { by[r.category] = (by[r.category] || 0) + (Number(r.amount) || 0); });
      const keys = Object.keys(by).sort();
      el.querySelector('[data-body]').innerHTML = `<table class="table"><thead><tr><th>Category</th><th class="text-end">Amount</th></tr></thead>
        <tbody>${keys.map(k => `<tr><td>${U.esc(k)}</td><td class="text-end">${U.inr(by[k])}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">No expenses this month.</td></tr>'}
        <tr><td class="fw-bold">Total</td><td class="text-end fw-bold">${U.inr(keys.reduce((s, k) => s + by[k], 0))}</td></tr></tbody></table>`;
    };
    el.innerHTML = `<div class="card"><div class="card-body">
      <input class="form-control mb-3" style="max-width:12rem" type="month" data-month value="${month}">
      <div data-body></div></div></div>`;
    el.querySelector('[data-month]').addEventListener('change', draw);
    draw();
  }
};
