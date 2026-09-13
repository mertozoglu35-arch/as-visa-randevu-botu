import { chromium } from 'playwright-core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HUB = 'https://appointment.as-visa.com/en/istanbul-piyalepasa';
const FALLBACK_TARGETS = [
  { id: 'hu-ist', country: 'Macaristan', city: 'Istanbul', url: 'https://appointment.as-visa.com/en/istanbul-hungary-individual-appointment' },
  { id: 'pt-ist', country: 'Portekiz', city: 'Istanbul', url: 'https://appointment.as-visa.com/en/istanbul-portugal-individual-appointment' },
  { id: 'si-ist', country: 'Slovenya', city: 'Istanbul', url: 'https://appointment.as-visa.com/en/istanbul-slovenia-individual-appointment' },
  { id: 'hu-ank', country: 'Macaristan', city: 'Ankara', url: 'https://appointment.as-visa.com/en/ankara-hungary-individual-appointment' }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function output(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  fs.appendFileSync(file, `${name}=${String(value).replace(/\n/g, ' ')}\n`);
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p));
}

function normalizeDiscovered(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(x => x && x.url && /appointment\.as-visa\.com/i.test(x.url))
    .map((x, i) => ({ id: x.id || `discovered-${i}`, country: x.country || 'Bilinmeyen', city: x.city || 'Istanbul', url: x.url }));
}

function mergeTargets(discovered) {
  const map = new Map();
  for (const d of discovered) map.set(`${d.country}-${d.city}`.toLocaleLowerCase('tr-TR'), d);
  for (const f of FALLBACK_TARGETS) {
    const key = `${f.country}-${f.city}`.toLocaleLowerCase('tr-TR');
    if (!map.has(key)) map.set(key, f);
  }
  return [...map.values()].filter(t => ['macaristan', 'portekiz', 'slovenya'].includes(t.country.toLocaleLowerCase('tr-TR')));
}

function discoverIstanbulLinks() {
  const countryFor = text => {
    const t = String(text || '').toLowerCase();
    if (t.includes('hungary') || t.includes('macar')) return 'Macaristan';
    if (t.includes('portugal') || t.includes('portek')) return 'Portekiz';
    if (t.includes('slovenia') || t.includes('sloven')) return 'Slovenya';
    return null;
  };
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const country = countryFor(`${a.innerText} ${a.getAttribute('title') || ''} ${a.href}`);
    if (!country || !/appointment/i.test(a.href)) continue;
    try {
      const u = new URL(a.href, location.href);
      if (u.hostname !== 'appointment.as-visa.com') continue;
      out.push({ id: `${country.toLowerCase()}-ist`, country, city: 'Istanbul', url: u.href });
    } catch (_) {}
  }
  const unique = [];
  const seen = new Set();
  for (const x of out) {
    if (!seen.has(x.country)) {
      seen.add(x.country);
      unique.push(x);
    }
  }
  return unique;
}

