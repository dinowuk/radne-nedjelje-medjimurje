# Radne nedjelje Međimurje

Aplikacija koja pokazuje koji dućani s hranom u Međimurskoj županiji rade koje nedjelje.

- **Aplikacija** (`docs/`) — web aplikacija (PWA) koja radi i bez interneta; objavljena preko GitHub Pages i zapakirana za Google Play (Trusted Web Activity).
- **Podaci** (`docs/podaci/nedjelje.json`) — svaki dan ih automatski osvježava GitHub Actions (`.github/workflows/dohvat.yml`) skriptom `scraper/dohvati.js`.

## Izvori

Podaci se čitaju s javnih stranica trgovaca:

| Lanac | Izvor | Koliko unaprijed |
|---|---|---|
| Trgovina Krk | `trgovina-krk.hr/raspored-rada-nedjeljom/` (tablica, ✔ = radi) | cijela godina, po datumu |
| NTL | `ntl.hr/prodajna-mjesta/` (`var locations`, `open_this_sunday`) | nadolazeća nedjelja |
| Konzum | `trgovine.konzum.hr/api/locations/` | ~10 dana, po datumu |
| Lidl | `lidl.hr/s/hr-HR/trazilica-trgovina/...` (`_payload.json`) | 7 dana, po datumu |
| Kaufland | `kaufland.hr/.klstorefinder.json` (`sod` = posebni dani) | posebni dani + nadolazeća nedjelja |
| Spar / Interspar | `spar.hr/.../lokacije/_jcr_content.stores.v2.html` | posebni dani + nadolazeća nedjelja |
| Plodine | `plodine.hr/supermarketi` (`data-open-on-sunday`) | nadolazeća nedjelja |
| Studenac | `studenac.hr/trgovine` (`data-open-on-sunday` + stranica trgovine) | nadolazeća nedjelja |
| KTC | `ktc.hr` (tjedni raspored) | nadolazeća nedjelja |
| Eurospin | `eurospin.hr/nase-poslovnice/` (tjedni raspored) | nadolazeća nedjelja |

Međimurje se prepoznaje po poštanskom broju `40xxx`, a za Studenac (nema poštanski broj) po imenu naselja.
Imena koja postoje i drugdje u Hrvatskoj (npr. Otok) se preskaču i bilježe u `upozorenja`.

Ako dohvat jednog lanca ne uspije, zadržavaju se njegovi prethodni podaci, a greška se upisuje u `greske`.

## Lokalno

```
node scraper/dohvati.js        # osvježi docs/podaci/nedjelje.json
node alati/posluzi.js 5173     # http://localhost:5173
```
