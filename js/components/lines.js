/**
 * Line editor for estimates, jobs and invoices.
 * Columns: name, qty, rate. Amount is qty × rate.
 */
const Lines = (() => {
  function shownQty(item) {
    if ((item.qty == null || item.qty === '') && !Number(item.width) && !Number(item.height)) return 1;
    const billed = Books.billQty(item);
    return billed > 0 ? billed : 1;
  }

  function mount(container, { items = [], onChange = () => {} } = {}) {
    container.classList.add('lines-editor');
    container.innerHTML = `
      <div class="items-head d-none d-md-grid">
        <span>Name</span><span class="text-end">Qty</span>
        <span class="text-end">Rate</span><span class="text-end">Amount</span><span></span>
      </div>
      <div class="items-rows"></div>
      <button type="button" class="btn btn-sm btn-outline-primary mt-2" data-add><i class="bx bx-plus me-1"></i>Add line</button>`;
    const rowsEl = container.querySelector('.items-rows');

    function paint(row) {
      const it = readRow(row);
      row.querySelector('[data-amount]').textContent = U.inr(Books.lineAmount(it));
    }

    function recalc() {
      let total = 0;
      rowsEl.querySelectorAll('.item-row').forEach(row => {
        paint(row);
        total += Books.lineAmount(readRow(row));
      });
      onChange(U.round2(total));
    }

    function readRow(row) {
      const val = name => row.querySelector(`[data-f="${name}"]`).value;
      return {
        item_name: val('item_name').trim(),
        width: 0,
        height: 0,
        qty: val('qty'),
        unit: 'pcs',
        rate: val('rate'),
        hsn: row.dataset.hsn || ''
      };
    }

    function addRow(item = {}) {
      const row = U.el(`
        <div class="item-row" data-id="${U.esc(item.id || '')}" data-hsn="${U.esc(item.hsn || '')}">
          <div class="item-name">
            <label class="d-md-none small text-muted">Name</label>
            <input class="form-control" data-f="item_name" placeholder="Name board, flex, installation…" value="${U.esc(item.item_name || '')}">
          </div>
          <div class="item-qty"><label class="d-md-none small text-muted">Qty</label>
            <input class="form-control text-end" data-f="qty" inputmode="decimal" value="${U.esc(shownQty(item))}"></div>
          <div class="item-rate"><label class="d-md-none small text-muted">Rate (₹)</label>
            <input class="form-control text-end" data-f="rate" inputmode="decimal" placeholder="0" value="${item.rate != null && item.rate !== '' ? U.esc(item.rate) : ''}"></div>
          <div class="item-amount"><label class="d-md-none small text-muted">Amount</label>
            <div class="fw-semibold text-end" data-amount>₹0</div></div>
          <div class="item-remove"><button type="button" class="btn btn-icon btn-sm btn-text-danger" aria-label="Remove"><i class="bx bx-trash"></i></button></div>
        </div>`);
      rowsEl.appendChild(row);
      const nameInput = row.querySelector('[data-f="item_name"]');
      const rateInput = row.querySelector('[data-f="rate"]');
      Typeahead.attach(nameInput, {
        minChars: 1,
        source: q => {
          const n = q.trim().toLowerCase();
          return Store.list('Services')
            .filter(s => s.active !== false && s.active !== 'FALSE' && s.name.toLowerCase().includes(n))
            .map(s => ({ label: s.name, sub: U.inr(s.rate), value: s }));
        },
        onPick: it => {
          const s = it.value;
          nameInput.value = s.name;
          if (!rateInput.value) rateInput.value = s.rate || '';
          row.dataset.hsn = s.hsn || '';
          recalc();
        }
      });
      row.querySelectorAll('input').forEach(el => el.addEventListener('input', recalc));
      row.querySelector('.item-remove button').addEventListener('click', () => {
        row.remove();
        if (!rowsEl.children.length) addRow();
        recalc();
      });
      return row;
    }

    container.querySelector('[data-add]').addEventListener('click', () => {
      addRow().querySelector('[data-f="item_name"]').focus();
    });
    (items.length ? items : [{}]).forEach(addRow);
    recalc();

    return {
      getItems() {
        return [...rowsEl.querySelectorAll('.item-row')].map(row => {
          const it = readRow(row);
          return {
            id: row.dataset.id || undefined,
            item_name: it.item_name,
            width: 0,
            height: 0,
            qty: U.round2(it.qty),
            unit: 'pcs',
            rate: U.round2(it.rate),
            amount: Books.lineAmount(it),
            hsn: row.dataset.hsn || ''
          };
        }).filter(it => it.item_name || it.rate || it.id);
      },
      total() { return Books.sumItems(this.getItems()); },
      validate() {
        const list = this.getItems().filter(it => it.item_name || it.rate);
        if (!list.length) return 'Add at least one line';
        for (const it of list) {
          if (!it.item_name) return 'Every line needs a name';
          if (!(Number(it.qty) > 0)) return `Quantity for "${it.item_name}" must be more than 0`;
          if (it.rate < 0) return `Rate for "${it.item_name}" can't be negative`;
        }
        return '';
      }
    };
  }

  return { mount };
})();
