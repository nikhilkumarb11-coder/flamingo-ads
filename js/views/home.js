/** Morning desk: money, this month, and the work in progress. */
Views.home = {
  title: 'Home',
  refreshOn: ['Parties', 'Estimates', 'Jobs', 'Invoices', 'Receipts', 'Settings', 'Materials', 'Purchases', 'PurchaseItems', 'PaymentsOut', 'Issues', 'Expenses'],
  render(el) {
    const month = U.today().slice(0, 7);
    const prev = U.addMonths(U.today(), -1);
    const now = Books.monthSales(month);
    const then = Books.monthSales(prev);
    const delta = then.total ? Math.round((now.total - then.total) / then.total * 100) : null;
    const days = Books.dailySales(month);
    const max = Math.max(...days, 1);
    const w = 320;
    const h = 72;
    const step = days.length > 1 ? w / (days.length - 1) : w;
    const pts = days.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`).join(' ');
    const dueJobs = Books.reminders();
    const pipeline = Books.JOB_STATUSES.filter(s => s !== 'Done' && s !== 'Cancelled').map(s => {
      const n = Store.list('Jobs').filter(j => j.status === s).length;
      return `<a class="col-6 col-md-4 col-xl-2" href="#/jobs"><div class="border rounded p-2 h-100"><div class="small text-muted">${s}</div><div class="fw-bold">${n}</div></div></a>`;
    }).join('');
    const waiting = Store.list('Estimates').filter(e => e.status === 'Draft' || e.status === 'Sent');
    const overdueInv = Store.list('Invoices').filter(i => i.status !== 'Void' && Books.invoiceDue(i) > 0.001)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 6);
    const lows = Books.lowStock();

    const kpi = (label, value, sub) => `<div class="col-6 col-xl-3"><div class="card kpi-card h-100"><div class="card-body">
      <div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div>
    </div></div></div>`;

    el.innerHTML = `
      ${Api.isLocal() ? '<div class="alert alert-warning">Books are on this device only. Connect a Google Sheet in Settings when you want the office and the phone to share them.</div>' : ''}
      <div class="row g-3 mb-3">
        ${kpi('Receivable', U.inr(Books.receivable()), 'Opening + unpaid invoices')}
        ${kpi('Payable', U.inr(Books.payable()), 'Opening + unpaid purchases')}
        ${kpi('Cash in hand', U.inr(Books.accountBalance('Cash')), 'After receipts, payments, and expenses')}
        ${kpi('Bank', U.inr(Books.accountBalance('Bank')), 'After receipts, payments, and expenses')}
      </div>
      <div class="row g-3 mb-3">
        <div class="col-lg-7"><div class="card h-100"><div class="card-body">
          <div class="d-flex justify-content-between">
            <div>
              <div class="text-muted small">Sales this month</div>
              <div class="h3 mb-0">${U.inr(now.total)}</div>
              <div class="small text-muted">${delta == null ? 'No sales last month' : (delta >= 0 ? delta + '% above last month' : Math.abs(delta) + '% below last month')}
                · GST ${U.inr(now.gst)} · without GST ${U.inr(now.plain)}</div>
            </div>
            <svg class="spark" viewBox="0 0 ${w} ${h}" width="180" height="72" aria-label="Daily sales this month">
              <polyline fill="none" stroke="#E23B4A" stroke-width="2.5" points="${pts}"></polyline>
            </svg>
          </div>
        </div></div></div>
        <div class="col-lg-5"><div class="card h-100"><div class="card-body">
          <div class="d-flex justify-content-between"><h6 class="mb-2">Due soon</h6><a href="#/jobs">Jobs</a></div>
          ${dueJobs.length ? dueJobs.slice(0, 5).map(r => `<a class="d-flex justify-content-between py-1 text-body" href="#/jobs/${r.job.id}">
            <span>${U.esc(r.job.job_no || 'Job')} · ${U.esc(Books.partyName(r.job.party_id))}</span>
            <span class="small ${r.days < 0 ? 'text-danger' : 'text-muted'}">${r.days < 0 ? Math.abs(r.days) + 'd overdue' : r.days === 0 ? 'Today' : 'in ' + r.days + 'd'}</span>
          </a>`).join('') : '<div class="text-muted small">Nothing due in the next few days.</div>'}
        </div></div></div>
      </div>
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex justify-content-between"><h6>Low stock</h6><a href="#/materials">Materials</a></div>
        ${lows.length ? lows.slice(0, 6).map(r => `<a class="d-flex justify-content-between py-1 text-body" href="#/materials/${r.material.id}">
          <span>${U.esc(r.material.name)}</span><span class="small text-danger">${r.qty} ${U.esc(r.material.unit || '')} · reorder ${r.material.reorder_level || 0}</span></a>`).join('')
          : '<div class="text-muted small">Everything is above its reorder level.</div>'}
      </div></div>
      <div class="card mb-3"><div class="card-body">
        <h6>Jobs in progress</h6>
        <div class="row g-2">${pipeline}</div>
      </div></div>
      <div class="row g-3">
        <div class="col-lg-6"><div class="card h-100"><div class="card-body">
          <div class="d-flex justify-content-between"><h6>Estimates waiting</h6><a href="#/estimates">All</a></div>
          ${waiting.slice(0, 6).map(e => `<a class="d-flex justify-content-between py-1 text-body" href="#/estimates/${e.id}">
            <span>${U.esc(e.estimate_no || 'Estimate')} · ${U.esc(Books.partyName(e.party_id))}</span>
            <span class="small">${U.inr(e.total)}</span></a>`).join('') || '<div class="text-muted small">No open estimates.</div>'}
        </div></div></div>
        <div class="col-lg-6"><div class="card h-100"><div class="card-body">
          <div class="d-flex justify-content-between"><h6>Invoices with a balance</h6><a href="#/invoices">All</a></div>
          ${overdueInv.map(i => `<a class="d-flex justify-content-between py-1 text-body" href="#/invoices/${i.id}">
            <span>${U.esc(i.invoice_no || 'Invoice')} · ${U.esc(i.buyer_name || '')}</span>
            <span class="small">${U.inr(Books.invoiceDue(i))}</span></a>`).join('') || '<div class="text-muted small">Nothing outstanding.</div>'}
        </div></div></div>
      </div>`;
  }
};
