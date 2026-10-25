// Jednokratno: preuzmi ikone (apple-touch-icon / favicon) sa službenih stranica lanaca u docs/logotipi/.
// node alati/logotipi.js
const fs = require('fs');
const path = require('path');

const IZVORI = {
  konzum: 'https://www.konzum.hr/',
  lidl: 'https://www.lidl.hr/',
  kaufland: 'https://www.kaufland.hr/',
  spar: 'https://www.spar.hr/',
  plodine: 'https://www.plodine.hr/',
  studenac: 'https://www.studenac.hr/',
  ktc: 'https://www.ktc.hr/',
  eurospin: 'https://www.eurospin.hr/',
  krk: 'https://trgovina-krk.hr/',
  ntl: 'https://ntl.hr/',
};
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36' };
const IZLAZ = path.join(__dirname, '..', 'docs', 'logotipi');

async function kandidati(stranica) {
  const html = await (await fetch(stranica, { headers: UA })).text();
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/rel=["']([^"']+)["']/i) || [])[1] || '';
    if (!/icon/i.test(rel)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const vel = +((tag.match(/sizes=["'](\d+)x\d+["']/i) || [])[1] || (/apple/i.test(rel) ? 180 : 32));
    out.push({ url: new URL(href, stranica).href, vel });
  }
  out.push({ url: new URL('/apple-touch-icon.png', stranica).href, vel: 179 });
  return out.sort((a, b) => b.vel - a.vel);
}

(async () => {
  fs.mkdirSync(IZLAZ, { recursive: true });
  for (const [ime, stranica] of Object.entries(IZVORI)) {
    try {
      let spremljeno = false;
      for (const k of await kandidati(stranica)) {
        if (/\.svg(\?|$)/i.test(k.url)) continue;
        const r = await fetch(k.url, { headers: UA });
        const tip = r.headers.get('content-type') || '';
        if (!r.ok || !/image\/(png|x-icon|vnd\.microsoft\.icon|jpeg|webp)/.test(tip)) continue;
        const ext = /png/.test(tip) ? 'png' : /jpeg/.test(tip) ? 'jpg' : /webp/.test(tip) ? 'webp' : 'ico';
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(path.join(IZLAZ, `${ime}.${ext}`), buf);
        console.log(`${ime}: ${k.url} (${k.vel}px, ${buf.length} B, ${ext})`);
        spremljeno = true;
        break;
      }
      if (!spremljeno) console.log(`${ime}: NIJE NAĐENO`);
    } catch (e) {
      console.log(`${ime}: GREŠKA ${e.message}`);
    }
  }
})();
