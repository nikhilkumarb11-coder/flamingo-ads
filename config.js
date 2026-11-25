/**
 * The only file you normally edit after setup.
 * apiUrl: Apps Script web app URL ending in /exec.
 * Leave it empty to keep the books on this device until the Sheet is connected.
 */
window.APP_CONFIG = {
  version: '0.2.0',
  companyName: 'Flamingo Ads',
  shortName: 'Flamingo',
  tagline: 'PRINT | SIGN | DISPLAY',
  logo: 'assets/logo.jpg',

  apiUrl: 'https://script.google.com/macros/s/AKfycbxQqtwYqzp3uEazuDWlfcPMqy475dLhCgdmC-zYCFTPSzzIV0vEiZnBoDHmj8rPXIVD/exec',

  syncIntervalMs: 45000,
  reminderDays: 5
};
