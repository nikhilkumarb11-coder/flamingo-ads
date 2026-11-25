/** Purchases bring stock in and increase what you owe the supplier. */
Views.purchases = {
  title: 'Purchases',
  refreshOn: ['Purchases', 'PurchaseItems', 'PaymentsOut', 'Materials', 'Parties'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new') return this.form(el);
    if (a === 'pay') return this.pay(el, b);
    if (a) return this.detail(el, a);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Purchases').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex justify-content-between mb-3"><span class="text-muted">${rows.length} purchases</span>
        <a class="btn btn-primary" href="#/purchases/new">New purchase</a></div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>No.</th><th>Supplier</th><th>Date</th><th class="text-end">Total</th><th class="text-end">Due</th></tr></thead>
        <tbody>${rows.map(p => `<tr>
          <td><a href="#/purchases/${p.id}">${U.esc(p.purchase_no || 'Pending')}</a>${p.status === 'Void' ? ' ' + Books.badge('Void') : ''}</td>
          <td>${U.esc(Books.partyName(p.party_id))}</td>
          <td>${U.fmtDate(p.date)}</td>
          <td class="text-end">${U.inr(p.total)}</td>
          <td class="text-end">${p.status === 'Void' ? '' : U.inr(Books.purchaseDue(p))}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-muted py-4 text-center">No purchases yet.</td></tr>'}
        </tbody></table></div>
    </div></div>`;
  },
  detail(el, id) {
    const doc = Store.get('Purchases', id);
    if (!doc) { el.innerHTML = `<div class="alert alert-warning">Purchase not found.</div>`; return; }
    document.getElementById('page-title').textContent = doc.purchase_no || 'Purchase';
    const lines = Books.items('PurchaseItems', 'purchase_id', id);
    const pays = Store.list('PaymentsOut').filter(r => r.purchase_id === id);
    const due = Books.purchaseDue(doc);
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">
        ${doc.status !== 'Void' && due > 0 ? `<a class="btn btn-primary" href="#/purchases/pay/${id}">Pay</a>` : ''}
        ${doc.status !== 'Void' ? `<button type="button" class="btn btn-outline-danger" data-void>Void</button>` : ''}
      </div>
      <div class="card"><div class="card-body">
        <div class="fw-semibold">${U.esc(Books.partyName(doc.party_id))}</div>
        <div class="small text-muted">${U.fmtDate(doc.date)}</div>
        ${doc.status === 'Void' ? `<div class="alert alert-danger mt-3">${U.esc(doc.void_reason || 'Void')}</div>` : ''}
        <table class="table mt-3"><thead><tr><th>Material</th><th class="text-end">Qty</th><th class="text-end">Rate</th><th class="text-end">Amount</th></tr></thead>
        <tbody>${lines.map(it => `<tr><td>${U.esc(it.item_name)}</td><td class="text-end">${it.qty} ${U.esc(it.unit || '')}</td><td class="text-end">${U.inr(it.rate)}</td><td class="text-end">${U.inr(it.amount)}</td></tr>`).join('')}</tbody></table>
        <div class="text-end fw-bold">${U.inr(doc.total)}</div>
        <div class="text-end small text-muted">Due ${U.inr(due)}</div>
        ${pays.length ? `<h6 class="mt-3">Payments</h6>` + pays.map(r => `<div class="d-flex justify-content-between align-items-center py-1">
          <span>${U.esc(r.payment_no || 'Payment')} · ${U.fmtDate(r.date)} · ${U.esc(r.account || '')}</span>
          <span>${U.inr(r.amount)} ${r.status === 'Void' ? Books.badge('Void') : `<button type="button" class="btn btn-sm btn-outline-danger ms-2" data-void-pay="${r.id}">Void</button>`}</span>
        </div>`).join('') : ''}
      </div></div>`;
    const btn = el.querySelector('[data-void]');
    if (btn) btn.addEventListener('click', async () => {
      if (Books.paidForPurchase(id) > 0) return UI.toast('Void the payments on this purchase first', 'warning');
      const short = {};
      Books.items('PurchaseItems', 'purchase_id', id).forEach(it => {
        short[it.material_id] = (short[it.material_id] || 0) + (Number(it.qty) || 0);
      });
      const blocked = Object.entries(short).some(([mid, qty]) => Books.onHand(mid) - qty < -0.001);
      if (blocked) return UI.toast('Material from this purchase is already issued to a job', 'warning');
      const reason = await UI.promptText({ title: 'Void purchase', message: 'Stock from this purchase comes back out.', label: 'Reason', confirmText: 'Void purchase', danger: true });
      if (!reason) return;
      await Store.save('Purchases', { id, status: 'Void', void_reason: reason });
      UI.toast('Purchase voided');
    });
    el.querySelectorAll('[data-void-pay]').forEach(payBtn => payBtn.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Void payment', message: 'The purchase balance goes back up, and the cash or bank comes back.', confirmText: 'Void payment' });
      if (!ok) return;
      await Store.save('PaymentsOut', { id: payBtn.dataset.voidPay, status: 'Void' });
      UI.toast('Payment voided');
    }));
  },
  form(el) {
    const mats = Store.list('Materials').filter(m => m.active !== false && m.active !== 'FALSE');
    document.getElementById('page-title').textContent = 'New purchase';
    el.innerHTML = `<form class="card"><div class="card-body">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Supplier</label>
          <input class="form-control" data-party-name placeholder="Type a name" autocomplete="off">
          <input type="hidden" name="party_id"></div>
        <div class="col-md-3"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${U.today()}"></div>
        <div class="col-12"><div data-lines></div><div class="text-end fw-bold mt-2" data-total>₹0</div></div>
        <div class="col-12"><label class="form-label">Notes</label><input class="form-control" name="notes"></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit">Save purchase</button>
        <a class="btn btn-outline-secondary" href="#/purchases">Cancel</a>
      </div>
    </div></form>`;
    const box = el.querySelector('[data-lines]');
    const options = mats.map(m => `<option value="${m.id}" data-rate="${m.purchase_rate || 0}" data-unit="${U.esc(m.unit || '')}">${U.esc(m.name)}</option>`).join('');
    function addRow() {
      const row = U.el(`<div class="row g-2 align-items-end mb-2" data-row>
        <div class="col-md-5"><label class="form-label">Material</label><select class="form-select" data-f="material">${options}</select></div>
        <div class="col-md-2"><label class="form-label">Qty</label><input class="form-control" data-f="qty" inputmode="decimal" value="1"></div>
        <div class="col-md-2"><label class="form-label">Rate</label><input class="form-control" data-f="rate" inputmode="decimal"></div>
        <div class="col-md-2 text-end fw-semibold" data-amt>₹0</div>
        <div class="col-md-1"><button type="button" class="btn btn-sm btn-text-danger" data-x aria-label="Remove"><i class="bx bx-trash"></i></button></div>
      </div>`);
      box.appendChild(row);
      const sel = row.querySelector('[data-f="material"]');
      const rate = row.querySelector('[data-f="rate"]');
      const fill = () => { const opt = sel.selectedOptions[0]; if (opt && !rate.value) rate.value = opt.dataset.rate || ''; paint(); };
      sel.addEventListener('change', () => { rate.value = ''; fill(); });
      row.querySelectorAll('input').forEach(i => i.addEventListener('input', paint));
      row.querySelector('[data-x]').addEventListener('click', () => { row.remove(); if (!box.children.length) addRow(); paint(); });
      fill();
    }
    function paint() {
      let total = 0;
      box.querySelectorAll('[data-row]').forEach(row => {
        const amt = U.round2((Number(row.querySelector('[data-f="qty"]').value) || 0) * (Number(row.querySelector('[data-f="rate"]').value) || 0));
        row.querySelector('[data-amt]').textContent = U.inr(amt);
        total += amt;
      });
      el.querySelector('[data-total]').textContent = U.inr(total);
    }
    addRow();
    Books.mountParty(el.querySelector('[data-party-name]'), el.querySelector('[name=party_id]'));
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const party = Books.takeParty(el.querySelector('[data-party-name]'), f.party_id);
      if (!party) return UI.toast('Type a supplier name', 'warning');
      const lines = [...box.querySelectorAll('[data-row]')].map(row => {
        const sel = row.querySelector('[data-f="material"]');
        const opt = sel.selectedOptions[0];
        const qty = U.round2(row.querySelector('[data-f="qty"]').value);
        const rate = U.round2(row.querySelector('[data-f="rate"]').value);
        return { material_id: sel.value, item_name: opt ? opt.textContent.split('·')[0].trim() : '', qty, unit: opt ? opt.dataset.unit : '', rate, amount: U.round2(qty * rate) };
      }).filter(it => it.material_id && it.qty > 0 && it.rate > 0);
      if (!lines.length) return UI.toast('Add a material with a quantity and a rate', 'warning');
      const total = U.round2(lines.reduce((s, it) => s + it.amount, 0));
      const id = U.uuid();
      await Store.saveMany([
        ...(party.op ? [party.op] : []),
        ['Purchases', { id, party_id: party.id, date: f.date.value, subtotal: total, total, status: 'Issued', void_reason: '', notes: f.notes.value.trim() }],
        ...lines.map((it, i) => ['PurchaseItems', { ...it, purchase_id: id, sort: i }])
      ]);
      UI.toast('Purchase saved. Stock is in.');
      location.hash = '#/purchases/' + id;
    });
  },
  pay(el, purchaseId) {
    const doc = Store.get('Purchases', purchaseId);
    if (!doc || doc.status === 'Void') { el.innerHTML = `<div class="alert alert-warning">Purchase not found.</div>`; return; }
    const due = Books.purchaseDue(doc);
    document.getElementById('page-title').textContent = 'Pay supplier';
    el.innerHTML = `<form class="card"><div class="card-body">
      <p>Balance on ${U.esc(doc.purchase_no || 'this purchase')} is <strong>${U.inr(due)}</strong>.</p>
      <div class="row g-3">
        <div class="col-md-4"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${U.today()}"></div>
        <div class="col-md-4"><label class="form-label">Amount</label><input class="form-control" name="amount" inputmode="decimal" value="${due}"></div>
        <div class="col-md-4"><label class="form-label">Account</label><select class="form-select" name="account"><option>Cash</option><option>Bank</option></select></div>
        <div class="col-12"><label class="form-label">Note</label><input class="form-control" name="note"></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" type="submit">Save payment</button>
        <a class="btn btn-outline-secondary" href="#/purchases/${purchaseId}">Cancel</a>
      </div>
    </div></form>`;
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const amount = U.round2(f.amount.value);
      const live = Books.purchaseDue(Store.get('Purchases', purchaseId));
      if (!(amount > 0)) return UI.toast('Amount must be more than 0', 'warning');
      if (amount > live + 0.001) return UI.toast('Amount is more than the balance of ' + U.inr(live), 'warning');
      await Store.save('PaymentsOut', {
        purchase_id: purchaseId, party_id: doc.party_id, date: f.date.value, amount, account: f.account.value, note: f.note.value.trim(), status: ''
      });
      UI.toast('Payment saved');
      location.hash = '#/purchases/' + purchaseId;
    });
  }
};
