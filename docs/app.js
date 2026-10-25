'use strict';

// Lokalno se čita kopija iz mape, inače (Android aplikacija) svježi podaci iz GitHub repozitorija.
const LOKALNO = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const PODACI_URL = LOKALNO ? 'podaci/nedjelje.json'
  : 'https://raw.githubusercontent.com/dinowuk/radne-nedjelje-medjimurje/main/docs/podaci/nedjelje.json';
const UGRADJENI_PODACI = 'podaci/nedjelje.json'; // kopija ugrađena u aplikaciju (prvo pokretanje bez interneta)
const U_APLIKACIJI = /androidplatform\.net$/.test(location.hostname);
if (U_APLIKACIJI) document.documentElement.classList.add('u-aplikaciji');
const BOJE = {
  Konzum: '#d2232a', Lidl: '#0050aa', Kaufland: '#e10915', Spar: '#00843d', Interspar: '#00843d',
  Plodine: '#e30613', Studenac: '#004a99', KTC: '#f08a00', Eurospin: '#1d3f8f', 'Trgovina Krk': '#0a5c9e', NTL: '#e2001a',
};
const KRATICE = { 'Trgovina Krk': 'KRK', Interspar: 'INTER SPAR', Studenac: 'STU', Kaufland: 'KAUF', Eurospin: 'EURO', Plodine: 'PLO', Konzum: 'KON' };
// Logotipi su ikone sa službenih stranica trgovaca (alati/logotipi.js), samo za prepoznavanje dućana.
const LOGOTIPI = {
  Konzum: 'konzum.png', Lidl: 'lidl.png', Kaufland: 'kaufland.png', Spar: 'spar.png', Interspar: 'spar.png',
  Plodine: 'plodine.svg', Studenac: 'studenac.png', KTC: 'ktc.png', Eurospin: 'eurospin.svg', 'Trgovina Krk': 'krk.png', NTL: 'ntl.jpg',
};
const MJESECI = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
const MJESECI_PUNO = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];

const $ = s => document.querySelector(s);
const spremi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const ucitaj = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };

const stanje = {
  podaci: null,
  nedjelja: null,
  mjesto: ucitaj('mjesto', '') === '*moji' ? '' : ucitaj('mjesto', ''),
  iskljuceniLanci: new Set(ucitaj('iskljuceniLanci', [])),
  samoOtvoreni: ucitaj('samoOtvoreni', true),
  moji: new Set(ucitaj('moji', [])),
  mojaMjesta: new Set(ucitaj('mojaMjesta', [])),
  prikaz: ucitaj('prikaz', null), // 'sve' | 'moji' | 'mjesta'
};
if (!['sve', 'moji', 'mjesta'].includes(stanje.prikaz)) {
  stanje.prikaz = stanje.moji.size ? 'moji' : stanje.mojaMjesta.size ? 'mjesta' : 'sve';
}

