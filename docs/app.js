'use strict';

const PODACI_URL = 'podaci/nedjelje.json';
const BOJE = {
  Konzum: '#d2232a', Lidl: '#0050aa', Kaufland: '#e10915', Spar: '#00843d', Interspar: '#00843d',
  Plodine: '#e30613', Studenac: '#004a99', KTC: '#f08a00', Eurospin: '#1d3f8f', 'Trgovina Krk': '#0a5c9e', NTL: '#e2001a',
};
const KRATICE = { 'Trgovina Krk': 'KRK', Interspar: 'INTER SPAR', Studenac: 'STU', Kaufland: 'KAUF', Eurospin: 'EURO', Plodine: 'PLO', Konzum: 'KON' };
const MJESECI = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
const MJESECI_PUNO = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];

const $ = s => document.querySelector(s);
const spremi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const ucitaj = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };

const stanje = {
  podaci: null,
  nedjelja: null,
  mjesto: ucitaj('mjesto', ''),
  iskljuceniLanci: new Set(ucitaj('iskljuceniLanci', [])),
  samoOtvoreni: ucitaj('samoOtvoreni', true),
  moji: new Set(ucitaj('moji', [])),
};

// ------------------------------------------------------------ datumi
function danasZagreb() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function dodajDane(datum, n) { const d = new Date(datum + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function nadolazecaNedjelja() { const d = danasZagreb(); const dan = new Date(d + 'T12:00:00Z').getUTCDay(); return dodajDane(d, (7 - dan) % 7); }
const dioDatuma = d => ({ dan: +d.slice(8, 10), mj: +d.slice(5, 7) - 1, god: +d.slice(0, 4) });

// Državni blagdani u RH (Zakon o blagdanima) — tada su trgovine zatvorene.
function uskrs(g) {
  const a = g % 19, b = Math.floor(g / 100), c = g % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    gg = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - gg + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mj = Math.floor((h + l - 7 * m + 114) / 31), dan = ((h + l - 7 * m + 114) % 31) + 1;
  return `${g}-${String(mj).padStart(2, '0')}-${String(dan).padStart(2, '0')}`;
}
function blagdan(d) {
  const g = +d.slice(0, 4), md = d.slice(5);
  const fiksni = {
    '01-01': 'Nova godina', '01-06': 'Sveta tri kralja', '05-01': 'Praznik rada', '05-30': 'Dan državnosti',
    '06-22': 'Dan antifašističke borbe', '08-05': 'Dan pobjede i domovinske zahvalnosti', '08-15': 'Velika Gospa',
    '11-01': 'Svi sveti', '11-18': 'Dan sjećanja na žrtve Domovinskog rata', '12-25': 'Božić', '12-26': 'Sveti Stjepan',
  };
  if (fiksni[md]) return fiksni[md];
  const u = uskrs(g);
  if (d === u) return 'Uskrs';
  if (d === dodajDane(u, 60)) return 'Tijelovo';
  return null;
}

// ------------------------------------------------------------ podaci
async function ucitajPodatke(forsiraj) {
  const gumb = $('#osvjezi');
  gumb.classList.add('vrti');
  try {
    const r = await fetch(PODACI_URL + (forsiraj ? '?t=' + Date.now() : ''), { cache: forsiraj ? 'no-store' : 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    stanje.podaci = await r.json();
  } catch (e) {
    if (!stanje.podaci) {
      $('#popis').innerHTML = '<p class="prazno">Podaci se ne mogu učitati. Provjeri internetsku vezu i pokušaj ponovno.</p>';
      return;
    }
  } finally {
    gumb.classList.remove('vrti');
  }
  const p = stanje.podaci;
  const nn = nadolazecaNedjelja();
  if (!stanje.nedjelja || !p.nedjelje.includes(stanje.nedjelja)) {
    stanje.nedjelja = p.nedjelje.includes(nn) ? nn : (p.nedjelje.filter(d => d >= nn)[0] || p.nedjelje[p.nedjelje.length - 1]);
  }
  nacrtajSve();
}

// Nedjelje za izbornik: najviše 2 prošle + sve buduće s podacima + nadolazeća + sljedeće 3 (s blagdanima).
function nedjeljeZaIzbornik() {
  const nn = nadolazecaNedjelja();
  const s = new Set(stanje.podaci.nedjelje.filter(d => d >= nn));
  stanje.podaci.nedjelje.filter(d => d < nn).slice(-2).forEach(d => s.add(d));
  for (let i = 0; i < 4; i++) s.add(dodajDane(nn, 7 * i));
  return [...s].sort();
}

function statusTrgovine(t, d) {
  if (blagdan(d)) return { tip: 'zatvoreno', tekst: 'Zatvoreno' };
  if (!(d in t.nedjelje)) return { tip: 'nepoznato', tekst: 'Još nije objavljeno' };
  const v = t.nedjelje[d];
  if (v === null) return { tip: 'zatvoreno', tekst: 'Zatvoreno' };
  if (v === 'otvoreno') return { tip: 'otvoreno', tekst: 'Radi' };
  return { tip: 'otvoreno', tekst: v.replace('-', ' – ') };
}

// ------------------------------------------------------------ crtanje
function nacrtajSve() {
  nacrtajNedjelje();
  nacrtajFiltere();
  nacrtajPopis();
  const az = new Date(stanje.podaci.azurirano);
  $('#azurirano').textContent = 'Zadnje ažuriranje: ' + az.toLocaleString('hr-HR', { dateStyle: 'medium', timeStyle: 'short' });
}

function nacrtajNedjelje() {
  const nav = $('#nedjelje');
  const nn = nadolazecaNedjelja();
  nav.innerHTML = '';
  for (const d of nedjeljeZaIzbornik()) {
    const { dan, mj } = dioDatuma(d);
    const b = document.createElement('button');
    b.className = 'nedjelja' + (d < nn ? ' prosla' : '');
    b.setAttribute('aria-pressed', d === stanje.nedjelja);
    const oznaka = d === nn ? (d === danasZagreb() ? 'Danas' : 'Ova ned.') : d === dodajDane(nn, 7) ? 'Sljedeća' : 'Nedjelja';
    b.innerHTML = `<small>${oznaka}</small><b>${dan}. ${MJESECI[mj]}</b>`;
    b.addEventListener('click', () => { stanje.nedjelja = d; nacrtajNedjelje(); nacrtajPopis(); });
    nav.appendChild(b);
    if (d === stanje.nedjelja) requestAnimationFrame(() => b.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }
}

function nacrtajFiltere() {
  const tr = stanje.podaci.trgovine;
  const sel = $('#mjesto');
  const mjesta = [...new Set(tr.map(t => t.mjesto))].sort((a, b) => a.localeCompare(b, 'hr'));
  sel.innerHTML = '<option value="">Sva mjesta</option>' + (stanje.moji.size ? '<option value="*moji">★ Moji dućani</option>' : '') +
    mjesta.map(m => `<option>${m}</option>`).join('');
  if (stanje.mjesto && ![...sel.options].some(o => o.value === stanje.mjesto)) stanje.mjesto = '';
  sel.value = stanje.mjesto;

  const lanci = [...new Set(tr.map(t => t.lanac))].sort((a, b) => a.localeCompare(b, 'hr'));
  const box = $('#lanci');
  box.innerHTML = '';
  for (const l of lanci) {
    const b = document.createElement('button');
    b.className = 'cip';
    b.setAttribute('aria-pressed', !stanje.iskljuceniLanci.has(l));
    b.innerHTML = `<i style="background:${BOJE[l] || '#888'}"></i>${l}`;
    b.addEventListener('click', () => {
      if (stanje.iskljuceniLanci.has(l)) stanje.iskljuceniLanci.delete(l); else stanje.iskljuceniLanci.add(l);
      spremi('iskljuceniLanci', [...stanje.iskljuceniLanci]);
      b.setAttribute('aria-pressed', !stanje.iskljuceniLanci.has(l));
      nacrtajPopis();
    });
    box.appendChild(b);
  }
  $('#samoOtvoreni').checked = stanje.samoOtvoreni;
}

function nacrtajPopis() {
  const d = stanje.nedjelja;
  const svi = stanje.podaci.trgovine.filter(t =>
    !stanje.iskljuceniLanci.has(t.lanac) &&
    (stanje.mjesto === '' || (stanje.mjesto === '*moji' ? stanje.moji.has(t.id) : t.mjesto === stanje.mjesto)));
  const sa = svi.map(t => ({ t, s: statusTrgovine(t, d) }));
  const otvoreni = sa.filter(x => x.s.tip === 'otvoreno');
  const nepoznati = sa.filter(x => x.s.tip === 'nepoznato');
  const prikaz = stanje.samoOtvoreni ? otvoreni : sa;

  // Sažetak
  const { dan, mj, god } = dioDatuma(d);
  const bl = blagdan(d);
  const nn = nadolazecaNedjelja();
  let s = `<h2>Nedjelja, ${dan}. ${MJESECI_PUNO[mj]} ${god}.</h2>`;
  if (bl) s += `<p>Blagdan (${bl}) — trgovine su zatvorene.</p>`;
  else if (nepoznati.length === sa.length) s += `<p>Trgovci još nisu objavili radno vrijeme za ovu nedjelju.</p>`;
  else s += `<p>Radi <b>${otvoreni.length}</b> od ${sa.length} ${sa.length === 1 ? 'dućana' : 'dućana'}${nepoznati.length ? ` · za ${nepoznati.length} još nema podatka` : ''}</p>`;
  if (d > nn && !bl && nepoznati.length) s += `<div class="obavijest">Većina trgovaca objavljuje radno vrijeme tek nekoliko dana prije nedjelje — provjeri ponovno bliže datumu.</div>`;
  if (d < nn) s += `<div class="obavijest">Ova nedjelja je prošla.</div>`;
  $('#sazetak').innerHTML = s;

  // Popis po mjestu
  const popis = $('#popis');
  popis.innerHTML = '';
  if (!prikaz.length) {
    const poruka = !sa.length ? 'Nema dućana za odabrane filtere.'
      : bl ? 'Na blagdan su trgovine zatvorene.'
      : nepoznati.length === sa.length ? 'Kad trgovci objave radno vrijeme, ovdje će se pojaviti dućani koji rade.'
      : 'Nijedan odabrani dućan ne radi ove nedjelje.';
    popis.innerHTML = `<p class="prazno">${poruka}</p>`;
    return;
  }
  const red = { otvoreno: 0, nepoznato: 1, zatvoreno: 2 };
  prikaz.sort((a, b) => (stanje.moji.has(b.t.id) - stanje.moji.has(a.t.id)) || a.t.mjesto.localeCompare(b.t.mjesto, 'hr') ||
    red[a.s.tip] - red[b.s.tip] || a.t.lanac.localeCompare(b.t.lanac, 'hr'));
  const tpl = $('#t-trgovina');
  let zadnjaGrupa = null;
  for (const { t, s: st } of prikaz) {
    const grupa = stanje.moji.has(t.id) ? '★ Moji dućani' : t.mjesto;
    if (grupa !== zadnjaGrupa) {
      const h = document.createElement('h3');
      h.className = 'grupa';
      h.textContent = grupa;
      popis.appendChild(h);
      zadnjaGrupa = grupa;
    }
    const el = tpl.content.firstElementChild.cloneNode(true);
    if (st.tip === 'zatvoreno') el.classList.add('zatvorena');
    const lanac = el.querySelector('.trgovina__lanac');
    lanac.style.background = BOJE[t.lanac] || '#666';
    lanac.textContent = KRATICE[t.lanac] || t.lanac.toUpperCase();
    el.querySelector('.trgovina__naziv').textContent = t.naziv === t.lanac ? t.lanac : t.naziv;
    el.querySelector('.trgovina__adresa').textContent = `${t.adresa}, ${t.mjesto}`;
    const v = el.querySelector('.trgovina__vrijeme');
    v.textContent = st.tekst;
    v.classList.add(st.tip);
    const q = t.lat ? `${t.lat},${t.lng}` : `${t.lanac} ${t.adresa}, ${t.mjesto}, Hrvatska`;
    el.querySelector('.karta').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    const z = el.querySelector('.zvjezdica');
    z.setAttribute('aria-pressed', stanje.moji.has(t.id));
    z.setAttribute('aria-label', stanje.moji.has(t.id) ? 'Makni iz mojih dućana' : 'Dodaj u moje dućane');
    z.addEventListener('click', () => {
      if (stanje.moji.has(t.id)) stanje.moji.delete(t.id); else stanje.moji.add(t.id);
      spremi('moji', [...stanje.moji]);
      nacrtajFiltere();
      nacrtajPopis();
    });
    popis.appendChild(el);
  }
}

// ------------------------------------------------------------ događaji
$('#mjesto').addEventListener('change', e => { stanje.mjesto = e.target.value; spremi('mjesto', stanje.mjesto); nacrtajPopis(); });
$('#samoOtvoreni').addEventListener('change', e => { stanje.samoOtvoreni = e.target.checked; spremi('samoOtvoreni', stanje.samoOtvoreni); nacrtajPopis(); });
$('#osvjezi').addEventListener('click', () => ucitajPodatke(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && stanje.podaci) ucitajPodatke(false); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
ucitajPodatke(false);
