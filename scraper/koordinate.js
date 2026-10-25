// Koordinate za dućane kojima ih trgovac ne daje (Trgovina Krk, Lidl, Plodine, Studenac).
// Traže se preko OpenStreetMap Nominatima (max 1 upit/s, po pravilima usluge) i pamte u
// docs/podaci/koordinate.json, pa se svaki dan traže samo nove adrese.

const fs = require('fs');
const path = require('path');

const DATOTEKA = path.join(__dirname, '..', 'docs', 'podaci', 'koordinate.json');
const UA = 'RadneNedjeljeMedjimurje/1.0 (+https://github.com/dinowuk/radne-nedjelje-medjimurje)';
const MAX_UPITA = 300; // zaštita od predugog rada

// Međimurje (s malo rezerve) — rezultat izvan toga se odbacuje.
const uMedjimurju = (lat, lng) => lat > 46.24 && lat < 46.6 && lng > 16.2 && lng < 16.98;

const pauza = ms => new Promise(r => setTimeout(r, ms));

async function nominatim(parametri) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=hr&' + new URLSearchParams(parametri);
  await pauza(1100);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'hr' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('Nominatim HTTP ' + r.status);
  const j = await r.json();
  if (!j.length) return null;
  const lat = +j[0].lat, lng = +j[0].lon;
  return uMedjimurju(lat, lng) ? { lat, lng } : null;
}

// "S. Radića 22" -> "Radića 22"; "M. Tita 62" -> "Tita 62" (Nominatim bolje nađe bez inicijala)
const bezInicijala = ulica => ulica.replace(/\b[A-ZČĆŠŽĐ]\.\s*/g, '').replace(/\s+/g, ' ').trim();

async function dopuniKoordinate(trgovine, upozorenja) {
  let kes = {};
  try { kes = JSON.parse(fs.readFileSync(DATOTEKA, 'utf8')); } catch (e) { /* prvi put */ }
  let upita = 0;
  const mjesta = {}; // središta mjesta, unutar jednog pokretanja

  for (const t of trgovine) {
    if (t.lat != null && t.lng != null) continue;
    const kljuc = `${t.adresa}, ${t.mjesto}`;
    if (kes[kljuc]) { Object.assign(t, { lat: kes[kljuc].lat, lng: kes[kljuc].lng }); continue; }
    if (upita >= MAX_UPITA) continue;
    let k = null, tocnost = 'ulica';
    try {
      upita++;
      k = await nominatim({ street: bezInicijala(t.adresa), city: t.mjesto, country: 'Hrvatska' });
      if (!k) {
        tocnost = 'mjesto';
        if (!(t.mjesto in mjesta)) { upita++; mjesta[t.mjesto] = await nominatim({ q: `${t.mjesto}, Međimurska županija` }); }
        k = mjesta[t.mjesto];
      }
    } catch (e) {
      upozorenja.push(`Koordinate: ${kljuc}: ${e.message}`);
      continue;
    }
    if (!k) { upozorenja.push(`Koordinate: nije pronađeno "${kljuc}"`); continue; }
    kes[kljuc] = { lat: +k.lat.toFixed(6), lng: +k.lng.toFixed(6), tocnost };
    Object.assign(t, { lat: kes[kljuc].lat, lng: kes[kljuc].lng });
  }
  fs.mkdirSync(path.dirname(DATOTEKA), { recursive: true });
  fs.writeFileSync(DATOTEKA, JSON.stringify(kes, null, 1) + '\n');
  if (upita) console.log(`Koordinate: ${upita} upita prema Nominatimu`);
}

module.exports = { dopuniKoordinate };
