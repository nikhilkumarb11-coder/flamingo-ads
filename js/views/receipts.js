/** Money received on an order, or on a standalone invoice, into Cash or Bank. */
Views.receipts = {
  title: 'Receipts',
  refreshOn: ['Receipts', 'Invoices', 'Jobs'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new') return this.form(el, b || '');
    if (a) return this.detail(el, a);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Receipts').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex justify-content-between mb-3"><span class="text-muted">${rows.length} receipts</span>
        <a class="btn btn-primary" href="#/receipts/new">New receipt</a></div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>No.</th><th>Party</th><th>Account</th><th>Date</th><th class="text-end">Amount</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><a href="#/receipts/${r.id}">${U.esc(r.receipt_no || 'Pending')}</a>${r.status === 'Void' ? ' ' + Books.badge('Void') : ''}</td>
          <td>${U.esc(Books.partyName(r.party_id))}<div class="small text-muted">${U.esc(this.about(r))}</div></td>
          <td>${U.esc(r.account || '')}</td>
          <td>${U.fmtDate(r.date)}</td>
          <td class="text-end">${U.inr(r.amount)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-muted py-4 text-center">No receipts yet.</td></tr>'}
        </tbody></table></div>
    </div></div>`;
  },
  detail(el, id) {
    const doc = Store.get('Receipts', id);
    if (!doc) { el.innerHTML = `<div class="alert alert-warning">Receipt not found.</div>`; return; }
    document.getElementById('page-title').textContent = doc.receipt_no || 'Receipt';
    const order = doc.job_id ? Store.get('Jobs', doc.job_id) : null;
    const inv = !order && doc.invoice_id ? Store.get('Invoices', doc.invoice_id) : null;
    el.innerHTML = `<div class="d-flex gap-2 mb-3">
        <button type="button" class="btn btn-primary" data-print>Print</button>
        ${doc.status !== 'Void' ? '<button type="button" class="btn btn-outline-danger" data-void>Void</button>' : ''}
        ${order ? `<a class="btn btn-outline-secondary" href="#/orders/${order.id}">Order</a>` : ''}
        ${inv ? `<a class="btn btn-outline-secondary" href="#/invoices/${inv.id}">Invoice</a>` : ''}
      </div>
      <div class="card"><div class="card-body">
        <div class="h4">${U.inr(doc.amount)}</div>
        <div>${U.esc(Books.partyName(doc.party_id))} · ${U.esc(doc.account || '')}</div>
        <div class="small text-muted">${U.fmtDate(doc.date)}</div>
        ${doc.note ? `<div class="mt-2">${U.esc(doc.note)}</div>` : ''}
        ${doc.status === 'Void' ? '<div class="alert alert-danger mt-3 mb-0">Void</div>' : ''}
      </div></div>`;
    el.querySelector('[data-print]').addEventListener('click', () => this.print(id));
    const voidBtn = el.querySelector('[data-void]');
    if (voidBtn) voidBtn.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Void receipt', message: 'This amount becomes due on the order again.', confirmText: 'Void receipt' });
      if (!ok) return;
      await Store.save('Receipts', { id, status: 'Void' });
      UI.toast('Receipt voided');
    });
  },
  about(r) {
    if (r.job_id) {
      const job = Store.get('Jobs', r.job_id);
      return job && job.job_no ? job.job_no : 'Order';
    }
    if (r.invoice_id) {
      const inv = Store.get('Invoices', r.invoice_id);
      return inv && inv.invoice_no ? inv.invoice_no : 'Invoice';
    }
    return '';
  },
  async print(id) {
    const live = await Docs.awaitNumber('Receipts', id, 'receipt_no');
    if (!live || !live.receipt_no) return UI.toast('The receipt number has not come back yet. Wait for Saved, then print again.', 'warning');
    Docs.receipt(live);
  },
  rowsFor(job) {
    return Books.orderReceipts(job.id).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  },
  linesHtml(rows, { voidable }) {
    return rows.map(r => `<div class="d-flex justify-content-between align-items-center py-1 gap-2">
      <span>${U.fmtDate(r.date)} · ${U.esc(r.account || '')}${r.receipt_no ? ' · ' + U.esc(r.receipt_no) : ''}</span>
      <span class="d-flex align-items-center gap-2">${U.inr(r.amount)}
        <button type="button" class="btn btn-sm btn-outline-primary" data-print-receipt="${r.id}">Receipt</button>
        ${voidable ? `<button type="button" class="btn btn-sm btn-outline-danger" data-void-receipt="${r.id}">Void</button>` : ''}
      </span>
    </div>`).join('') || '<div class="text-muted small">No payment yet.</div>';
  },
  bind(container, rerender) {
    container.querySelectorAll('[data-print-receipt]').forEach(btn => btn.addEventListener('click', () => this.print(btn.dataset.printReceipt)));
    container.querySelectorAll('[data-void-receipt]').forEach(btn => btn.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Void payment', message: 'This amount becomes due on the order again.', confirmText: 'Void payment' });
      if (!ok) return;
      await Store.save('Receipts', { id: btn.dataset.voidReceipt, status: 'Void' });
      UI.toast('Payment voided');
      if (rerender) rerender();
    }));
  },
  /** Part or full payments on an order. An invoice is not required. */
  settleOrder(container, job, rerender) {
    if (!container || !job) return;
    const due = Books.orderDue(job);
    const paid = Books.paidForOrder(job.id);
    const ceiling = Books.collectable(job);
    const inv = Books.activeInvoiceForJob(job.id);
    const gstNote = inv && Number(inv.total) > Number(job.total) + 0.001 ? ' · includes GST on the invoice' : '';
    const rows = this.rowsFor(job);
    container.innerHTML = `<div class="card mt-3"><div class="card-body">
      <div class="d-flex justify-content-between align-items-baseline">
        <h6 class="mb-1">Settlement</h6>
        <div class="fw-bold">${due > 0.001 ? 'Due ' + U.inr(due) : 'Settled'}</div>
      </div>
      <div class="small text-muted mb-2">Received ${U.inr(paid)} of ${U.inr(ceiling)}${gstNote}</div>
      ${this.linesHtml(rows, { voidable: true })}
      ${due > 0.001 ? `<div class="row g-2 align-items-end mt-2">
        <div class="col-6 col-md-3"><label class="form-label">Amount</label>
          <input class="form-control" data-amount inputmode="decimal" value="${due}"></div>
        <div class="col-6 col-md-3"><label class="form-label">Into</label>
          <select class="form-select" data-account><option>Cash</option><option>Bank</option></select></div>
        <div class="col-12 col-md-auto"><button type="button" class="btn btn-primary" data-receive>Receive</button></div>
      </div>
      <p class="small text-muted mt-2 mb-0">Each amount is its own receipt. Take the full balance, or a smaller part, until the order is complete. The invoice can be issued at any time and will show what is received and what remains.</p>` : ''}
    </div></div>`;
    const again = () => { if (rerender) rerender(); else this.settleOrder(container, Store.get('Jobs', job.id)); };
    const receive = container.querySelector('[data-receive]');
    if (receive) receive.addEventListener('click', async () => {
      const value = U.round2(container.querySelector('[data-amount]').value);
      const live = Store.get('Jobs', job.id);
      const left = Books.orderDue(live);
      if (!(value > 0)) return UI.toast('Amount must be more than 0', 'warning');
      if (value > left + 0.001) return UI.toast('Amount is more than the balance of ' + U.inr(left), 'warning');
      await Store.save('Receipts', {
        job_id: live.id,
        invoice_id: '',
        party_id: live.party_id,
        date: U.today(),
        amount: value,
        account: container.querySelector('[data-account]').value,
        note: '',
        status: ''
      });
      UI.toast(value + 0.001 >= left ? 'Settled' : 'Part payment recorded. ' + U.inr(U.round2(left - value)) + ' still due');
      again();
    });
    this.bind(container, again);
  },
  /** Payments already taken, shown on an invoice that belongs to an order. */
  showOnInvoice(container, invoice) {
    if (!container || !invoice || !invoice.job_id) return;
    const rows = Books.orderReceipts(invoice.job_id).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    container.innerHTML = `<div class="card mt-3"><div class="card-body">
      <div class="d-flex justify-content-between align-items-baseline">
        <h6 class="mb-1">Payments</h6>
        <a href="#/orders/${invoice.job_id}">Record on the order</a>
      </div>
      ${this.linesHtml(rows, { voidable: false })}
    </div></div>`;
    this.bind(container);
  },
  /** Standalone invoice, with no order to receive against. */
  settle(container, invoice, rerender) {
    if (!container) return;
    if (!invoice || invoice.status === 'Void' || invoice.job_id) { container.innerHTML = ''; return; }
    const due = Books.invoiceDue(invoice);
    const paid = Books.paidForInvoice(invoice.id);
    const rows = Store.list('Receipts')
      .filter(r => r.invoice_id === invoice.id && !r.job_id && r.status !== 'Void')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    container.innerHTML = `<div class="card mt-3"><div class="card-body">
      <div class="d-flex justify-content-between align-items-baseline">
        <h6 class="mb-1">Settlement</h6>
        <div class="fw-bold">${due > 0.001 ? 'Due ' + U.inr(due) : 'Settled'}</div>
      </div>
      <div class="small text-muted mb-2">${U.esc(invoice.invoice_no || 'Invoice')} · received ${U.inr(paid)} of ${U.inr(invoice.total)}</div>
      ${this.linesHtml(rows, { voidable: true })}
      ${due > 0.001 ? `<div class="row g-2 align-items-end mt-2">
        <div class="col-6 col-md-3"><label class="form-label">Amount</label>
          <input class="form-control" data-amount inputmode="decimal" value="${due}"></div>
        <div class="col-6 col-md-3"><label class="form-label">Into</label>
          <select class="form-select" data-account><option>Cash</option><option>Bank</option></select></div>
        <div class="col-12 col-md-auto"><button type="button" class="btn btn-primary" data-receive>Receive</button></div>
      </div>` : ''}
    </div></div>`;
    const again = () => { if (rerender) rerender(); else this.settle(container, Store.get('Invoices', invoice.id)); };
    const receive = container.querySelector('[data-receive]');
    if (receive) receive.addEventListener('click', async () => {
      const value = U.round2(container.querySelector('[data-amount]').value);
      const live = Store.get('Invoices', invoice.id);
      const left = Books.invoiceDue(live);
      if (!(value > 0)) return UI.toast('Amount must be more than 0', 'warning');
      if (value > left + 0.001) return UI.toast('Amount is more than the balance of ' + U.inr(left), 'warning');
      await Store.save('Receipts', {
        job_id: '',
        invoice_id: live.id,
        party_id: live.party_id,
        date: U.today(),
        amount: value,
        account: container.querySelector('[data-account]').value,
        note: '',
        status: ''
      });
      UI.toast(value + 0.001 >= left ? 'Settled' : 'Part payment recorded. ' + U.inr(U.round2(left - value)) + ' still due');
      again();
    });
    this.bind(container, again);
  },
  form(el) {
    const orders = Store.list('Jobs').filter(j => j.status !== 'Cancelled' && Books.orderDue(j) > 0.001)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const bills = Store.list('Invoices').filter(i => !i.job_id && i.status !== 'Void' && Books.invoiceDue(i) > 0.001);
    document.getElementById('page-title').textContent = 'New receipt';
    const options = orders.map(j =>
      `<option value="job:${j.id}">${U.esc(j.job_no || 'Order')} · ${U.esc(Books.partyName(j.party_id))} · due ${U.inr(Books.orderDue(j))}</option>`
    ).concat(bills.map(i =>
      `<option value="inv:${i.id}">${U.esc(i.invoice_no || 'Invoice')} · ${U.esc(i.buyer_name || '')} · due ${U.inr(Books.invoiceDue(i))}</option>`
    )).join('');
    el.innerHTML = `<form class="card"><div class="card-body">
      ${options ? '' : '<div class="alert alert-warning">Nothing has a balance. Open the order and receive there, or issue a standalone invoice.</div>'}
      <div class="row g-3">
        <div class="col-12"><label class="form-label">Order</label><select class="form-select" name="target" ${options ? '' : 'disabled'}>${options}</select></div>
        <div class="col-md-4"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${U.today()}"></div>
        <div class="col-md-4"><label class="form-label">Amount (₹)</label><input class="form-control" name="amount" inputmode="decimal" required></div>
        <div class="col-md-4"><label class="form-label">Account</label>
          <select class="form-select" name="account"><option>Cash</option><option>Bank</option></select></div>
        <div class="col-12"><label class="form-label">Note</label><input class="form-control" name="note"></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit" ${options ? '' : 'disabled'}>Save receipt</button>
        <a class="btn btn-outline-secondary" href="#/receipts">Cancel</a>
      </div>
    </div></form>`;
    const select = el.querySelector('[name=target]');
    const amount = el.querySelector('[name=amount]');
    const dueOf = value => {
      const [kind, id] = String(value || '').split(':');
      if (kind === 'job') return Books.orderDue(Store.get('Jobs', id));
      if (kind === 'inv') return Books.invoiceDue(Store.get('Invoices', id));
      return 0;
    };
    const fill = () => { if (select && select.value) amount.value = dueOf(select.value); };
    if (select) select.addEventListener('change', fill);
    fill();
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const [kind, id] = String(f.target.value || '').split(':');
      const value = U.round2(f.amount.value);
      if (!(value > 0)) return UI.toast('Amount must be more than 0', 'warning');
      const due = dueOf(f.target.value);
      if (value > due + 0.001) return UI.toast('Amount is more than the balance of ' + U.inr(due), 'warning');
      const patch = { date: f.date.value, amount: value, account: f.account.value, note: f.note.value.trim(), status: '' };
      if (kind === 'job') {
        const job = Store.get('Jobs', id);
        if (!job) return UI.toast('Choose an order', 'warning');
        Object.assign(patch, { job_id: job.id, invoice_id: '', party_id: job.party_id });
      } else if (kind === 'inv') {
        const inv = Store.get('Invoices', id);
        if (!inv) return UI.toast('Choose an invoice', 'warning');
        Object.assign(patch, { job_id: '', invoice_id: inv.id, party_id: inv.party_id });
      } else return UI.toast('Choose an order', 'warning');
      const row = await Store.save('Receipts', patch);
      UI.toast('Receipt saved');
      location.hash = '#/receipts/' + row.id;
    });
  }
};
