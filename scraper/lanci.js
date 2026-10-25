// Dohvat poslovnica u Međimurju i njihovog nedjeljnog radnog vremena, po lancu.
// Svaka funkcija vraća niz trgovina:
//   { id, lanac, naziv, adresa, mjesto, lat, lng, nedjelje: { 'YYYY-MM-DD': '08:00-14:00' | 'otvoreno' | null } }
// null = zatvoreno, 'otvoreno' = radi, ali vrijeme nije objavljeno.
// Upisuju se samo nedjelje za koje izvor stvarno daje podatak.

const Z = require('./zajednicko');

const decode = s => String(s || '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- Konzum
async function konzum(sada) {
  const j = await Z.dohvati('https://trgovine.konzum.hr/api/locations/', { json: true });
  const out = [];
  for (const l of j.locations || []) {
    const m = String(l.address || '').match(/^(.*?),\s*(40\d{3})\s+(.+)$/);
    if (!m) continue;
    const mjesto = Z.naselje(m[3]) || m[3].trim();
    const dani = JSON.parse(l.work_hours || '[]');
    // Nedjelja bez radnog vremena nema datum — izvodi se iz susjednog dana.
    const datumi = dani.map(d => (d.from_hour ? d.from_hour.slice(0, 10) : null));
    for (let i = 0; i < dani.length; i++) {
      if (datumi[i]) continue;
      if (i + 1 < dani.length && datumi[i + 1]) datumi[i] = Z.dodajDane(datumi[i + 1], -1);
      else if (i > 0 && datumi[i - 1]) datumi[i] = Z.dodajDane(datumi[i - 1], 1);
    }
    const nedjelje = {};
    dani.forEach((d, i) => {
      const dat = datumi[i];
      if (!dat || !Z.jeNedjelja(dat)) return;
      nedjelje[dat] = d.from_hour && d.to_hour ? Z.hhmm(d.from_hour.slice(11)) + '-' + Z.hhmm(d.to_hour.slice(11)) : null;
    });
    const nn = Z.nadolazecaNedjelja(sada);
    if (!(nn in nedjelje) && typeof l.open_this_sunday === 'boolean') nedjelje[nn] = l.open_this_sunday ? 'otvoreno' : null;
    out.push({
      id: 'konzum-' + l.id, lanac: 'Konzum', naziv: 'Konzum',
      adresa: m[1].trim(), mjesto, lat: l.coordinates && l.coordinates.lat, lng: l.coordinates && l.coordinates.lng, nedjelje,
    });
  }
  return out;
}

// ---------------------------------------------------------------- Lidl
// Nuxt _payload.json je "devalue" format (spljošteni niz s referencama).
function unflatten(arr) {
  const h = new Array(arr.length);
  const OMOTI = ['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'EmptyRef', 'Set', 'Map'];
  function v(i) {
    if (i === -1) return undefined;
    if (h[i] !== undefined) return h[i];
    const x = arr[i];
    if (x === null || typeof x !== 'object') return (h[i] = x);
    if (Array.isArray(x)) {
      if (typeof x[0] === 'string' && OMOTI.includes(x[0])) return (h[i] = v(x[1]));
      if (x[0] === 'Date') return (h[i] = x[1]);
      const o = []; h[i] = o; for (const j of x) o.push(v(j)); return o;
    }
    const o = {}; h[i] = o; for (const k in x) o[k] = v(x[k]); return o;
  }
  return v(0);
}
const slug = s => Z.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function lidlTrgovine(o) {
  const nadjene = [];
  (function walk(x) {
    if (!x || typeof x !== 'object') return;
    if (x.objectNumber && x.address && x.openingHours) nadjene.push(x);
    for (const k in x) walk(x[k]);
  })(o);
  return nadjene;
}

async function lidl() {
  const baza = 'https://www.lidl.hr/s/hr-HR/trazilica-trgovina/';
  const poBroju = new Map();
  // Polazište: stranica Čakovca; "nearbyStores" otkriva ostale (npr. Prelog).
  const start = unflatten(await Z.dohvati(baza + 'cakovec/_payload.json', { json: true }));
  for (const t of lidlTrgovine(start)) if (Z.jeMedjimurskiPostanski(t.address.zip)) poBroju.set(t.objectNumber, t);

  const out = [];
  for (const [broj, t] of poBroju) {
    const a = t.address;
    const ulica = [a.streetName, a.streetNumber].filter(Boolean).join(' ');
    let detalj = t;
    try {
      const o = unflatten(await Z.dohvati(`${baza}${slug(a.city)}/${slug(ulica)}/_payload.json`, { json: true }));
      detalj = lidlTrgovine(o).find(x => x.objectNumber === broj && (x.openingHours.items || []).length > 2) || t;
    } catch (e) { /* ostaje kraći popis iz "nearbyStores" */ }
    const nedjelje = {};
    for (const it of detalj.openingHours.items || []) {
      if (!Z.jeNedjelja(it.date)) continue;
      const r = (it.timeRanges || [])[0];
      nedjelje[it.date] = r ? Z.hhmm(r.from.slice(11)) + '-' + Z.hhmm(r.to.slice(11)) : null;
    }
    out.push({
      id: 'lidl-' + broj, lanac: 'Lidl', naziv: 'Lidl', adresa: ulica, mjesto: Z.naselje(a.city) || a.city,
      lat: detalj.location && detalj.location.latitude, lng: detalj.location && detalj.location.longitude, nedjelje,
    });
  }
  return out;
}

// ---------------------------------------------------------------- Kaufland
async function kaufland(sada) {
  const j = await Z.dohvati('https://www.kaufland.hr/.klstorefinder.json', { json: true });
  const nn = Z.nadolazecaNedjelja(sada);
  const out = [];
  for (const s of j) {
    if (!Z.jeMedjimurskiPostanski(s.pc)) continue;
    const nedjelje = {};
    for (const e of s.sod || []) {
      const [dat, od, doo] = String(e).split('|');
      if (Z.jeNedjelja(dat)) nedjelje[dat] = Z.raspon(od + '-' + doo);
    }
    if (!(nn in nedjelje)) {
      const ned = (s.wod || []).find(e => e.startsWith('Sunday|'));
      nedjelje[nn] = ned ? Z.raspon(ned.split('|').slice(1).join('-')) : null;
    }
    out.push({
      id: 'kaufland-' + s.n, lanac: 'Kaufland', naziv: 'Kaufland', adresa: s.sn, mjesto: Z.naselje(s.t) || s.t,
      lat: +s.lat, lng: +s.lng, nedjelje,
    });
  }
  return out;
}

// ---------------------------------------------------------------- Spar / Interspar
async function spar(sada) {
  const j = await Z.dohvati('https://www.spar.hr/content/sparhrwebsite/hr_HR/index/lokacije/_jcr_content.stores.v2.html', { json: true });
  const nn = Z.nadolazecaNedjelja(sada);
  const vrijeme = x => (x ? String(x.hourOfDay).padStart(2, '0') + ':' + String(x.minute).padStart(2, '0') : null);
  const out = [];
  for (const s of j) {
    if (!Z.jeMedjimurskiPostanski(s.zipCode)) continue;
    if (s.temporarilyClosed) continue;
    const nedjelje = {};
    for (const p of s.specialShopHours || []) {
      const d = p.openingHours && p.openingHours.dayType;
      if (!d || typeof d !== 'object') continue;
      // Java kalendar: mjesec počinje od 0.
      const dat = `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.dayOfMonth).padStart(2, '0')}`;
      if (!Z.jeNedjelja(dat)) continue;
      const o = p.openingHours;
      nedjelje[dat] = o.from1 && o.to1 ? vrijeme(o.from1) + '-' + vrijeme(o.to1) : null;
    }
    if (!(nn in nedjelje)) {
      const st = (s.shopHours || []).find(h => h.openingHours && h.openingHours.dayType === 'nedjelja' && h.timeperiod && h.timeperiod.timeperiodType === 'standard');
      nedjelje[nn] = st && st.openingHours.from1 ? vrijeme(st.openingHours.from1) + '-' + vrijeme(st.openingHours.to1) : null;
    }
    out.push({
      id: 'spar-' + s.locationId, lanac: /interspar/i.test(s.name) ? 'Interspar' : 'Spar', naziv: s.name.replace(/\s+/g, ' ').trim(),
      adresa: s.address, mjesto: Z.naselje(s.city) || s.city, lat: s.latitude, lng: s.longitude, nedjelje,
    });
  }
  return out;
}

// ---------------------------------------------------------------- Plodine
async function plodine(sada) {
  const html = await Z.dohvati('https://www.plodine.hr/supermarketi');
  const nn = Z.nadolazecaNedjelja(sada);
  const out = [];
  const blokovi = html.split('<li class="market').slice(1);
  for (const b of blokovi) {
    const lok = [...b.matchAll(/<div class="market__location">([\s\S]*?)<\/div>/g)][0];
    if (!lok) continue;
    const p = [...lok[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => decode(x[1]));
    const pm = (p[1] || '').match(/^(40\d{3})\s+(.+)$/);
    if (!pm) continue;
    const naslov = b.match(/market__title"><a href="[^"]*\/supermarketi\/(\d+)\/[^"]*">([^<]*)<\/a>/);
    const radi = /data-open-on-sunday="true"/.test(b.slice(0, 200));
    const ned = b.match(/Nedjelja\s*:<\/span>\s*<strong[^>]*>([^<]*)<\/strong>/);
    const vrijeme = ned ? Z.raspon(ned[1]) : null;
    out.push({
      id: 'plodine-' + (naslov ? naslov[1] : slug(p[0])), lanac: 'Plodine', naziv: naslov ? decode(naslov[2]) : 'Plodine',
      adresa: p[0], mjesto: Z.naselje(pm[2]) || pm[2], lat: null, lng: null,
      nedjelje: { [nn]: radi ? (vrijeme || 'otvoreno') : null },
    });
  }
  return out;
}

// ---------------------------------------------------------------- Studenac
async function studenac(sada, upozorenja) {
  const html = await Z.dohvati('https://www.studenac.hr/trgovine');
  const nn = Z.nadolazecaNedjelja(sada);
  const out = [];
  const re = /data-store-id="(\d+)"[^>]*data-open-on-sunday="(\w+)"[\s\S]*?card__title">([^<]*)<\/h3>[\s\S]*?href="(https:\/\/www\.studenac\.hr\/trgovine\/[^"]+)"/g;
  for (const m of html.matchAll(re)) {
    const naslov = decode(m[3]);
    const dijelovi = naslov.split(',');
    const grad = dijelovi.pop();
    const mjesto = Z.naselje(grad);
    if (!mjesto) continue;
    if (Z.DVOSMISLENA.has(Z.norm(grad))) {
      upozorenja.push(`Studenac: preskočena "${naslov}" (ime mjesta postoji i izvan Međimurja)`);
      continue;
    }
    const radi = m[2] === 'true';
    let vrijeme = null;
    if (radi) {
      try {
        const d = await Z.dohvati(m[4]);
        const ned = d.match(/Nedjelja:\s*<strong>([^<]*)<\/strong>/);
        vrijeme = ned ? Z.raspon(ned[1]) : null;
      } catch (e) { /* bez vremena */ }
    }
    out.push({
      id: 'studenac-' + m[1], lanac: 'Studenac', naziv: 'Studenac', adresa: dijelovi.join(',').trim(), mjesto,
      lat: null, lng: null, nedjelje: { [nn]: radi ? (vrijeme || 'otvoreno') : null },
    });
  }
  return out;
}

// ---------------------------------------------------------------- KTC
async function ktc(sada) {
  const html = await Z.dohvati('https://www.ktc.hr/');
  const nn = Z.nadolazecaNedjelja(sada);
  const out = [];
  for (const m of html.matchAll(/\{"ID":"(\d+)","Type":"(\d+)"[^{}]*?\}/g)) {
    let o;
    try { o = JSON.parse(m[0]); } catch (e) { continue; }
    if (o.Type !== '2' && o.Type !== '1') continue; // 1/2 = hipermarket/supermarket; 3 restoran, 4 poljoljekarna
    if (!Z.jeMedjimurskiPostanski(o.Zip)) continue;
    const ned = String(o.WorkHoures || '').split(';').find(x => /^\s*Ned/i.test(x));
    out.push({
      id: 'ktc-' + o.ID, lanac: 'KTC', naziv: o.Name, adresa: o.Address, mjesto: Z.naselje(o.City) || o.City,
      lat: +o.PositionX || null, lng: +o.PositionY || null, nedjelje: { [nn]: ned ? Z.raspon(ned) : null },
    });
  }
  return out;
}

// ---------------------------------------------------------------- Eurospin
async function eurospin(sada) {
  const html = await Z.dohvati('https://www.eurospin.hr/nase-poslovnice/');
  const nn = Z.nadolazecaNedjelja(sada);
  const out = [];
  const re = /\{"name":"((?:[^"\\]|\\.)*)","lat":([\d.]+),"lng":([\d.]+),[^{}]*?"content":"((?:[^"\\]|\\.)*)","url":"((?:[^"\\]|\\.)*)"/g;
  for (const m of html.matchAll(re)) {
    const sadrzaj = JSON.parse('"' + m[4] + '"');
    const linije = sadrzaj.split(/<br\s*\/?>/i).map(decode);
    const pm = (linije[1] || '').match(/^(40\d{3}),\s*(.+?)(\s+[A-ZČĆŠŽĐ]{2})?$/);
    if (!pm) continue;
    const ned = linije.find(x => /^Nedjelja/i.test(x));
    out.push({
      id: 'eurospin-' + slug(JSON.parse('"' + m[1] + '"')), lanac: 'Eurospin', naziv: 'Eurospin', adresa: linije[0],
      mjesto: Z.naselje(pm[2]) || pm[2], lat: +m[2], lng: +m[3], nedjelje: { [nn]: ned ? Z.raspon(ned) : null },
    });
  }
  return out;
}

// ---------------------------------------------------------------- Trgovina Krk
// Tablica za cijelu godinu: stupci su datumi nedjelja (m/d/yyyy), ✔ = radi.
async function trgovinaKrk() {
  const html = await Z.dohvati('https://trgovina-krk.hr/raspored-rada-nedjeljom/');
  const thead = (html.match(/<thead>([\s\S]*?)<\/thead>/) || [])[1] || '';
  const stupci = {}; // broj stupca -> 'YYYY-MM-DD'
  for (const m of thead.matchAll(/class="column-(\d+)">\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*</g)) {
    stupci[m[1]] = `${m[4]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  if (!Object.keys(stupci).length) throw new Error('nema stupaca s datumima');
  // "G. Kuršanec", "M.Mihaljevec", "D. Hrašćan" -> puna imena
  const PRATI = [[/^G\.\s*/i, 'Gornji '], [/^D\.\s*/i, 'Donji '], [/^M\.\s*/i, 'Mali '], [/^N\.\s*/i, 'Novo ']];
  const pronadjiNaselje = s => {
    if (Z.naselje(s)) return Z.naselje(s);
    for (const [re, z] of PRATI) if (re.test(s) && Z.naselje(s.replace(re, z))) return Z.naselje(s.replace(re, z));
    return null;
  };
  const out = [];
  for (const red of html.matchAll(/<tr class="row-\d+">([\s\S]*?)<\/tr>/g)) {
    const celije = {};
    for (const c of red[1].matchAll(/<td class="column-(\d+)">([\s\S]*?)<\/td>/g)) celije[c[1]] = decode(c[2]);
    const adresa = celije['2'] || '';
    const pm = adresa.match(/^(.*),\s*(40\d{3})\s+(.+)$/);
    if (!pm) continue;
    const dijelovi = pm[1].split(',').map(s => s.trim()).filter(Boolean);
    let mjesto = null;
    if (dijelovi.length > 1) mjesto = pronadjiNaselje(dijelovi[dijelovi.length - 1]);
    if (mjesto) dijelovi.pop();
    mjesto = mjesto || Z.naselje(pm[3]) || pm[3].charAt(0) + pm[3].slice(1).toLowerCase();
    const vrijeme = Z.raspon(celije['3']);
    const nedjelje = {};
    for (const [st, dat] of Object.entries(stupci)) {
      const v = celije[st];
      if (v === undefined) continue;
      nedjelje[dat] = /✔|✓/.test(v) ? (vrijeme || 'otvoreno') : null;
    }
    out.push({
      id: 'krk-' + celije['1'], lanac: 'Trgovina Krk', naziv: 'Trgovina Krk', adresa: dijelovi.join(', ').replace(/\s+/g, ' '),
      mjesto, lat: null, lng: null, nedjelje,
    });
  }
  return out;
}

// ---------------------------------------------------------------- NTL (Narodni trgovački lanac)
async function ntl(sada) {
  const html = await Z.dohvati('https://ntl.hr/prodajna-mjesta/');
  const i = html.indexOf('var locations = [');
  if (i < 0) throw new Error('nema "var locations"');
  const kraj = html.indexOf('];', i);
  const lok = JSON.parse(html.slice(i + 'var locations = '.length, kraj + 1));
  const nn = Z.nadolazecaNedjelja(sada);
  const out = [];
  for (const l of lok) {
    const pm = String(l.place || '').match(/^(40\d{3})\s+(.+)$/);
    if (!pm) continue;
    const ned = (l.working_hours || []).find(w => /^Nedjelja/i.test(w.name));
    const vrijeme = ned ? Z.raspon(ned.time) : null;
    // Naselje je često u ulici: "Okrugli Vrh 62 Lopatinec", "Glavna ul. 24 Macinec"; pošta je samo rezerva.
    let adresa = decode(l.street);
    let mjesto = null;
    const prije = adresa.match(/^([^\d]+?)\s+\d/);
    if (prije && Z.naselje(prije[1])) mjesto = Z.naselje(prije[1]);
    if (!mjesto) {
      const rijeci = adresa.split(' ');
      for (let n = 3; n >= 1 && !mjesto; n--) {
        if (rijeci.length <= n) continue;
        const kandidat = Z.naselje(rijeci.slice(-n).join(' '));
        if (kandidat && /\d/.test(rijeci[rijeci.length - n - 1])) { mjesto = kandidat; adresa = rijeci.slice(0, -n).join(' '); }
      }
    }
    mjesto = mjesto || Z.naselje(pm[2]) || pm[2];
    out.push({
      id: 'ntl-' + l.id, lanac: 'NTL', naziv: 'NTL', adresa, mjesto,
      lat: l.position ? +l.position.lat : null, lng: l.position ? +l.position.lng : null,
      nedjelje: { [nn]: l.open_this_sunday ? (vrijeme || 'otvoreno') : null },
    });
  }
  return out;
}

module.exports = { 'Trgovina Krk': trgovinaKrk, NTL: ntl, Konzum: konzum, Lidl: lidl, Kaufland: kaufland, Spar: spar, Plodine: plodine, Studenac: studenac, KTC: ktc, Eurospin: eurospin };
