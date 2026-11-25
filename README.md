# Flamingo Ads

Estimates, jobs, tax invoices and invoices without GST for the sign shop. The screen reads from this device. A Google Sheet is the shared copy when you connect one.

Two invoice series, assigned on the server (or on this device until the Sheet is connected):

- With GST: `GST/2026-27/001`, heading **Tax Invoice**
- Without GST: `BILL/2026-27/001`, heading **Invoice**

The year runs April–March. A voided number is not reused. A job may come from an estimate, or stand on its own.

## Open the app

https://nikhilkumarb11-coder.github.io/flamingo-ads/

Log in with the Sheet password. On a phone or the shop computer, open that address, then Settings → **Install app**.

## Try it on this computer

Open the folder with a local server (a file URL blocks the database):

```
python -m http.server 8765
```

Then open `http://localhost:8765`.

## Share the books (one-time)

1. Create a Google Sheet, for example `Flamingo Ads`.
2. Extensions → Apps Script. Paste `apps-script/Code.gs`, and set the project time zone to `(GMT+05:30) India Standard Time`.
3. Run `setup`. Allow the permissions. The menu **Flamingo Ads** appears on the Sheet.
4. Flamingo Ads → Set app password.
5. Deploy → New deployment → Web app. Execute as **Me**. Who has access: **Anyone**. Copy the URL that ends in `/exec`.
6. Paste that URL into `config.js` → `apiUrl`.
7. On any device that was used before the Sheet existed: Settings → Clear this device, then log in with the Sheet password.

When `Code.gs` changes later: paste, save, Deploy → Manage deployments → pencil → New version → Deploy. The URL stays the same.

## What is in this build

Parties, services, estimates, jobs, both invoice series, receipts, and printable bills.

Stock moves when you record a purchase or issue material to a job. Estimates and invoices do not change stock. Purchases increase what you owe. Payments out and expenses reduce cash or bank. Reports cover the sales register (both series), the GST register (GST series only), the daybook, outstanding, stock, and expenses by category.

Opening receivable, payable, cash and bank are on the party and in Settings, ready for the day you leave Vyapar.

If a Sheet was set up on the earlier build, paste the new `Code.gs`, save, and run `setup` again so the Materials, Purchases, and Expenses tabs appear. Then publish a new web app version. The URL stays the same.

## Install on a phone or the shop computer

Open the hosted site over https, log in, then Settings → **Install app**. Chrome, Edge, and Android show that button. iPhone uses Safari → Share → Add to Home Screen. The preview address `localhost` does not offer install.

## Releasing a change

Bump every `?v=` in `index.html` and `VERSION` in `sw.js` to the same number. Phones keep the previous files until that number changes.
