#!/usr/bin/env node
// Build src/v2/world-data.js: country outlines from Natural Earth (world-atlas@2.0.2, public domain).
// Usage: node scripts/make-world-data.mjs [50m|110m]
// Outer rings only, lon/lat × SCALE as integers. Korean names are kept from the current file where they exist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const res = process.argv[2] ?? '50m', SCALE = 100;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'src/v2/world-data.js');
const topo = await (await fetch(`https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-${res}.json`)).json();

// Korean names from the file being replaced
const ko = {};
if (fs.existsSync(out)) { const m = fs.readFileSync(out, 'utf8').matchAll(/"n":"([^"]+)","ko":"([^"]+)"/g); for (const [, n, k] of m) ko[n] = k; }

// names the 1:110m file did not have (small states and territories)
Object.assign(ko, { 'Vatican': '바티칸', 'Micronesia': '미크로네시아', 'Marshall Is.': '마셜 제도', 'N. Mariana Is.': '북마리아나 제도', 'U.S. Virgin Is.': '미국령 버진아일랜드', 'Guam': '괌', 'American Samoa': '아메리칸사모아',
  'S. Geo. and the Is.': '사우스조지아', 'Br. Indian Ocean Ter.': '영국령 인도양 지역', 'Saint Helena': '세인트헬레나', 'Pitcairn Is.': '핏케언 제도', 'Anguilla': '앵귈라', 'Cayman Is.': '케이맨 제도', 'Bermuda': '버뮤다',
  'British Virgin Is.': '영국령 버진아일랜드', 'Turks and Caicos Is.': '터크스 케이커스 제도', 'Montserrat': '몬트세랫', 'Jersey': '저지', 'Guernsey': '건지', 'Isle of Man': '맨섬', 'Tonga': '통가', 'Singapore': '싱가포르',
  'Seychelles': '세이셸', 'São Tomé and Principe': '상투메 프린시페', 'San Marino': '산마리노', 'Samoa': '사모아', 'St. Vin. and Gren.': '세인트빈센트 그레나딘', 'Saint Lucia': '세인트루시아', 'St. Kitts and Nevis': '세인트키츠 네비스',
  'Palau': '팔라우', 'Niue': '니우에', 'Cook Is.': '쿡 제도', 'Aruba': '아루바', 'Curaçao': '퀴라소', 'Nauru': '나우루', 'Monaco': '모나코', 'Mauritius': '모리셔스', 'Malta': '몰타', 'Maldives': '몰디브', 'Liechtenstein': '리히텐슈타인',
  'Kiribati': '키리바시', 'Grenada': '그레나다', 'St. Pierre and Miquelon': '생피에르 미클롱', 'Wallis and Futuna Is.': '왈리스 푸투나', 'St-Martin': '생마르탱', 'St-Barthélemy': '생바르텔레미', 'Fr. Polynesia': '프랑스령 폴리네시아',
  'Åland': '올란드', 'Dominica': '도미니카 연방', 'Faeroe Is.': '페로 제도', 'Comoros': '코모로', 'Macao': '마카오', 'Hong Kong': '홍콩', 'Cabo Verde': '카보베르데', 'Barbados': '바베이도스', 'Bahrain': '바레인',
  'Indian Ocean Ter.': '오스트레일리아령 인도양 지역', 'Heard I. and McDonald Is.': '허드 맥도널드 제도', 'Norfolk Island': '노퍽섬', 'Ashmore and Cartier Is.': '애시모어 카르티에 제도', 'Antigua and Barb.': '앤티가 바부다',
  'Andorra': '안도라', 'Siachen Glacier': '시아첸 빙하', 'Sint Maarten': '신트마르턴' });

// TopoJSON: quantized, delta-encoded arcs; a negative index means the arc reversed
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
const arc = (i) => i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
const ring = (ids) => { const pts = []; for (const i of ids) { const a = arc(i); pts.push(...(pts.length ? a.slice(1) : a)); } return pts; };

const countries = [];
for (const g of topo.objects.countries.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  const rings = polys.map(p => ring(p[0]))                      // outer ring of each polygon
    .map(r => { const flat = []; let px, py; for (const [x, y] of r) { const ix = Math.round(x * SCALE), iy = Math.round(y * SCALE); if (ix === px && iy === py) continue; flat.push(ix, iy); px = ix; py = iy; } return flat; })
    .filter(r => r.length >= 6);
  const n = g.properties?.name ?? '';
  if (rings.length) countries.push({ n, ko: ko[n] ?? n, p: rings });
}
fs.writeFileSync(out, `// Country outlines from Natural Earth 1:${res} via world-atlas@2.0.2 (public domain). Outer rings only, lon/lat × ${SCALE} as integers.\n// Made by scripts/make-world-data.mjs.\nexport const SCALE = ${SCALE};\nexport const COUNTRIES = ${JSON.stringify(countries)};\n`);
console.log(`${countries.length} countries, ${countries.reduce((t, c) => t + c.p.reduce((u, r) => u + r.length / 2, 0), 0)} points, ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${countries.filter(c => c.ko === c.n).length} without a Korean name`);
