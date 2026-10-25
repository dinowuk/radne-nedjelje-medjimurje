'use strict';
// Admin: ručne izmjene spremaju se u GitHub repozitorij (docs/podaci/uredjivanje.json, fotke u docs/slike/).
// Aplikacija čita tu datoteku i preklapa je preko automatski dohvaćenih podataka.

const REPO = 'dinowuk/radne-nedjelje-medjimurje';
const API = `https://api.github.com/repos/${REPO}/contents/`;
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const PUT_UREDJIVANJA = 'docs/podaci/uredjivanje.json';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bezKvacica = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
let porukaT;
const poruka = t => { const p = $('#poruka'); p.textContent = t; p.classList.add('vidljiva'); clearTimeout(porukaT); porukaT = setTimeout(() => p.classList.remove('vidljiva'), 2600); };

let token = '';
try { token = localStorage.getItem('adminToken') || ''; } catch (e) {}
let podaci = null;       // automatski podaci (nedjelje.json)
let ured = null;         // uredjivanje.json
let uredSha = null;      // sha za GitHub PUT

// ------------------------------------------------------------ GitHub
const zaglavlja = () => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' });
const b64 = str => btoa(unescape(encodeURIComponent(str)));
const odB64 = b => decodeURIComponent(escape(atob(b.replace(/\n/g, ''))));

async function ucitajUredjivanje() {
  const r = await fetch(API + PUT_UREDJIVANJA + '?ref=main&t=' + Date.now(), { headers: zaglavlja(), cache: 'no-store' });
  if (r.status === 404) { uredSha = null; return { restorani: {}, noviRestorani: [], dogadaji: { skriveni: [], novi: [] } }; }
  if (r.status === 401 || r.status === 403) throw new Error('Ključ nije ispravan ili nema pravo pisanja u repozitorij.');
  if (!r.ok) throw new Error('GitHub: HTTP ' + r.status);
  const j = await r.json();
  uredSha = j.sha;
  const u = JSON.parse(odB64(j.content));
  u.restorani = u.restorani || {}; u.noviRestorani = u.noviRestorani || [];
  u.dogadaji = u.dogadaji || {}; u.dogadaji.skriveni = u.dogadaji.skriveni || []; u.dogadaji.novi = u.dogadaji.novi || [];
  return u;
}

async function spremiUredjivanje(opis) {
  ured.azurirano = new Date().toISOString();
  const tijelo = { message: 'Admin: ' + opis, content: b64(JSON.stringify(ured, null, 1) + '\n'), branch: 'main' };
  if (uredSha) tijelo.sha = uredSha;
  const r = await fetch(API + PUT_UREDJIVANJA, { method: 'PUT', headers: { ...zaglavlja(), 'Content-Type': 'application/json' }, body: JSON.stringify(tijelo) });
  if (r.status === 409) { // netko je u međuvremenu spremio — ponovno učitaj i pokušaj
    const svjeze = await ucitajUredjivanje();
    ured = { ...svjeze, ...ured };
    return spremiUredjivanje(opis);
  }
  if (!r.ok) throw new Error('Spremanje nije uspjelo: HTTP ' + r.status);
  uredSha = (await r.json()).content.sha;
}

// Fotka: smanji na max 1200 px (JPEG) i spremi u docs/slike/ (jelovnik do 1800 px, da se tekst može čitati)
async function posaljiFotku(datoteka, maks = 1200) {
  const slika = await new Promise((ok, ne) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ne; i.src = URL.createObjectURL(datoteka); });
  const k = Math.min(1, maks / Math.max(slika.width, slika.height));
  const c = document.createElement('canvas');
  c.width = Math.round(slika.width * k); c.height = Math.round(slika.height * k);
  c.getContext('2d').drawImage(slika, 0, 0, c.width, c.height);
  const jpeg = c.toDataURL('image/jpeg', 0.82).split(',')[1];
  const ime = `docs/slike/${Date.now()}.jpg`;
  const r = await fetch(API + ime, { method: 'PUT', headers: { ...zaglavlja(), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Admin: fotka', content: jpeg, branch: 'main' }) });
  if (!r.ok) throw new Error('Slanje fotke nije uspjelo: HTTP ' + r.status);
  return RAW + ime;
}

// ------------------------------------------------------------ pokretanje
async function pokreni() {
  if (!token) { $('#prijava').hidden = false; $('#radno').hidden = true; return; }
  try {
    const [p, u] = await Promise.all([
      fetch(RAW + 'docs/podaci/nedjelje.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()),
      ucitajUredjivanje(),
    ]);
    podaci = p; ured = u;
    $('#prijava').hidden = true; $('#radno').hidden = false;
    nacrtajRestorane(); nacrtajDogadaje();
  } catch (e) {
    $('#prijava').hidden = false; $('#radno').hidden = true;
    $('#greskaPrijave').textContent = e.message;
  }
}

$('#prijaviSe').addEventListener('click', () => {
  token = $('#token').value.trim();
  try { localStorage.setItem('adminToken', token); } catch (e) {}
  $('#greskaPrijave').textContent = '';
  pokreni();
});
$('#odjava').addEventListener('click', () => { token = ''; try { localStorage.removeItem('adminToken'); } catch (e) {} pokreni(); });
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  $('#tabRestorani').hidden = b.dataset.tab !== 'restorani';
  $('#tabDogadaji').hidden = b.dataset.tab !== 'dogadaji';
}));

