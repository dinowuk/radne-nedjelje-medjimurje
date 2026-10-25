# Google Play — tekstovi i odgovori za "Radne nedjelje Međimurje"

Kopiraj u Play Console. Sve je na hrvatskom (zadani jezik: Hrvatski – hr).

---

## Glavni popis trgovine (Rast → Prisutnost u trgovini → Glavni popis trgovine)

**Naziv aplikacije** (max 30 znakova)
```
Radne nedjelje Međimurje
```

**Kratki opis** (max 80 znakova)
```
Koji dućani u Međimurju rade ove nedjelje — Konzum, Lidl, Spar, Krk, NTL…
```

**Potpuni opis** (max 4000 znakova)
```
Ide nedjelja, a ne znaš koji dućan radi? Radne nedjelje Međimurje na jednom mjestu pokazuju koje trgovine s hranom u Međimurskoj županiji rade ove (i sljedećih) nedjelja i u koliko sati.

ŠTO SVE MOŽEŠ
• Odmah vidiš koji dućani rade danas ili ove nedjelje, s radnim vremenom
• Biraš nedjelju — ova, sljedeća i dalje (gdje su trgovci već objavili raspored)
• Upišeš svoje mjesto (npr. Prelog, Mursko Središće, Nedelišće…) i vidiš samo dućane u njemu
• ★ Moji dućani — označi dućane u kojima kupuješ i jednim dodirom vidi rade li
• Moja mjesta — odaberi mjesta u kojima kupuješ
• Filtriraj po lancu
• Jednim dodirom otvori dućan u Google Kartama
• Blagdani su označeni (tada su trgovine zatvorene)
• Radi i bez interneta — pokazuje zadnje preuzete podatke

TRGOVINE
Trgovina Krk, NTL, Konzum, Lidl, Kaufland, Spar, Plodine, Studenac, KTC i Eurospin — više od 150 dućana u Čakovcu, Prelogu, Murskom Središću, Nedelišću, Kotoribi, Donjoj Dubravi, Goričanu, Belici, Podturnu, Štrigovi i svim ostalim mjestima Međimurja.

ODAKLE SU PODACI
Radno vrijeme se svaki dan automatski preuzima s javnih stranica trgovaca. Trgovac može promijeniti radno vrijeme u zadnji čas, zato za svaki slučaj provjeri i kod trgovca.

PRIVATNOST
Bez registracije, bez oglasa, bez praćenja. Aplikacija ne prikuplja nikakve osobne podatke — tvoji odabiri (moji dućani, moja mjesta) ostaju samo na tvom mobitelu.

Aplikacija nije povezana ni s jednim trgovcem. Nazivi i logotipi trgovaca vlasništvo su trgovaca i koriste se samo za prepoznavanje dućana.
```

**Ikona aplikacije** (512×512 PNG): `docs/ikone/ikona-512.png`
**Grafika istaknutog sadržaja** (1024×500): `google-play/grafika-1024x500.png`
**Snimke zaslona telefona** (min. 2, preporuka 4): napravi ih na Honoru (vidi dolje).

---

## Postavljanje aplikacije (Nadzorna ploča → "Postavite aplikaciju")

**Pravila o privatnosti — URL** (treba uključen GitHub Pages: repo → Settings → Pages → Branch `main`, mapa `/docs` → Save)
```
https://dinowuk.github.io/radne-nedjelje-medjimurje/privatnost.html
```

**Pristup aplikaciji:** Sve funkcije dostupne su bez posebnog pristupa (nema prijave).

**Oglasi:** Ne, moja aplikacija ne sadrži oglase.

**Ocjena sadržaja (upitnik IARC):**
- E-pošta za kontakt: tvoja
- Kategorija: **Sve ostale vrste aplikacija** (ne igra, ne društvena mreža)
- Na sva pitanja (nasilje, seksualni sadržaj, jezik, kontrolirane tvari, kockanje, korisnička interakcija, dijeljenje lokacije, kupnje) → **Ne**
- Očekivana ocjena: 3+ / PEGI 3

**Ciljana publika:** dob **18 i više** (najjednostavnije — aplikacija nije namijenjena djeci; tako ne treba ispunjavati pravila "Obitelji").

**Aplikacija s vijestima:** Ne.

**Sigurnost podataka:**
- Prikuplja li ili dijeli aplikacija neke od obaveznih vrsta korisničkih podataka? → **Ne**
- (Aplikacija ne šalje ništa o korisniku; samo preuzima javnu JSON datoteku s GitHuba.)

**Vladine aplikacije:** Ne. **Financijske značajke:** Nijedna. **Zdravlje:** Ne.

**Kategorija aplikacije:** Kupovina (Shopping)
**Oznake:** Kupovina, Lokalno
**Kontakt podaci:** e-pošta (obavezno), web-mjesto (neobavezno): `https://github.com/dinowuk/radne-nedjelje-medjimurje`

---

## Snimke zaslona — kako ih napraviti na Honoru
1. Otvori aplikaciju (verzija 1.0.5 ili novija).
2. Snimi (tipka za glasnoću dolje + uključivanje):
   - glavni ekran "Sve" s popisom dućana koji rade danas
   - upisano mjesto (npr. "Prelog") s prijedlozima ili rezultatima
   - kartica "★ Moji dućani" s 2–3 označena dućana
   - dijalog "Moja mjesta" s nekoliko označenih mjesta
3. Pošalji ih ovamo — po potrebi ih obrežem (statusna traka s obavijestima) i složim.

---

## Zatvoreno testiranje (obavezno za osobni račun)
- Testiranje → Zatvoreno testiranje → izradi popis testera (Gmail adrese, **min. 12**).
- Učitaj `izlaz/radne-nedjelje-<verzija>.aab`.
- Testeri moraju **prihvatiti poziv** (link iz Play Consolea) i aplikaciju **imati instaliranu 14 dana zaredom**.
- Nakon 14 dana: Nadzorna ploča → "Prijavite se za produkcijski pristup".
