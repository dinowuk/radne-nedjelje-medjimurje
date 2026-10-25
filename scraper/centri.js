// Trgovački centri u Međimurju: rade li nedjeljom.
//   Stop Shop Čakovec — raspored je samo slika u PDF-u → ručno upisan u centri-rucno.json;
//                       ovdje se samo provjerava je li objavljen novi PDF.
//   Galerija Sjever    — prema C&A u centru (stranica ima strojno čitljiv popis posebnih dana).
// Vraća niz u istom obliku kao trgovine, uz vrsta: 'centar' i opis.

const fs = require('fs');
const path = require('path');
const Z = require('./zajednicko');

const RUCNO = JSON.parse(fs.readFileSync(path.join(__dirname, 'centri-rucno.json'), 'utf8'));

// Sve nedjelje od-do (uključivo)
function nedjeljeIzmedju(od, doo) {
  const out = [];
  let d = od;
  while (!Z.jeNedjelja(d)) d = Z.dodajDane(d, 1);
  for (; d <= doo; d = Z.dodajDane(d, 7)) out.push(d);
  return out;
}

async function stopShop(upozorenja) {
  const r = RUCNO['stop-shop-cakovec'];
  const nedjelje = {};
  for (const d of nedjeljeIzmedju(r.vrijedi_od, r.vrijedi_do)) nedjelje[d] = r.radne_nedjelje.includes(d) ? r.vrijeme : null;
  try {
    const html = await Z.dohvati(r.izvor);
    const id = (html.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || [])[1];
    if (id && id !== r.pdfId) upozorenja.push(`Stop Shop Čakovec: objavljen NOVI raspored nedjelja (${id}) — prepiši u scraper/centri-rucno.json`);
  } catch (e) {
    upozorenja.push('Stop Shop Čakovec: provjera novog rasporeda nije uspjela: ' + e.message);
  }
  if (Z.danasZagreb() > r.vrijedi_do) upozorenja.push('Stop Shop Čakovec: ručni raspored je istekao — treba upisati novi');
  return {
    id: 'centar-stop-shop-cakovec', vrsta: 'centar', lanac: 'Stop Shop', naziv: 'STOP SHOP Čakovec',
    adresa: 'Ulica 34. Inženjerijske bojne 2', mjesto: 'Čakovec', lat: null, lng: null, // koordinate iz keša (ista adresa kao Plodine)
    opis: 'Retail park. Radne nedjelje od 9 do 14 h; supermarket i kafić mogu imati drugačije vrijeme.',
    izvor: r.izvor, nedjelje, tjedan: null,
    // Trgovina radi kad radi centar (svojim nedjeljnim vremenom); s 'veza' prati vlastiti raspored.
    trgovine: r.trgovine,
  };
}

async function galerijaSjever() {
  const url = 'https://www.c-and-a.com/stores/hr-en/medimurje/cakovec/svetojelenska-cesta-25.html';
  const html = await Z.dohvati(url);
  const posebni = JSON.parse((html.match(/(\[\{"closedFlag"[\s\S]*?\}\])/) || [])[1] || '[]');
  const tjedno = (html.match(/"openingHours":\s*"([^"]+)"/) || [])[1] || '';
  const ned = (tjedno.match(/Su (\d\d:\d\d-\d\d:\d\d)/) || [])[1] || null;
  const tj = {};
  for (const [k, en] of [['pon', 'Mo'], ['uto', 'Tu'], ['sri', 'We'], ['cet', 'Th'], ['pet', 'Fr'], ['sub', 'Sa']]) {
    const m = tjedno.match(new RegExp(en + ' (\\d\\d:\\d\\d-\\d\\d:\\d\\d)'));
    tj[k] = m ? m[1] : null;
  }
  // C&A navodi samo iznimke; nedjelje do zadnjeg navedenog datuma su redovne.
  const zadnji = posebni.map(p => p.specialOpeningTimeDate).sort().pop() || Z.nadolazecaNedjelja();
  const nedjelje = {};
  for (const d of nedjeljeIzmedju(Z.nadolazecaNedjelja(), zadnji)) nedjelje[d] = ned;
  for (const p of posebni) {
    if (!Z.jeNedjelja(p.specialOpeningTimeDate)) continue;
    nedjelje[p.specialOpeningTimeDate] = p.closedFlag ? null : `${p.openingTime.slice(0, 5)}-${p.closingTime.slice(0, 5)}`;
  }
  return {
    id: 'centar-galerija-sjever', vrsta: 'centar', lanac: 'Galerija Sjever', naziv: 'Galerija Sjever',
    adresa: 'Svetojelenska cesta 25', mjesto: 'Čakovec', lat: 46.395973, lng: 16.428315,
    opis: 'Trgovački centar. Radno vrijeme centra prema trgovini C&A.',
    izvor: url, nedjelje, tjedan: Object.values(tj).some(Boolean) ? tj : null,
    trgovine: RUCNO['galerija-sjever'].trgovine,
  };
}

async function centri(sada, upozorenja) {
  const out = [];
  for (const [ime, fn] of [['Stop Shop', () => stopShop(upozorenja)], ['Galerija Sjever', galerijaSjever]]) {
    try { out.push(await fn()); } catch (e) { upozorenja.push(`${ime}: ${e.message}`); }
  }
  return out;
}

module.exports = { centri };
