/** Costs that are not stock: rent, wages, fuel, tea. */
Views.expenses = {
  title: 'Expenses',
  refreshOn: ['Expenses'],
  render(el, params) {
    const [a, b] = params;
    if (a === 'new' || b === 'edit') return this.form(el, b === 'edit' ? a : null);
    this.list(el);
  },
  list(el) {
    const rows = Store.list('Expenses').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="d-flex justify-content-between mb-3"><span class="text-muted">${rows.length} expenses</span>
        <a class="btn btn-primary" href="#/expenses/new">New expense</a></div>
      <div class="table-responsive"><table class="table">
        <thead><tr><th>No.</th><th>Date</th><th>Category</th><th>Account</th><th class="text-end">Amount</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><a href="#/expenses/${r.id}/edit">${U.esc(r.expense_no || 'Pending')}</a></td>
          <td>${U.fmtDate(r.date)}</td>
          <td>${U.esc(r.category)}</td>
          <td>${U.esc(r.account || '')}</td>
          <td class="text-end">${U.inr(r.amount)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-muted py-4 text-center">No expenses yet.</td></tr>'}
        </tbody></table></div>
    </div></div>`;
  },
  form(el, id) {
    const doc = id ? Store.get('Expenses', id) : { category: 'Fuel', account: 'Cash', date: U.today() };
    if (id && !doc) { el.innerHTML = `<div class="alert alert-warning">Expense not found.</div>`; return; }
    document.getElementById('page-title').textContent = id ? 'Edit expense' : 'New expense';
    el.innerHTML = `<form class="card"><div class="card-body"><div class="row g-3">
      <div class="col-md-4"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${U.esc(doc.date || U.today())}"></div>
      <div class="col-md-4"><label class="form-label">Category</label>
        <select class="form-select" name="category">${Books.EXPENSE_CATEGORIES.map(c => `<option${c === doc.category ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="col-md-4"><label class="form-label">Amount</label><input class="form-control" name="amount" inputmode="decimal" required value="${U.esc(doc.amount || '')}"></div>
      <div class="col-md-4"><label class="form-label">Account</label>
        <select class="form-select" name="account"><option${doc.account === 'Bank' ? '' : ' selected'}>Cash</option><option${doc.account === 'Bank' ? ' selected' : ''}>Bank</option></select></div>
      <div class="col-md-8"><label class="form-label">Note</label><input class="form-control" name="note" value="${U.esc(doc.note || '')}"></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-primary" type="submit">Save</button>
      ${id ? '<button type="button" class="btn btn-outline-danger" data-del>Delete</button>' : ''}
      <a class="btn btn-outline-secondary" href="#/expenses">Cancel</a>
    </div></div></form>`;
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const amount = U.round2(f.amount.value);
      if (!(amount > 0)) return UI.toast('Amount must be more than 0', 'warning');
      await Store.save('Expenses', {
        id: id || undefined,
        date: f.date.value,
        category: f.category.value,
        account: f.account.value,
        amount,
        note: f.note.value.trim(),
        party_id: ''
      });
      UI.toast('Expense saved');
      location.hash = '#/expenses';
    });
    const del = el.querySelector('[data-del]');
    if (del) del.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Delete expense', message: 'It leaves the daybook and the cash or bank balance.', confirmText: 'Delete' });
      if (!ok) return;
      await Store.remove('Expenses', id);
      UI.toast('Expense deleted');
      location.hash = '#/expenses';
    });
  }
};
