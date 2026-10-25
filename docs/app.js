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
  nacrtajKategoriju();
  const az = new Date(stanje.podaci.azurirano);
  $('#azurirano').textContent = 'Zadnje ažuriranje: ' + az.toLocaleString('hr-HR', { dateStyle: 'medium', timeStyle: 'short' });
}

// ------------------------------------------------------------ kategorije (donja traka)
// Aplikacija se uvijek otvara na događanjima (glavna namjena); dućani, centri i katalozi su dodatak.
stanje.kategorija = 'dogadaji';
const ELEMENTI_DUCANA = ['main > .kartice', '#obavijestSubota', '#sazetak', '.filteri', '#popis'];

function nacrtajKategoriju() {
  const k = stanje.kategorija;
  document.querySelectorAll('.kategorije button').forEach(b =>
    b.dataset.kategorija === k ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  for (const s of ELEMENTI_DUCANA) {
    const el = $(s);
    if (k !== 'ducani') el.dataset.skriven = '1', el.hidden = true;
    else if (el.dataset.skriven) { delete el.dataset.skriven; el.hidden = false; }
  }
  $('#pogledCentri').hidden = k !== 'centri';
  $('#pogledKatalozi').hidden = k !== 'katalozi';
  $('#pogledDogadaji').hidden = k !== 'dogadaji';
  $('#pogledRestorani').hidden = k !== 'restorani';
  // Izbornik nedjelja nema smisla za kataloge i događanja
  $('#nedjelje').hidden = k === 'katalozi' || k === 'dogadaji';
  if (k === 'ducani') { nacrtajFiltere(); nacrtajPopis(); }
  else if (k === 'centri') nacrtajCentre();
  else if (k === 'dogadaji') nacrtajDogadaje();
  else if (k === 'restorani') nacrtajRestorane();
  else nacrtajKataloge();
}

// ------------------------------------------------------------ restorani (OpenStreetMap)
stanje.traziRestoran = '';
stanje.samoNedjeljom = ucitaj('samoNedjeljom', true);
stanje.restoraniBlizu = false;
const IKONA_TEL = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>';

// Radno vrijeme restorana odabrane nedjelje (ili blagdana): iz OSM-a je poznat samo redovni raspored.
function statusRestorana(r) {
  if (!r.tjedan) return { tip: 'nepoznato', tekst: 'Vrijeme nije upisano' };
  if (!('ned' in r.tjedan)) return { tip: 'nepoznato', tekst: 'Nedjelja nije upisana' };
  const v = r.tjedan.ned;
  return v ? { tip: 'otvoreno', tekst: v.replace('-', ' – ') } : { tip: 'zatvoreno', tekst: 'Nedjeljom ne radi' };
}

function nacrtajRestorane() {
  const svi = stanje.podaci.restorani || [];
  const q = stanje.traziRestoran;
  const d = stanje.nedjelja;
  const { dan, mj } = dioDatuma(d);
  let lista = svi.filter(r => !q || mjestoOdgovara(r.naziv, q) || mjestoOdgovara(r.mjesto, q) || mjestoOdgovara(r.kuhinja || '', q))
    .map(r => ({ r, s: statusRestorana(r) }));
  const rade = lista.filter(x => x.s.tip === 'otvoreno').length;
  const ukupno = lista.length;
  if (stanje.samoNedjeljom) lista = lista.filter(x => x.s.tip === 'otvoreno');
  const red = { otvoreno: 0, nepoznato: 1, zatvoreno: 2 };
  const blizu = stanje.restoraniBlizu && stanje.pozicija;
  if (blizu) {
    for (const x of lista) x.km = udaljenostKm(stanje.pozicija, x.r);
    lista.sort((a, b) => a.km - b.km);
  } else {
    lista.sort((a, b) => red[a.s.tip] - red[b.s.tip] || a.r.mjesto.localeCompare(b.r.mjesto, 'hr') || a.r.naziv.localeCompare(b.r.naziv, 'hr'));
  }
  $('#restoraniSazetak').innerHTML = `<h2>Restorani u Međimurju</h2><p>Nedjelja, ${dan}. ${MJESECI_PUNO[mj]}: radi <b>${rade}</b> od ${ukupno} restorana${q ? ` za „${esc(q)}”` : ''}</p>` +
    (blagdan(d) ? `<div class="obavijest">${blagdan(d)} je blagdan — restorani mogu raditi drugačije, provjeri pozivom.</div>` : '');
  $('#samoNedjeljom').checked = stanje.samoNedjeljom;
  $('#ocistiRestoran').hidden = !q;
  $('#restoraniBlizu').setAttribute('aria-pressed', !!blizu);

  const box = $('#restoraniPopis');
  if (!lista.length) {
    box.innerHTML = ukupno
      ? `<p class="prazno">Nijedan od ${ukupno} restorana nema upisano da radi nedjeljom.<br><button class="gumb-glavni" id="prikaziSveRestorane">Prikaži sve (pa nazovi)</button></p>`
      : '<p class="prazno">Nema restorana za tu pretragu.</p>';
    const g = $('#prikaziSveRestorane');
    if (g) g.addEventListener('click', () => { stanje.samoNedjeljom = false; spremi('samoNedjeljom', false); nacrtajRestorane(); });
    return;
  }
  box.innerHTML = '';
  for (const { r, s, km } of lista) {
    const el = document.createElement('article');
    el.className = 'restoran';
    const info = [r.kuhinja || r.vrsta, r.mjesto].filter(Boolean).join(' · ') +
      (blizu ? ` · ${km < 1 ? Math.round(km * 1000 / 50) * 50 + ' m' : km.toFixed(1).replace('.', ',') + ' km'}` : '');
    const karta = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${r.naziv}, ${r.adresa ? r.adresa + ', ' : ''}${r.mjesto}, Hrvatska`);
    el.innerHTML = `<div class="restoran__glava"><div><h3>${esc(r.naziv)}</h3><p class="restoran__info">${esc(info)}</p></div>
        <span class="trgovina__vrijeme ${s.tip}">${esc(s.tekst)}</span></div>
      <div class="restoran__gumbi">
        ${r.tel ? `<a href="tel:${esc(r.tel.replace(/[^\d+]/g, ''))}">${IKONA_TEL} Nazovi</a>` : ''}
        ${r.web ? `<a href="${esc(r.web)}" target="_blank" rel="noopener">Web</a>` : ''}
        <a href="${karta}" target="_blank" rel="noopener">Karta</a>
      </div>
      <div class="trgovina__detalji" hidden></div>`;
    const det = el.querySelector('.trgovina__detalji');
    el.querySelector('.restoran__glava').addEventListener('click', () => {
      if (!det.innerHTML) {
        if (r.tjedan) {
          let h = '<h4>Radno vrijeme</h4><table>';
          for (const [k, ime] of [...DANI_TJEDNA, ['ned', 'Nedjelja']]) {
            const v = r.tjedan[k];
            h += `<tr><td>${ime}</td><td${v ? '' : ' class="zat"'}>${k in r.tjedan ? (v ? esc(v.replace('-', ' – ')) : 'Zatvoreno') : '—'}</td></tr>`;
          }
          det.innerHTML = h + '</table>';
        } else det.innerHTML = '<p>Radno vrijeme nije upisano — najbolje nazovi.</p>';
      }
      det.hidden = !det.hidden;
    });
    box.appendChild(el);
  }
}

$('#traziRestoran').addEventListener('input', e => { stanje.traziRestoran = e.target.value; nacrtajRestorane(); });
$('#ocistiRestoran').addEventListener('click', () => { $('#traziRestoran').value = ''; stanje.traziRestoran = ''; nacrtajRestorane(); });
$('#samoNedjeljom').addEventListener('change', e => { stanje.samoNedjeljom = e.target.checked; spremi('samoNedjeljom', stanje.samoNedjeljom); nacrtajRestorane(); });
$('#restoraniBlizu').addEventListener('click', () => {
  if (stanje.restoraniBlizu) { stanje.restoraniBlizu = false; nacrtajRestorane(); return; }
  if (!navigator.geolocation) { pokaziPoruku('Lokacija nije dostupna na ovom uređaju'); return; }
  pokaziPoruku('Tražim tvoju lokaciju…');
  navigator.geolocation.getCurrentPosition(p => {
    stanje.pozicija = { lat: p.coords.latitude, lng: p.coords.longitude };
    stanje.restoraniBlizu = true;
    nacrtajRestorane();
    pokaziPoruku('Restorani su složeni po udaljenosti');
  }, () => pokaziPoruku('Lokacija nije dopuštena ili nije dostupna'), { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
});

// ------------------------------------------------------------ događanja (eventinfo.com.hr)
stanje.razdoblje = ucitaj('razdoblje', 'vikend');
stanje.vrstaDogadaja = '';
const DANI_KRATKO = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
const VELIKO = s => s.charAt(0).toUpperCase() + s.slice(1);

// Ovaj vikend = petak–nedjelja ovog tjedna (od danas nadalje)
function vikend() {
  const nn = nadolazecaNedjelja();
  const danas = danasZagreb();
  const pet = dodajDane(nn, -2);
  return { od: danas > pet ? danas : pet, do: nn };
}

function kadaDogadaj(e) {
  const f = d => { const x = dioDatuma(d); return `${DANI_KRATKO[new Date(d + 'T12:00:00Z').getUTCDay()]} ${x.dan}.${x.mj + 1}.`; };
  if (e.od !== e.do) {
    const danas = danasZagreb();
    return e.od <= danas ? `Traje do ${f(e.do)}` : `${f(e.od)} – ${f(e.do)}`;
  }
  return f(e.od) + (e.vrijeme ? ' · ' + e.vrijeme : '');
}

// Najave sa službenih stranica općina/gradova: datum objave, a ne događanja (RSS ga ne daje)
function nacrtajNajave() {
  const najave = stanje.podaci.najave || [];
  $('#dogadajiKategorije').innerHTML = '';
  $('#dogadajiSazetak').innerHTML = `<h2>Najave općina i gradova</h2><p>Najave događanja sa službenih stranica općina i gradova (zadnjih 30 dana). Datum događanja je u objavi.</p>`;
  const box = $('#dogadajiPopis');
  box.innerHTML = najave.length ? '' : '<p class="prazno">Trenutno nema novih najava.</p>';
  for (const n of najave) {
    const a = document.createElement('a');
    a.className = 'dogadaj';
    a.href = n.link;
    a.target = '_blank';
    a.rel = 'noopener';
    const { dan, mj } = dioDatuma(n.objavljeno);
    a.innerHTML = `${n.slika ? `<img src="${esc(n.slika)}" alt="" loading="lazy">` : '<span class="dogadaj__bez-slike"></span>'}
      <div class="dogadaj__tijelo"><div class="dogadaj__kada">${esc(n.opcina)} · objavljeno ${dan}.${mj + 1}.</div>
      <h3>${esc(n.naslov)}</h3>${n.opis ? `<p class="dogadaj__gdje">${esc(n.opis)}</p>` : ''}</div>`;
    const img = a.querySelector('img');
    if (img) img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'dogadaj__bez-slike' }));
    box.appendChild(a);
  }
}

function nacrtajDogadaje() {
  const svi = (stanje.podaci.dogadaji || []).filter(e => e.do >= danasZagreb());
  const r = stanje.razdoblje;
  document.querySelectorAll('[data-razdoblje]').forEach(b => b.setAttribute('aria-selected', b.dataset.razdoblje === r));
  if (r === 'najave') { nacrtajNajave(); return; }
  const vk = vikend();
  const uRazdoblju = r === 'vikend' ? svi.filter(e => e.od <= vk.do && e.do >= vk.od) : svi;

  // Vrste (kategorije) kao čipovi
  const vrste = [...new Set(uRazdoblju.map(e => e.kategorija))].sort((a, b) => a.localeCompare(b, 'hr'));
  if (stanje.vrstaDogadaja && !vrste.includes(stanje.vrstaDogadaja)) stanje.vrstaDogadaja = '';
  const kat = $('#dogadajiKategorije');
  kat.innerHTML = '';
  for (const v of ['', ...vrste]) {
    const b = document.createElement('button');
    b.className = 'cip';
    b.setAttribute('aria-pressed', stanje.vrstaDogadaja === v);
    b.textContent = v ? VELIKO(v) : 'Sve vrste';
    b.addEventListener('click', () => { stanje.vrstaDogadaja = v; nacrtajDogadaje(); });
    kat.appendChild(b);
  }
  const prikaz = uRazdoblju.filter(e => !stanje.vrstaDogadaja || e.kategorija === stanje.vrstaDogadaja);

  $('#dogadajiSazetak').innerHTML = r === 'vikend'
    ? `<h2>Ovaj vikend u Međimurju</h2><p>${prikaz.length ? prikaz.length + ' ' + (prikaz.length === 1 ? 'događaj' : 'događanja') : 'Nema najavljenih događanja'} · ${vk.od === vk.do ? '' : dioDatuma(vk.od).dan + '.–'}${dioDatuma(vk.do).dan}. ${MJESECI_PUNO[dioDatuma(vk.do).mj]}</p>`
    : `<h2>Sva događanja</h2><p>${prikaz.length} nadolazećih događanja u Međimurju</p>`;

  const box = $('#dogadajiPopis');
  box.innerHTML = '';
  if (!prikaz.length && r === 'vikend') {
    box.innerHTML = '<p class="prazno">Za ovaj vikend nema najavljenih događanja.<br><button class="gumb-glavni" data-razdoblje-idi="sve">Pogledaj sva događanja</button></p>';
    box.querySelector('[data-razdoblje-idi]').addEventListener('click', () => { stanje.razdoblje = 'sve'; spremi('razdoblje', 'sve'); nacrtajDogadaje(); });
    return;
  }
  for (const e of prikaz) {
    const a = document.createElement('a');
    a.className = 'dogadaj';
    a.href = e.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `${e.slika ? `<img src="${esc(e.slika)}" alt="" loading="lazy">` : '<span class="dogadaj__bez-slike"></span>'}
      <div class="dogadaj__tijelo"><div class="dogadaj__kada">${esc(kadaDogadaj(e))}</div>
      <h3>${esc(e.naslov)}</h3><p class="dogadaj__gdje">${esc(e.mjesto)}${e.grad && !e.mjesto.includes(e.grad) ? ', ' + esc(e.grad) : ''}</p>
      <div class="dogadaj__oznake"><span>${esc(VELIKO(e.kategorija || 'ostalo'))}</span>${e.cijena ? `<span>${esc(e.cijena)}</span>` : ''}</div></div>`;
    const img = a.querySelector('img');
    if (img) img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'dogadaj__bez-slike' }));
    box.appendChild(a);
  }
}

document.querySelectorAll('[data-razdoblje]').forEach(b => b.addEventListener('click', () => {
  stanje.razdoblje = b.dataset.razdoblje;
  spremi('razdoblje', stanje.razdoblje);
  nacrtajDogadaje();
}));

document.querySelectorAll('.kategorije button').forEach(b => b.addEventListener('click', () => {
  stanje.kategorija = b.dataset.kategorija;
  spremi('kategorija', stanje.kategorija);
  nacrtajKategoriju();
  window.scrollTo(0, 0);
}));

// Trgovina u centru: s "veza" prati vlastiti raspored, inače radi kad radi centar (svojim nedjeljnim vremenom).
function statusUCentru(tr, c, d) {
  if (tr.veza) {
    const t = stanje.podaci.trgovine.find(x => x.id === tr.veza) || (stanje.podaci.centri || []).find(x => x.id === tr.veza);
    if (t) return statusTrgovine(t, d);
  }
  const sc = statusTrgovine(c, d);
  if (sc.tip !== 'otvoreno') return sc;
  return tr.ned ? { tip: 'otvoreno', tekst: tr.ned.replace('-', ' – ') } : sc;
}

function nacrtajCentre() {
  const d = stanje.nedjelja;
  const { dan, mj, god } = dioDatuma(d);
  const box = $('#pogledCentri');
  const centri = stanje.podaci.centri || [];
  let h = `<div class="sazetak"><h2>Trgovački centri</h2><p>Nedjelja, ${dan}. ${MJESECI_PUNO[mj]} ${god}.${blagdan(d) ? ' — blagdan (' + blagdan(d) + ')' : ''}</p></div>`;
  if (!centri.length) h += '<p class="prazno">Podaci o centrima još nisu dostupni.</p>';
  for (const c of centri) {
    const s = statusTrgovine(c, d);
    const trg = (c.trgovine || []).map(tr => ({ tr, s: statusUCentru(tr, c, d) }));
    const rade = trg.filter(x => x.s.tip === 'otvoreno').length;
    const karta = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${c.naziv}, ${c.adresa}, ${c.mjesto}`);
    h += `<article class="centar"><div class="centar__glava"><div><h3>${esc(c.naziv)}</h3>
      <p class="centar__adresa">${esc(c.adresa)}, ${esc(c.mjesto)}</p></div>
      <span class="trgovina__vrijeme ${s.tip}">${esc(s.tekst)}</span>
      <a class="ikonski karta" href="${karta}" target="_blank" rel="noopener" aria-label="Otvori na karti"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></a></div>
      <p class="centar__opis">${esc(c.opis || '')}${trg.length ? ` Radi ${rade} od ${trg.length} trgovina.` : ''}</p><ul>`;
    for (const { tr, s: st } of trg.sort((a, b) => (a.s.tip !== 'otvoreno') - (b.s.tip !== 'otvoreno'))) {
      h += `<li><span><b>${esc(tr.naziv)}</b> <small>${esc(tr.vrsta || '')}</small></span><span class="trgovina__vrijeme ${st.tip}">${esc(st.tekst)}</span></li>`;
    }
    h += '</ul></article>';
  }
  box.innerHTML = h;
}

