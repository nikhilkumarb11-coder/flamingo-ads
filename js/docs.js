/** Printable estimate, job sheet, tax invoice, plain invoice, receipt, and party statement. */
const Docs = (() => {
  function firm() {
    const s = Store.settings();
    return {
      name: s.company_name || APP_CONFIG.companyName,
      tagline: APP_CONFIG.tagline,
      address: s.address || '',
      phone: s.phone || '',
      email: s.email || '',
      gstin: s.gstin || '',
      state: s.state || '',
      sign: s.doc_sign_name || s.company_name || APP_CONFIG.companyName,
      terms: String(s.invoice_terms || Books.DEFAULT_TERMS).split('\n').map(t => t.trim()).filter(Boolean)
    };
  }

  function head(title, meta) {
    const f = firm();
    return `<div class="d-flex justify-content-between gap-3">
      <div class="d-flex gap-3">
        <img src="${APP_CONFIG.logo}" alt="" width="72" height="72" style="border-radius:50%">
        <div>
          <div class="fw-bold" style="font-size:1.25rem">${U.esc(f.name)}</div>
          <div class="tagline-mark">${U.esc(f.tagline)}</div>
          <div class="small">${U.esc(f.address)}</div>
          <div class="small">${[f.phone, f.email].filter(Boolean).map(U.esc).join(' · ')}</div>
          ${f.gstin ? `<div class="small">GSTIN ${U.esc(f.gstin)}${f.state ? ' · ' + U.esc(f.state) : ''}</div>` : ''}
        </div>
      </div>
      <div class="text-end">
        <div class="fw-bold" style="font-size:1.15rem">${U.esc(title)}</div>
        ${meta.map(m => `<div class="small"><span class="text-muted">${U.esc(m[0])}</span> ${U.esc(m[1])}</div>`).join('')}
      </div>
    </div>
    <div class="bill-rule"></div>`;
  }

  function partyBlock(name, extra) {
    return `<div class="mb-3"><div class="small text-muted">Bill to</div>
      <div class="fw-semibold">${U.esc(name || '')}</div>
      ${extra.filter(Boolean).map(x => `<div class="small">${U.esc(x)}</div>`).join('')}
    </div>`;
  }

  function linesTable(list, gst) {
    const headCells = `<th>Name</th><th class="text-end">Qty</th>${gst ? '<th>HSN</th>' : ''}<th class="text-end">Rate</th><th class="text-end">Amount</th>`;
    const body = list.map(it => `<tr>
      <td>${U.esc(it.item_name)}</td>
      <td class="text-end">${Books.billQty(it)}</td>
      ${gst ? `<td>${U.esc(it.hsn || '')}</td>` : ''}
      <td class="text-end">${U.money(it.rate)}</td>
      <td class="text-end">${U.money(it.amount)}</td>
    </tr>`).join('');
    return `<table><thead><tr>${headCells}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function totals(rows) {
    return `<div class="d-flex justify-content-end mt-2"><table style="width:16rem">
      ${rows.map(r => `<tr><td>${U.esc(r[0])}</td><td class="text-end">${r[1]}</td></tr>`).join('')}
    </table></div>`;
  }

  function foot(note) {
    const f = firm();
    return `<div class="row mt-4">
      <div class="col-7 small">
        ${note ? `<div class="mb-2">${U.esc(note)}</div>` : ''}
        ${f.terms.length ? `<div class="fw-semibold">Terms</div><ol class="mb-0 ps-3">${f.terms.map(t => `<li>${U.esc(t)}</li>`).join('')}</ol>` : ''}
      </div>
      <div class="col-5 text-end small">For ${U.esc(f.sign)}<div style="height:3rem"></div>Authorised signatory</div>
    </div>`;
  }

  function open(inner) {
    const root = document.getElementById('print-root');
    root.innerHTML = `<div class="bill-preview">
      <div class="bill-actions no-print">
        <button type="button" class="btn btn-outline-secondary" data-close>Close</button>
        <button type="button" class="btn btn-primary" data-print>Print / Save PDF</button>
      </div>
      <div class="bill-sheet">${inner}</div>
    </div>`;
    root.querySelector('[data-close]').addEventListener('click', () => { root.innerHTML = ''; });
    root.querySelector('[data-print]').addEventListener('click', () => window.print());
  }

  function estimate(doc) {
    const list = Books.items('EstimateItems', 'estimate_id', doc.id);
    const p = Books.party(doc.party_id) || {};
    open(head('Estimate', [['No.', doc.estimate_no || 'Pending'], ['Date', U.fmtDate(doc.date)]])
      + partyBlock(p.name, [p.address, p.phone, p.gstin])
      + linesTable(list, false)
      + totals([['Total', U.money(doc.total)]])
      + `<div class="small mt-2">${U.esc(U.inWords(doc.total))}</div>`
      + foot(doc.notes));
  }

  function job(doc) {
    const list = Books.items('JobItems', 'job_id', doc.id);
    const p = Books.party(doc.party_id) || {};
    open(head('Order sheet', [['No.', doc.job_no || 'Pending'], ['Date', U.fmtDate(doc.date)], ['Due', U.fmtDate(doc.due_date)]])
      + partyBlock(p.name, [doc.site_address || p.address, p.phone])
      + `<div class="small mb-2">Status: ${U.esc(doc.status)}</div>`
      + linesTable(list, false)
      + totals([['Total', U.money(doc.total)]])
      + foot(doc.notes));
  }

  function invoice(doc) {
    const gst = doc.tax_mode === 'gst';
    const list = Books.items('InvoiceItems', 'invoice_id', doc.id);
    const rows = [['Taxable value', U.money(doc.subtotal)]];
    if (gst) {
      if (Number(doc.cgst)) rows.push([`CGST`, U.money(doc.cgst)]);
      if (Number(doc.sgst)) rows.push([`SGST`, U.money(doc.sgst)]);
      if (Number(doc.igst)) rows.push([`IGST`, U.money(doc.igst)]);
    }
    rows.push(['Grand total', `<strong>${U.money(doc.total)}</strong>`]);
    const paid = Books.paidForInvoice(doc.id);
    if (paid) rows.push(['Received', U.money(paid)], ['Balance', U.money(Books.invoiceDue(doc))]);
    open(head(gst ? 'Tax Invoice' : 'Invoice', [
      ['No.', doc.invoice_no || 'Pending'],
      ['Date', U.fmtDate(doc.date)],
      ['Mode', gst ? 'With GST' : 'Without GST']
    ])
      + partyBlock(doc.buyer_name, [doc.buyer_address, doc.buyer_phone, doc.buyer_gstin ? 'GSTIN ' + doc.buyer_gstin : '', doc.buyer_state])
      + (doc.status === 'Void' ? `<div class="alert alert-danger">Void. ${U.esc(doc.void_reason || '')}</div>` : '')
      + linesTable(list, gst)
      + totals(rows)
      + `<div class="small mt-2">${U.esc(U.inWords(doc.total))}</div>`
      + foot(doc.notes));
  }

  function receipt(doc) {
    const inv = Store.get('Invoices', doc.invoice_id);
    open(head('Receipt', [['No.', doc.receipt_no || 'Pending'], ['Date', U.fmtDate(doc.date)]])
      + `<p>Received ${U.inr(doc.amount)} from <strong>${U.esc(doc.party_id ? Books.partyName(doc.party_id) : '')}</strong>
        ${inv ? ` against ${inv.tax_mode === 'gst' ? 'tax invoice' : 'invoice'} <strong>${U.esc(inv.invoice_no || '')}</strong>` : ''}
        into ${U.esc(doc.account || 'Cash')}.</p>
        <p>${U.esc(U.inWords(doc.amount))}</p>
        ${doc.note ? `<p class="small">${U.esc(doc.note)}</p>` : ''}
        ${doc.status === 'Void' ? '<p class="text-danger">This receipt is void.</p>' : ''}`);
  }

  function statement(party) {
    const st = Books.partyStatement(party.id);
    const body = st.rows.map(r => `<tr>
      <td>${U.fmtDate(r.date)}</td>
      <td>${U.esc(r.label)}</td>
      <td class="text-end">${r.debit ? U.money(r.debit) : ''}</td>
      <td class="text-end">${r.credit ? U.money(r.credit) : ''}</td>
      <td class="text-end">${U.money(r.balance)}</td>
    </tr>`).join('');
    open(head('Statement', [['As on', U.fmtDate(U.today())]])
      + partyBlock(party.name, [party.address, party.phone, party.gstin ? 'GSTIN ' + party.gstin : '', party.state])
      + `<table><thead><tr><th>Date</th><th>Particular</th><th class="text-end">Debit</th><th class="text-end">Credit</th><th class="text-end">Balance</th></tr></thead>
        <tbody>${body || '<tr><td colspan="5">No entries yet.</td></tr>'}</tbody></table>`
      + totals([['Balance', `<strong>${U.money(st.balance)}</strong>`]]));
  }

  return { estimate, job, invoice, receipt, statement };
})();
