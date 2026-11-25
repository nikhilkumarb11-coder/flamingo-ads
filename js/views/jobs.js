/** Orders. Linked to an estimate when created from one, otherwise independent. */
Views.orders = {
  title: 'Orders',
  refreshOn: ['Jobs', 'JobItems', 'Invoices', 'Receipts', 'Estimates', 'Issues', 'Materials'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new') return this.form(el, null, { partyId: b || '' });
    if (a === 'from') return this.form(el, null, { estimateId: b || '' });
    if (b === 'edit') return this.form(el, a, {});
    if (a) return this.detail(el, a);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Jobs').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex justify-content-between mb-3"><span class="text-muted">${rows.length} orders</span>
        <a class="btn btn-primary" href="#/orders/new">New order</a></div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>No.</th><th>Party</th><th>Status</th><th>Due</th><th class="text-end">Total</th></tr></thead>
        <tbody>${rows.map(j => `<tr>
          <td><a href="#/orders/${j.id}">${U.esc(j.job_no || 'Pending')}</a>
            <div class="small text-muted">${j.estimate_id ? 'From estimate' : 'Independent'}</div></td>
          <td>${U.esc(Books.partyName(j.party_id))}</td>
          <td>${Books.badge(j.status)}</td>
          <td>${U.fmtDate(j.due_date)}</td>
          <td class="text-end">${U.inr(j.total)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-muted py-4 text-center">No orders yet.</td></tr>'}
        </tbody></table></div>
    </div></div>`;
  },
  detail(el, id) {
    const doc = Store.get('Jobs', id);
    if (!doc || doc.is_deleted) { el.innerHTML = `<div class="alert alert-warning">Order not found.</div>`; return; }
    document.getElementById('page-title').textContent = doc.job_no || 'Order';
    const list = Books.items('JobItems', 'job_id', id);
    const inv = Books.activeInvoiceForJob(id);
    const est = doc.estimate_id ? Store.get('Estimates', doc.estimate_id) : null;
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">
        ${inv
          ? `<a class="btn btn-outline-primary" href="#/invoices/${inv.id}">${U.esc(inv.invoice_no || 'Invoice')}</a>`
          : `<a class="btn btn-outline-primary" href="#/invoices/new/gst/${id}">Tax invoice</a>
             <a class="btn btn-outline-secondary" href="#/invoices/new/none/${id}">Invoice without GST</a>`}
        <button type="button" class="btn btn-outline-primary" data-print>Order sheet</button>
        <a class="btn btn-outline-secondary" href="#/orders/${id}/edit">Edit</a>
      </div>
      <div class="card mb-3"><div class="card-body d-flex flex-wrap gap-2">
        ${Books.JOB_STATUSES.map(s => `<button type="button" class="btn btn-sm ${s === doc.status ? 'btn-primary' : 'btn-outline-secondary'}" data-status="${s}">${s}</button>`).join('')}
      </div></div>
      <div class="card"><div class="card-body">
        <div class="fw-semibold">${U.esc(Books.partyName(doc.party_id))}</div>
        <div class="small text-muted">${U.fmtDate(doc.date)}${doc.due_date ? ' · due ' + U.fmtDate(doc.due_date) : ''}</div>
        ${doc.site_address ? `<div class="small mt-1">${U.esc(doc.site_address)}</div>` : ''}
        <div class="small mt-1">${est ? `<a href="#/estimates/${est.id}">Estimate ${U.esc(est.estimate_no || '')}</a>` : 'No estimate. This order stands on its own.'}</div>
        ${Views.estimates.linesHtml(list)}
        <div class="text-end fw-bold">${U.inr(doc.total)}</div>
      </div></div>
      <div data-settle></div>
      <div class="card mt-3"><div class="card-body">
        <div class="d-flex justify-content-between"><h6 class="mb-2">Material issued</h6><a href="#/issues/new/${id}">Issue material</a></div>
        ${Store.list('Issues').filter(it => it.job_id === id).map(it => {
          const m = Store.get('Materials', it.material_id);
          return `<div class="d-flex justify-content-between align-items-center py-1">
            <span>${U.fmtDate(it.date)} · ${U.esc(m ? m.name : 'Material')} · ${it.qty} ${U.esc((m && m.unit) || '')}</span>
            <button type="button" class="btn btn-sm btn-outline-danger" data-unissue="${it.id}">Remove</button>
          </div>`;
        }).join('') || '<div class="text-muted small">Nothing issued yet. Saving the order does not move stock.</div>'}
      </div></div>`;
    Views.receipts.settleOrder(el.querySelector('[data-settle]'), doc, () => this.detail(el, id));
    el.querySelector('[data-print]').addEventListener('click', async () => {
      const live = await Docs.awaitNumber('Jobs', id, 'job_no');
      if (!live || !live.job_no) return UI.toast('The order number has not come back yet. Wait for Saved, then print again.', 'warning');
      Docs.job(live);
    });
    el.querySelectorAll('[data-unissue]').forEach(btn => btn.addEventListener('click', async () => {
      await Store.remove('Issues', btn.dataset.unissue);
      UI.toast('Issue removed. Stock is back.');
    }));
    el.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', async () => {
      if (btn.dataset.status === doc.status) return;
      await Store.save('Jobs', { id, status: btn.dataset.status });
      UI.toast('Status updated');
    }));
  },
  form(el, id, { partyId = '', estimateId = '' } = {}) {
    const doc = id ? Store.get('Jobs', id) : null;
    if (id && !doc) { el.innerHTML = `<div class="alert alert-warning">Order not found.</div>`; return; }
    const est = estimateId ? Store.get('Estimates', estimateId) : (doc && doc.estimate_id ? Store.get('Estimates', doc.estimate_id) : null);
    if (estimateId && (!est || est.is_deleted)) { el.innerHTML = `<div class="alert alert-warning">Estimate not found.</div>`; return; }
    if (estimateId && est.job_id) { location.hash = '#/orders/' + est.job_id; return; }
    document.getElementById('page-title').textContent = id ? 'Edit order' : (est ? 'Order from estimate' : 'New order');
    const existing = id
      ? Books.items('JobItems', 'job_id', id)
      : (est ? Books.items('EstimateItems', 'estimate_id', est.id).map(it => ({ ...it, id: undefined })) : []);
    el.innerHTML = `<form class="card"><div class="card-body">
      ${est && !id ? `<div class="alert alert-info">Lines are copied from ${U.esc(est.estimate_no || 'the estimate')}. The estimate itself stays as the quote.</div>` : ''}
      ${doc && doc.estimate_id ? `<div class="small mb-2">Linked estimate stays linked.</div>` : ''}
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Party</label>
          <input class="form-control" data-party-name placeholder="Type a name" autocomplete="off" ${est ? 'readonly' : ''}>
          <input type="hidden" name="party_id"></div>
        <div class="col-md-3"><label class="form-label">Date</label>
          <input class="form-control" type="date" name="date" required value="${U.esc((doc && doc.date) || U.today())}"></div>
        <div class="col-md-3"><label class="form-label">Due</label>
          <input class="form-control" type="date" name="due_date" value="${U.esc((doc && doc.due_date) || '')}"></div>
        <div class="col-md-6"><label class="form-label">Site address</label>
          <input class="form-control" name="site_address" value="${U.esc((doc && doc.site_address) || '')}"></div>
        <div class="col-md-6"><label class="form-label">Status</label>
          <select class="form-select" name="status">${Books.JOB_STATUSES.map(s => `<option${((doc && doc.status) || 'Confirmed') === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="col-12"><div data-lines></div><div class="text-end fw-bold mt-2" data-total></div></div>
        <div class="col-12"><label class="form-label">Notes</label><textarea class="form-control" name="notes" rows="2">${U.esc((doc && doc.notes) || (est && est.notes) || '')}</textarea></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit">${est && !id ? 'Create order' : 'Save order'}</button>
        <a class="btn btn-outline-secondary" href="${id ? '#/orders/' + id : '#/orders'}">Cancel</a>
      </div>
    </div></form>`;
    const editor = Lines.mount(el.querySelector('[data-lines]'), {
      items: existing,
      onChange: total => { el.querySelector('[data-total]').textContent = U.inr(total); }
    });
    Books.mountParty(
      el.querySelector('[data-party-name]'),
      el.querySelector('[name=party_id]'),
      (doc && doc.party_id) || (est && est.party_id) || partyId
    );
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const err = editor.validate();
      const party = Books.takeParty(el.querySelector('[data-party-name]'), f.party_id);
      if (!party) return UI.toast('Type a party name', 'warning');
      if (err) return UI.toast(err, 'warning');
      const list = editor.getItems();
      const total = Books.sumItems(list);
      const jobId = id || U.uuid();
      const linkEstimate = !id && est ? est.id : ((doc && doc.estimate_id) || '');
      const ops = [
        ...(party.op ? [party.op] : []),
        ['Jobs', {
          id: jobId,
          party_id: party.id,
          estimate_id: linkEstimate,
          date: f.date.value,
          due_date: f.due_date.value,
          status: f.status.value,
          site_address: f.site_address.value.trim(),
          notes: f.notes.value.trim(),
          subtotal: total,
          total
        }],
        ...Books.childOps('JobItems', 'job_id', jobId, list, id ? Books.items('JobItems', 'job_id', id) : [])
      ];
      if (!id && est) ops.push(['Estimates', { id: est.id, status: 'Accepted', job_id: jobId }]);
      await Store.saveMany(ops);
      UI.toast(est && !id ? 'Order created from the estimate' : 'Order saved');
      location.hash = '#/orders/' + jobId;
    });
  }
};
Views.jobs = Views.orders;