// ------------------------------------------------------------ restorani
function sviRestorani() {
  return [...(podaci.restorani || []), ...ured.noviRestorani.map(r => ({ ...r, rucni: true }))];
}

function nacrtajRestorane() {
  const q = bezKvacica($('#traziR').value);
  const box = $('#popisR');
  box.innerHTML = '';
  const lista = sviRestorani().filter(r => !q || bezKvacica(r.naziv + ' ' + r.mjesto).includes(q))
    .sort((a, b) => a.mjesto.localeCompare(b.mjesto, 'hr') || a.naziv.localeCompare(b.naziv, 'hr'));
  for (const r of lista) {
    const iz = ured.restorani[r.id] || {};
    const foto = iz.foto !== undefined ? iz.foto : r.foto;
    const el = document.createElement('div');
    el.className = 'admin-red' + (iz.sakriven ? ' sakriven' : '');
    el.innerHTML = `${foto ? `<img src="${esc(foto)}" alt="">` : '<span class="bez"></span>'}
      <div><b>${esc(iz.naziv || r.naziv)}</b><small>${esc(r.mjesto)}${r.rucni ? ' · dodan ručno' : ''}</small>
      <div>${iz.istaknut ? '<span class="oznaka">istaknut</span>' : ''}${iz.gablec ? '<span class="oznaka">gablec</span>' : ''}${iz.sakriven ? '<span class="oznaka siva">sakriven</span>' : ''}${Object.keys(iz).length ? '<span class="oznaka siva">uređen</span>' : ''}</div></div>`;
    el.addEventListener('click', () => urediRestoran(r));
    box.appendChild(el);
  }
}
$('#traziR').addEventListener('input', nacrtajRestorane);

let trenutniR = null;
let gablecSlika = '';
function urediRestoran(r) {
  trenutniR = r;
  const iz = ured.restorani[r.id] || {};
  const v = (k, def) => (iz[k] !== undefined ? iz[k] : def);
  $('#dlgRNaslov').textContent = r.rucni || !r.id ? 'Restoran (dodan ručno)' : 'Restoran';
  $('#rNaziv').value = v('naziv', r.naziv || '');
  $('#rMjesto').value = v('mjesto', r.mjesto || '');
  $('#rAdresa').value = v('adresa', r.adresa || '');
  $('#rTel').value = v('tel', r.tel || '');
  $('#rWeb').value = v('web', r.web || '');
  $('#rFoto').value = v('foto', r.foto || '') || '';
  $('#rFotoPrikaz').src = $('#rFoto').value;
  $('#rFotoDatoteka').value = '';
  $('#rOpis').value = v('opis', r.opis || '') || '';
  $('#rJela').value = (iz.jela || []).join('\n');
  $('#rRucak').value = iz.rucak || '';
  $('#rNedjelja').value = iz.nedjelja || '';
  $('#rIstaknut').checked = !!iz.istaknut;
  $('#rSakriven').checked = !!iz.sakriven;
  const g = iz.gablec || {};
  $('#rGablec').checked = !!iz.gablec;
  $('#rGablecCijena').value = g.cijena || '';
  $('#rGablecVrijeme').value = g.vrijeme || '';
  $('#rGablecMeni').value = g.meni || '';
  gablecSlika = g.slika || '';
  if (gablecSlika) $('#rGablecSlikaPrikaz').src = gablecSlika; else $('#rGablecSlikaPrikaz').removeAttribute('src');
  $('#rGablecSlikaDatoteka').value = '';
  $('#greskaR').textContent = '';
  $('#dlgR').showModal();
}
$('#rFoto').addEventListener('input', e => { $('#rFotoPrikaz').src = e.target.value; });
$('#rFotoDatoteka').addEventListener('change', e => { const f = e.target.files[0]; if (f) $('#rFotoPrikaz').src = URL.createObjectURL(f); });
$('#rGablecSlikaDatoteka').addEventListener('change', e => { const f = e.target.files[0]; if (f) { $('#rGablecSlikaPrikaz').src = URL.createObjectURL(f); $('#rGablec').checked = true; } });
$('#rGablecSlikaMakni').addEventListener('click', () => { gablecSlika = ''; $('#rGablecSlikaDatoteka').value = ''; $('#rGablecSlikaPrikaz').removeAttribute('src'); });
$('#rFotoMakni').addEventListener('click', () => { $('#rFoto').value = ''; $('#rFotoDatoteka').value = ''; $('#rFotoPrikaz').removeAttribute('src'); });

