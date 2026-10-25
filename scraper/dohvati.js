// Dohvati radne nedjelje svih lanaca i spoji s prethodnim podacima.
// Pokretanje:  node scraper/dohvati.js [izlaz.json]
// Ako lanac ne uspije, zadržavaju se njegovi prethodni podaci (i bilježi se greška).

const fs = require('fs');
const path = require('path');
const Z = require('./zajednicko');
const LANCI = require('./lanci');
const { dopuniKoordinate } = require('./koordinate');
const { centri: dohvatiCentre } = require('./centri');

const IZLAZ = process.argv[2] || path.join(__dirname, '..', 'docs', 'podaci', 'nedjelje.json');
const CUVAJ_PROSLE_DANA = 70;

async function main() {
  const sada = new Date();
  const danas = Z.danasZagreb(sada);
  let staro = { trgovine: [] };
  try { staro = JSON.parse(fs.readFileSync(IZLAZ, 'utf8')); } catch (e) { /* prvi put */ }
  const stareById = new Map((staro.trgovine || []).map(t => [t.id, t]));

  const greske = [];
  const upozorenja = [];
  const trgovine = [];
  const statusLanaca = {};

  for (const [lanac, fn] of Object.entries(LANCI)) {
    try {
      const nove = await fn(sada, upozorenja);
      if (!nove.length) throw new Error('nijedna poslovnica u Međimurju (promijenila se stranica?)');
      for (const t of nove) {
        const st = stareById.get(t.id);
        t.nedjelje = { ...(st ? st.nedjelje : {}), ...t.nedjelje };
        if (st && t.lat == null) { t.lat = st.lat; t.lng = st.lng; }
        trgovine.push(t);
      }
      statusLanaca[lanac] = { ok: true, poslovnica: nove.length, provjereno: sada.toISOString() };
      console.log(`${lanac}: ${nove.length} poslovnica`);
    } catch (e) {
      greske.push(`${lanac}: ${e.message}`);
      const stare = (staro.trgovine || []).filter(t => t.lanac === lanac || (lanac === 'Spar' && t.lanac === 'Interspar'));
      trgovine.push(...stare);
      statusLanaca[lanac] = { ok: false, poslovnica: stare.length, greska: e.message, provjereno: (staro.lanci && staro.lanci[lanac] && staro.lanci[lanac].provjereno) || null };
      console.error(`${lanac}: GREŠKA ${e.message} (zadržano ${stare.length} starih)`);
    }
  }

  // Trgovački centri (zaseban popis u aplikaciji)
  const centri = await dohvatiCentre(sada, upozorenja);
  const stariCentri = new Map((staro.centri || []).map(c => [c.id, c]));
  for (const c of centri) {
    const st = stariCentri.get(c.id);
    if (st) c.nedjelje = { ...st.nedjelje, ...c.nedjelje };
  }

  try {
    await dopuniKoordinate([...trgovine, ...centri], upozorenja);
  } catch (e) {
    upozorenja.push('Koordinate: ' + e.message);
  }

  // Brisanje starih nedjelja i sortiranje.
  const granica = Z.dodajDane(danas, -CUVAJ_PROSLE_DANA);
  const sveNedjelje = new Set();
  for (const t of [...trgovine, ...centri]) {
    const n = {};
    for (const d of Object.keys(t.nedjelje).sort()) if (d >= granica) { n[d] = t.nedjelje[d]; sveNedjelje.add(d); }
    t.nedjelje = n;
  }
  trgovine.sort((a, b) => a.mjesto.localeCompare(b.mjesto, 'hr') || a.lanac.localeCompare(b.lanac, 'hr') || a.adresa.localeCompare(b.adresa, 'hr'));

  const izlaz = {
    azurirano: sada.toISOString(),
    nadolazeca: Z.nadolazecaNedjelja(sada),
    nedjelje: [...sveNedjelje].sort(),
    lanci: statusLanaca,
    greske,
    upozorenja,
    trgovine,
    centri,
  };
  fs.mkdirSync(path.dirname(IZLAZ), { recursive: true });
  fs.writeFileSync(IZLAZ, JSON.stringify(izlaz, null, 1) + '\n');
  console.log(`Spremljeno ${trgovine.length} trgovina u ${IZLAZ}`);
  // Izlazni kod 1 samo ako je sve palo, da GitHub javi problem.
  if (greske.length === Object.keys(LANCI).length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