async function scanAppointmentPage(config) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').toLowerCase().replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\s+/g, ' ').trim();
  const visible = el => {
    if (!el) return false;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };

  const pageText = norm(document.body?.innerText || '');
  if (/cloudflare|verify you are human|captcha|access denied|forbidden|guvenlik dogrulamasi|insan oldugunuzu dogrulayin|just a moment/.test(pageText)) {
    return { status: 'challenge', slots: [], note: 'CAPTCHA veya erisim dogrulamasi goruldu.' };
  }
  if (!/appointment|randevu|make an appointment/.test(pageText)) {
    return { status: 'error', slots: [], error: 'Randevu formu bulunamadi; sayfa yapisi degismis veya erisim engellenmis olabilir.' };
  }

  const getLabel = el => {
    const id = el.id;
    const direct = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    if (direct) return norm(direct.innerText);
    const parent = el.closest('.form-group,.mb-3,.row,.col,.col-md-6,.col-lg-6,div');
    return norm(`${el.name || ''} ${el.id || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${parent?.innerText?.slice(0, 220) || ''}`);
  };

  const classify = el => {
    const t = getLabel(el);
    if (/appointment type|randevu tipi|randevu turu/.test(t)) return 'type';
    if (/nationality|uyruk|vatandas/.test(t)) return 'nationality';
    if (/appointment description|randevu aciklama/.test(t)) return 'description';
    if (/travel purpose|seyahat amac/.test(t)) return 'purpose';
    if (/travel date|seyahat tarih/.test(t)) return 'travelDate';
    if (/appointment date|randevu tarih/.test(t)) return 'appointmentDate';
    if (/appointment time|randevu saat/.test(t)) return 'time';
    return null;
  };

  const selectMap = {};
  const inputMap = {};
  for (const s of document.querySelectorAll('select')) {
    const k = classify(s); if (k && !selectMap[k]) selectMap[k] = s;
  }
  for (const i of document.querySelectorAll('input')) {
    const k = classify(i); if (k && !inputMap[k]) inputMap[k] = i;
  }

  const options = sel => !sel ? [] : [...sel.options]
    .filter(o => o.value && !o.disabled && !/select|seciniz|please/i.test(o.textContent || ''))
    .map(o => ({ value: o.value, text: (o.textContent || '').trim() }));

  const setSelect = async (sel, value) => {
    if (!sel) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(sel, value); else sel.value = value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800);
  };

  if (selectMap.nationality) {
    const needle = norm(config.nationalityNeedle || 'tur');
    const opts = options(selectMap.nationality);
    const cand = opts.find(o => norm(`${o.text} ${o.value}`).includes(needle)) || opts[0];
    if (cand) await setSelect(selectMap.nationality, cand.value);
  }

  const setInputValue = (input, value) => {
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const datePlus = days => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { iso: `${yyyy}-${mm}-${dd}`, tr: `${dd}.${mm}.${yyyy}`, slash: `${dd}/${mm}/${yyyy}` };
  };

  if (inputMap.travelDate) {
    const d = datePlus(Number(config.travelDateOffsetDays || 90));
    let val = d.iso;
    const ph = norm(inputMap.travelDate.placeholder || '');
    if (/dd\.mm|gg\.aa|\.yyyy/.test(ph)) val = d.tr;
    else if (/dd\/mm|gg\/aa/.test(ph)) val = d.slash;
    setInputValue(inputMap.travelDate, val);
    await sleep(800);
  }

  const pickFirstIfNeeded = async sel => {
    if (!sel || sel.value) return;
    const opts = options(sel);
    if (opts[0]) await setSelect(sel, opts[0].value);
  };
  await pickFirstIfNeeded(selectMap.type);
  await pickFirstIfNeeded(selectMap.description);

  const purposeOptions = options(selectMap.purpose);
  const work = purposeOptions.length ? purposeOptions : [{ value: selectMap.purpose?.value || '', text: selectMap.purpose?.selectedOptions?.[0]?.textContent?.trim() || '' }];
  const slots = [];
  const details = [];

  async function scanCurrentPurpose(purposeText) {
    await sleep(600);
    const timeSel = selectMap.time || [...document.querySelectorAll('select')].find(s => classify(s) === 'time');
    const timeOpts = options(timeSel);
    if (timeOpts.length) {
      const appointmentDateEl = inputMap.appointmentDate || [...document.querySelectorAll('input')].find(i => classify(i) === 'appointmentDate');
      const dateValue = appointmentDateEl?.value || '';
      for (const t of timeOpts) slots.push({ date: dateValue, time: t.text, purpose: purposeText });
      return;
    }

    const dateInput = inputMap.appointmentDate || [...document.querySelectorAll('input')].find(i => classify(i) === 'appointmentDate');
    if (!dateInput) return;
    try { dateInput.scrollIntoView({ block: 'center' }); dateInput.click(); } catch (_) {}
    await sleep(800);

    const pickerRoots = [...document.querySelectorAll('.flatpickr-calendar,.datepicker,.ui-datepicker,.date-picker,.daterangepicker,[role="dialog"]')].filter(visible);
    const root = pickerRoots[pickerRoots.length - 1] || document.body;
    const dayCandidates = [...root.querySelectorAll('.flatpickr-day,td a,td button,button,[role="gridcell"],.day')]
      .filter(visible)
      .filter(el => {
        const c = norm(`${el.className || ''} ${el.getAttribute('aria-disabled') || ''}`);
        const txt = (el.textContent || '').trim();
        if (!/^\d{1,2}$/.test(txt)) return false;
        if (/disabled|unavailable|muted|old|new|outside|othermonth|aria-disabled true/.test(c)) return false;
        if (el.disabled) return false;
        return true;
      })
      .slice(0, 31);

    const seenDays = new Set();
    for (const day of dayCandidates) {
      const signature = `${day.textContent?.trim()}|${day.getAttribute('aria-label') || ''}|${day.getAttribute('data-date') || ''}`;
      if (seenDays.has(signature)) continue;
      seenDays.add(signature);
      let dateLabel = day.getAttribute('aria-label') || day.getAttribute('data-date') || day.textContent?.trim() || '';
      try { day.click(); } catch (_) { continue; }
      await sleep(650);
      const ts = selectMap.time || [...document.querySelectorAll('select')].find(s => classify(s) === 'time');
      const tos = options(ts);
      if (dateInput.value) dateLabel = dateInput.value;
      for (const t of tos) slots.push({ date: dateLabel, time: t.text, purpose: purposeText });
      if (slots.length >= 30) break;
      try { dateInput.click(); } catch (_) {}
      await sleep(350);
    }
  }

  for (const p of work.slice(0, 20)) {
    if (selectMap.purpose && p.value) await setSelect(selectMap.purpose, p.value);
    await scanCurrentPurpose(p.text || '');
    details.push({ purpose: p.text || '', slotCount: slots.filter(s => s.purpose === (p.text || '')).length });
    if (slots.length >= 30) break;
  }

  const unique = [];
  const seen = new Set();
  for (const s of slots) {
    const key = `${s.date}|${s.time}|${s.purpose}`;
    if (!seen.has(key)) { seen.add(key); unique.push(s); }
  }

  if (unique.length) return { status: 'slots', slots: unique, details };

  const textNow = norm(document.body?.innerText || '');
  const noSlotText = /no appointment|no available|not available|randevu bulunamadi|randevu yok|uygun randevu|kontenjan|quota|kota/.test(textNow);
  return {
    status: 'none',
    slots: [],
    details,
    note: noSlotText ? 'Sayfa kontrol edildi; uygun saat bulunamadi.' : 'Randevu saati seceneginde aktif saat bulunamadi.'
  };
}