// Službene stranice s aktualnim katalozima (KTC ih mijenja svaki tjedan, pa vodi na naslovnicu).
const KATALOZI = [
  ['Trgovina Krk', 'https://trgovina-krk.hr/katalozi/'],
  ['NTL', 'https://ntl.hr/aktualna-ponuda/katalog-ntl-sjever/'],
  ['Konzum', 'https://www.konzum.hr/katalozi'],
  ['Lidl', 'https://www.lidl.hr/c/online-katalog/s10027538'],
  ['Kaufland', 'https://www.kaufland.hr/aktualni-katalozi.html'],
  ['Spar', 'https://www.spar.hr/letci-i-katalozi'],
  ['Plodine', 'https://www.plodine.hr/aktualni-katalozi'],
  ['Studenac', 'https://www.studenac.hr/pregled-kataloga/'],
  ['KTC', 'https://www.ktc.hr/'],
  ['Eurospin', 'https://www.eurospin.hr/katalog-eurospin/'],
];
function nacrtajKataloge() {
  const box = $('#katalozi');
  if (box.children.length) return;
  for (const [lanac, url] of KATALOZI) {
    const a = document.createElement('a');
    a.className = 'katalog';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `<span class="trgovina__lanac s-logom"><img alt="" src="logotipi/${LOGOTIPI[lanac]}"></span><span>${esc(lanac)}<small>Otvori katalog</small></span>`;
    box.appendChild(a);
  }
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
    b.addEventListener('click', () => { stanje.nedjelja = d; nacrtajNedjelje(); nacrtajKategoriju(); });
    nav.appendChild(b);
    if (d === stanje.nedjelja) requestAnimationFrame(() => b.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }
}

