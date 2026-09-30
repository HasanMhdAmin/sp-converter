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
  var RATES_API_URL = 'https://sp-proxy-test.eng-amin-h.workers.dev/';
  var RATES_API_CITY = 'damascus';
  var BANKNOTES = [500, 200, 100, 50, 25, 10]; // new S.P. notes, largest first

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
  // Old S.P. is new S.P. × 100, so it gets two more integer digits.
  function sanitizeOld(str) { return sanitizeDecimal(str, 13, 2); }
  function sanitizeRate(str) { return sanitizeDecimal(str, 7, 4); }

  // Add thousands separators to a sanitized string, keeping a trailing "." or typed decimals.
  function groupDigits(clean) {
    if (clean === '') return '';
    var parts = clean.split('.');
    var intPart = parts[0] === '' ? '0' : parts[0];
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? intPart + '.' + parts[1] : intPart;
  }

  // Inputs are already sanitized on input; just drop the thousands separators.
  function parseAmount(str) {
    var n = parseFloat(normalizeDigits(str).replace(/[^\d.]/g, ''));
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
    source: 'foreign', // which field the user last edited: 'foreign' | 'sp' | 'old'
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
    oldSpInput: $('oldSpInput'),
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
    syncRates: $('syncRates'),
    syncLabel: $('syncLabel'),
    syncStatus: $('syncStatus'),
    installBanner: $('installBanner'),
    installBtn: $('installBtn'),
    dismissInstall: $('dismissInstall'),
    showInstall: $('showInstall'),
    toast: $('toast'),
    notesGrid: $('notesGrid'),
    notesFeedback: $('notesFeedback'),
    suggestNotes: $('suggestNotes'),
    resetNotes: $('resetNotes')
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
    var v = state.value;
    // Everything is derived from the new S.P. amount; the edited field is left as typed.
    var spValue = v === null ? null
      : state.source === 'foreign' ? v * rate
      : state.source === 'old' ? v / OLD_SP_FACTOR
      : v;

    if (state.source !== 'foreign') el.foreignInput.value = formatAmount(spValue === null ? null : spValue / rate);
    if (state.source !== 'sp') el.spInput.value = formatAmount(spValue);
    if (state.source !== 'old') el.oldSpInput.value = formatAmount(spValue === null ? null : spValue * OLD_SP_FACTOR);
    fitAmounts();
    renderNotes(spValue === null ? null : round2(spValue));
  }

  // Shrink the font for long numbers so they stay fully visible on narrow screens.
  function fitAmounts() {
    [el.foreignInput, el.spInput, el.oldSpInput].forEach(function (input) {
      var len = input.value.length;
      input.classList.toggle('long', len > 10 && len <= 14);
      input.classList.toggle('xlong', len > 14);
    });
  }

  function onAmountInput(source) {
    var sanitizer = source === 'old' ? sanitizeOld : sanitize;
    return function (e) {
      reformatInput(e.target, sanitizer);
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

  // ---------- banknotes ----------
  // Fewest notes that cover as much of `amount` as possible using only `notes`.
  // Uses the largest note for the bulk, then an exact DP over the last few thousand,
  // so it finds e.g. 30 = 10 × 3 where a greedy 25 + ... would get stuck.
  function breakdown(amount, notes) {
    var counts = {};
    notes.forEach(function (n) { counts[n] = 0; });
    var whole = Math.floor(amount);
    if (!notes.length || whole <= 0) return { counts: counts, covered: 0, total: 0 };

    var largest = Math.max.apply(null, notes);
    var bulk = Math.max(0, Math.floor(whole / largest) - 10);
    var rest = whole - bulk * largest;

    var best = [0], via = [0];
    for (var v = 1; v <= rest; v++) {
      best[v] = Infinity;
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        if (n <= v && best[v - n] + 1 < best[v]) { best[v] = best[v - n] + 1; via[v] = n; }
      }
    }
    var reach = rest;
    while (reach > 0 && best[reach] === Infinity) reach--;

    for (var x = reach; x > 0; x -= via[x]) counts[via[x]]++;
    counts[largest] += bulk;
    return { counts: counts, covered: reach + bulk * largest, total: best[reach] + bulk };
  }

  // How many of each note the user has tapped in.
  var noteCounts = {};
  BANKNOTES.forEach(function (n) { noteCounts[n] = 0; });
  var targetAmount = null;

  function buildNotes() {
    BANKNOTES.forEach(function (n) {
      var tile = document.createElement('div');
      tile.className = 'note-tile';
      tile.dataset.value = n;
      tile.innerHTML =
        '<button type="button" class="note">' +
          '<img src="assets/notes/' + n + '.jpg" alt="" width="360" height="165" loading="lazy" decoding="async">' +
          '<span class="note-label">' + n + ' ل.س</span>' +
        '</button>' +
        '<span class="note-count" dir="ltr" aria-hidden="true">×0</span>' +
        '<button type="button" class="note-minus" aria-label="إنقاص ورقة ' + n + '">−</button>';
      tile.querySelector('.note').addEventListener('click', function () { changeNote(n, 1); });
      tile.querySelector('.note-minus').addEventListener('click', function () { changeNote(n, -1); });
      el.notesGrid.appendChild(tile);
    });
  }

  function changeNote(n, delta) {
    noteCounts[n] = Math.max(0, noteCounts[n] + delta);
    renderNotes(targetAmount);
  }

  function setAllNotes(counts) {
    BANKNOTES.forEach(function (n) { noteCounts[n] = counts[n] || 0; });
    renderNotes(targetAmount);
  }

  // Arabic counted noun: 1 ورقة واحدة, 2 ورقتان, 3–10 أوراق, otherwise ورقة.
  function countNotes(n) {
    if (n === 1) return 'ورقة واحدة';
    if (n === 2) return 'ورقتان';
    var lastTwo = n % 100;
    return amountFormat.format(n) + (lastTwo >= 3 && lastTwo <= 10 ? ' أوراق' : ' ورقة');
  }

  function setNotesFeedback(html, kind) {
    el.notesFeedback.innerHTML = html;
    el.notesFeedback.className = 'notes-feedback' + (kind ? ' ' + kind : '');
  }

  function sp(n) { return '<span class="nowrap"><bdi dir="ltr">' + formatAmount(n) + '</bdi> ل.س</span>'; }

  function renderNotes(amount) {
    targetAmount = amount;
    var sum = 0, pieces = 0;

    Array.prototype.forEach.call(el.notesGrid.children, function (tile) {
      var n = Number(tile.dataset.value);
      var count = noteCounts[n];
      sum += n * count;
      pieces += count;
      tile.classList.toggle('empty', count === 0);
      tile.querySelector('.note-count').textContent = '×' + count;
      tile.querySelector('.note').setAttribute('aria-label',
        'إضافة ورقة ' + n + ' ليرة، العدد الحالي ' + count);
    });

    var total = 'المجموع <strong>' + sp(sum) + '</strong>' + (pieces ? ' (' + countNotes(pieces) + ')' : '');

    if (!amount) {
      setNotesFeedback(pieces ? total + '. أدخل المبلغ المطلوب للمقارنة.' : 'أدخل مبلغاً ثم اضغط على الأوراق لعدّها.');
    } else if (!pieces) {
      setNotesFeedback('المطلوب <strong>' + sp(amount) + '</strong>. اضغط على الأوراق لعدّها.');
    } else {
      var diff = round2(sum - amount);
      if (diff === 0) setNotesFeedback('✓ المبلغ مطابق: ' + total + '.', 'ok');
      else if (diff < 0) setNotesFeedback(total + ' — ينقص <strong>' + sp(-diff) + '</strong>.', 'missing');
      else setNotesFeedback(total + ' — زيادة <strong>' + sp(diff) + '</strong>.', 'over');
    }

    el.suggestNotes.disabled = !amount;
    el.resetNotes.disabled = !pieces;
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
    setSyncStatus('');
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

  // ---------- sync rates from API ----------
  // The API quotes old S.P. per unit; the app stores new S.P. (old / 100).
  function extractRates(json) {
    var list = json && json.ok && json.data && json.data.rates;
    if (!Array.isArray(list)) throw new Error('bad response');
    var result = {};
    ['USD', 'EUR'].forEach(function (code) {
      var entry = list.filter(function (r) { return r.code === code; })[0];
      var buy = entry && entry.cities && entry.cities[RATES_API_CITY] && entry.cities[RATES_API_CITY].buy;
      if (!(typeof buy === 'number' && buy > 0)) throw new Error('missing ' + code);
      result[code] = Math.round(buy / OLD_SP_FACTOR * 10000) / 10000;
    });
    result.updatedAt = json.data.currencies_updated_at || null;
    return result;
  }

  function setSyncStatus(msg, isError) {
    el.syncStatus.textContent = msg;
    el.syncStatus.hidden = !msg;
    el.syncStatus.classList.toggle('error', !!isError);
  }

  function setSyncBusy(busy) {
    el.syncRates.disabled = busy;
    el.syncRates.setAttribute('aria-busy', busy ? 'true' : 'false');
    el.syncLabel.textContent = busy ? 'جارٍ المزامنة…' : 'مزامنة الأسعار من الإنترنت';
  }

  function syncRates() {
    setSyncBusy(true);
    setSyncStatus('');
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 10000);

    fetch(RATES_API_URL, { cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var rates = extractRates(json);
        el.rateUsdInput.value = groupDigits(sanitizeRate(String(rates.USD)));
        el.rateEurInput.value = groupDigits(sanitizeRate(String(rates.EUR)));
        clearSettingsError();

        var ts = rates.updatedAt ? new Date(rates.updatedAt) : null;
        var when = ts && !isNaN(ts.getTime()) ? ' (تحديث المصدر: ' + (dateFormat ? dateFormat.format(ts) : ts.toLocaleString()) + ')' : '';
        setSyncStatus('تم جلب سعر الشراء في دمشق' + when + '. اضغط «حفظ» لتطبيقه.');
      })
      .catch(function () {
        setSyncStatus('تعذّرت المزامنة. تحقق من الاتصال بالإنترنت وحاول مجدداً.', true);
      })
      .then(function () {
        clearTimeout(timer);
        setSyncBusy(false);
      });
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
  [el.foreignInput, el.spInput, el.oldSpInput, el.rateUsdInput, el.rateEurInput].forEach(function (input) {
    input.addEventListener('beforeinput', handleBeforeInput);
  });
  el.foreignInput.addEventListener('input', onAmountInput('foreign'));
  el.spInput.addEventListener('input', onAmountInput('sp'));
  el.oldSpInput.addEventListener('input', onAmountInput('old'));
  [el.foreignInput, el.spInput, el.oldSpInput].forEach(function (input) {
    input.addEventListener('blur', onAmountBlur);
  });
  el.rateUsdInput.addEventListener('input', onRateInput);
  el.rateEurInput.addEventListener('input', onRateInput);

  el.suggestNotes.addEventListener('click', function () {
    if (targetAmount) setAllNotes(breakdown(targetAmount, BANKNOTES).counts);
  });
  el.resetNotes.addEventListener('click', function () { setAllNotes({}); });

  el.clearBtn.addEventListener('click', function () {
    state.value = null;
    state.source = 'foreign';
    el.foreignInput.value = '';
    render();
    el.foreignInput.focus();
  });

  el.openSettings.addEventListener('click', openSettings);
  el.cancelSettings.addEventListener('click', closeSettings);
  el.syncRates.addEventListener('click', syncRates);
  el.form.addEventListener('submit', saveSettings);
  // Close the sheet when tapping the backdrop.
  el.dialog.addEventListener('click', function (e) {
    if (e.target === el.dialog) closeSettings();
  });

  // ---------- init ----------
  buildNotes();
  renderRates();
  setCurrency(state.currency);
  setupInstall();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
    });
  }
})();
