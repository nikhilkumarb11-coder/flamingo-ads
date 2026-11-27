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

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  /** Server-assigned numbers arrive after save. Wait before opening a print that would say Pending. */
  async function awaitNumber(table, id, field) {
    let row = Store.get(table, id);
    if (!row || row[field]) return row;
    try { await Sync.now(); } catch (e) { /* the row may still arrive */ }
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      row = Store.get(table, id);
      if (!row || row[field] || !row._pending) return row;
      await sleep(200);
    }
    return Store.get(table, id);
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

  const STATE_CODE = {
    'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03', 'Chandigarh': '04', 'Uttarakhand': '05',
    'Haryana': '06', 'Delhi': '07', 'Rajasthan': '08', 'Uttar Pradesh': '09', 'Bihar': '10', 'Sikkim': '11',
    'Arunachal Pradesh': '12', 'Nagaland': '13', 'Manipur': '14', 'Mizoram': '15', 'Tripura': '16', 'Meghalaya': '17',
    'Assam': '18', 'West Bengal': '19', 'Jharkhand': '20', 'Odisha': '21', 'Chhattisgarh': '22', 'Madhya Pradesh': '23',
    'Gujarat': '24', 'Dadra and Nagar Haveli and Daman and Diu': '26', 'Maharashtra': '27', 'Karnataka': '29', 'Goa': '30',
    'Lakshadweep': '31', 'Kerala': '32', 'Tamil Nadu': '33', 'Puducherry': '34', 'Andaman and Nicobar Islands': '35',
    'Telangana': '36', 'Andhra Pradesh': '37', 'Ladakh': '38'
  };

  function stateLabel(name) {
    const n = String(name || '').trim();
    if (!n) return '';
    return STATE_CODE[n] ? STATE_CODE[n] + '-' + n : n;
  }

  function dmy(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : (ymd ? U.fmtDate(ymd) : '');
  }

  function rupee(n) { return '₹ ' + U.money(n); }

  function unitText(it) {
    const u = String(it.unit || '').trim();
    return !u || u === 'pcs' ? '-' : u;
  }

  function qtyText(n) {
    const v = U.round2(n);
    return v % 1 ? String(v) : String(v);
  }

  function firmBlock() {
    const f = firm();
    return `<tr><td colspan="2"><div class="sheet-firm">
      <img src="${APP_CONFIG.logo}" alt="">
      <div style="flex:1">
        <div class="sheet-firm-name">${U.esc(f.name)}</div>
        <div>${U.esc(f.address)}</div>
        <div class="sheet-firm-meta">
          <div>${f.phone ? 'Phone: ' + U.esc(f.phone) : ''}${f.gstin ? '<br>GSTIN: ' + U.esc(f.gstin) : ''}</div>
          <div>${f.email ? 'Email: ' + U.esc(f.email) : ''}${f.state ? '<br>State: ' + U.esc(stateLabel(f.state)) : ''}</div>
        </div>
      </div>
    </div></td></tr>`;
  }

  function partyCell(label, who) {
    return `<td>
      <div class="sheet-label">${U.esc(label)}</div>
      <div class="sheet-party">${U.esc(who.name || '')}</div>
      ${who.address ? `<div>${U.esc(who.address)}</div>` : ''}
      ${who.phone ? `<div>Contact No: ${U.esc(who.phone)}</div>` : ''}
      ${who.state ? `<div>State: ${U.esc(stateLabel(who.state))}</div>` : ''}
      ${who.gstin ? `<div>GSTIN Number: ${U.esc(who.gstin)}</div>` : ''}
    </td>`;
  }

  function detailsCell(label, rows) {
    return `<td>
      <div class="sheet-label">${U.esc(label)}</div>
      ${rows.map(r => `<div>${U.esc(r[0])}: ${U.esc(r[1] || '')}</div>`).join('')}
    </td>`;
  }

  function pricedLines(list, rate) {
    return list.map((it, i) => {
      const taxable = U.round2(Number(it.amount) || 0);
      const tax = rate ? U.round2(taxable * rate / 100) : 0;
      return {
        n: i + 1, name: it.item_name || '', hsn: it.hsn || '', qty: Books.billQty(it), unit: unitText(it),
        rate: Number(it.rate) || 0, taxable, tax, gross: U.round2(taxable + tax)
      };
    });
  }

  function taxGroups(lines, rate, inter) {
    const groups = [];
    lines.forEach(line => {
      let g = groups.find(x => x.hsn === line.hsn);
      if (!g) { g = { hsn: line.hsn, taxable: 0 }; groups.push(g); }
      g.taxable = U.round2(g.taxable + line.taxable);
    });
    return groups.map(g => {
      const tax = U.round2(g.taxable * rate / 100);
      if (inter) return { ...g, igst: tax, tax };
      const cgst = U.round2(tax / 2);
      return { ...g, cgst, sgst: U.round2(tax - cgst), tax };
    });
  }

  function fitTax(lines, groups, taxAmount) {
    const target = U.round2(taxAmount);
    const sum = U.round2(lines.reduce((s, r) => s + r.tax, 0));
    const diff = U.round2(target - sum);
    if (lines.length && diff) {
      const last = lines[lines.length - 1];
      last.tax = U.round2(last.tax + diff);
      last.gross = U.round2(last.taxable + last.tax);
    }
    const gsum = U.round2(groups.reduce((s, r) => s + r.tax, 0));
    const gdiff = U.round2(target - gsum);
    if (groups.length && gdiff) {
      const last = groups[groups.length - 1];
      last.tax = U.round2(last.tax + gdiff);
      if (last.igst != null) last.igst = last.tax;
      else { last.cgst = U.round2(last.tax / 2); last.sgst = U.round2(last.tax - last.cgst); }
    }
  }

  function moneyTable(lines, gst, rate) {
    const head = `<tr>
      <th>#</th><th>Item name</th><th>HSN/ SAC</th><th class="sheet-num">Quantity</th><th>Unit</th>
      <th class="sheet-num">Price/ Unit (₹)</th>${gst ? '<th class="sheet-num">GST(₹)</th>' : ''}
      <th class="sheet-num">Amount(₹)</th></tr>`;
    const body = lines.map(it => `<tr>
      <td>${it.n}</td>
      <td class="sheet-item">${U.esc(it.name)}</td>
      <td>${U.esc(it.hsn)}</td>
      <td class="sheet-num">${qtyText(it.qty)}</td>
      <td>${U.esc(it.unit)}</td>
      <td class="sheet-num">${rupee(it.rate)}</td>
      ${gst ? `<td class="sheet-num">${rupee(it.tax)}<br>(${Number(rate).toFixed(1)}%)</td>` : ''}
      <td class="sheet-num">${rupee(gst ? it.gross : it.taxable)}</td>
    </tr>`).join('');
    const qty = U.round2(lines.reduce((s, it) => s + it.qty, 0));
    const tax = U.round2(lines.reduce((s, it) => s + it.tax, 0));
    const gross = U.round2(lines.reduce((s, it) => s + (gst ? it.gross : it.taxable), 0));
    const total = `<tr>
      <td></td><td class="sheet-item">Total</td><td></td>
      <td class="sheet-num">${qtyText(qty)}</td><td></td><td></td>
      ${gst ? `<td class="sheet-num">${rupee(tax)}</td>` : ''}
      <td class="sheet-num">${rupee(gross)}</td>
    </tr>`;
    return { html: `<table class="sheet-box">${head}${body}${total}</table>`, gross, tax };
  }

  function taxSummary(groups, inter) {
    if (!groups.length) return '';
    const head = inter
      ? `<tr><th rowspan="2">HSN/ SAC</th><th rowspan="2">Taxable amount (₹)</th><th colspan="2">IGST</th><th rowspan="2">Total Tax(₹)</th></tr>
         <tr><th>Rate (%)</th><th>Amt (₹)</th></tr>`
      : `<tr><th rowspan="2">HSN/ SAC</th><th rowspan="2">Taxable amount (₹)</th><th colspan="2">CGST</th><th colspan="2">SGST</th><th rowspan="2">Total Tax(₹)</th></tr>
         <tr><th>Rate (%)</th><th>Amt (₹)</th><th>Rate (%)</th><th>Amt (₹)</th></tr>`;
    const half = n => (Number(n) / 2);
    const body = groups.map(g => {
      const pct = g.taxable ? U.round2(g.tax / g.taxable * 100) : 0;
      return inter
        ? `<tr><td>${U.esc(g.hsn)}</td><td class="sheet-num">${U.money(g.taxable)}</td><td class="sheet-num">${pct.toFixed(1)}</td><td class="sheet-num">${U.money(g.igst)}</td><td class="sheet-num">${U.money(g.tax)}</td></tr>`
        : `<tr><td>${U.esc(g.hsn)}</td><td class="sheet-num">${U.money(g.taxable)}</td><td class="sheet-num">${half(pct).toFixed(1)}</td><td class="sheet-num">${U.money(g.cgst)}</td><td class="sheet-num">${half(pct).toFixed(1)}</td><td class="sheet-num">${U.money(g.sgst)}</td><td class="sheet-num">${U.money(g.tax)}</td></tr>`;
    }).join('');
    const taxable = U.round2(groups.reduce((s, g) => s + g.taxable, 0));
    const tax = U.round2(groups.reduce((s, g) => s + g.tax, 0));
    const cgst = U.round2(groups.reduce((s, g) => s + (g.cgst || 0), 0));
    const sgst = U.round2(groups.reduce((s, g) => s + (g.sgst || 0), 0));
    const igst = U.round2(groups.reduce((s, g) => s + (g.igst || 0), 0));
    const foot = inter
      ? `<tr><td>TOTAL</td><td class="sheet-num">${U.money(taxable)}</td><td></td><td class="sheet-num">${U.money(igst)}</td><td class="sheet-num">${U.money(tax)}</td></tr>`
      : `<tr><td>TOTAL</td><td class="sheet-num">${U.money(taxable)}</td><td></td><td class="sheet-num">${U.money(cgst)}</td><td></td><td class="sheet-num">${U.money(sgst)}</td><td class="sheet-num">${U.money(tax)}</td></tr>`;
    return `<div class="sheet-label">Tax Summary:</div><table class="sheet-mini">${head}${body}${foot}</table>`;
  }

  function totalsBox(before, wordsLabel, words, after) {
    const line = r => `<tr><td>${U.esc(r[0])}</td><td>:</td><td class="sheet-num">${r[1]}</td></tr>`;
    return `<table class="sheet-mini">
      ${(before || []).map(line).join('')}
      <tr><td colspan="3"><div class="sheet-label">${U.esc(wordsLabel)}</div>${U.esc(words)}</td></tr>
      ${(after || []).map(line).join('')}
    </table>`;
  }

  function signBlock() {
    const f = firm();
    return `<td><div class="sheet-label">For ${U.esc(f.name)}:</div><div class="sheet-sign"><span>Authorized Signatory</span></div></td>`;
  }

  function paper(title, inner) {
    return `<div class="sheet-doc"><div class="sheet-title">${U.esc(title)}</div>${inner}</div>`;
  }

  function estimate(doc) {
    const list = Books.items('EstimateItems', 'estimate_id', doc.id);
    const p = Books.party(doc.party_id) || {};
    const sub = U.round2(list.reduce((s, it) => s + (Number(it.amount) || 0), 0));
    const t = Books.tax(sub, p.state);
    const gst = t.rate > 0;
    const lines = pricedLines(list, gst ? t.rate : 0);
    const groups = gst ? taxGroups(lines, t.rate, t.inter) : [];
    if (gst) fitTax(lines, groups, t.tax);
    const table = moneyTable(lines, gst, t.rate);
    const total = gst ? table.gross : sub;
    open(paper('Estimate', `<table class="sheet-box">
        ${firmBlock()}
        <tr>
          ${partyCell('Estimate For:', p)}
          ${detailsCell('Estimate Details:', [['No', doc.estimate_no || ''], ['Date', dmy(doc.date)], ['Place of Supply', stateLabel(p.state)]])}
        </tr>
      </table>
      ${table.html}
      <table class="sheet-box"><tr>
        <td>${gst ? taxSummary(groups, t.inter) : ''}</td>
        <td style="width:38%">${totalsBox([['Sub Total', rupee(total)], ['Total', rupee(total)]], 'Estimate Amount In Words :', U.inWords(total))}</td>
      </tr><tr>
        <td><div class="sheet-label">Bank Details:</div><div class="sheet-sign"></div></td>
        ${signBlock()}
      </tr></table>`));
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
    const rate = gst ? Number(doc.gst_rate) || 0 : 0;
    const inter = gst && Number(doc.igst) > 0;
    const lines = pricedLines(list, rate);
    const groups = gst ? taxGroups(lines, rate, inter) : [];
    if (gst) fitTax(lines, groups, doc.tax_amount);
    const table = moneyTable(lines, gst, rate);
    const buyer = { name: doc.buyer_name, address: doc.buyer_address, phone: doc.buyer_phone, state: doc.buyer_state, gstin: doc.buyer_gstin };
    const paid = Books.receivedOnInvoice(doc);
    const due = Books.invoiceDue(doc);
    const total = U.round2(doc.total);
    open(paper('Invoice', `<table class="sheet-box">
        ${firmBlock()}
        <tr>
          ${partyCell('Bill To:', buyer)}
          ${detailsCell('Invoice Details:', [['No', doc.invoice_no || ''], ['Date', dmy(doc.date)], ['Place of Supply', stateLabel(doc.buyer_state)]])}
        </tr>
      </table>
      ${doc.status === 'Void' ? `<div class="alert alert-danger">Void. ${U.esc(doc.void_reason || '')}</div>` : ''}
      ${table.html}
      <table class="sheet-box"><tr>
        <td>${gst ? taxSummary(groups, inter) : ''}</td>
        <td style="width:38%">${totalsBox(
          [['Sub Total', rupee(total)], ['Total', rupee(total)]],
          'Invoice Amount In Words :', U.inWords(total),
          [['Received', rupee(paid)], ['Balance', rupee(due)]]
        )}</td>
      </tr><tr>
        <td><div class="sheet-label">Bank Details:</div><div class="sheet-sign"></div></td>
        ${signBlock()}
      </tr></table>`));
  }

  function receipt(doc) {
    const party = Books.party(doc.party_id) || {};
    const who = { name: party.name || '', address: party.address || '', phone: party.phone || '' };
    open(paper('Payment Receipt', `<table class="sheet-box">
        ${firmBlock()}
        <tr>
          ${partyCell('Received From:', who)}
          ${detailsCell('Receipt Details:', [['No', doc.receipt_no || ''], ['Date', dmy(doc.date)]])}
        </tr>
        <tr>
          <td>${doc.note ? U.esc(doc.note) : ''}${doc.status === 'Void' ? '<div>This receipt is void.</div>' : ''}</td>
          <td style="width:42%">${totalsBox([['Received', rupee(doc.amount)]], 'Amount In Words :', U.inWords(doc.amount))}</td>
        </tr>
      </table>
      <table class="sheet-box" style="width:46%;margin-left:auto"><tr>${signBlock()}</tr></table>`));
  }

  /** Goods note for an order. Once an invoice exists, the challan uses that bill's number and lines. */
  function deliveryChallan(job, invoice) {
    const inv = invoice || (job ? Books.activeInvoiceForJob(job.id) : null);
    const list = inv
      ? Books.items('InvoiceItems', 'invoice_id', inv.id)
      : Books.items('JobItems', 'job_id', job.id);
    const party = job ? (Books.party(job.party_id) || {}) : {};
    const who = inv
      ? { name: inv.buyer_name, address: inv.buyer_address, phone: inv.buyer_phone, state: inv.buyer_state, gstin: inv.buyer_gstin }
      : party;
    const lines = list.map((it, i) => ({ n: i + 1, name: it.item_name || '', hsn: it.hsn || '', qty: Books.billQty(it), unit: unitText(it) }));
    const qty = U.round2(lines.reduce((s, it) => s + it.qty, 0));
    const body = lines.map(it => `<tr>
      <td>${it.n}</td>
      <td class="sheet-item">${U.esc(it.name)}</td>
      <td>${U.esc(it.hsn)}</td>
      <td class="sheet-num">${qtyText(it.qty)}</td>
      <td>${U.esc(it.unit)}</td>
    </tr>`).join('');
    const hand = label => `<td><div class="sheet-label">${label}</div>
      <div>Name:</div><div>Comment:</div><div>Date:</div><div>Signature:</div><div style="height:2.2rem"></div></td>`;
    open(paper('Delivery Challan', `<table class="sheet-box">
        ${firmBlock()}
        <tr>
          ${partyCell('Bill To:', who)}
          ${detailsCell(inv ? 'Invoice Details:' : 'Order Details:', [
            ['No', inv ? (inv.invoice_no || '') : (job.job_no || '')],
            ['Date', dmy(inv ? inv.date : job.date)],
            ['Place of Supply', stateLabel(who.state)]
          ])}
        </tr>
      </table>
      <table class="sheet-box">
        <tr><th>#</th><th>Item name</th><th>HSN/ SAC</th><th class="sheet-num">Quantity</th><th>Unit</th></tr>
        ${body}
        <tr><td></td><td class="sheet-item">Total</td><td></td><td class="sheet-num">${qtyText(qty)}</td><td></td></tr>
      </table>
      <table class="sheet-box"><tr>${hand('Received By:')} ${hand('Delivered By:')} ${signBlock()}</tr></table>`));
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

  return { estimate, job, invoice, receipt, deliveryChallan, statement, awaitNumber };
})();