function nacrtajFiltere() {
  const tr = stanje.podaci.trgovine;
  const p = stanje.prikaz;
  document.querySelectorAll('.kartice [data-prikaz]').forEach(b => b.setAttribute('aria-selected', b.dataset.prikaz === p));
  posaljiPostavkeAndroidu(); // moji dućani / mjesta su se možda promijenili
  nacrtajObavijest();
  $('#brojMoji').textContent = stanje.moji.size ? `(${stanje.moji.size})` : '';
  $('#brojMjesta').textContent = stanje.mojaMjesta.size ? `(${stanje.mojaMjesta.size})` : '';
  $('#poljeMjesto').hidden = p !== 'sve';
  $('#mojaMjesta').hidden = p !== 'mjesta';
  $('#lanci').hidden = p === 'moji';
  $('#samoOtvoreni').parentElement.hidden = p === 'moji'; // svoje dućane uvijek vidiš, i kad su zatvoreni
  $('#mojaMjestaPopis').textContent = stanje.mojaMjesta.size
    ? [...stanje.mojaMjesta].sort((a, b) => a.localeCompare(b, 'hr')).join(', ') : 'Još nisi odabrao mjesta.';

  $('#mjesto').value = stanje.mjesto;
  $('#ocistiMjesto').hidden = !stanje.mjesto;
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

// ------------------------------------------------------------ detalji dućana i udaljenost
const DANI_TJEDNA = [['pon', 'Ponedjeljak'], ['uto', 'Utorak'], ['sri', 'Srijeda'], ['cet', 'Četvrtak'], ['pet', 'Petak'], ['sub', 'Subota']];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function detaljiHtml(t) {
  const danas = ['ned', 'pon', 'uto', 'sri', 'cet', 'pet', 'sub'][new Date(danasZagreb() + 'T12:00:00Z').getUTCDay()];
  let h = '';
  if (t.tjedan) {
    h += '<h4>Radno vrijeme</h4><table>';
    for (const [k, ime] of DANI_TJEDNA) {
      const v = t.tjedan[k];
      h += `<tr${k === danas ? ' class="danas"' : ''}><td>${ime}</td><td${v ? '' : ' class="zat"'}>${v ? esc(v.replace('-', ' – ')) : 'Zatvoreno'}</td></tr>`;
    }
    h += '</table>';
  } else {
    h += '<p>Trgovac ne objavljuje radno vrijeme za ostale dane.</p>';
  }
  const nn = nadolazecaNedjelja();
  const buduce = Object.keys(t.nedjelje).filter(d => d >= nn).sort();
  if (buduce.length) {
    h += '<h4>Nedjelje</h4><table>';
    for (const d of buduce.slice(0, 8)) {
      const { dan, mj } = dioDatuma(d);
      const s = statusTrgovine(t, d);
      h += `<tr><td>${dan}. ${MJESECI_PUNO[mj]}${blagdan(d) ? ' (' + blagdan(d) + ')' : ''}</td><td${s.tip === 'otvoreno' ? '' : ' class="zat"'}>${esc(s.tekst)}</td></tr>`;
    }
    h += '</table>';
  }
  return h;
}

function udaljenostKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

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
  const blizu = stanje.blizu && stanje.pozicija;
  if (blizu) {
    for (const x of prikaz) x.km = x.t.lat != null ? udaljenostKm(stanje.pozicija, x.t) : Infinity;
    prikaz.sort((a, b) => a.km - b.km || red[a.s.tip] - red[b.s.tip]);
  } else {
    prikaz.sort((a, b) => a.t.mjesto.localeCompare(b.t.mjesto, 'hr') ||
      red[a.s.tip] - red[b.s.tip] || a.t.lanac.localeCompare(b.t.lanac, 'hr'));
  }
  const tpl = $('#t-trgovina');
  let zadnjaGrupa = null;
  for (const { t, s: st, km } of prikaz) {
    const grupa = blizu ? 'Najbliže tebi' : t.mjesto;
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
    const adr = el.querySelector('.trgovina__adresa');
    adr.textContent = `${t.adresa}, ${t.mjesto}`;
    if (blizu && km !== Infinity) {
      const s = document.createElement('span');
      s.className = 'trgovina__udaljenost';
      s.textContent = ' · ' + (km < 1 ? Math.round(km * 1000 / 50) * 50 + ' m' : km.toFixed(1).replace('.', ',') + ' km');
      adr.appendChild(s);
    }
    const v = el.querySelector('.trgovina__vrijeme');
    v.textContent = st.tekst;
    v.classList.add(st.tip);
    // Karta po adresi (dio koordinata je samo središte mjesta)
    const q = `${t.lanac}, ${t.adresa}, ${t.mjesto}, Hrvatska`;
    el.querySelector('.karta').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    // Dodir na dućan: tjedni raspored i sljedeće nedjelje
    const det = el.querySelector('.trgovina__detalji');
    el.querySelector('.trgovina__tijelo').addEventListener('click', () => {
      if (det.hidden && !det.innerHTML) det.innerHTML = detaljiHtml(t);
      det.hidden = !det.hidden;
    });
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

// ------------------------------------------------------------ obavijest subotom (samo Android aplikacija)
const MOST = window.RadneNedjeljeApp || null;
stanje.obavijest = ucitaj('obavijest', false);

// Android pozadinski zadatak čita moje dućane/mjesta iz ovoga (ne vidi localStorage).
function posaljiPostavkeAndroidu() {
  if (!MOST) return;
  try {
    MOST.spremiPostavke(JSON.stringify({ moji: [...stanje.moji], mojaMjesta: [...stanje.mojaMjesta], obavijest: stanje.obavijest }));
  } catch (e) {}
}

function nacrtajObavijest() {
  const box = $('#obavijestSubota');
  box.hidden = !MOST || stanje.prikaz === 'sve';
  if (box.hidden) return;
  $('#obavijestPrekidac').checked = stanje.obavijest;
  $('#probnaObavijest').hidden = !stanje.obavijest;
  const sto = stanje.moji.size ? 'koji tvoji dućani sutra rade'
    : stanje.mojaMjesta.size ? 'koliko dućana u tvojim mjestima sutra radi' : 'koliko dućana u Međimurju sutra radi';
  $('#obavijestOpis').textContent = `Subotom između 17 i 22 h javi ${sto}.`;
}

$('#obavijestPrekidac').addEventListener('change', e => {
  stanje.obavijest = e.target.checked;
  spremi('obavijest', stanje.obavijest);
  posaljiPostavkeAndroidu();
  nacrtajObavijest();
  if (stanje.obavijest && MOST && !MOST.obavijestiDopustene()) MOST.traziObavijesti();
  else if (stanje.obavijest) pokaziPoruku('🔔 Javit ću ti subotom navečer');
});
$('#probnaObavijest').addEventListener('click', () => {
  if (!MOST) return;
  if (!MOST.obavijestiDopustene()) { MOST.traziObavijesti(); return; }
  MOST.probnaObavijest();
  pokaziPoruku('Probna obavijest stiže za par sekundi');
});
window.addEventListener('dopustenje', e => {
  if (e.detail.vrsta !== 'obavijesti') return;
  if (e.detail.dano) pokaziPoruku('🔔 Javit ću ti subotom navečer');
  else {
    stanje.obavijest = false;
    spremi('obavijest', false);
    posaljiPostavkeAndroidu();
    nacrtajObavijest();
    pokaziPoruku('Obavijesti nisu dopuštene — uključi ih u postavkama mobitela');
  }
});
posaljiPostavkeAndroidu();

// ------------------------------------------------------------ blizu mene
// Lokacija se koristi samo na mobitelu za računanje udaljenosti i nigdje se ne šalje.
$('#blizuMene').addEventListener('click', () => {
  const gumb = $('#blizuMene');
  if (stanje.blizu) {
    stanje.blizu = false;
    gumb.setAttribute('aria-pressed', 'false');
    nacrtajPopis();
    return;
  }
  if (!navigator.geolocation) { pokaziPoruku('Lokacija nije dostupna na ovom uređaju'); return; }
  pokaziPoruku('Tražim tvoju lokaciju…');
  navigator.geolocation.getCurrentPosition(p => {
    stanje.pozicija = { lat: p.coords.latitude, lng: p.coords.longitude };
    stanje.blizu = true;
    gumb.setAttribute('aria-pressed', 'true');
    nacrtajPopis();
    pokaziPoruku('Dućani su složeni po udaljenosti');
    window.scrollTo({ top: $('#popis').offsetTop - 140, behavior: 'smooth' });
  }, () => {
    pokaziPoruku('Lokacija nije dopuštena ili nije dostupna');
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
});

// ------------------------------------------------------------ događaji
function postaviPrikaz(p) {
  stanje.prikaz = p;
  spremi('prikaz', p);
  nacrtajFiltere();
  nacrtajPopis();
}
document.querySelectorAll('.kartice [data-prikaz]').forEach(b => b.addEventListener('click', () => postaviPrikaz(b.dataset.prikaz)));
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
      $('#ocistiMjesto').hidden = false;
      $('#mjesto').blur(); // zatvori tipkovnicu
      nacrtajPrijedloge();
      nacrtajPopis();
    });
    box.appendChild(b);
  }
  box.hidden = !nadjena.length;
}
// Android tipkovnice ne javljaju svako brisanje istim događajem — sluša se više njih.
function promjenaMjesta() {
  const v = $('#mjesto').value;
  $('#ocistiMjesto').hidden = !v;
  if (v === stanje.mjesto) return;
  stanje.mjesto = v;
  spremi('mjesto', v);
  nacrtajPrijedloge();
  nacrtajPopis();
}
for (const dog of ['input', 'change', 'keyup', 'search', 'compositionend']) $('#mjesto').addEventListener(dog, promjenaMjesta);
$('#mjesto').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('#ocistiMjesto').addEventListener('click', () => {
  $('#mjesto').value = '';
  promjenaMjesta();
});
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
