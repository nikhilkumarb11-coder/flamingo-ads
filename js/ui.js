/** Shell: navigation, routing, toasts, search. */
const NAV = [
  { id: 'home', label: 'Home', icon: 'bx-home-circle' },
  { header: 'Work' },
  { id: 'parties', label: 'Parties', icon: 'bx-user' },
  { id: 'estimates', label: 'Estimates', icon: 'bx-file' },
  { id: 'orders', label: 'Orders', icon: 'bx-briefcase' },
  { id: 'invoices', label: 'Invoices', icon: 'bx-receipt' },
  { id: 'receipts', label: 'Receipts', icon: 'bx-wallet' },
  { id: 'purchases', label: 'Purchases', icon: 'bx-cart' },
  { id: 'expenses', label: 'Expenses', icon: 'bx-money' },
  { header: 'Catalog' },
  { id: 'services', label: 'Services', icon: 'bx-purchase-tag' },
  { id: 'materials', label: 'Materials', icon: 'bx-package' },
  { header: 'System' },
  { id: 'reports', label: 'Reports', icon: 'bx-bar-chart-alt-2' },
  { id: 'settings', label: 'Settings', icon: 'bx-cog' }
];

const NAV_GROUP = (() => {
  const out = {};
  let group = '';
  NAV.forEach(i => { if (i.header) group = i.header; else if (group) out[i.id] = group; });
  return out;
})();

const BOTTOM_NAV = [
  { id: 'home', label: 'Home', icon: 'bx-home-circle' },
  { id: 'parties', label: 'Parties', icon: 'bx-user' },
  { id: 'new', label: 'New', icon: 'bx-plus', action: 'new' },
  { id: 'orders', label: 'Orders', icon: 'bx-briefcase' },
  { id: 'more', label: 'More', icon: 'bx-grid-alt', action: 'more', rest: true }
];

const QUICK_ACTIONS = [
  { label: 'Estimate', icon: 'bx-file', href: '#/estimates/new', tone: 'violet' },
  { label: 'Order', icon: 'bx-briefcase', href: '#/orders/new', tone: 'rose' },
  { label: 'Party', icon: 'bx-user-plus', href: '#/parties/new', tone: 'blue' },
  { label: 'Tax invoice', icon: 'bx-receipt', href: '#/invoices/new/gst', tone: 'amber' },
  { label: 'Invoice without GST', icon: 'bx-receipt', href: '#/invoices/new/none', tone: 'green' },
  { label: 'Purchase', icon: 'bx-cart', href: '#/purchases/new', tone: 'blue' },
  { label: 'Expense', icon: 'bx-money', href: '#/expenses/new', tone: 'rose' }
];

const Views = {};

