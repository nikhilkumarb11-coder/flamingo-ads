/**
 * Invoices. tax_mode is chosen before the form and never changes.
 * GST and non-GST bills use separate number series, assigned on save.
 */
Views.invoices = {
  title: 'Invoices',
  refreshOn: ['Invoices', 'InvoiceItems', 'Receipts'],
  render(el, params) {
    const [a, b, c, d] = params;
    if (a === 'new') return this.form(el, b, c, d);
    if (a) return this.detail(el, a);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Invoices').sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex flex-wrap gap-2 justify-content-between mb-3">
        <span class="text-muted">${rows.length} invoices</span>
        <span class="d-flex gap-2">
          <a class="btn btn-primary" href="#/invoices/new/gst">Tax invoice</a>
          <a class="btn btn-outline-primary" href="#/invoices/new/none">Without GST</a>
        </span>
      </div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>No.</th><th>Party</th><th>Series</th><th>Date</th><th class="text-end">Total</th><th class="text-end">Due</th></tr></thead>
        <tbody>${rows.map(i => `<tr>
          <td><a href="#/invoices/${i.id}">${U.esc(i.invoice_no || 'Pending')}</a>${i.status === 'Void' ? ' ' + Books.badge('Void') : ''}</td>
          <td>${U.esc(i.buyer_name || '')}</td>
          <td>${i.tax_mode === 'gst' ? 'GST' : 'Without GST'}</td>
          <td>${U.fmtDate(i.date)}</td>
          <td class="text-end">${U.inr(i.total)}</td>
          <td class="text-end">${i.status === 'Void' ? '' : U.inr(Books.invoiceDue(i))}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="text-muted py-4 text-center">No invoices yet.</td></tr>'}
        </tbody></table></div>
    </div></div>`;
  },
  detail(el, id) {
    const doc = Store.get('Invoices', id);
    if (!doc || doc.is_deleted) { el.innerHTML = `<div class="alert alert-warning">Invoice not found.</div>`; return; }
    document.getElementById('page-title').textContent = doc.invoice_no || 'Invoice';
    const list = Books.items('InvoiceItems', 'invoice_id', id);
    const due = Books.invoiceDue(doc);
    const paid = Books.paidForInvoice(id);
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">
        <button type="button" class="btn btn-primary" data-print>${doc.tax_mode === 'gst' ? 'Print tax invoice' : 'Print invoice'}</button>
        ${doc.status !== 'Void' && due > 0 ? `<a class="btn btn-outline-primary" href="#/receipts/new/${id}">Receipt</a>` : ''}
        ${doc.status !== 'Void' ? `<button type="button" class="btn btn-outline-danger" data-void>Void</button>` : ''}
        ${doc.job_id ? `<a class="btn btn-outline-secondary" href="#/jobs/${doc.job_id}">Job</a>` : ''}
      </div>
      <div class="card"><div class="card-body">
        <div class="d-flex justify-content-between">
          <div>
            <div class="fw-semibold">${U.esc(doc.buyer_name)}</div>
            <div class="small text-muted">${U.fmtDate(doc.date)} · ${doc.tax_mode === 'gst' ? 'Tax invoice' : 'Invoice without GST'}</div>
          </div>
          ${Books.badge(doc.status === 'Void' ? 'Void' : due <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid')}
        </div>
        ${doc.status === 'Void' ? `<div class="alert alert-danger mt-3 mb-0">Void. ${U.esc(doc.void_reason || '')}</div>` : ''}
        ${Views.estimates.linesHtml(list)}
        <div class="text-end">
          <div>Taxable ${U.inr(doc.subtotal)}</div>
          ${doc.tax_mode === 'gst' ? `<div class="small">CGST ${U.inr(doc.cgst)} · SGST ${U.inr(doc.sgst)} · IGST ${U.inr(doc.igst)}</div>` : ''}
          <div class="fw-bold">${U.inr(doc.total)}</div>
          <div class="small text-muted">Received ${U.inr(paid)} · Due ${U.inr(due)}</div>
        </div>
      </div></div>`;
    el.querySelector('[data-print]').addEventListener('click', () => Docs.invoice(doc));
    const voidBtn = el.querySelector('[data-void]');
    if (voidBtn) voidBtn.addEventListener('click', async () => {
      const reason = await UI.promptText({ title: 'Void invoice', message: 'The number stays used. Issue a new invoice if you still need to bill this job.', label: 'Reason', confirmText: 'Void invoice', danger: true });
      if (!reason) return;
      await Store.save('Invoices', { id, status: 'Void', void_reason: reason });
      UI.toast('Invoice voided');
    });
  },

  /**
   * #/invoices/new/gst
   * #/invoices/new/gst/{jobId}
   * #/invoices/new/gst/party/{partyId}
   */
  form(el, mode, ref, extra) {
    const taxMode = mode === 'none' ? 'none' : 'gst';
    let job = null;
    let partyId = '';
    if (ref && ref !== 'party') {
      job = Store.get('Jobs', ref);
      if (!job || job.is_deleted) {
        el.innerHTML = `<div class="alert alert-warning">Job not found.</div>`;
        return;
      }
      if (job.status === 'Cancelled') {
        el.innerHTML = `<div class="alert alert-warning">This job is cancelled. Reopen it before billing.</div>`;
        return;
      }
      const existing = Books.activeInvoiceForJob(job.id);
      if (existing) { location.hash = '#/invoices/' + existing.id; return; }
      partyId = job.party_id;
    } else if (ref === 'party') partyId = extra || '';
    const party = partyId ? Store.get('Parties', partyId) : null;
    const seed = job ? Books.items('JobItems', 'job_id', job.id).map(it => ({ ...it, id: undefined })) : [];
    document.getElementById('page-title').textContent = taxMode === 'gst' ? 'Tax invoice' : 'Invoice without GST';
    el.innerHTML = `<form class="card"><div class="card-body">
      <div class="alert ${taxMode === 'gst' ? 'alert-primary' : 'alert-secondary'}" data-series>
        This will be numbered in the <strong>${taxMode === 'gst' ? 'GST' : 'BILL'}</strong> series
        for <span data-fy>${U.fy(U.today())}</span>.
        The series cannot be changed after you save. A mistake is a void and a new bill.
      </div>
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Party</label>
          <input class="form-control" data-party-name placeholder="Type a name" autocomplete="off">
          <input type="hidden" name="party_id"></div>
        <div class="col-md-3"><label class="form-label">Date</label>
          <input class="form-control" type="date" name="date" required value="${U.today()}"></div>
        <div class="col-md-3"><label class="form-label">Place of supply</label>
          <select class="form-select" name="buyer_state">${Books.stateOptions(party && party.state)}</select></div>
        <div class="col-md-4"><label class="form-label">Name on bill</label><input class="form-control" name="buyer_name" value="${U.esc((party && party.name) || '')}"></div>
        <div class="col-md-4"><label class="form-label">Phone</label><input class="form-control" name="buyer_phone" value="${U.esc((party && party.phone) || '')}"></div>
        <div class="col-md-4"><label class="form-label">GSTIN</label><input class="form-control" name="buyer_gstin" value="${U.esc((party && party.gstin) || '')}"></div>
        <div class="col-12"><label class="form-label">Address</label><textarea class="form-control" name="buyer_address" rows="2">${U.esc((job && job.site_address) || (party && party.address) || '')}</textarea></div>
        <div class="col-12"><div data-lines></div></div>
        <div class="col-md-6"><label class="form-label">Notes on the bill</label><textarea class="form-control" name="notes" rows="2"></textarea></div>
        <div class="col-md-6"><div class="money-box" data-tax></div></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit">Issue ${taxMode === 'gst' ? 'tax invoice' : 'invoice'}</button>
        <a class="btn btn-outline-secondary" href="${job ? '#/jobs/' + job.id : '#/invoices'}">Cancel</a>
      </div>
    </div></form>`;
    const paint = () => {
      const sub = editor.total();
      const box = el.querySelector('[data-tax]');
      if (taxMode !== 'gst') {
        box.innerHTML = `<div>Amount <strong>${U.inr(sub)}</strong></div><div class="small text-muted">No tax on this series.</div>`;
        return;
      }
      const t = Books.tax(sub, el.querySelector('[name=buyer_state]').value);
      box.innerHTML = `<div>Taxable ${U.inr(sub)}</div>
        <div class="small">${t.inter ? `IGST ${t.rate}% ${U.inr(t.igst)}` : `CGST ${U.inr(t.cgst)} + SGST ${U.inr(t.sgst)} (${t.rate}%)`}</div>
        <div class="fw-bold">Total ${U.inr(U.round2(sub + t.tax))}</div>
        ${!Store.settings().state ? '<div class="small text-muted">Set the shop state in Settings so inter-state bills use IGST.</div>' : ''}`;
    };
    const editor = Lines.mount(el.querySelector('[data-lines]'), { items: seed, onChange: paint });
    const fill = p => {
      const f = el.querySelector('form');
      if (!f.buyer_name.value) f.buyer_name.value = p.name || '';
      f.buyer_name.value = p.name || '';
      f.buyer_phone.value = p.phone || '';
      f.buyer_gstin.value = p.gstin || '';
      f.buyer_address.value = (job && job.site_address) || p.address || '';
      f.buyer_state.value = p.state || '';
      paint();
    };
    Books.mountParty(el.querySelector('[data-party-name]'), el.querySelector('[name=party_id]'), partyId, fill);
    el.querySelector('[name=buyer_state]').addEventListener('change', paint);
    el.querySelector('[name=date]').addEventListener('change', () => {
      el.querySelector('[data-fy]').textContent = U.fy(el.querySelector('[name=date]').value);
    });
    paint();
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const err = editor.validate();
      if (!f.party_id.value) return UI.toast('Choose a party', 'warning');
      if (!f.buyer_name.value.trim()) return UI.toast('Name on the bill is required', 'warning');
      if (f.buyer_gstin.value.trim() && !U.isGstin(f.buyer_gstin.value.trim())) return UI.toast('GSTIN does not look right', 'warning');
      if (err) return UI.toast(err, 'warning');
      const list = editor.getItems();
      const subtotal = Books.sumItems(list);
      if (!(subtotal > 0)) return UI.toast('Total must be more than 0', 'warning');
      const t = taxMode === 'gst' ? Books.tax(subtotal, f.buyer_state.value) : { rate: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
      const invoiceId = U.uuid();
      await Store.saveMany([
        ['Invoices', {
          id: invoiceId,
          tax_mode: taxMode,
          job_id: job ? job.id : '',
          party_id: f.party_id.value,
          buyer_name: f.buyer_name.value.trim(),
          buyer_phone: f.buyer_phone.value.trim(),
          buyer_gstin: f.buyer_gstin.value.trim().toUpperCase(),
          buyer_address: f.buyer_address.value.trim(),
          buyer_state: f.buyer_state.value,
          date: f.date.value,
          subtotal,
          gst_rate: t.rate,
          cgst: t.cgst, sgst: t.sgst, igst: t.igst,
          tax_amount: t.tax,
          total: U.round2(subtotal + t.tax),
          status: 'Issued',
          void_reason: '',
          notes: f.notes.value.trim()
        }],
        ...Books.childOps('InvoiceItems', 'invoice_id', invoiceId, list, [])
      ]);
      UI.toast(taxMode === 'gst' ? 'Tax invoice issued' : 'Invoice issued');
      location.hash = '#/invoices/' + invoiceId;
    });
  }
};
