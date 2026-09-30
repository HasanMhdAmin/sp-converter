(function () {
  'use strict';

  var DEFAULT_RATES = { USD: 137.5, EUR: 155 };
  var OLD_SP_FACTOR = 100;
  var KEYS = {
    rateUSD: 'rateUSD',
    rateEUR: 'rateEUR',
    updatedAt: 'ratesUpdatedAt',
    currency: 'activeCurrency',
    installDismissed: 'installHintDismissed'
  };
  var CURRENCY_NAMES = { USD: 'دولار أمريكي', EUR: 'يورو' };

  var amountFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  var rateFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
  var dateFormat = safeDateFormat();

  // ---------- storage ----------
  function store(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* storage unavailable */ }
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function loadRate(key, fallback) {
    var value = parseFloat(load(key));
    if (isFinite(value) && value > 0) return value;
    store(key, fallback);
    return fallback;
  }

  // ---------- number helpers ----------
  // Round to 2 decimals without float artifacts (e.g. 1.005 -> 1.01).
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Convert Eastern Arabic / Persian digits and Arabic separators to plain ASCII.
  function normalizeDigits(str) {
    return str
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/٫/g, '.')   // Arabic decimal separator
      .replace(/٬/g, ',');  // Arabic thousands separator
  }

  // Keep only digits and a single decimal point, limited to maxInt integer digits
  // (keeps results within exact float precision) and maxDecimals decimals.
  function sanitizeDecimal(str, maxInt, maxDecimals) {
    var clean = normalizeDigits(str).replace(/[^\d.]/g, '');
    var dot = clean.indexOf('.');
    var intPart = dot === -1 ? clean : clean.slice(0, dot);
    // Drop redundant leading zeros ("007" -> "7", but keep "0.5").
    intPart = intPart.replace(/^0+(?=\d)/, '').slice(0, maxInt);
    if (dot === -1) return intPart;
    return intPart + '.' + clean.slice(dot + 1).replace(/\./g, '').slice(0, maxDecimals);
  }

  function sanitize(str) { return sanitizeDecimal(str, 11, 2); }
  function sanitizeRate(str) { return sanitizeDecimal(str, 7, 4); }

  // Add thousands separators to a sanitized string, keeping a trailing "." or typed decimals.
  function groupDigits(clean) {
    if (clean === '') return '';
    var parts = clean.split('.');
    var intPart = parts[0] === '' ? '0' : parts[0];
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? intPart + '.' + parts[1] : intPart;
  }

  function parseAmount(str) {
    var n = parseFloat(sanitize(str));
    return isFinite(n) ? n : null;
  }

  function formatAmount(n) {
    return n === null ? '' : amountFormat.format(round2(n));
  }

  function safeDateFormat() {
    try {
      return new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return null;
    }
  }

  // ---------- state ----------
  var state = {
    rates: {
      USD: loadRate(KEYS.rateUSD, DEFAULT_RATES.USD),
      EUR: loadRate(KEYS.rateEUR, DEFAULT_RATES.EUR)
    },
    updatedAt: load(KEYS.updatedAt),
    currency: load(KEYS.currency) === 'EUR' ? 'EUR' : 'USD',
    source: 'foreign', // which field the user last edited: 'foreign' | 'sp'
    value: null        // numeric value of that field
  };

  // ---------- elements ----------
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    tabs: Array.prototype.slice.call(document.querySelectorAll('.tab')),
    panel: $('converter'),
    foreignInput: $('foreignInput'),
    foreignLabel: $('foreignLabel'),
    foreignUnit: $('foreignUnit'),
    spInput: $('spInput'),
    oldSp: $('oldSpOutput'),
    clearBtn: $('clearBtn'),
    rateUsdText: $('rateUsdText'),
    rateEurText: $('rateEurText'),
    ratesUpdated: $('ratesUpdated'),
    openSettings: $('openSettings'),
    dialog: $('settingsDialog'),
    form: $('settingsForm'),
    rateUsdInput: $('rateUsdInput'),
    rateEurInput: $('rateEurInput'),
    settingsError: $('settingsError'),
    cancelSettings: $('cancelSettings'),
    resetRates: $('resetRates'),
    installBanner: $('installBanner'),
    installBtn: $('installBtn'),
    dismissInstall: $('dismissInstall'),
    showInstall: $('showInstall'),
    toast: $('toast')
  };

  // ---------- live-formatting inputs ----------
  // Reformat an input with thousands separators while keeping the caret in place.
  function reformatInput(input, sanitizer) {
    var raw = input.value;
    var caret = input.selectionStart == null ? raw.length : input.selectionStart;
    // Count meaningful characters (digits / dot) before the caret.
    var before = sanitizeCount(raw.slice(0, caret));
    var clean = sanitizer(raw);
    // A leading "." gets a "0" in front; shift the caret past it.
    if (clean.charAt(0) === '.') { clean = '0' + clean; before++; }
    var formatted = groupDigits(clean);
    input.value = formatted;

    var pos = 0, seen = 0;
    while (pos < formatted.length && seen < before) {
      if (formatted[pos] !== ',') seen++;
      pos++;
    }
    try { input.setSelectionRange(pos, pos); } catch (e) { /* not focusable */ }
  }

  function sanitizeCount(str) {
    return normalizeDigits(str).replace(/[^\d.]/g, '').length;
  }

  // Treat a typed comma as a decimal point (common on European decimal keypads),
  // since commas are reserved for our own thousands separators. Inserted text like
  // "12,5" is read as a decimal; "1,000" (3 digits after the comma) stays a thousands group.
  function handleBeforeInput(e) {
    if (e.inputType !== 'insertText' && e.inputType !== 'insertFromPaste') return;
    var data = e.data != null ? e.data : (e.dataTransfer && e.dataTransfer.getData('text/plain'));
    if (!data) return;

    var text = normalizeDigits(data).replace(/،/g, ',');
    if (text === ',') text = '.';
    else if (/^\d*,\d{1,2}$/.test(text)) text = text.replace(',', '.');
    if (text === data) return;

    var input = e.target;
    var start = input.selectionStart, end = input.selectionEnd;
    var rest = input.value.slice(0, start) + input.value.slice(end);
    if (rest.indexOf('.') !== -1) text = text.replace(/\./g, '');

    e.preventDefault();
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.setSelectionRange(start + text.length, start + text.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------- conversion ----------
  function currentRate() {
    return state.rates[state.currency];
  }

  function render() {
    var rate = currentRate();
    var spValue = null;

    if (state.source === 'foreign') {
      spValue = state.value === null ? null : state.value * rate;
      el.spInput.value = formatAmount(spValue);
    } else {
      spValue = state.value;
      el.foreignInput.value = formatAmount(spValue === null ? null : spValue / rate);
    }

    el.oldSp.textContent = spValue === null ? '0' : formatAmount(spValue * OLD_SP_FACTOR);
    fitAmounts();
  }

  // Shrink the font for long numbers so they stay fully visible on narrow screens.
  function fitAmounts() {
    [el.foreignInput, el.spInput].forEach(function (input) {
      var len = input.value.length;
      input.classList.toggle('long', len > 10 && len <= 14);
      input.classList.toggle('xlong', len > 14);
    });
  }

  function onAmountInput(source) {
    return function (e) {
      reformatInput(e.target, sanitize);
      state.source = source;
      state.value = parseAmount(e.target.value);
      render();
    };
  }

  // Tidy the edited field on blur (e.g. "12." -> "12").
  function onAmountBlur(e) {
    var n = parseAmount(e.target.value);
    e.target.value = formatAmount(n);
    fitAmounts();
  }

  // ---------- tabs ----------
  function setCurrency(code, focusTab) {
    state.currency = code;
    store(KEYS.currency, code);

    el.tabs.forEach(function (tab) {
      var active = tab.dataset.currency === code;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      if (active && focusTab) tab.focus();
    });
    el.panel.setAttribute('aria-labelledby', 'tab-' + code);
    el.foreignLabel.textContent = CURRENCY_NAMES[code];
    el.foreignUnit.textContent = code;

    // Keep the value the user typed and recompute the other side with the new rate.
    if (state.source === 'foreign') el.foreignInput.value = formatAmount(state.value);
    render();
  }

  el.tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { setCurrency(tab.dataset.currency); });
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var next = el.tabs[(i + 1) % el.tabs.length];
      setCurrency(next.dataset.currency, true);
    });
  });

  // ---------- rates display ----------
  function renderRates() {
    el.rateUsdText.textContent = rateFormat.format(state.rates.USD);
    el.rateEurText.textContent = rateFormat.format(state.rates.EUR);

    var ts = state.updatedAt ? new Date(Number(state.updatedAt)) : null;
    if (ts && !isNaN(ts.getTime())) {
      el.ratesUpdated.textContent = 'آخر تحديث: ' + (dateFormat ? dateFormat.format(ts) : ts.toLocaleString());
      el.ratesUpdated.hidden = false;
    } else {
      el.ratesUpdated.hidden = true;
    }
  }

  // ---------- settings sheet ----------
  function openSettings() {
    el.rateUsdInput.value = groupDigits(sanitizeRate(String(state.rates.USD)));
    el.rateEurInput.value = groupDigits(sanitizeRate(String(state.rates.EUR)));
    clearSettingsError();
    if (typeof el.dialog.showModal === 'function') {
      el.dialog.showModal();
    } else {
      el.dialog.setAttribute('open', '');
    }
  }

  function closeSettings() {
    if (typeof el.dialog.close === 'function') el.dialog.close();
    else el.dialog.removeAttribute('open');
  }

  function parseRate(str) {
    var n = parseFloat(sanitizeRate(str));
    return isFinite(n) && n > 0 ? n : null;
  }

  function clearSettingsError() {
    el.settingsError.hidden = true;
    [el.rateUsdInput, el.rateEurInput].forEach(function (input) {
      input.parentElement.classList.remove('invalid');
      input.removeAttribute('aria-invalid');
    });
  }

  function markInvalid(input) {
    input.parentElement.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
  }

  function saveSettings(e) {
    e.preventDefault();
    clearSettingsError();

    var usd = parseRate(el.rateUsdInput.value);
    var eur = parseRate(el.rateEurInput.value);
    if (usd === null) markInvalid(el.rateUsdInput);
    if (eur === null) markInvalid(el.rateEurInput);
    if (usd === null || eur === null) {
      el.settingsError.hidden = false;
      (usd === null ? el.rateUsdInput : el.rateEurInput).focus();
      return;
    }

    state.rates.USD = usd;
    state.rates.EUR = eur;
    state.updatedAt = String(Date.now());
    store(KEYS.rateUSD, usd);
    store(KEYS.rateEUR, eur);
    store(KEYS.updatedAt, state.updatedAt);

    renderRates();
    render();
    closeSettings();
    showToast('تم حفظ سعر الصرف');
  }

  function onRateInput(e) {
    reformatInput(e.target, sanitizeRate);
    e.target.parentElement.classList.remove('invalid');
  }

  // ---------- toast ----------
  var toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2200);
  }

  // ---------- install / add to home screen ----------
  var deferredPrompt = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    // iPadOS reports itself as a Mac; touch support gives it away.
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    return 'other';
  }

  function setupInstall() {
    if (isStandalone()) return; // already installed — nothing to show

    var platform = detectPlatform();
    // Show only the relevant instructions on phones; show both elsewhere.
    Array.prototype.forEach.call(document.querySelectorAll('.install-steps'), function (block) {
      block.hidden = platform !== 'other' && block.dataset.platform !== platform;
    });

    el.showInstall.hidden = false;
    if (load(KEYS.installDismissed) !== '1') el.installBanner.hidden = false;

    el.dismissInstall.addEventListener('click', function () {
      el.installBanner.hidden = true;
      store(KEYS.installDismissed, '1');
    });
    el.showInstall.addEventListener('click', function () {
      el.installBanner.hidden = false;
      el.installBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      el.installBtn.hidden = false;
    });

    el.installBtn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        el.installBtn.hidden = true;
      });
    });

    window.addEventListener('appinstalled', function () {
      el.installBanner.hidden = true;
      el.showInstall.hidden = true;
      store(KEYS.installDismissed, '1');
    });
  }

  // ---------- wiring ----------
  [el.foreignInput, el.spInput, el.rateUsdInput, el.rateEurInput].forEach(function (input) {
    input.addEventListener('beforeinput', handleBeforeInput);
  });
  el.foreignInput.addEventListener('input', onAmountInput('foreign'));
  el.spInput.addEventListener('input', onAmountInput('sp'));
  el.foreignInput.addEventListener('blur', onAmountBlur);
  el.spInput.addEventListener('blur', onAmountBlur);
  el.rateUsdInput.addEventListener('input', onRateInput);
  el.rateEurInput.addEventListener('input', onRateInput);

  el.clearBtn.addEventListener('click', function () {
    state.value = null;
    state.source = 'foreign';
    el.foreignInput.value = '';
    render();
    el.foreignInput.focus();
  });

  el.openSettings.addEventListener('click', openSettings);
  el.cancelSettings.addEventListener('click', closeSettings);
  el.form.addEventListener('submit', saveSettings);
  el.resetRates.addEventListener('click', function () {
    el.rateUsdInput.value = groupDigits(sanitizeRate(String(DEFAULT_RATES.USD)));
    el.rateEurInput.value = groupDigits(sanitizeRate(String(DEFAULT_RATES.EUR)));
    clearSettingsError();
  });
  // Close the sheet when tapping the backdrop.
  el.dialog.addEventListener('click', function (e) {
    if (e.target === el.dialog) closeSettings();
  });

  // ---------- init ----------
  renderRates();
  setCurrency(state.currency);
  setupInstall();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
    });
  }
})();