const UI = (() => {
  let current = null;
  const $ = sel => document.querySelector(sel);

  function buildNav() {
    $('#menu-items').innerHTML = NAV.map(item => item.header
      ? `<li class="menu-header small text-uppercase"><span class="menu-header-text">${item.header}</span></li>`
      : `<li class="menu-item" data-nav="${item.id}">
           <a href="#/${item.id}" class="menu-link">
             <i class="menu-icon tf-icons bx ${item.icon}"></i>
             <div>${item.label}</div>
             <span class="badge rounded-pill bg-danger ms-auto d-none" data-badge="${item.id}"></span>
           </a>
         </li>`).join('');

    $('#bottom-nav').innerHTML = BOTTOM_NAV.map(item => item.action === 'new'
      ? `<button type="button" class="bottom-nav-new" data-action="new" aria-label="Create new"><i class="bx bx-plus"></i></button>`
      : `<a href="${item.action ? 'javascript:void(0)' : '#/' + item.id}" class="bottom-nav-item" data-bottom="${item.id}" ${item.action ? `data-action="${item.action}"` : ''}>
          <span class="bottom-nav-icon"><i class="bx ${item.icon}"></i>
            <span class="badge rounded-pill bg-danger bottom-nav-badge d-none" data-badge="${item.id}"></span></span>
          <span>${item.label}</span>
        </a>`).join('');

    $('#more-items').innerHTML = NAV.filter(i => !i.header).map(item => `
      <a href="#/${item.id}" class="more-tile"><i class="bx ${item.icon}"></i><span>${item.label}</span></a>`).join('');

    const tile = a => `
      <a href="${a.href}" class="action-tile">
        <span class="action-icon tone-${a.tone}"><i class="bx ${a.icon}"></i></span><span>${a.label}</span>
      </a>`;
    $('#new-items').innerHTML = QUICK_ACTIONS.map(tile).join('');
    $('#fab-menu').innerHTML = QUICK_ACTIONS.map(a => `
      <li><a class="dropdown-item d-flex align-items-center gap-2 py-2" href="${a.href}">
        <span class="action-icon action-icon-sm tone-${a.tone}"><i class="bx ${a.icon}"></i></span><span>${a.label}</span></a></li>`).join('');

    document.querySelector('[data-action="more"]').addEventListener('click', () => {
      bootstrap.Offcanvas.getOrCreateInstance($('#more-sheet')).show();
    });
    document.querySelector('[data-action="new"]').addEventListener('click', () => {
      bootstrap.Offcanvas.getOrCreateInstance($('#new-sheet')).show();
    });
    ['#more-sheet', '#new-sheet'].forEach(sel => $(sel).addEventListener('click', e => {
      if (e.target.closest('a[href^="#/"]')) bootstrap.Offcanvas.getOrCreateInstance($(sel)).hide();
    }));
    Search.init();
    document.querySelectorAll('.layout-menu-toggle').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      document.documentElement.classList.toggle('layout-menu-expanded');
    }));
    $('#sync-status').addEventListener('click', () => Sync.now());
  }

  function parseHash() {
    const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/').filter(Boolean);
    return { name: parts[0] || 'home', params: parts.slice(1).map(decodeURIComponent) };
  }

  function route() {
    let { name, params } = parseHash();
    if (name === 'jobs') {
      const rest = params.map(encodeURIComponent).join('/');
      location.replace('#/orders' + (rest ? '/' + rest : ''));
      return;
    }
    const view = Views[name] || Views.notfound;
    current = { name, params, view };
    document.documentElement.classList.remove('layout-menu-expanded');
    document.querySelectorAll('[data-nav]').forEach(li => li.classList.toggle('active', li.dataset.nav === name));
    const named = BOTTOM_NAV.filter(b => !b.action).map(b => b.id);
    document.querySelectorAll('[data-bottom]').forEach(a => {
      const def = BOTTOM_NAV.find(b => b.id === a.dataset.bottom);
      a.classList.toggle('active', def.rest ? !named.includes(name) : def.id === name);
    });
    $('#page-title').textContent = view.title || '';
    $('#page-sub').textContent = name === 'home' ? U.fmtDate(U.today()) : (NAV_GROUP[name] || '');
    document.body.dataset.page = name;
    const printRoot = document.getElementById('print-root');
    if (printRoot) printRoot.innerHTML = '';
    document.title = `${view.title ? view.title + ' · ' : ''}${APP_CONFIG.companyName}`;
    render();
    const el = $('#page-content');
    el.classList.remove('page-enter');
    void el.offsetWidth;
    el.classList.add('page-enter');
    window.scrollTo(0, 0);
  }

  function render() {
    if (!current) return;
    const el = $('#page-content');
    try { current.view.render(el, current.params); }
    catch (e) {
      console.error(e);
      el.innerHTML = `<div class="alert alert-danger">This screen could not be shown: ${U.esc(e.message)}</div>`;
    }
  }

  function onDataChange(tables) {
    updateBadges();
    renderSyncStatus(Sync.status());
    if (!current) return;
    const { view, params } = current;
    const watch = typeof view.refreshOn === 'function' ? view.refreshOn(params) : view.refreshOn;
    if (!watch || !watch.some(t => tables.has(t))) return;
    if (document.querySelector('#page-content form')) return;
    if (view.update) {
      try { view.update($('#page-content'), params); } catch (e) { console.error(e); }
    } else render();
  }

  function updateBadges() {
    const due = Books.reminders().length;
    document.querySelectorAll('[data-badge="home"], [data-badge="orders"]').forEach(b => {
      b.textContent = due;
      b.classList.toggle('d-none', !due);
    });
  }

  function renderSyncStatus(s) {
    const btn = $('#sync-status');
    if (!btn) return;
    const pending = s.pending || 0;
    const states = {
      idle: ['bx-cloud', 'text-muted', 'Ready'],
      syncing: ['bx-refresh bx-spin', 'text-muted', 'Syncing…'],
      saving: ['bx-loader-alt bx-spin', 'text-primary', `Saving… (${pending})`],
      synced: [pending ? 'bx-loader-alt bx-spin' : 'bx-check-circle', pending ? 'text-primary' : 'text-success', pending ? `Saving… (${pending})` : 'Saved'],
      offline: ['bx-wifi-off', 'text-warning', pending ? `Offline · ${pending} pending` : 'Offline'],
      error: ['bx-error-circle', 'text-danger', pending ? `Sync error · ${pending} pending` : 'Sync error']
    };
    const [icon, color, label] = states[s.state] || states.idle;
    btn.className = `btn btn-sm sync-pill ${color}`;
    btn.title = s.message || (s.lastSync ? `Last synced ${U.timeAgo(s.lastSync)}. Tap to sync now.` : 'Tap to sync now');
    btn.innerHTML = `<i class="bx ${icon}"></i><span class="sync-label">${label}</span>`;
  }

  function toast(message, type = 'success', action = null) {
    const icons = { success: 'bx-check-circle', danger: 'bx-error-circle', warning: 'bx-error', info: 'bx-info-circle' };
    const el = U.el(`
      <div class="toast align-items-center text-white bg-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : type === 'info' ? 'info' : 'success'} border-0" role="alert">
        <div class="d-flex">
          <div class="toast-body d-flex gap-2 align-items-start"><i class="bx ${icons[type] || icons.info} fs-5"></i><span>${U.esc(message)}</span></div>
          ${action ? `<button type="button" class="btn btn-sm btn-light my-auto" data-action>${U.esc(action.label)}</button>` : ''}
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`);
    if (action) el.querySelector('[data-action]').addEventListener('click', action.onClick);
    $('#toast-area').appendChild(el);
    const t = new bootstrap.Toast(el, { autohide: !action, delay: type === 'danger' || type === 'warning' ? 7000 : 3000 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  function confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = true } = {}) {
    return new Promise(resolve => {
      const el = U.el(`
        <div class="modal fade" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
              <div class="modal-header"><h5 class="modal-title">${U.esc(title)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
              <div class="modal-body">${U.esc(message)}</div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${U.esc(cancelText)}</button>
                <button type="button" class="btn btn-${danger ? 'danger' : 'primary'}" data-ok>${U.esc(confirmText)}</button>
              </div>
            </div>
          </div>
        </div>`);
      document.body.appendChild(el);
      const modal = new bootstrap.Modal(el);
      let ok = false;
      el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; modal.hide(); });
      el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(ok); });
      modal.show();
    });
  }

  function promptText({ title = 'Note', message = '', label = 'Reason', confirmText = 'Save', danger = false } = {}) {
    return new Promise(resolve => {
      const el = U.el(`
        <div class="modal fade" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header"><h5 class="modal-title">${U.esc(title)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
              <form class="modal-body">
                <p class="mb-2">${U.esc(message)}</p>
                <label class="form-label">${U.esc(label)}</label>
                <input class="form-control" data-value required>
              </form>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-${danger ? 'danger' : 'primary'}" data-ok>${U.esc(confirmText)}</button>
              </div>
            </div>
          </div>
        </div>`);
      document.body.appendChild(el);
      const modal = new bootstrap.Modal(el);
      const input = el.querySelector('[data-value]');
      let value = null;
      el.querySelector('[data-ok]').addEventListener('click', () => {
        if (!input.value.trim()) { input.focus(); return; }
        value = input.value.trim();
        modal.hide();
      });
      el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); el.querySelector('[data-ok]').click(); });
      el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(value); });
      el.addEventListener('shown.bs.modal', () => input.focus());
      modal.show();
    });
  }

  function skeleton(cards = 4) {
    return `<div class="row g-3">${Array.from({ length: cards }, () => `
      <div class="col-6 col-lg-3"><div class="card"><div class="card-body">
        <div class="skeleton skeleton-line w-50"></div>
        <div class="skeleton skeleton-line skeleton-lg w-75 mt-2"></div>
      </div></div></div>`).join('')}</div>`;
  }

  return {
    buildNav, route, render, onDataChange, renderSyncStatus, updateBadges, toast, confirm, promptText, skeleton,
    current: () => current && current.name,
    showSkeleton: () => { $('#page-content').innerHTML = skeleton(); }
  };
})();

