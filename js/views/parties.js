/** Parties: customers and suppliers in one list. */
Views.parties = {
  title: 'Parties',
  refreshOn: ['Parties', 'Invoices', 'Receipts', 'Purchases', 'PaymentsOut'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new' || b === 'edit') return this.form(el, b === 'edit' ? a : null);
    if (a) return this.detail(el, a);
    this.list(el);
  },
  update(el, params) {
    if (!params.length) this.list(el, true);
    else if (params[1] !== 'edit' && params[0] !== 'new') this.detail(el, params[0], true);
  },
  list(el, keep) {
    const q = keep ? (el.querySelector('[data-q]') || {}).value || '' : '';
    const n = q.trim().toLowerCase();
    const rows = Store.list('Parties')
      .filter(p => !n || String(p.name).toLowerCase().includes(n) || String(p.phone || '').includes(n) || String(p.gstin || '').toLowerCase().includes(n))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const body = rows.map(p => {
      const st = Books.partyStatement(p.id);
      return `<tr>
        <td><a href="#/parties/${p.id}" class="fw-semibold">${U.esc(p.name)}</a><div class="small text-muted">${U.esc(p.phone || '')}</div></td>
        <td class="d-none d-md-table-cell">${U.esc(p.gstin || '')}</td>
        <td class="text-end">${st.balance > 0 ? U.inr(st.balance) : ''}</td>
        <td class="text-end">${st.balance < 0 ? U.inr(-st.balance) : ''}</td>
      </tr>`;
    }).join('');
    const table = `<div class="table-responsive"><table class="table">
      <thead><tr><th>Party</th><th class="d-none d-md-table-cell">GSTIN</th><th class="text-end">Receivable</th><th class="text-end">Payable</th></tr></thead>
      <tbody>${body || `<tr><td colspan="4" class="text-muted py-4 text-center">${n ? 'No party matches.' : 'No parties yet. Add the first shop or supplier.'}</td></tr>`}</tbody>
    </table></div>`;
    if (keep && el.querySelector('[data-body]')) {
      el.querySelector('[data-body]').innerHTML = table;
      return;
    }
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex gap-2 mb-3">
        <input class="form-control" data-q placeholder="Search name, phone, GSTIN" value="${U.esc(q)}">
        <a class="btn btn-primary" href="#/parties/new">Add</a>
      </div>
      <div data-body>${table}</div>
    </div></div>`;
    el.querySelector('[data-q]').addEventListener('input', () => this.list(el, true));
  },
  detail(el, id) {
    const p = Store.get('Parties', id);
    if (!p || p.is_deleted) { el.innerHTML = `<div class="alert alert-warning">Party not found.</div>`; return; }
    document.getElementById('page-title').textContent = p.name;
    const st = Books.partyStatement(id);
    const lines = st.rows.map(r => `<tr>
      <td>${U.fmtDate(r.date)}</td>
      <td>${r.href ? `<a href="${r.href}">${U.esc(r.label)}</a>` : U.esc(r.label)}</td>
      <td class="text-end">${r.debit ? U.inr(r.debit) : ''}</td>
      <td class="text-end">${r.credit ? U.inr(r.credit) : ''}</td>
      <td class="text-end fw-semibold">${U.inr(r.balance)}</td>
    </tr>`).join('');
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">
        <a class="btn btn-primary" href="#/estimates/new/${id}">Estimate</a>
        <a class="btn btn-outline-primary" href="#/orders/new/${id}">Order</a>
        <a class="btn btn-outline-primary" href="#/invoices/new/gst/party/${id}">Tax invoice</a>
        <a class="btn btn-outline-secondary" href="#/parties/${id}/edit">Edit</a>
        <button type="button" class="btn btn-outline-primary" data-print>Print statement</button>
      </div>
      <div class="row g-3">
        <div class="col-lg-4"><div class="card"><div class="card-body">
          <div class="text-muted small">Balance</div>
          <div class="h4 mb-2">${U.inr(st.balance)}</div>
          <div class="small">${U.esc(p.phone || '')}</div>
          <div class="small">${U.esc(p.gstin || 'No GSTIN')}</div>
          <div class="small">${U.esc(p.state || '')}</div>
          <div class="small mt-2">${U.esc(p.address || '')}</div>
          ${p.notes ? `<div class="small text-muted mt-2">${U.esc(p.notes)}</div>` : ''}
        </div></div></div>
        <div class="col-lg-8"><div class="card"><div class="card-body">
          <h6>Statement</h6>
          <div class="table-responsive table-fit"><table class="table">
            <thead><tr><th>Date</th><th>Particular</th><th class="text-end">Debit</th><th class="text-end">Credit</th><th class="text-end">Balance</th></tr></thead>
            <tbody>${lines || '<tr><td colspan="5" class="text-muted">No bills yet.</td></tr>'}</tbody>
          </table></div>
        </div></div></div>
      </div>`;
    el.querySelector('[data-print]').addEventListener('click', () => Docs.statement(p));
  },
  form(el, id) {
    const p = id ? Store.get('Parties', id) : {};
    if (id && !p) { el.innerHTML = `<div class="alert alert-warning">Party not found.</div>`; return; }
    document.getElementById('page-title').textContent = id ? 'Edit party' : 'New party';
    el.innerHTML = `<form class="card"><div class="card-body">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Name</label><input class="form-control" name="name" required value="${U.esc(p.name || '')}"></div>
        <div class="col-md-6"><label class="form-label">Phone</label><input class="form-control" name="phone" inputmode="numeric" maxlength="10" value="${U.esc(p.phone || '')}"></div>
        <div class="col-md-6"><label class="form-label">GSTIN</label><input class="form-control" name="gstin" value="${U.esc(p.gstin || '')}"></div>
        <div class="col-md-6"><label class="form-label">State</label><select class="form-select" name="state">${Books.stateOptions(p.state)}</select></div>
        <div class="col-12"><label class="form-label">Billing address</label><textarea class="form-control" name="address" rows="2">${U.esc(p.address || '')}</textarea></div>
        <div class="col-md-6"><label class="form-label">Opening receivable (₹)</label><input class="form-control" name="opening_receivable" inputmode="decimal" value="${U.esc(p.opening_receivable || '')}"></div>
        <div class="col-md-6"><label class="form-label">Opening payable (₹)</label><input class="form-control" name="opening_payable" inputmode="decimal" value="${U.esc(p.opening_payable || '')}"></div>
        <div class="col-12"><label class="form-label">Notes</label><textarea class="form-control" name="notes" rows="2">${U.esc(p.notes || '')}</textarea></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit">Save</button>
        <a class="btn btn-outline-secondary" href="${id ? '#/parties/' + id : '#/parties'}">Cancel</a>
      </div>
      <p class="small text-muted mt-3 mb-0">Opening figures are what stood in the old books on the day you start here. Bills you create in Flamingo are added on top.</p>
    </div></form>`;
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const phone = f.phone.value.trim();
      const gstin = f.gstin.value.trim().toUpperCase();
      if (!f.name.value.trim()) return UI.toast('Name is required', 'warning');
      if (phone && !U.isPhone(phone)) return UI.toast('Phone must be 10 digits', 'warning');
      if (gstin && !U.isGstin(gstin)) return UI.toast('GSTIN does not look right', 'warning');
      const row = await Store.save('Parties', {
        id: id || undefined,
        name: f.name.value.trim(),
        phone, gstin, state: f.state.value, address: f.address.value.trim(),
        opening_receivable: U.round2(f.opening_receivable.value),
        opening_payable: U.round2(f.opening_payable.value),
        notes: f.notes.value.trim()
      });
      UI.toast('Party saved');
      location.hash = '#/parties/' + row.id;
    });
  }
};
