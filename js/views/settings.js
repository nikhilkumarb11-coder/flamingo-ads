/** Shop identity, tax, opening cash and bank, and this device. */
Views.settings = {
  title: 'Settings',
  refreshOn: ['Settings'],
  render(el) {
    const s = Store.settings();
    const field = (name, label, value, type = 'text') => `
      <div class="col-md-6"><label class="form-label">${label}</label>
        <input class="form-control" name="${name}" type="${type}" value="${U.esc(value || '')}"></div>`;
    el.innerHTML = `
      ${Api.isLocal() ? `<div class="alert alert-warning">No Google Sheet is connected. These books stay in this browser. When you paste the web app URL into <code>config.js</code>, log out and use Settings → Clear this device before the first shared login, so trial rows are not mixed into the Sheet.</div>` : ''}
      <form class="card mb-3"><div class="card-body">
        <h6>Shop</h6>
        <div class="row g-3">
          ${field('company_name', 'Legal name', s.company_name || 'Flamingo Ads')}
          ${field('phone', 'Phone', s.phone)}
          ${field('email', 'Email', s.email)}
          ${field('gstin', 'GSTIN', s.gstin)}
          <div class="col-md-6"><label class="form-label">State</label>
            <select class="form-select" name="state">${Books.stateOptions(s.state)}</select></div>
          ${field('gst_rate', 'GST %', s.gst_rate || '18')}
          <div class="col-12"><label class="form-label">Address</label>
            <textarea class="form-control" name="address" rows="2">${U.esc(s.address || '')}</textarea></div>
          <div class="col-12"><label class="form-label">Terms on documents</label>
            <textarea class="form-control" name="invoice_terms" rows="4">${U.esc(s.invoice_terms || Books.DEFAULT_TERMS)}</textarea></div>
          ${field('doc_sign_name', 'Name on the signature', s.doc_sign_name || 'Flamingo Ads')}
        </div>
        <h6 class="mt-4">Opening money</h6>
        <p class="small text-muted">What cash and bank held on the morning you start. Receipts add. Payments to suppliers and expenses come off.</p>
        <div class="row g-3">
          ${field('opening_cash', 'Opening cash (₹)', s.opening_cash || '0')}
          ${field('opening_bank', 'Opening bank (₹)', s.opening_bank || '0')}
        </div>
        <h6 class="mt-4">Number prefixes</h6>
        <p class="small text-muted">The counters stay separate even if you rename the letters. A GST bill and a bill without GST never share a sequence.</p>
        <div class="row g-3">
          ${field('prefix_gst', 'With GST', s.prefix_gst || 'GST')}
          ${field('prefix_bill', 'Without GST', s.prefix_bill || 'BILL')}
          ${field('prefix_est', 'Estimate', s.prefix_est || 'EST')}
          ${field('prefix_job', 'Job', s.prefix_job || 'JOB')}
          ${field('prefix_rcpt', 'Receipt', s.prefix_rcpt || 'RCT')}
          ${field('prefix_pur', 'Purchase', s.prefix_pur || 'PUR')}
          ${field('prefix_pay', 'Payment out', s.prefix_pay || 'PAY')}
          ${field('prefix_exp', 'Expense', s.prefix_exp || 'EXP')}
        </div>
        <button class="btn btn-primary mt-3" type="submit">Save settings</button>
      </div></form>
      ${this.installCard()}
      <div class="card"><div class="card-body d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-outline-primary" data-reload>Reload from server</button>
        <button type="button" class="btn btn-outline-danger" data-clear>Clear this device</button>
        <button type="button" class="btn btn-outline-secondary" data-logout>Log out</button>
        <span class="small text-muted align-self-center ms-auto">Version ${U.esc(APP_CONFIG.version)}</span>
      </div></div>`;

    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (f.gstin.value.trim() && !U.isGstin(f.gstin.value.trim())) return UI.toast('GSTIN does not look right', 'warning');
      const keys = ['company_name', 'phone', 'email', 'gstin', 'state', 'gst_rate', 'address', 'invoice_terms', 'doc_sign_name', 'opening_cash', 'opening_bank', 'prefix_gst', 'prefix_bill', 'prefix_est', 'prefix_job', 'prefix_rcpt', 'prefix_pur', 'prefix_pay', 'prefix_exp'];
      await Store.saveMany(keys.map(key => ['Settings', {
        id: key,
        key,
        value: key === 'gstin' ? f[key].value.trim().toUpperCase() : f[key].value.trim()
      }]));
      UI.toast('Settings saved');
    });
    const installBtn = el.querySelector('#install-btn');
    if (installBtn) installBtn.addEventListener('click', async () => {
      if (await App.install.prompt()) return;
      this.render(el);
    });
    el.querySelector('[data-reload]').addEventListener('click', () => Sync.now());
    el.querySelector('[data-logout]').addEventListener('click', () => Auth.logout());
    el.querySelector('[data-clear]').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Clear this device?',
        message: 'The books stored in this browser are removed. A connected Sheet is not deleted.',
        confirmText: 'Clear'
      });
      if (!ok) return;
      await Auth.logout();
    });
  },
  installCard() {
    const ins = App.install;
    let body;
    if (ins.isInstalled()) {
      body = '<p class="small mb-0"><i class="bx bx-check-circle text-success me-1"></i>Running as an installed app on this device.</p>';
    } else if (ins.canPrompt()) {
      body = `<p class="small text-muted">Add Flamingo to this device. It opens full screen from the icon.</p>
        <button type="button" class="btn btn-primary" id="install-btn"><i class="bx bx-download me-1"></i>Install app</button>`;
    } else if (ins.isIos()) {
      body = `<p class="small text-muted mb-2">On iPhone, add it from Safari:</p>
        <ol class="small text-muted mb-0 ps-3">
          <li class="mb-1">Open this site in <b>Safari</b>.</li>
          <li class="mb-1">Tap <b>Share</b>.</li>
          <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>`;
    } else if (['localhost', '127.0.0.1'].includes(location.hostname)) {
      body = '<p class="small text-muted mb-0">Install appears when the site is opened from its https address. On a phone, use the browser menu. On iPhone, Share → Add to Home Screen.</p>';
    } else {
      body = '<p class="small text-muted mb-0">Open the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>';
    }
    return `<div class="card mb-3"><div class="card-body"><h6>Install on this device</h6>${body}</div></div>`;
  }
};
