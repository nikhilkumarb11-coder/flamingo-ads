/** Services you sell. Stock of raw material comes later. */
Views.services = {
  title: 'Services',
  refreshOn: ['Services'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new' || b === 'edit') return this.form(el, b === 'edit' ? a : null);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Services').sort((a, b) => String(a.name).localeCompare(String(b.name)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <p class="mb-0 text-muted">These names show up while you type a line. Rate is only a default.</p>
        <a class="btn btn-primary" href="#/services/new">Add</a>
      </div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>Service</th><th>Unit</th><th class="text-end">Default rate</th><th>HSN</th></tr></thead>
        <tbody>${rows.map(s => `<tr>
          <td><a href="#/services/${s.id}/edit">${U.esc(s.name)}</a></td>
          <td>${U.esc(s.unit || '')}</td>
          <td class="text-end">${U.inr(s.rate || 0)}</td>
          <td>${U.esc(s.hsn || '')}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="text-muted">No services yet.</td></tr>'}
        </tbody>
      </table></div>
    </div></div>`;
  },
  form(el, id) {
    const s = id ? Store.get('Services', id) : { unit: 'sq.ft', active: true };
    if (id && !s) { el.innerHTML = `<div class="alert alert-warning">Service not found.</div>`; return; }
    document.getElementById('page-title').textContent = id ? 'Edit service' : 'New service';
    el.innerHTML = `<form class="card"><div class="card-body">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Name</label><input class="form-control" name="name" required value="${U.esc(s.name || '')}"></div>
        <div class="col-md-3"><label class="form-label">Unit</label>
          <select class="form-select" name="unit">${Books.UNITS.map(u => `<option${u === (s.unit || 'sq.ft') ? ' selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="col-md-3"><label class="form-label">Default rate (₹)</label><input class="form-control" name="rate" inputmode="decimal" value="${U.esc(s.rate || '')}"></div>
        <div class="col-md-6"><label class="form-label">HSN</label><input class="form-control" name="hsn" value="${U.esc(s.hsn || '')}"></div>
        <div class="col-md-6 d-flex align-items-end"><div class="form-check">
          <input class="form-check-input" type="checkbox" name="active" id="svc-active" ${s.active === false || s.active === 'FALSE' ? '' : 'checked'}>
          <label class="form-check-label" for="svc-active">Show in suggestions</label>
        </div></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-outline-secondary" href="#/services">Cancel</a>
      </div>
    </div></form>`;
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (!f.name.value.trim()) return UI.toast('Name is required', 'warning');
      await Store.save('Services', {
        id: id || undefined,
        name: f.name.value.trim(),
        unit: f.unit.value,
        rate: U.round2(f.rate.value),
        hsn: f.hsn.value.trim(),
        active: f.active.checked
      });
      UI.toast('Service saved');
      location.hash = '#/services';
    });
  }
};
