/** Formatting, ids, dates, Indian currency. */
const U = (() => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');

  return {
    uuid() {
      if (crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
    },

    nowIso: () => new Date().toISOString(),

    today(d = new Date()) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },

    /** Financial year label for an invoice date. 2026-11-25 → 2026-27. April–March. */
    fy(ymd) {
      const s = String(ymd || U.today()).slice(0, 10);
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(5, 7));
      const start = m >= 4 ? y : y - 1;
      return `${start}-${pad((start + 1) % 100)}`;
    },

    addMonths(ymd, delta) {
      const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
      const dt = new Date(y, m - 1 + delta, 1);
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
    },

    fmtDate(ymd) {
      if (!ymd) return '';
      const [y, m, d] = String(ymd).slice(0, 10).split('-');
      if (!d) return String(ymd);
      return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
    },

    fmtDateTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
    },

    timeAgo(iso) {
      if (!iso) return 'never';
      const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 10) return 'just now';
      if (s < 60) return `${s}s ago`;
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      return U.fmtDateTime(iso);
    },

    daysUntil(ymd) {
      const [y, m, d] = String(ymd).split('-').map(Number);
      const target = new Date(y, m - 1, d);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.round((target - today) / 86400000);
    },

    round2: n => Math.round((Number(n) || 0) * 100) / 100,

    inr(n) {
      const v = U.round2(n);
      const s = '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
      return v < 0 ? '-' + s : s;
    },

    money(n) {
      return U.round2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    inWords(n) {
      const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
        'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      const two = x => x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? ' ' + ONES[x % 10] : '');
      const three = x => [x >= 100 ? ONES[Math.floor(x / 100)] + ' Hundred' : '', two(x % 100)].filter(Boolean).join(' ');
      const words = x => {
        if (!x) return '';
        return [
          x >= 1e7 ? words(Math.floor(x / 1e7)) + ' Crore' : '',
          Math.floor(x / 1e5) % 100 ? two(Math.floor(x / 1e5) % 100) + ' Lakh' : '',
          Math.floor(x / 1000) % 100 ? two(Math.floor(x / 1000) % 100) + ' Thousand' : '',
          three(x % 1000)
        ].filter(Boolean).join(' ');
      };
      const v = U.round2(Math.abs(n));
      const rupees = Math.floor(v);
      const paise = Math.round((v - rupees) * 100);
      return `Rupees ${words(rupees) || 'Zero'}${paise ? ' and ' + two(paise) + ' Paise' : ''} Only`;
    },

    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    isPhone: s => /^\d{10}$/.test(String(s || '')),

    isGstin: s => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i.test(String(s || '').trim()),

    debounce(fn, ms) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },

    el(html) {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    },

    /** "12 × 4" when both sizes are set. */
    size(w, h) {
      const ww = Number(w) || 0;
      const hh = Number(h) || 0;
      if (ww > 0 && hh > 0) return `${ww} × ${hh}`;
      if (ww > 0) return String(ww);
      return '';
    }
  };
})();
