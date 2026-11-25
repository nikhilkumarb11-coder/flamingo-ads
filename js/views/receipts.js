/** Money received against an invoice, into Cash or Bank. */
Views.receipts = {
  title: 'Receipts',
  refreshOn: ['Receipts', 'Invoices'],
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
          <td>${U.esc(Books.partyName(r.party_id))}</td>
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
    const inv = Store.get('Invoices', doc.invoice_id);
    el.innerHTML = `<div class="d-flex gap-2 mb-3">
        <button type="button" class="btn btn-primary" data-print>Print</button>
        ${doc.status !== 'Void' ? '<button type="button" class="btn btn-outline-danger" data-void>Void</button>' : ''}
        ${inv ? `<a class="btn btn-outline-secondary" href="#/invoices/${inv.id}">Invoice</a>` : ''}
      </div>
      <div class="card"><div class="card-body">
        <div class="h4">${U.inr(doc.amount)}</div>
        <div>${U.esc(Books.partyName(doc.party_id))} · ${U.esc(doc.account || '')}</div>
        <div class="small text-muted">${U.fmtDate(doc.date)}</div>
        ${doc.note ? `<div class="mt-2">${U.esc(doc.note)}</div>` : ''}
        ${doc.status === 'Void' ? '<div class="alert alert-danger mt-3 mb-0">Void</div>' : ''}
      </div></div>`;
    el.querySelector('[data-print]').addEventListener('click', () => Docs.receipt(doc));
    const voidBtn = el.querySelector('[data-void]');
    if (voidBtn) voidBtn.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Void receipt', message: 'The amount comes back as due on the invoice.', confirmText: 'Void receipt' });
      if (!ok) return;
      await Store.save('Receipts', { id, status: 'Void' });
      UI.toast('Receipt voided');
    });
  },
  form(el, invoiceId) {
    const open = Store.list('Invoices').filter(i => i.status !== 'Void' && Books.invoiceDue(i) > 0);
    const preset = invoiceId ? Store.get('Invoices', invoiceId) : null;
    if (invoiceId && (!preset || preset.status === 'Void')) { el.innerHTML = `<div class="alert alert-warning">Invoice not found.</div>`; return; }
    document.getElementById('page-title').textContent = 'New receipt';
    const options = (preset ? [preset] : open).map(i =>
      `<option value="${i.id}" ${preset && i.id === preset.id ? 'selected' : ''}>${U.esc(i.invoice_no || 'Pending')} · ${U.esc(i.buyer_name || '')} · due ${U.inr(Books.invoiceDue(i))}</option>`
    ).join('');
    el.innerHTML = `<form class="card"><div class="card-body">
      ${options ? '' : '<div class="alert alert-warning">There is no invoice with a balance.</div>'}
      <div class="row g-3">
        <div class="col-12"><label class="form-label">Invoice</label><select class="form-select" name="invoice_id" ${options ? '' : 'disabled'}>${options}</select></div>
        <div class="col-md-4"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${U.today()}"></div>
        <div class="col-md-4"><label class="form-label">Amount (₹)</label><input class="form-control" name="amount" inputmode="decimal" required></div>
        <div class="col-md-4"><label class="form-label">Account</label>
          <select class="form-select" name="account"><option>Cash</option><option>Bank</option></select></div>
        <div class="col-12"><label class="form-label">Note</label><input class="form-control" name="note"></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit" ${options ? '' : 'disabled'}>Save receipt</button>
        <a class="btn btn-outline-secondary" href="${invoiceId ? '#/invoices/' + invoiceId : '#/receipts'}">Cancel</a>
      </div>
    </div></form>`;
    const select = el.querySelector('[name=invoice_id]');
    const amount = el.querySelector('[name=amount]');
    const fill = () => {
      const inv = Store.get('Invoices', select.value);
      if (inv && !amount.value) amount.value = Books.invoiceDue(inv);
    };
    if (select) select.addEventListener('change', () => { amount.value = ''; fill(); });
    fill();
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const inv = Store.get('Invoices', f.invoice_id.value);
      const value = U.round2(f.amount.value);
      if (!inv) return UI.toast('Choose an invoice', 'warning');
      if (!(value > 0)) return UI.toast('Amount must be more than 0', 'warning');
      const due = Books.invoiceDue(inv);
      if (value > due + 0.001) return UI.toast('Amount is more than the balance of ' + U.inr(due), 'warning');
      const row = await Store.save('Receipts', {
        invoice_id: inv.id,
        party_id: inv.party_id,
        date: f.date.value,
        amount: value,
        account: f.account.value,
        note: f.note.value.trim(),
        status: ''
      });
      UI.toast('Receipt saved');
      location.hash = '#/receipts/' + row.id;
    });
  }
};