$('#noviRestoran').addEventListener('click', () => urediRestoran({ id: 'ru-' + Date.now().toString(36), naziv: '', mjesto: '', rucni: true, novi: true }));

$('#dlgR').addEventListener('close', async () => {
  if ($('#dlgR').returnValue !== 'spremi') return;
  const r = trenutniR;
  try {
    poruka('Spremam…');
    let foto = $('#rFoto').value.trim();
    const dat = $('#rFotoDatoteka').files[0];
    if (dat) foto = await posaljiFotku(dat);
    const jela = $('#rJela').value.split('\n').map(s => s.trim()).filter(Boolean);
    const datJelovnik = $('#rGablecSlikaDatoteka').files[0];
    if (datJelovnik) gablecSlika = await posaljiFotku(datJelovnik, 1800);
    const gablec = $('#rGablec').checked ? {
      cijena: $('#rGablecCijena').value.trim(), vrijeme: $('#rGablecVrijeme').value.trim(),
      meni: $('#rGablecMeni').value.trim(), slika: gablecSlika || null, azurirano: new Date().toISOString().slice(0, 10),
    } : undefined;
    if (r.rucni) {
      // ručno dodani restoran: cijeli zapis u noviRestorani
      const zapis = {
        id: r.id, naziv: $('#rNaziv').value.trim(), mjesto: $('#rMjesto').value.trim(), adresa: $('#rAdresa').value.trim(),
        tel: $('#rTel').value.trim() || null, web: $('#rWeb').value.trim() || null, foto: foto || null, opis: $('#rOpis').value.trim() || null,
        vrsta: 'restoran', kuhinja: '', tjedan: null, lat: r.lat || null, lng: r.lng || null,
      };
      if (!zapis.naziv || !zapis.mjesto) throw new Error('Naziv i mjesto su obavezni.');
      ured.noviRestorani = ured.noviRestorani.filter(x => x.id !== r.id).concat([zapis]);
    }
    // izmjene (i za ručno dodane: jela, ručak, gablec, istaknut, sakriven, nedjelja)
    const iz = {};
    const auto = (podaci.restorani || []).find(x => x.id === r.id) || {};
    const ako = (k, vr, izvorno) => { if (vr !== (izvorno || '')) iz[k] = vr || null; };
    if (!r.rucni) {
      ako('naziv', $('#rNaziv').value.trim(), auto.naziv);
      ako('mjesto', $('#rMjesto').value.trim(), auto.mjesto);
      ako('adresa', $('#rAdresa').value.trim(), auto.adresa);
      ako('tel', $('#rTel').value.trim(), auto.tel);
      ako('web', $('#rWeb').value.trim(), auto.web);
      ako('foto', foto, auto.foto);
      ako('opis', $('#rOpis').value.trim(), auto.opis);
    }
    if (jela.length) iz.jela = jela;
    if ($('#rRucak').value.trim()) iz.rucak = $('#rRucak').value.trim();
    if ($('#rNedjelja').value.trim()) iz.nedjelja = $('#rNedjelja').value.trim();
    if ($('#rIstaknut').checked) iz.istaknut = true;
    if ($('#rSakriven').checked) iz.sakriven = true;
    if (gablec) iz.gablec = gablec;
    if (Object.keys(iz).length) ured.restorani[r.id] = iz; else delete ured.restorani[r.id];
    await spremiUredjivanje('restoran ' + ($('#rNaziv').value.trim() || r.id));
    poruka('Spremljeno ✓');
    nacrtajRestorane();
  } catch (e) {
    poruka(e.message);
  }
});

