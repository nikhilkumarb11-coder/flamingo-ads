/** Raw material. Stock moves only through purchases and issues, not through estimates. */
Views.materials = {
  title: 'Materials',
  refreshOn: ['Materials', 'Purchases', 'PurchaseItems', 'Issues'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new' || b === 'edit') return this.form(el, b === 'edit' ? a : null);
    if (a) return this.detail(el, a);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Materials').sort((a, b) => String(a.name).localeCompare(String(b.name)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <p class="mb-0 text-muted">Sheets, vinyl and ink. A job does not reduce stock until you issue the material.</p>
        <a class="btn btn-primary" href="#/materials/new">Add</a>
      </div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>Material</th><th>Unit</th><th class="text-end">On hand</th><th class="text-end">Reorder</th><th class="text-end">Buy rate</th></tr></thead>
        <tbody>${rows.map(m => {
          const qty = Books.onHand(m.id);
          const low = qty <= (Number(m.reorder_level) || 0);
          return `<tr>
            <td><a href="#/materials/${m.id}">${U.esc(m.name)}</a>${low ? ' <span class="badge bg-danger">Low</span>' : ''}</td>
            <td>${U.esc(m.unit || '')}</td>
            <td class="text-end">${qty}</td>
            <td class="text-end">${m.reorder_level || 0}</td>
            <td class="text-end">${U.inr(m.purchase_rate || 0)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" class="text-muted">No materials yet.</td></tr>'}
        </tbody></table></div>
    </div></div>`;
  },
  detail(el, id) {
    const m = Store.get('Materials', id);
    if (!m) { el.innerHTML = `<div class="alert alert-warning">Material not found.</div>`; return; }
    document.getElementById('page-title').textContent = m.name;
    const ins = Store.list('PurchaseItems').filter(it => it.material_id === id).map(it => {
      const p = Store.get('Purchases', it.purchase_id);
      return p && p.status !== 'Void' ? { date: p.date, label: `Purchase ${p.purchase_no || ''}`, qty: Number(it.qty) || 0, href: `#/purchases/${p.id}` } : null;
    }).filter(Boolean);
    const outs = Store.list('Issues').filter(it => it.material_id === id).map(it => ({
      date: it.date, label: `Issued${it.job_id ? ' · ' + ((Store.get('Jobs', it.job_id) || {}).job_no || 'job') : ''}`, qty: -(Number(it.qty) || 0), href: it.job_id ? `#/jobs/${it.job_id}` : ''
    }));
    const moves = ins.concat(outs).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `<div class="d-flex gap-2 mb-3">
        <a class="btn btn-outline-primary" href="#/materials/${id}/edit">Edit</a>
        <a class="btn btn-primary" href="#/purchases/new">Purchase</a>
      </div>
      <div class="row g-3">
        <div class="col-md-4"><div class="card"><div class="card-body">
          <div class="text-muted small">On hand</div>
          <div class="h3">${Books.onHand(id)} <span class="fs-6">${U.esc(m.unit || '')}</span></div>
          <div class="small text-muted">Opening ${m.opening_qty || 0} · reorder at ${m.reorder_level || 0}</div>
        </div></div></div>
        <div class="col-md-8"><div class="card"><div class="card-body">
          <h6>Movements</h6>
          ${moves.map(mv => `<div class="d-flex justify-content-between py-1"><span>${mv.href ? `<a href="${mv.href}">${U.esc(mv.label)}</a>` : U.esc(mv.label)} <span class="text-muted small">${U.fmtDate(mv.date)}</span></span><span>${mv.qty > 0 ? '+' : ''}${mv.qty}</span></div>`).join('') || '<div class="text-muted small">No purchases or issues yet.</div>'}
        </div></div></div>
      </div>`;
  },
  form(el, id) {
    const m = id ? Store.get('Materials', id) : { unit: 'sheet', active: true };
    if (id && !m) { el.innerHTML = `<div class="alert alert-warning">Material not found.</div>`; return; }
    document.getElementById('page-title').textContent = id ? 'Edit material' : 'New material';
    el.innerHTML = `<form class="card"><div class="card-body"><div class="row g-3">
      <div class="col-md-6"><label class="form-label">Name</label><input class="form-control" name="name" required value="${U.esc(m.name || '')}"></div>
      <div class="col-md-3"><label class="form-label">Unit</label>
        <select class="form-select" name="unit">${Books.MATERIAL_UNITS.map(u => `<option${u === (m.unit || 'sheet') ? ' selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="col-md-3"><label class="form-label">Opening qty</label><input class="form-control" name="opening_qty" inputmode="decimal" value="${U.esc(m.opening_qty || 0)}"></div>
      <div class="col-md-4"><label class="form-label">Reorder at</label><input class="form-control" name="reorder_level" inputmode="decimal" value="${U.esc(m.reorder_level || 0)}"></div>
      <div class="col-md-4"><label class="form-label">Buy rate (₹)</label><input class="form-control" name="purchase_rate" inputmode="decimal" value="${U.esc(m.purchase_rate || '')}"></div>
      <div class="col-md-4 d-flex align-items-end"><div class="form-check">
        <input class="form-check-input" type="checkbox" name="active" id="mat-active" ${m.active === false || m.active === 'FALSE' ? '' : 'checked'}>
        <label class="form-check-label" for="mat-active">In use</label>
      </div></div>
      <div class="col-12"><label class="form-label">Notes</label><input class="form-control" name="notes" value="${U.esc(m.notes || '')}"></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-primary" type="submit">Save</button>
      <a class="btn btn-outline-secondary" href="${id ? '#/materials/' + id : '#/materials'}">Cancel</a>
    </div></div></form>`;
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (!f.name.value.trim()) return UI.toast('Name is required', 'warning');
      const row = await Store.save('Materials', {
        id: id || undefined,
        name: f.name.value.trim(),
        unit: f.unit.value,
        opening_qty: U.round2(f.opening_qty.value),
        reorder_level: U.round2(f.reorder_level.value),
        purchase_rate: U.round2(f.purchase_rate.value),
        active: f.active.checked,
        notes: f.notes.value.trim()
      });
      UI.toast('Material saved');
      location.hash = '#/materials/' + row.id;
    });
  }
};

Views.issues = {
  title: 'Issue material',
  refreshOn: ['Materials', 'Issues', 'Jobs'],
  render(el, params) {
    const jobId = params[0] === 'new' ? (params[1] || '') : '';
    const job = jobId ? Store.get('Jobs', jobId) : null;
    const mats = Store.list('Materials').filter(m => m.active !== false && m.active !== 'FALSE');
    document.getElementById('page-title').textContent = 'Issue material';
    el.innerHTML = `<form class="card"><div class="card-body">
      <p class="text-muted">This is the only way a job uses stock. Saving the job itself does not.</p>
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Job</label>
          <select class="form-select" name="job_id"><option value="">No job</option>
            ${Store.list('Jobs').filter(j => j.status !== 'Cancelled').map(j => `<option value="${j.id}"${j.id === jobId ? ' selected' : ''}>${U.esc(j.job_no || 'Job')} · ${U.esc(Books.partyName(j.party_id))}</option>`).join('')}
          </select></div>
        <div class="col-md-6"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${U.today()}"></div>
        <div class="col-md-6"><label class="form-label">Material</label>
          <select class="form-select" name="material_id">${mats.map(m => `<option value="${m.id}">${U.esc(m.name)} · ${Books.onHand(m.id)} ${U.esc(m.unit || '')}</option>`).join('')}</select></div>
        <div class="col-md-3"><label class="form-label">Qty</label><input class="form-control" name="qty" inputmode="decimal" value="1"></div>
        <div class="col-12"><label class="form-label">Note</label><input class="form-control" name="note"></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit" ${mats.length ? '' : 'disabled'}>Issue</button>
        <a class="btn btn-outline-secondary" href="${job ? '#/jobs/' + job.id : '#/materials'}">Cancel</a>
      </div>
    </div></form>`;
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const qty = U.round2(f.qty.value);
      const have = Books.onHand(f.material_id.value);
      if (!(qty > 0)) return UI.toast('Quantity must be more than 0', 'warning');
      if (qty > have + 0.001) return UI.toast('Only ' + have + ' on hand', 'warning');
      await Store.save('Issues', {
        job_id: f.job_id.value,
        material_id: f.material_id.value,
        date: f.date.value,
        qty,
        note: f.note.value.trim()
      });
      UI.toast('Material issued');
      location.hash = f.job_id.value ? '#/jobs/' + f.job_id.value : '#/materials/' + f.material_id.value;
    });
  }
};
