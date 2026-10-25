// Restorani u Međimurju iz OpenStreetMapa (Overpass API). Podaci © OpenStreetMap suradnici, ODbL.
// Radno vrijeme se čita iz OSM oznake opening_hours (najčešći oblici; ostalo = "nije upisano").

const fs = require('fs');
const path = require('path');
const Z = require('./zajednicko');

const UA = 'KamFNedelu/1.0 (+https://github.com/dinowuk/radne-nedjelje-medjimurje)';
const POSLUZITELJI = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const UPIT = `[out:json][timeout:90];
area["boundary"="administrative"]["name"="Međimurska županija"]->.z;
nwr(area.z)["amenity"~"^(restaurant|fast_food)$"]["name"];
out tags center;`;
const MJESTA_KES = path.join(__dirname, '..', 'docs', 'podaci', 'restorani-mjesta.json');
// Zatvoreni restorani koje OSM još vodi (dojave korisnika)
const ISKLJUCENI = JSON.parse(fs.readFileSync(path.join(__dirname, 'restorani-iskljuceni.json'), 'utf8'));

const KUHINJE = {
  pizza: 'pizza', burger: 'burgeri', grill: 'roštilj', steak_house: 'steak', regional: 'domaća kuhinja', local: 'domaća kuhinja',
  croatian: 'hrvatska', italian: 'talijanska', chinese: 'kineska', fish: 'riba', seafood: 'riba', kebab: 'kebab',
  sandwich: 'sendviči', chicken: 'piletina', international: 'internacionalna', balkan: 'balkanska', mexican: 'meksička',
  asian: 'azijska', sushi: 'sushi', cake: 'kolači', coffee_shop: 'kava', ice_cream: 'sladoled', hungarian: 'mađarska',
};

// ---------------------------------------------------------------- opening_hours
const OSM_DANI = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const NASI = ['pon', 'uto', 'sri', 'cet', 'pet', 'sub', 'ned'];

// "Mo-Fr 12:00-23:00; Sa 11:00-22:00; Su,PH 12:00-23:00" -> { pon: '12:00-23:00', ..., ned: '12:00-23:00' } ili null
function citajRadnoVrijeme(oh) {
  const s = String(oh || '').trim();
  if (!s) return null;
  if (/^24\/7$/.test(s)) return Object.fromEntries(NASI.map(d => [d, '00:00-24:00']));
  const t = {};
  // Pravila dijeli ";" ili "," iza vremena ("…23:00, Sa …"); "Su,PH 08:00-23:00" je jedno pravilo.
  for (const pravilo of s.split(/;|(?<=\d|off|closed)\s*,(?=\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/)) {
    const m = pravilo.trim().match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)\s*(.*)$/);
    if (!m) {
      // bez dana = svaki dan ("10:00-22:00")
      const v = pravilo.trim().match(/^(\d\d:\d\d)\s*-\s*(\d\d:\d\d)/);
      if (v) for (const d of NASI) t[d] = `${v[1]}-${v[2]}`;
      continue;
    }
    const dani = new Set();
    for (const dio of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
      const r = dio.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
      if (!r) continue;
      const a = OSM_DANI.indexOf(r[1]), b = r[2] ? OSM_DANI.indexOf(r[2]) : a;
      for (let i = a; ; i = (i + 1) % 7) { dani.add(NASI[i]); if (i === b) break; }
    }
    const ostatak = m[2].trim();
    const vrijeme = /^off|closed/i.test(ostatak) ? null
      : (ostatak.match(/(\d\d:\d\d)\s*-\s*(\d\d:\d\d)/) || []).slice(1, 3).join('-') || undefined;
    if (vrijeme === undefined) continue;
    for (const d of dani) t[d] = vrijeme;
  }
  return Object.keys(t).length ? t : null;
}

// "Grad Čakovec" -> Čakovec, "Općina Donji Kraljevec" -> Donji Kraljevec, "Nedelišće - Pušćine" -> Pušćine
function ocistiMjesto(ime) {
  if (!ime) return null;
  let s = String(ime).replace(/^(Grad|Općina|Opcina)\s+/i, '').trim();
  if (s.includes(' - ')) s = s.split(' - ').pop().trim();
  return Z.naselje(s) || s;
}

// ---------------------------------------------------------------- mjesto (OSM često nema addr:city)
async function mjestoIzKoordinata(lat, lng, kes) {
  const k = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (k in kes) return kes[k];
  await new Promise(r => setTimeout(r, 1100));
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&lat=${lat}&lon=${lng}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'hr' }, signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  const a = j.address || {};
  const ime = a.village || a.town || a.city || a.hamlet || a.suburb || null;
  kes[k] = Z.naselje(ime) || ime;
  return kes[k];
}

async function restorani(upozorenja) {
  let j = null, zadnja;
  // Javni Overpass zna biti preopterećen: dva kruga po svim poslužiteljima, s pauzom.
  for (const url of [...POSLUZITELJI, ...POSLUZITELJI]) {
    if (zadnja) await new Promise(r => setTimeout(r, 10000));
    try {
      const r = await fetch(url, {
        method: 'POST', body: 'data=' + encodeURIComponent(UPIT),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      j = await r.json();
      break;
    } catch (e) { zadnja = e; }
  }
  if (!j) throw new Error('Overpass: ' + (zadnja && zadnja.message));

  let kes = {};
  try { kes = JSON.parse(fs.readFileSync(MJESTA_KES, 'utf8')); } catch (e) { /* prvi put */ }
  const out = [];
  for (const e of j.elements) {
    const t = e.tags || {};
    if (`osm-${e.type[0]}${e.id}` in ISKLJUCENI) continue;
    const lat = e.lat != null ? e.lat : e.center && e.center.lat;
    const lng = e.lon != null ? e.lon : e.center && e.center.lon;
    if (lat == null) continue;
    let mjesto = ocistiMjesto(t['addr:place'] || t['addr:city']);
    if (!mjesto) {
      try { mjesto = ocistiMjesto(await mjestoIzKoordinata(lat, lng, kes)); } catch (err) { upozorenja.push('Restorani, mjesto: ' + err.message); }
    }
    const tjedan = citajRadnoVrijeme(t.opening_hours);
    out.push({
      id: `osm-${e.type[0]}${e.id}`,
      naziv: t.name,
      vrsta: t.amenity === 'fast_food' ? 'brza hrana' : 'restoran',
      kuhinja: [...new Set(String(t.cuisine || '').split(';').map(c => KUHINJE[c.trim()] || '').filter(Boolean))].join(', '),
      mjesto: mjesto || 'Međimurje',
      adresa: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
      lat: +lat.toFixed(6), lng: +lng.toFixed(6),
      tel: t.phone || t['contact:phone'] || null,
      web: t.website || t['contact:website'] || t['contact:facebook'] || null,
      tjedan, // uključuje i ned; null = radno vrijeme nije upisano u OSM
    });
  }
  fs.writeFileSync(MJESTA_KES, JSON.stringify(kes, null, 1) + '\n');
  out.sort((a, b) => a.mjesto.localeCompare(b.mjesto, 'hr') || a.naziv.localeCompare(b.naziv, 'hr'));
  return out;
}

module.exports = { restorani, citajRadnoVrijeme };