// ------------------------------------------------------------ događanja
function nacrtajDogadaje() {
  const q = bezKvacica($('#traziD').value);
  const box = $('#popisD');
  box.innerHTML = '';
  const danas = new Date().toISOString().slice(0, 10);
  const lista = [
    ...ured.dogadaji.novi.map(e => ({ ...e, izvor: 'ručno' })),
    ...(podaci.dogadaji || []).map(e => ({ ...e, izvor: 'eventinfo' })),
    ...(podaci.najave || []).map(n => ({ id: n.id, naslov: n.naslov, od: n.objavljeno, do: n.objavljeno, grad: n.opcina, slika: n.slika, izvor: 'najava općine' })),
  ].filter(e => (e.do || e.od) >= danas || e.izvor !== 'eventinfo')
    .filter(e => !q || bezKvacica(e.naslov + ' ' + (e.grad || '')).includes(q));
  for (const e of lista) {
    const skriven = ured.dogadaji.skriveni.includes(e.id);
    const el = document.createElement('div');
    el.className = 'admin-red' + (skriven ? ' sakriven' : '');
    el.innerHTML = `${e.slika ? `<img src="${esc(e.slika)}" alt="">` : '<span class="bez"></span>'}
      <div><b>${esc(e.naslov)}</b><small>${esc(e.od)}${e.grad ? ' · ' + esc(e.grad) : ''} · ${esc(e.izvor)}</small>
      <div>${skriven ? '<span class="oznaka siva">sakriveno</span>' : ''}</div></div>
      ${e.izvor === 'ručno' ? '' : `<button class="gumb-tekst">${skriven ? 'Prikaži' : 'Sakrij'}</button>`}`;
    if (e.izvor === 'ručno') el.addEventListener('click', () => urediDogadaj(e));
    else el.querySelector('button').addEventListener('click', async ev => {
      ev.stopPropagation();
      ured.dogadaji.skriveni = skriven ? ured.dogadaji.skriveni.filter(x => x !== e.id) : ured.dogadaji.skriveni.concat([e.id]);
      try { await spremiUredjivanje((skriven ? 'prikaži ' : 'sakrij ') + e.naslov); poruka('Spremljeno ✓'); nacrtajDogadaje(); } catch (err) { poruka(err.message); }
    });
    box.appendChild(el);
  }
}
$('#traziD').addEventListener('input', nacrtajDogadaje);

let trenutniD = null;
function urediDogadaj(e) {
  trenutniD = e;
  $('#dNaslov').value = e.naslov || '';
  $('#dOd').value = e.od || '';
  $('#dDo').value = e.do || '';
  $('#dVrijeme').value = e.vrijeme || '';
  $('#dKategorija').value = e.kategorija || 'ostalo';
  $('#dMjesto').value = e.mjesto || '';
  $('#dGrad').value = e.grad || '';
  $('#dCijena').value = e.cijena || '';
  $('#dLink').value = e.link || '';
  $('#dFoto').value = e.slika || '';
  $('#dFotoPrikaz').src = e.slika || '';
  $('#dFotoDatoteka').value = '';
  $('#dOpis').value = e.opis || '';
  $('#obrisiD').hidden = !e.id;
  $('#dlgD').showModal();
}
$('#dFoto').addEventListener('input', e => { $('#dFotoPrikaz').src = e.target.value; });
$('#dFotoDatoteka').addEventListener('change', e => { const f = e.target.files[0]; if (f) $('#dFotoPrikaz').src = URL.createObjectURL(f); });
$('#noviDogadaj').addEventListener('click', () => urediDogadaj({}));

$('#dlgD').addEventListener('close', async () => {
  const k = $('#dlgD').returnValue;
  if (k === 'obrisi') {
    if (!confirm('Obrisati ovo događanje?')) return;
    ured.dogadaji.novi = ured.dogadaji.novi.filter(x => x.id !== trenutniD.id);
    try { await spremiUredjivanje('obriši događanje'); poruka('Obrisano'); nacrtajDogadaje(); } catch (e) { poruka(e.message); }
    return;
  }
  if (k !== 'spremi') return;
  try {
    const naslov = $('#dNaslov').value.trim(), od = $('#dOd').value;
    if (!naslov || !od) throw new Error('Naslov i datum su obavezni.');
    poruka('Spremam…');
    let slika = $('#dFoto').value.trim();
    const dat = $('#dFotoDatoteka').files[0];
    if (dat) slika = await posaljiFotku(dat);
    const zapis = {
      id: trenutniD.id || 'ud-' + Date.now().toString(36), naslov, od, do: $('#dDo').value || od,
      vrijeme: $('#dVrijeme').value || null, kategorija: $('#dKategorija').value, mjesto: $('#dMjesto').value.trim(),
      grad: $('#dGrad').value.trim(), cijena: $('#dCijena').value.trim() || null, link: $('#dLink').value.trim() || null,
      slika: slika || null, opis: $('#dOpis').value.trim() || null, lat: null, lng: null,
    };
    ured.dogadaji.novi = ured.dogadaji.novi.filter(x => x.id !== zapis.id).concat([zapis]);
    await spremiUredjivanje('događanje ' + naslov);
    poruka('Spremljeno ✓');
    nacrtajDogadaje();
  } catch (e) { poruka(e.message); }
});

pokreni();
