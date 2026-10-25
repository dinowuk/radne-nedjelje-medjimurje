// Najave događanja sa službenih stranica općina i gradova Međimurja (RSS).
// Uzimaju se samo objave čiji naslov zvuči kao događanje (festival, koncert, sajam…);
// natječaji, sjednice, radovi, obavijesti i sl. se preskaču. RSS daje datum objave, ne datum događanja.

const Z = require('./zajednicko');

const IZVORI = {
  'Čakovec': 'https://www.cakovec.hr/feed/',
  'Mursko Središće': 'https://mursko-sredisce.hr/feed/',
  'Prelog': 'https://www.prelog.hr/rss.php',
  'Belica': 'https://www.belica.hr/wp/feed/',
  'Donji Kraljevec': 'https://www.donjikraljevec.hr/feed/',
  'Gornji Mihaljevec': 'https://www.gornjimihaljevec.hr/feed/',
  'Orehovica': 'https://orehovica.hr/feed/',
  'Pribislavec': 'https://pribislavec.hr/feed/',
  'Selnica': 'https://www.selnica.hr/feed/',
  'Sveti Juraj na Bregu': 'https://www.svetijurajnabregu.hr/feed/',
  'Šenkovec': 'https://senkovec.hr/feed/',
  'Štrigova': 'https://opcinastrigova.hr/feed/',
};
const DANA_UNAZAD = 30;

// Riječi koje znače događanje / riječi koje znače da to NIJE (provjerava se bez kvačica, malim slovima)
const DA = /manifestacij|festival|koncert|sajam|sajm|fasnik|fasenk|maskenbal|martin(je|ska|sk)|berb|smotr|turnir|utrk|izlozb|predstav|kazalis|proslav|dan(i)? (opcine|grada|zupe|sela)|advent|uskrs|vincek|urbanov|vinsk|gulas|kotlovin|degustacij|radionic|zabav|party|tulum|svecan|dodite|docek|\bfest\b|mimohod|kup hrvatske|memorijal|bicikl|pohod|setnj|trcanj|kino|projekcij|promocij|predavanj|tribin|cajank|druzenj/;
// Ne: administracija, obavijesti i izvještaji o već održanom (RSS ne zna datum događanja, pa se gleda vrijeme glagola)
const NE = /natjecaj|javni poziv|poziv za|poziv na (prijav|podnos|sudjelovanje u|predlag)|kandidat|sjednic|radov|obavijest|odluk|proracun|zaposljav|stipendij|rezultat|zatvaranj|prekid|iskljucenj|struj|vodoopskrb|nerazvrstan|cest[ae] |izbor|savjetovanj|oglas|zahtjev|mjer[ae] |potpor|subvencij|trgovine otvorene|radno vrijeme|cijepljenj|odvoz|otpad|komunaln|porez|naknad|upis|prijav|lokacijsk|dozvol|plan |izmjen|nabav|ugovor|financij|obracun|pomoc|steta|stete|nepogod|bonov|predlaganj|\bodrzan|obiljezen|nastupil|proglasen|osvojil|zavrsen|bio je|bila je|uspjesn/;

const norm = s => Z.norm(s);
const dekod = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&#8211;|&ndash;/g, '–').replace(/&#8220;|&#8221;|&#8222;|&quot;/g, '"').replace(/&#8217;|&#039;|&#39;/g, "'")
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const polje = (item, ime) => dekod((item.match(new RegExp(`<${ime}[^>]*>([\\s\\S]*?)<\\/${ime}>`, 'i')) || [])[1]);

const jeNajava = naslov => { const n = norm(naslov); return DA.test(n) && !NE.test(n); };

async function najave(upozorenja) {
  const granica = Date.now() - DANA_UNAZAD * 86400000;
  const out = [];
  await Promise.all(Object.entries(IZVORI).map(async ([opcina, url]) => {
    let xml;
    try { xml = await Z.dohvati(url); } catch (e) { upozorenja.push(`Najave ${opcina}: ${e.message}`); return; }
    for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
      const it = m[0];
      const naslov = polje(it, 'title');
      const datum = new Date(polje(it, 'pubDate') || polje(it, 'dc:date'));
      if (!naslov || isNaN(datum) || datum.getTime() < granica || !jeNajava(naslov)) continue;
      // Neke stranice na početak opisa stavljaju svoje ime ("Grad Čakovec Grad Čakovec - Službene stranice Grada Čakovca")
      let opis = polje(it, 'description').replace(/^.*?Službene (web )?stranice [^\s]+ [^\s]+\s*/i, '');
      if (opis.length > 220) opis = opis.slice(0, opis.lastIndexOf(' ', 220)) + '…';
      const slika = (it.match(/<(?:media:content|enclosure)[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || it.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || null;
      out.push({
        id: 'na-' + Buffer.from(polje(it, 'link') || naslov).toString('base64').slice(-16),
        naslov, opcina, objavljeno: datum.toISOString().slice(0, 10), opis,
        link: polje(it, 'link'), slika,
      });
    }
  }));
  out.sort((a, b) => b.objavljeno.localeCompare(a.objavljeno));
  return out;
}

module.exports = { najave, jeNajava, IZVORI };
