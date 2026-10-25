// Zajedničke pomoćne funkcije za dohvat radnih nedjelja.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function dohvati(url, { json = false, pokusaja = 3 } = {}) {
  let zadnja;
  for (let i = 0; i < pokusaja; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': json ? 'application/json,*/*' : 'text/html,*/*', 'Accept-Language': 'hr-HR,hr;q=0.9' },
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} za ${url}`);
      return json ? await r.json() : await r.text();
    } catch (e) {
      zadnja = e;
      await new Promise(res => setTimeout(res, 2000 * (i + 1)));
    }
  }
  throw zadnja;
}

// Naselja Međimurske županije (hr.wikipedia.org, Međimurska županija).
const NASELJA = ('Čakovec, Ivanovec, Krištanovec, Kuršanec, Mačkovec, Mihovljan, Novo Selo na Dravi, Novo Selo Rok, Savska Ves, Slemenice, Šandorovec, Štefanec, Totovec, Žiškovec, ' +
  'Hlapičina, Križovec, Mursko Središće, Peklenica, Štrukovec, Cirkovljan, Čehovec, Čukovec, Draškovec, Hemuševec, Oporovec, Otok, Prelog, Belica, Gardinovec, Dekanovec, Domašinec, Turčišće, ' +
  'Donja Dubrava, Donji Hrašćan, Donji Kraljevec, Donji Pustakovec, Hodošan, Palinovec, Sveti Juraj u Trnju, Donji Vidovec, Goričan, Badličan, Bogdanovec, Dragoslavec Breg, Dragoslavec Selo, ' +
  'Gornja Dubrava, Gornji Mihaljevec, Martinuševec, Preseka, Prhovec, Tupkovec, Vugrišinec, Vukanovec, Kotoriba, Držimurec, Mala Subotica, Palovec, Piškorovec, Strelec, Sveti Križ, Črečan, ' +
  'Dunjkovec, Gornji Hrašćan, Gornji Kuršanec, Macinec, Nedelišće, Parag, Pretetinec, Pušćine, Slakovec, Trnovec, Orehovica, Podbrest, Vularija, Celine, Ferketinec, Miklavec, Novakovec, ' +
  'Podturen, Sivica, Pribislavec, Bukovec, Donji Koncovčak, Donji Zebanec, Gornji Zebanec, Merhatovec, Plešivica, Praporčan, Selnica, Zaveščak, Zebanec Selo, Strahoninec, Donji Mihaljevec, ' +
  'Sveta Marija, Brezje, Dragoslavec, Frkanovec, Lopatinec, Mali Mihaljevec, Okrugli Vrh, Pleškovec, Vučetinec, Zasadbreg, Brezovec, Čestijanec, Gornji Koncovčak, Gradiščak, Grkaveščak, ' +
  'Jurovčak, Jurovec, Kapelščak, Lapšina, Marof, Sveti Martin na Muri, Toplice Sveti Martin, Vrhovljan, Žabnik, Knezovec, Šenkovec, Banfi, Grabrovnik, Jalšovec, Leskovec, Prekopa, Robadje, ' +
  'Stanetinec, Sveti Urban, Štrigova, Železna Gora, Gornji Kraljevec, Vratišinec').split(', ');

// Imena koja postoje i izvan Međimurja — za izvore bez poštanskog broja (Studenac) se ne prihvaćaju.
const DVOSMISLENA = new Set(['otok', 'marof', 'brezje', 'leskovec', 'bukovec', 'brezovec', 'prekopa', 'parag', 'strelec', 'dragoslavec',
  'preseka', 'jurovec', 'palovec', 'selnica', 'celine', 'trnovec', 'sivica', 'belica', 'knezovec', 'sveti kriz', 'gornja dubrava', 'okrugli vrh']);

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const PO_IMENU = new Map(NASELJA.map(n => [norm(n), n]));
// Krivo napisana imena u izvorima.
PO_IMENU.set('gradinovec', 'Gardinovec');

// Vrati pravo ime naselja (s dijakritikom) ili null ako nije u Međimurju.
function naselje(ime) {
  return PO_IMENU.get(norm(ime)) || null;
}

const jeMedjimurskiPostanski = pb => /^40\d{3}$/.test(String(pb || '').trim());

// Datumi računati po zagrebačkom vremenu, kao 'YYYY-MM-DD'.
function danasZagreb(sada = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sada);
}
function dodajDane(datum, n) {
  const d = new Date(datum + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const danUTjednu = datum => new Date(datum + 'T12:00:00Z').getUTCDay(); // 0 = nedjelja
const jeNedjelja = datum => danUTjednu(datum) === 0;

// Nadolazeća nedjelja: danas ako je nedjelja, inače sljedeća.
function nadolazecaNedjelja(sada = new Date()) {
  const d = danasZagreb(sada);
  return dodajDane(d, (7 - danUTjednu(d)) % 7);
}

const hhmm = s => {
  const m = String(s || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? m[1].padStart(2, '0') + ':' + m[2] : null;
};
// "07:00 - 21:00" -> "07:00-21:00"; ništa/zatvoreno -> null
function raspon(tekst) {
  const m = String(tekst || '').match(/(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/);
  if (!m) return null;
  const od = hhmm(m[1]), doo = hhmm(m[2]);
  if (od === '00:00' && doo === '00:00') return null;
  return od + '-' + doo;
}

module.exports = { dohvati, naselje, norm, DVOSMISLENA, jeMedjimurskiPostanski, danasZagreb, dodajDane, jeNedjelja, nadolazecaNedjelja, hhmm, raspon };