let porukaTimer;
function pokaziPoruku(tekst) {
  const el = $('#poruka');
  el.textContent = tekst;
  el.classList.add('vidljiva');
  clearTimeout(porukaTimer);
  porukaTimer = setTimeout(() => el.classList.remove('vidljiva'), 2200);
}

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
  // Redom: mreža → zadnji spremljeni podaci → kopija ugrađena u aplikaciju. Uzima se najsvježije.
  const svjezije = p => p && (!stanje.podaci || p.azurirano > stanje.podaci.azurirano);
  try {
    const r = await fetch(PODACI_URL + (forsiraj ? '?t=' + Date.now() : ''), { cache: forsiraj ? 'no-store' : 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const p = await r.json();
    if (svjezije(p)) stanje.podaci = p;
    try { localStorage.setItem('podaci', JSON.stringify(p)); } catch (e) {}
  } catch (e) {
    const spremljeni = ucitaj('podaci', null);
    if (svjezije(spremljeni)) stanje.podaci = spremljeni;
    if (!stanje.podaci) {
      try { stanje.podaci = await (await fetch(UGRADJENI_PODACI)).json(); } catch (e2) {}
    }
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
  const p = stanje.prikaz;
  document.querySelectorAll('.kartice button').forEach(b => b.setAttribute('aria-selected', b.dataset.prikaz === p));
  $('#brojMoji').textContent = stanje.moji.size ? `(${stanje.moji.size})` : '';
  $('#brojMjesta').textContent = stanje.mojaMjesta.size ? `(${stanje.mojaMjesta.size})` : '';
  $('#poljeMjesto').hidden = p !== 'sve';
  $('#mojaMjesta').hidden = p !== 'mjesta';
  $('#lanci').hidden = p === 'moji';
  $('#samoOtvoreni').parentElement.hidden = p === 'moji'; // svoje dućane uvijek vidiš, i kad su zatvoreni
  $('#mojaMjestaPopis').textContent = stanje.mojaMjesta.size
    ? [...stanje.mojaMjesta].sort((a, b) => a.localeCompare(b, 'hr')).join(', ') : 'Još nisi odabrao mjesta.';

  $('#mjesto').value = stanje.mjesto;
  nacrtajPrijedloge();

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

// Usporedba bez kvačica i velikih slova: "cakovec" nađe "Čakovec".
const bezKvacica = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const mjestoOdgovara = (mjesto, upit) => !upit || bezKvacica(mjesto).includes(bezKvacica(upit));

function sveMjesta() {
  return [...new Set(stanje.podaci.trgovine.map(t => t.mjesto))].sort((a, b) => a.localeCompare(b, 'hr'));
}

function nacrtajPopis() {
  const d = stanje.nedjelja;
  const p = stanje.prikaz;
  const svi = stanje.podaci.trgovine.filter(t =>
    p === 'moji' ? stanje.moji.has(t.id)
      : !stanje.iskljuceniLanci.has(t.lanac) &&
        (p === 'mjesta' ? stanje.mojaMjesta.has(t.mjesto) : mjestoOdgovara(t.mjesto, stanje.mjesto)));
  const sa = svi.map(t => ({ t, s: statusTrgovine(t, d) }));
  const otvoreni = sa.filter(x => x.s.tip === 'otvoreno');
  const nepoznati = sa.filter(x => x.s.tip === 'nepoznato');
  const prikaz = stanje.samoOtvoreni && p !== 'moji' ? otvoreni : sa;

  // Prazni "moji" prikazi: uputa umjesto praznog popisa
  if (p === 'moji' && !stanje.moji.size || p === 'mjesta' && !stanje.mojaMjesta.size) {
    $('#sazetak').innerHTML = '';
    $('#popis').innerHTML = p === 'moji'
      ? `<div class="prazno"><p><b>Još nemaš svojih dućana.</b></p><p>Na kartici "Sve" dodirni ★ kod dućana u kojima kupuješ — ovdje ćeš ih onda odmah vidjeti, i radi li ove nedjelje.</p><button class="gumb-glavni" data-idi="sve">Odaberi dućane</button></div>`
      : `<div class="prazno"><p><b>Još nemaš svojih mjesta.</b></p><p>Odaberi mjesta u kojima kupuješ pa ćeš vidjeti samo dućane iz njih.</p><button class="gumb-glavni" data-uredi-mjesta>Odaberi mjesta</button></div>`;
    return;
  }

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
  prikaz.sort((a, b) => a.t.mjesto.localeCompare(b.t.mjesto, 'hr') ||
    red[a.s.tip] - red[b.s.tip] || a.t.lanac.localeCompare(b.t.lanac, 'hr'));
  const tpl = $('#t-trgovina');
  let zadnjaGrupa = null;
  for (const { t, s: st } of prikaz) {
    const grupa = t.mjesto;
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
    const kratica = () => {
      lanac.classList.remove('s-logom');
      lanac.style.background = BOJE[t.lanac] || '#666';
      lanac.textContent = KRATICE[t.lanac] || t.lanac.toUpperCase();
    };
    if (LOGOTIPI[t.lanac]) {
      const img = document.createElement('img');
      img.src = 'logotipi/' + LOGOTIPI[t.lanac];
      img.alt = t.lanac;
      img.loading = 'lazy';
      img.onerror = kratica;
      lanac.classList.add('s-logom');
      lanac.appendChild(img);
    } else kratica();
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
      const dodano = !stanje.moji.has(t.id);
      if (dodano) stanje.moji.add(t.id); else stanje.moji.delete(t.id);
      spremi('moji', [...stanje.moji]);
      pokaziPoruku(dodano ? `★ ${t.lanac}, ${t.mjesto} dodan u moje dućane` : 'Maknuto iz mojih dućana');
      nacrtajFiltere();
      if (stanje.prikaz === 'moji') nacrtajPopis();
      else {
        z.setAttribute('aria-pressed', dodano);
        z.setAttribute('aria-label', dodano ? 'Makni iz mojih dućana' : 'Dodaj u moje dućane');
      }
    });
    popis.appendChild(el);
  }
}

// ------------------------------------------------------------ moja mjesta (dijalog)
function nacrtajPopisMjesta() {
  const q = $('#traziMjesto').value;
  const brojPo = {};
  for (const t of stanje.podaci.trgovine) brojPo[t.mjesto] = (brojPo[t.mjesto] || 0) + 1;
  const box = $('#popisMjesta');
  box.innerHTML = '';
  // Odabrana mjesta na vrhu (redoslijed se ne mijenja dok je dijalog otvoren, da kvačica ne "pobjegne").
  const odabranaNaPocetku = new Set(stanje.mojaMjesta);
  const redom = sveMjesta().sort((a, b) => odabranaNaPocetku.has(b) - odabranaNaPocetku.has(a));
  for (const m of redom) {
    if (!mjestoOdgovara(m, q)) continue;
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox"${stanje.mojaMjesta.has(m) ? ' checked' : ''}><span></span><small>${brojPo[m]} ${brojPo[m] === 1 ? 'dućan' : 'dućana'}</small>`;
    l.querySelector('span').textContent = m;
    l.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) stanje.mojaMjesta.add(m); else stanje.mojaMjesta.delete(m);
      spremi('mojaMjesta', [...stanje.mojaMjesta]);
    });
    box.appendChild(l);
  }
  if (!box.children.length) box.innerHTML = '<p class="prazno">Nema mjesta s tim imenom.</p>';
}
function otvoriMjesta() {
  $('#traziMjesto').value = '';
  nacrtajPopisMjesta();
  $('#dijalogMjesta').showModal();
}
$('#traziMjesto').addEventListener('input', nacrtajPopisMjesta);
$('#urediMjesta').addEventListener('click', otvoriMjesta);
$('#ocistiMjesta').addEventListener('click', e => {
  e.preventDefault();
  stanje.mojaMjesta.clear();
  spremi('mojaMjesta', []);
  nacrtajPopisMjesta();
});
$('#dijalogMjesta').addEventListener('close', () => {
  stanje.prikaz = 'mjesta';
  spremi('prikaz', 'mjesta');
  nacrtajFiltere();
  nacrtajPopis();
});

