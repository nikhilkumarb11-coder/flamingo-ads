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
  /** Payment against one invoice, kept on the order or the bill. */
  settle(container, invoice, rerender) {
    if (!container) return;
    if (!invoice || invoice.status === 'Void') { container.innerHTML = ''; return; }
    const due = Books.invoiceDue(invoice);
    const paid = Books.paidForInvoice(invoice.id);
    const rows = Store.list('Receipts')
      .filter(r => r.invoice_id === invoice.id && r.status !== 'Void')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    container.innerHTML = `<div class="card mt-3"><div class="card-body">
      <div class="d-flex justify-content-between align-items-baseline">
        <h6 class="mb-1">Settlement</h6>
        <div class="fw-bold">${due > 0.001 ? 'Due ' + U.inr(due) : 'Settled'}</div>
      </div>
      <div class="small text-muted mb-2">${U.esc(invoice.invoice_no || 'Invoice')} · received ${U.inr(paid)} of ${U.inr(invoice.total)}</div>
      ${rows.map(r => `<div class="d-flex justify-content-between align-items-center py-1">
        <span>${U.fmtDate(r.date)} · ${U.esc(r.account || '')}${r.receipt_no ? ' · ' + U.esc(r.receipt_no) : ''}</span>
        <span class="d-flex align-items-center gap-2">${U.inr(r.amount)}
          <button type="button" class="btn btn-sm btn-outline-danger" data-void-receipt="${r.id}">Void</button></span>
      </div>`).join('') || '<div class="text-muted small">No payment yet.</div>'}
      ${due > 0.001 ? `<div class="row g-2 align-items-end mt-2">
        <div class="col-6 col-md-3"><label class="form-label">Amount</label>
          <input class="form-control" data-amount inputmode="decimal" value="${due}"></div>
        <div class="col-6 col-md-3"><label class="form-label">Into</label>
          <select class="form-select" data-account><option>Cash</option><option>Bank</option></select></div>
        <div class="col-12 col-md-auto"><button type="button" class="btn btn-primary" data-receive>Receive</button></div>
      </div>
      <p class="small text-muted mt-2 mb-0">Use the full balance to settle, or a smaller amount for a part payment.</p>` : ''}
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
    container.querySelectorAll('[data-void-receipt]').forEach(btn => btn.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Void payment', message: 'This amount becomes due again.', confirmText: 'Void payment' });
      if (!ok) return;
      await Store.save('Receipts', { id: btn.dataset.voidReceipt, status: 'Void' });
      UI.toast('Payment voided');
      again();
    }));
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