async function main() {
  fs.mkdirSync('debug', { recursive: true });
  fs.mkdirSync('.slot-cache', { recursive: true });
  fs.mkdirSync('.challenge-cache', { recursive: true });

  const executablePath = findChromeExecutable();
  if (!executablePath) throw new Error('GitHub runner uzerinde Chrome/Chromium bulunamadi.');

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1365, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  const results = [];
  let targets = FALLBACK_TARGETS;

  try {
    try {
      await page.goto(HUB, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      const discovered = normalizeDiscovered(await page.evaluate(discoverIstanbulLinks));
      targets = mergeTargets(discovered);
    } catch (e) {
      console.warn('Merkez linkleri kesfedilemedi, sabit hedefler kullaniliyor:', e.message);
    }

    for (const target of targets) {
      console.log(`Kontrol: ${target.country} - ${target.city}`);
      try {
        const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2200);
        const httpStatus = response?.status() || 0;
        const scan = await page.evaluate(scanAppointmentPage, {
          country: target.country,
          city: target.city,
          nationalityNeedle: 'tur',
          travelDateOffsetDays: 90
        });
        const item = { ...target, httpStatus, ...scan, checkedAt: nowIso() };
        results.push(item);

        if (scan.status === 'challenge' || scan.status === 'error') {
          const safe = `${target.id}-${scan.status}`.replace(/[^a-z0-9_-]/gi, '_');
          await page.screenshot({ path: `debug/${safe}.png`, fullPage: true }).catch(() => {});
          fs.writeFileSync(`debug/${safe}.html`, await page.content().catch(() => ''), 'utf8');
        }
      } catch (err) {
        results.push({ ...target, status: 'error', slots: [], error: String(err?.message || err), checkedAt: nowIso() });
      }
      await sleep(900);
    }
  } finally {
    await browser.close();
  }

  const slotRows = [];
  for (const r of results) {
    for (const s of r.slots || []) {
      slotRows.push({ country: r.country, city: r.city, url: r.url, date: s.date || '', time: s.time || '', purpose: s.purpose || '' });
    }
  }

  const challenges = results.filter(r => r.status === 'challenge');
  const errors = results.filter(r => r.status === 'error');
  const slotFingerprint = slotRows.length ? sha(JSON.stringify(slotRows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))) : 'none';
  const challengeDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  const payload = {
    generatedAt: nowIso(),
    results,
    slots: slotRows,
    summary: {
      checked: results.length,
      slots: slotRows.length,
      challenges: challenges.length,
      errors: errors.length
    }
  };
  fs.writeFileSync('result.json', JSON.stringify(payload, null, 2), 'utf8');

  if (slotRows.length) fs.writeFileSync(path.join('.slot-cache', slotFingerprint), nowIso());
  if (challenges.length) fs.writeFileSync(path.join('.challenge-cache', challengeDay), nowIso());

  output('has_slots', slotRows.length ? 'true' : 'false');
  output('slot_fingerprint', slotFingerprint);
  output('has_challenge', challenges.length ? 'true' : 'false');
  output('challenge_day', challengeDay);
  output('has_errors', errors.length ? 'true' : 'false');
  output('summary', `${results.length} hedef / ${slotRows.length} slot / ${challenges.length} doğrulama / ${errors.length} hata`);

  console.log(JSON.stringify(payload.summary, null, 2));
}

main().catch(err => {
  console.error(err);
  output('has_slots', 'false');
  output('slot_fingerprint', 'none');
  output('has_challenge', 'false');
  output('challenge_day', new Date().toISOString().slice(0, 10));
  output('has_errors', 'true');
  process.exit(1);
});