// ------------------------------------------------------------ događaji
function postaviPrikaz(p) {
  stanje.prikaz = p;
  spremi('prikaz', p);
  nacrtajFiltere();
  nacrtajPopis();
}
document.querySelectorAll('.kartice button').forEach(b => b.addEventListener('click', () => postaviPrikaz(b.dataset.prikaz)));
$('#popis').addEventListener('click', e => {
  if (e.target.closest('[data-uredi-mjesta]')) otvoriMjesta();
  const idi = e.target.closest('[data-idi]');
  if (idi) postaviPrikaz(idi.dataset.idi);
});
// Prijedlozi mjesta: tek kad se nešto upiše, najviše 6, i ne kad je upisano točno ime mjesta.
function nacrtajPrijedloge() {
  const box = $('#prijedlozi');
  const q = stanje.mjesto.trim();
  const tocno = sveMjesta().some(m => bezKvacica(m) === bezKvacica(q));
  const nadjena = q && !tocno ? sveMjesta().filter(m => mjestoOdgovara(m, q))
    .sort((a, b) => bezKvacica(b).startsWith(bezKvacica(q)) - bezKvacica(a).startsWith(bezKvacica(q))).slice(0, 6) : [];
  box.innerHTML = '';
  for (const m of nadjena) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m;
    b.addEventListener('click', () => {
      stanje.mjesto = m;
      spremi('mjesto', m);
      $('#mjesto').value = m;
      $('#mjesto').blur(); // zatvori tipkovnicu
      nacrtajPrijedloge();
      nacrtajPopis();
    });
    box.appendChild(b);
  }
  box.hidden = !nadjena.length;
}
$('#mjesto').addEventListener('input', e => { stanje.mjesto = e.target.value; spremi('mjesto', stanje.mjesto); nacrtajPrijedloge(); nacrtajPopis(); });
$('#mjesto').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('#samoOtvoreni').addEventListener('change', e => { stanje.samoOtvoreni = e.target.checked; spremi('samoOtvoreni', stanje.samoOtvoreni); nacrtajPopis(); });
$('#osvjezi').addEventListener('click', () => ucitajPodatke(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && stanje.podaci) ucitajPodatke(false); });

// ------------------------------------------------------------ provjera nove verzije (samo Android aplikacija)
// Aplikacija u user-agentu šalje "RadneNedjelje/<versionCode>"; docs/verzija.json kaže koja je najnovija.
const VERZIJA_URL = 'https://raw.githubusercontent.com/dinowuk/radne-nedjelje-medjimurje/main/docs/verzija.json';
let zadnjaProvjera = 0;
async function provjeriAzuriranje() {
  const m = navigator.userAgent.match(/RadneNedjelje\/(\d+)/);
  if (!m || Date.now() - zadnjaProvjera < 60000) return;
  zadnjaProvjera = Date.now();
  try {
    const v = await (await fetch(VERZIJA_URL + '?t=' + Date.now(), { cache: 'no-store' })).json();
    if (+v.versionCode > +m[1] && v.url) {
      $('#azuriranjeTekst').textContent = `Dostupna je nova verzija ${v.versionName}${v.opis ? ' — ' + v.opis : ''}.`;
      $('#azuriranjeLink').href = v.url;
      $('#azuriranje').hidden = false;
    }
  } catch (e) { /* bez interneta — provjerit će sljedeći put */ }
}
provjeriAzuriranje();
// i kad se aplikacija vrati iz pozadine (Android je često ne pokreće ispočetka)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') provjeriAzuriranje(); });
{
  const v = navigator.userAgent.match(/RadneNedjeljeVerzija\/([\w.]+)/);
  if (v) $('#verzijaAplikacije').textContent = 'Verzija aplikacije: ' + v[1];
}

// U Android aplikaciji su datoteke već ugrađene, service worker treba samo web verziji.
if ('serviceWorker' in navigator && !U_APLIKACIJI) navigator.serviceWorker.register('sw.js').catch(() => {});
ucitajPodatke(false);
