/** Estimates. Accepting one can create a job. A job can also exist without one. */
Views.estimates = {
  title: 'Estimates',
  refreshOn: ['Estimates', 'EstimateItems', 'Jobs'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new') return this.form(el, null, b || '');
    if (b === 'edit') return this.form(el, a);
    if (a) return this.detail(el, a);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Estimates').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex justify-content-between mb-3"><span class="text-muted">${rows.length} estimates</span>
        <a class="btn btn-primary" href="#/estimates/new">New estimate</a></div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>No.</th><th>Party</th><th>Date</th><th>Status</th><th class="text-end">Total</th></tr></thead>
        <tbody>${rows.map(e => `<tr>
          <td><a href="#/estimates/${e.id}">${U.esc(e.estimate_no || 'Pending')}</a></td>
          <td>${U.esc(Books.partyName(e.party_id))}</td>
          <td>${U.fmtDate(e.date)}</td>
          <td>${Books.badge(e.status)}</td>
          <td class="text-end">${U.inr(e.total)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-muted py-4 text-center">No estimates yet.</td></tr>'}
        </tbody></table></div>
    </div></div>`;
  },
  detail(el, id) {
    const doc = Store.get('Estimates', id);
    if (!doc || doc.is_deleted) { el.innerHTML = `<div class="alert alert-warning">Estimate not found.</div>`; return; }
    document.getElementById('page-title').textContent = doc.estimate_no || 'Estimate';
    const list = Books.items('EstimateItems', 'estimate_id', id);
    const job = doc.job_id ? Store.get('Jobs', doc.job_id) : null;
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">
        ${job ? `<a class="btn btn-primary" href="#/jobs/${job.id}">Open ${U.esc(job.job_no || 'job')}</a>` : `<a class="btn btn-primary" href="#/jobs/from/${id}">Create job</a>`}
        <button type="button" class="btn btn-outline-primary" data-print>Print</button>
        <a class="btn btn-outline-secondary" href="#/estimates/${id}/edit">Edit</a>
      </div>
      <div class="card"><div class="card-body">
        <div class="d-flex justify-content-between"><div>
          <div class="fw-semibold">${U.esc(Books.partyName(doc.party_id))}</div>
          <div class="small text-muted">${U.fmtDate(doc.date)}</div>
        </div>${Books.badge(doc.status)}</div>
        ${this.linesHtml(list)}
        <div class="text-end fw-bold mt-2">${U.inr(doc.total)}</div>
        ${doc.notes ? `<div class="small mt-3">${U.esc(doc.notes)}</div>` : ''}
      </div></div>`;
    el.querySelector('[data-print]').addEventListener('click', () => Docs.estimate(doc));
  },
  linesHtml(list) {
    return `<div class="table-responsive mt-3"><table class="table">
      <thead><tr><th>Name</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Amount</th></tr></thead>
      <tbody>${list.map(it => `<tr>
        <td>${U.esc(it.item_name)}</td>
        <td class="text-end">${Books.billQty(it)}</td><td class="text-end">${U.inr(it.rate)}</td><td class="text-end">${U.inr(it.amount)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  },
  form(el, id, partyId) {
    const doc = id ? Store.get('Estimates', id) : null;
    if (id && !doc) { el.innerHTML = `<div class="alert alert-warning">Estimate not found.</div>`; return; }
    document.getElementById('page-title').textContent = id ? 'Edit estimate' : 'New estimate';
    const existing = id ? Books.items('EstimateItems', 'estimate_id', id) : [];
    el.innerHTML = `<form class="card"><div class="card-body">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Party</label>
          <input class="form-control" data-party-name placeholder="Type a name" autocomplete="off">
          <input type="hidden" name="party_id"></div>
        <div class="col-md-3"><label class="form-label">Date</label>
          <input class="form-control" type="date" name="date" required value="${U.esc((doc && doc.date) || U.today())}"></div>
        <div class="col-md-3"><label class="form-label">Status</label>
          <select class="form-select" name="status">${Books.EST_STATUSES.filter(s => s !== 'Accepted' || (doc && doc.status === 'Accepted')).map(s => `<option${(doc && doc.status) === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="col-12"><div data-lines></div>
          <div class="text-end fw-bold mt-2" data-total></div></div>
        <div class="col-md-6"><label class="form-label">Notes</label><textarea class="form-control" name="notes" rows="3">${U.esc((doc && doc.notes) || 'GST extra as applicable.')}</textarea></div>
        <div class="col-md-6"><label class="form-label">Terms</label><textarea class="form-control" name="terms_text" rows="3">${U.esc((doc && doc.terms_text) || '')}</textarea></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit">Save estimate</button>
        <a class="btn btn-outline-secondary" href="${id ? '#/estimates/' + id : '#/estimates'}">Cancel</a>
      </div>
    </div></form>`;
    const editor = Lines.mount(el.querySelector('[data-lines]'), {
      items: existing,
      onChange: total => { el.querySelector('[data-total]').textContent = U.inr(total); }
    });
    Books.mountParty(el.querySelector('[data-party-name]'), el.querySelector('[name=party_id]'), (doc && doc.party_id) || partyId);
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const err = editor.validate();
      if (!f.party_id.value) return UI.toast('Choose a party', 'warning');
      if (err) return UI.toast(err, 'warning');
      const list = editor.getItems();
      const total = Books.sumItems(list);
      const estimateId = id || U.uuid();
      const ops = [
        ['Estimates', {
          id: estimateId,
          party_id: f.party_id.value,
          date: f.date.value,
          status: doc && doc.status === 'Accepted' ? 'Accepted' : f.status.value,
          job_id: (doc && doc.job_id) || '',
          notes: f.notes.value.trim(),
          terms_text: f.terms_text.value.trim(),
          subtotal: total,
          total
        }],
        ...Books.childOps('EstimateItems', 'estimate_id', estimateId, list, existing)
      ];
      await Store.saveMany(ops);
      UI.toast('Estimate saved');
      location.hash = '#/estimates/' + estimateId;
    });
  }
};