Views.notfound = {
  title: 'Not found',
  render(el) {
    el.innerHTML = `<div class="card"><div class="card-body text-center py-5">
      <h5>That page is not in the app.</h5>
      <a class="btn btn-primary mt-2" href="#/home">Back home</a>
    </div></div>`;
  }
};

const Search = (() => {
  const LIMIT = 6;
  let modal, input, box;

  function open() {
    if (!Auth.isLoggedIn()) return;
    input.value = '';
    show('');
    modal.show();
  }

  function find(q) {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    const has = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(n));
    const recent = (a, b, f) => String(b[f] || '').localeCompare(String(a[f] || ''));
    const groups = [
      {
        title: 'Parties', icon: 'bx-user', tone: 'violet',
        rows: Store.list('Parties').filter(p => has(p.name, p.phone, p.gstin))
          .map(p => ({ href: `#/parties/${encodeURIComponent(p.id)}`, title: p.name, sub: [p.phone, p.gstin].filter(Boolean).join(' · ') }))
      },
      {
        title: 'Orders', icon: 'bx-briefcase', tone: 'rose',
        rows: Store.list('Jobs').filter(j => has(j.job_no, Books.partyName(j.party_id), j.site_address)).sort((a, b) => recent(a, b, 'date'))
          .map(j => ({ href: `#/orders/${encodeURIComponent(j.id)}`, title: `${j.job_no || 'Order'} · ${Books.partyName(j.party_id)}`, sub: `${U.fmtDate(j.date)} · ${j.status}` }))
      },
      {
        title: 'Estimates', icon: 'bx-file', tone: 'blue',
        rows: Store.list('Estimates').filter(e => has(e.estimate_no, Books.partyName(e.party_id))).sort((a, b) => recent(a, b, 'date'))
          .map(e => ({ href: `#/estimates/${encodeURIComponent(e.id)}`, title: `${e.estimate_no || 'Estimate'} · ${Books.partyName(e.party_id)}`, sub: `${U.fmtDate(e.date)} · ${U.inr(e.total)}` }))
      },
      {
        title: 'Invoices', icon: 'bx-receipt', tone: 'amber',
        rows: Store.list('Invoices').filter(i => has(i.invoice_no, i.buyer_name)).sort((a, b) => recent(a, b, 'date'))
          .map(i => ({ href: `#/invoices/${encodeURIComponent(i.id)}`, title: `${i.invoice_no || 'Invoice'} · ${i.buyer_name || ''}`, sub: `${i.tax_mode === 'gst' ? 'GST' : 'Without GST'} · ${U.inr(i.total)}` }))
      },
      {
        title: 'Materials', icon: 'bx-package', tone: 'green',
        rows: Store.list('Materials').filter(m => has(m.name, m.unit))
          .map(m => ({ href: `#/materials/${encodeURIComponent(m.id)}`, title: m.name, sub: `${Books.onHand(m.id)} ${m.unit || ''} on hand` }))
      },
      {
        title: 'Purchases', icon: 'bx-cart', tone: 'blue',
        rows: Store.list('Purchases').filter(p => has(p.purchase_no, Books.partyName(p.party_id))).sort((a, b) => recent(a, b, 'date'))
          .map(p => ({ href: `#/purchases/${encodeURIComponent(p.id)}`, title: `${p.purchase_no || 'Purchase'} · ${Books.partyName(p.party_id)}`, sub: `${U.fmtDate(p.date)} · ${U.inr(p.total)}` }))
      }
    ];
    return groups.filter(g => g.rows.length);
  }

  function show(q) {
    if (!q.trim()) {
      box.innerHTML = `<div class="search-empty"><i class="bx bx-search-alt"></i><div>Type a party, phone, order, estimate, invoice, material or purchase.</div></div>`;
      return;
    }
    const groups = find(q);
    if (!groups.length) {
      box.innerHTML = `<div class="search-empty"><i class="bx bx-search"></i><div>Nothing matches “${U.esc(q.trim())}”.</div></div>`;
      return;
    }
    box.innerHTML = groups.map(g => `
      <div class="search-group">
        <div class="search-group-title">${g.title}</div>
        ${g.rows.slice(0, LIMIT).map(r => `
          <a href="${r.href}" class="search-row">
            <span class="action-icon action-icon-sm tone-${g.tone}"><i class="bx ${g.icon}"></i></span>
            <span class="min-w-0"><span class="search-row-title">${U.esc(r.title)}</span><span class="search-row-sub">${U.esc(r.sub)}</span></span>
            <i class="bx bx-chevron-right ms-auto text-muted"></i>
          </a>`).join('')}
      </div>`).join('');
  }

  function init() {
    const el = document.getElementById('search-modal');
    modal = bootstrap.Modal.getOrCreateInstance(el);
    input = document.getElementById('search-input');
    box = document.getElementById('search-results');
    document.querySelectorAll('[data-search-open]').forEach(b => b.addEventListener('click', open));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    });
    el.addEventListener('shown.bs.modal', () => input.focus());
    input.addEventListener('input', U.debounce(() => show(input.value), 120));
    box.addEventListener('click', e => { if (e.target.closest('.search-row')) modal.hide(); });
  }

  return { init, open };
})();
