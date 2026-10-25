// Događanja u Međimurju s eventinfo.com.hr (kalendar na koji vodi i Turistička zajednica Međimurja).
// Svaki događaj u aplikaciji vodi na izvornu stranicu; opis se skraćuje.

const Z = require('./zajednicko');

const BAZA = 'https://eventinfo.com.hr/';
const BEZ_VREMENA = '01:23'; // eventinfo tako označava događaje bez točnog sata (npr. izložbe)

const iso = d => { const m = String(d || '').match(/^(\d\d)\.(\d\d)\.(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const skrati = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, t.lastIndexOf(' ', n)) + '…' : t; };

async function dogadaji() {
  const tekst = await Z.dohvati(BAZA + 'framework/getListOfResults.php?s=dogadajiSvi');
  const lista = JSON.parse(tekst.replace(/^﻿/, '').trim());
  const danas = Z.danasZagreb();
  const out = [];
  for (const e of lista) {
    const od = iso(e.pocetak), doo = iso(e.zavrsetak) || od;
    if (!od || doo < danas) continue;
    const dijelovi = String(e.adresa || '').split(',').map(s => s.trim());
    const grad = dijelovi.length >= 3 ? dijelovi[dijelovi.length - 2] : '';
    out.push({
      id: 'ei-' + e.id,
      naslov: e.naslov,
      od, do: doo,
      vrijeme: e.vrijeme && e.vrijeme !== BEZ_VREMENA ? e.vrijeme : null,
      mjesto: e.mjesto,
      grad: Z.naselje(grad) || grad,
      lat: +e.latitude || null, lng: +e.longitude || null,
      kategorija: e.kategorija,
      cijena: e.cijena && e.cijena !== 'Nepoznato' ? e.cijena : null,
      opis: skrati(e.opis, 280),
      slika: e.slika ? BAZA + 'admin/slike_dogadaji/mala/' + encodeURIComponent(e.slika) : null,
      link: BAZA + 'dogadaj/' + e.slug,
    });
  }
  out.sort((a, b) => a.od.localeCompare(b.od) || String(a.vrijeme).localeCompare(String(b.vrijeme)));
  return out;
}

module.exports = { dogadaji };
