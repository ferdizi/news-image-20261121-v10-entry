// news-image-20261121 v10 — "THE SATURDAY WORLD", 1024x1024 broadsheet front page.
// Draws Saturday 21 November 2026 world news (36 dated stories, 7 regions).
// Node 22 stdlib only, no network, no Date, no randomness — deterministic.
// Fonts: Liberation Serif Bold / Sans / Sans Bold / Serif Italic, outlines
// extracted from the real .ttf files with fontTools (glyf + hmtx, composites
// expanded, curves flattened) and embedded below as delta-encoded data.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;
const SS = 2; // supersampling factor
const W2 = W * SS;
const H2 = H * SS;

// ---------- palette ----------
const CREAM: C = [247, 243, 232];
const PAPER: C = [253, 250, 242];
const INK: C = [20, 20, 20];
const RED: C = [185, 28, 28];
const GREY: C = [107, 107, 107];
const WHITE: C = [255, 255, 255];
const BLACK: C = [0, 0, 0];
const GOLD: C = [212, 175, 55];
const GREEN_TAG: C = [21, 128, 61];
const BLUE_TAG: C = [29, 78, 216];
const BROWN_TAG: C = [146, 64, 14];

type C = [number, number, number];

// ---------- canvas (RGB, 2x supersampled) ----------
const buf = new Uint8Array(W2 * H2 * 3);
function fillAll(c: C): void {
  for (let i = 0; i < W2 * H2; i++) {
    buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2];
  }
}
function px(x: number, y: number, c: C): void {
  if (x < 0 || y < 0 || x >= W2 || y >= H2) return;
  const i = (y * W2 + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: C): void {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(W2, Math.round((x + w) * SS));
  const y1 = Math.min(H2, Math.round((y + h) * SS));
  for (let yy = y0; yy < y1; yy++) {
    let base = (yy * W2 + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[base] = c[0]; buf[base + 1] = c[1]; buf[base + 2] = c[2];
      base += 3;
    }
  }
}
function fillCircle(cx: number, cy: number, r: number, c: C): void {
  const x0 = Math.max(0, Math.floor((cx - r) * SS));
  const x1 = Math.min(W2 - 1, Math.ceil((cx + r) * SS));
  const y0 = Math.max(0, Math.floor((cy - r) * SS));
  const y1 = Math.min(H2 - 1, Math.ceil((cy + r) * SS));
  const R = r * SS, CX = cx * SS, CY = cy * SS;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - CX, dy = yy + 0.5 - CY;
      if (dx * dx + dy * dy <= R * R) px(xx, yy, c);
    }
  }
}
function ring(cx: number, cy: number, r: number, w: number, c: C): void {
  const x0 = Math.max(0, Math.floor((cx - r - w) * SS));
  const x1 = Math.min(W2 - 1, Math.ceil((cx + r + w) * SS));
  const y0 = Math.max(0, Math.floor((cy - r - w) * SS));
  const y1 = Math.min(H2 - 1, Math.ceil((cy + r + w) * SS));
  const R0 = (r - w / 2) * SS, R1 = (r + w / 2) * SS, CX = cx * SS, CY = cy * SS;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - CX, dy = yy + 0.5 - CY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= R0 && d <= R1) px(xx, yy, c);
    }
  }
}
// Even-odd scanline fill of polygons. pts are in 1024-space, will be scaled.
function fillPoly(contours: number[][][], c: C): void {
  // contours: array of polygons, each an array of [x,y]
  const edges: number[][] = [];
  let minY = 1e9, maxY = -1e9;
  for (const poly of contours) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const ax = a[0] * SS, ay = a[1] * SS, bx = b[0] * SS, by = b[1] * SS;
      if (ay === by) continue;
      edges.push([ax, ay, bx, by]);
      if (ay < minY) minY = ay;
      if (ay > maxY) maxY = ay;
      if (by < minY) minY = by;
      if (by > maxY) maxY = by;
    }
  }
  if (!edges.length) return;
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H2 - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (const e of edges) {
      const [ax, ay, bx, by] = e;
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5));
      const xb = Math.min(W2 - 1, Math.floor(xs[i + 1] - 0.5));
      for (let xx = xa; xx <= xb; xx++) px(xx, y, c);
    }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: C): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len === 0) { fillCircle(x0, y0, w / 2, c); return; }
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  fillPoly([[[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]], c);
  fillCircle(x0, y0, w / 2, c);
  fillCircle(x1, y1, w / 2, c);
}
function polyline(pts: number[][], w: number, c: C): void {
  for (let i = 0; i + 1 < pts.length; i++) thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
}

// ---------- PNG encoder (deterministic) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(rgb: Buffer, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const ro = y * (w * 3 + 1);
    raw[ro] = 2; // Up filter
    const src = y * w * 3;
    if (y === 0) {
      rgb.copy(raw, ro + 1, src, src + w * 3);
    } else {
      const prev = (y - 1) * w * 3;
      for (let i = 0; i < w * 3; i++) raw[ro + 1 + i] = (rgb[src + i] - rgb[prev + i]) & 0xff;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function downsample(): Buffer {
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = (((y * SS + dy) * W2) + (x * SS + dx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const o = (y * W + x) * 3;
      rgb[o] = Math.round(r / (SS * SS));
      rgb[o + 1] = Math.round(g / (SS * SS));
      rgb[o + 2] = Math.round(b / (SS * SS));
    }
  }
  return rgb;
}

// ---------- font runtime ----------
// Glyph data format: "code:advance|x,y dx,dy ...|contour2;code2:..." with
// delta-encoded integer points (font units, y-up). Decoded once per font.
type Glyph = { a: number; c: number[][][] };
type Font = { upm: number; glyphs: Map<number, Glyph> };
function decodeFont(data: string, upm: number): Font {
  const glyphs = new Map<number, Glyph>();
  for (const part of data.split(";")) {
    if (!part) continue;
    const ci = part.indexOf(":");
    const code = Number(part.slice(0, ci));
    const segs = part.slice(ci + 1).split("|");
    const adv = Number(segs[0]);
    const conts: number[][][] = [];
    for (let s = 1; s < segs.length; s++) {
      if (!segs[s]) continue;
      const pts: number[][] = [];
      let px = 0, py = 0;
      for (const tok of segs[s].split(" ")) {
        const cm = tok.indexOf(",");
        px += Number(tok.slice(0, cm));
        py += Number(tok.slice(cm + 1));
        pts.push([px, py]);
      }
      if (pts.length >= 3) conts.push(pts);
    }
    glyphs.set(code, { a: adv, c: conts });
  }
  return { upm, glyphs };
}
function glyphAdvance(f: Font, ch: string): number {
  const g = f.glyphs.get(ch.codePointAt(0) as number);
  if (g) return g.a;
  const sp = f.glyphs.get(32);
  return sp ? sp.a : f.upm / 2;
}
function measure(f: Font, size: number, text: string, ls = 0): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += glyphAdvance(f, text[i]) * (size / f.upm);
    if (i + 1 < text.length) w += ls;
  }
  return w;
}
function drawGlyph(f: Font, size: number, ch: string, x: number, baseline: number, c: C): void {
  const g = f.glyphs.get(ch.codePointAt(0) as number);
  if (!g || !g.c.length) return;
  const s = (size / f.upm) * SS;
  const conts: number[][][] = g.c.map((poly) =>
    poly.map(([px, py]) => [x + (px * s) / SS, baseline - (py * s) / SS])
  );
  fillPoly(conts, c);
}
function drawText(f: Font, size: number, x: number, baseline: number, text: string, c: C, ls = 0, align: "l" | "c" | "r" = "l"): void {
  let x0 = x;
  if (align !== "l") {
    const w = measure(f, size, text, ls);
    if (align === "c") x0 = x - w / 2;
    else x0 = x - w;
  }
  const step = size / f.upm;
  for (let i = 0; i < text.length; i++) {
    drawGlyph(f, size, text[i], x0, baseline, c);
    x0 += glyphAdvance(f, text[i]) * step + ls;
  }
}
function wrapText(f: Font, size: number, text: string, maxW: number, ls = 0): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (measure(f, size, trial, ls) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
// Small drawn marks used in the footer legend.
function drawCheck(x: number, y: number, s: number, c: C): void {
  polyline([[x, y + s * 0.45], [x + s * 0.35, y + s * 0.8], [x + s, y]], 1.6, c);
}
function drawCircledLetter(f: Font, x: number, y: number, letter: string, c: C): void {
  ring(x + 5, y - 3.5, 5.5, 1.1, c);
  drawText(f, 8, x + 5, y, letter, c, 0, "c");
}

// ---------- content (ground truth: BUILD-BRIEF, 36 stories) ----------
const KICKER_L = "THE WORLD IN ONE DAY";
const KICKER_C = "DAY 325 OF 2026";
const KICKER_R = "ALL TIMES UTC · RANKED BY CONSEQUENCE";
const MASTHEAD = "Saturday 21 November 2026";
const REDLINE = "36 STORIES · 7 REGIONS · EVERY ONE DATED";
const SUBKICK = "Climate talks run into day 13 · Three missiles downed over Riyadh · M6.7 quake shakes central Peru";

const STATS: [string, string, string][] = [
  ["13", "Day of COP31, planned to", "close day 12"],
  ["3", "missiles shot down", "over Riyadh"],
  ["6.7", "magnitude of Peru quake,", "108 km deep"],
  ["146", "people safe after Davao jet", "emergency"],
  ["$58,983", "Bitcoin, down", "3.9% in a day"],
  ["136", "Rahul’s score as India lead", "NZ by 118"],
];

type Region = { name: string; count: number; color: C };
const REGIONS: Region[] = [
  { name: "Europe", count: 13, color: [37, 99, 235] },
  { name: "Middle East", count: 6, color: [185, 28, 28] },
  { name: "Asia", count: 5, color: [146, 64, 14] },
  { name: "Africa", count: 1, color: [21, 128, 61] },
  { name: "Americas", count: 7, color: [124, 58, 237] },
  { name: "Oceania", count: 3, color: [15, 118, 110] },
  { name: "Global", count: 1, color: [107, 114, 128] },
];
// region index per story 1..36 (0 Europe, 1 Middle East, 2 Asia, 3 Africa, 4 Americas, 5 Oceania, 6 Global)
const STORY_REGION = [0,1,4,1,1,0,0,4,0,1,6,0,5,0,0,2,2,0,2,0,4,1,3,4,0,5,0,0,0,1,4,4,4,2,2,5];

const TIMELINE: [string, string][] = [
  ["00:09", "Peru quake"], ["02:00", "Sinaloa raid"], ["03:45", "Robot talks end"],
  ["05:47", "Kyiv missiles"], ["09:42", "Banda Sea M6.8"], ["13:30", "Bitcoin rebounds"], ["22:10", "COP31 pauses"],
];

type Hero = { n: number; label: string; tag: string; tagColor: C; headline: string; body: string; source: string };
const HEROES: Hero[] = [
  { n: 1, label: "COP31: OVERTIME", tag: "CONFIRMED", tagColor: GREEN_TAG,
    headline: "Climate summit runs into Saturday with no deal",
    body: "COP31 missed its Friday close. A draft omitting fossil fuels split nearly 200 nations; a third text is promised. Vote moved to Sunday 09:00.",
    source: "AFP, Reuters" },
  { n: 2, label: "SAUDI: MISSILES", tag: "OFFICIAL", tagColor: BLUE_TAG,
    headline: "Houthi missiles aimed at Riyadh shot down",
    body: "Coalition says it intercepted 3 ballistic missiles just after 2 a.m.; two blasts heard. Two more downed over Jizan, a day after Hodeidah was bombed.",
    source: "Arab News, Al Jazeera" },
  { n: 3, label: "PERU: QUAKE 6.7", tag: "OFFICIAL", tagColor: BLUE_TAG,
    headline: "Magnitude 6.7 earthquake shakes central Peru",
    body: "00:09 UTC, 108 km deep near Carhuamayo. Felt in Lima; no deaths, damage or tsunami risk. 152 homes uninhabitable.",
    source: "USGS, IGP" },
];

type Mid = { n: number; label: string; tag: string; tagColor: C; tint: C; big: string; bigNote: string; headline: string; body: string; source: string };
const MIDS: Mid[] = [
  { n: 4, label: "BAHRAIN: US BASES HIT", tag: "OFFICIAL", tagColor: BLUE_TAG, tint: [253, 232, 214], big: "2", bigNote: "BASES HIT",
    headline: "Iran hits two US bases in Bahrain", body: "IRGC hit al-Riffa, Awali; Bahrain reports a fire, no injuries.", source: "Bahrain, UKMTO" },
  { n: 5, label: "HORMUZ: TANKERS HIT", tag: "OFFICIAL", tagColor: BLUE_TAG, tint: [219, 234, 254], big: "2", bigNote: "TANKERS HIT",
    headline: "Two tankers hit off Oman; third in Strait", body: "UKMTO: two hit off Khasab; a vessel hit a mine. One missing.", source: "UKMTO" },
  { n: 6, label: "BALTIC: SHIP ABLAZE", tag: "OFFICIAL", tagColor: BLUE_TAG, tint: [219, 234, 254], big: "SPARTA II", bigNote: "ADRIFT",
    headline: "Drones set Russian ship Sparta II ablaze", body: "Crew evacuated; ship adrift off Finland. Finland suspects Ukraine.", source: "France 24, Al Jazeera" },
  { n: 7, label: "KYIV: MISSILES", tag: "OFFICIAL", tagColor: BLUE_TAG, tint: [254, 226, 226], big: "05:47", bigNote: "UTC",
    headline: "Ballistic missiles hit Kyiv at 5:47", body: "Two homes ablaze in Podil, city says.", source: "Kyiv Post" },
  { n: 8, label: "SINALOA: CAPTURED", tag: "CONFIRMED", tagColor: GREEN_TAG, tint: [254, 243, 199], big: "11", bigNote: "DEAD",
    headline: "Troops capture ‘Chapo Isidro’", body: "FBI most-wanted Meza Flores held in Guasave; 11 killed in the raid.", source: "FBI, Euronews, AP" },
  { n: 9, label: "EU–INDONESIA: DEAL", tag: "OFFICIAL", tagColor: BLUE_TAG, tint: [219, 234, 254], big: "98.5%", bigNote: "TARIFFS CUT",
    headline: "EU and Indonesia sign free-trade deal", body: "After 10 years of talks; tariffs cut on 98.5% of EU lines.", source: "European Commission" },
  { n: 10, label: "GAZA: STRIKE", tag: "REPORTED", tagColor: BROWN_TAG, tint: [254, 226, 226], big: "3", bigNote: "KILLED",
    headline: "Israeli drone strike kills 3 in Gaza City", body: "A car hit in Tel al-Hawa; the three were handing out food.", source: "Al Jazeera, ToI" },
  { n: 11, label: "BITCOIN: TWO-YEAR LOW", tag: "REPORTED", tagColor: BROWN_TAG, tint: [254, 243, 199], big: "$58,983", bigNote: "EARLY SAT.",
    headline: "Bitcoin falls to its lowest since 2024", body: "Two-year low at 04:13 UTC; back over $60,000 by 15:16.", source: "CoinGecko" },
  { n: 12, label: "FRANCE: PROTESTS", tag: "OFFICIAL", tagColor: BLUE_TAG, tint: [219, 234, 254], big: "82,500", bigNote: "MARCHERS",
    headline: "Sixth Saturday of protests in France", body: "82,500 at cost-of-living marches; 70,000 police on duty.", source: "France 24" },
  { n: 13, label: "CRICKET: RAHUL 136", tag: "CONFIRMED", tagColor: GREEN_TAG, tint: [254, 243, 199], big: "136", bigNote: "RAHUL",
    headline: "Rahul hits 136 as India lead NZ by 118", body: "India 486-4 on day 3 in Wellington; Gill 98.", source: "Reuters" },
];

// list stories 14..36: [place, text, source] — wording shortened only where a
// headline would not fit; no facts changed.
const LIST: [string, string, string][] = [
  ["Kryvyi Rih", "Russian missile kills 2, incl. a boy, 7, and a paramedic, 20; ~60 wounded", "Kyiv Independent"],
  ["Lviv", "Russian strike kills 2, 10 injured", "—"],
  ["Davao", "Air Niugini jet lands safely after engine fire alert; 146 safe", "AP"],
  ["Timor-Leste", "M6.8 quake 105 km NE of Lospalos, depth 132 km; felt in Darwin, no tsunami", "USGS"],
  ["Geneva", "128 nations agree to draft AI-weapon rules; UN talks set 2-year path on killer robots", "Al Jazeera"],
  ["Taiwan", "21 Chinese jets held a patrol; 15 crossed the Strait median line", "Taipei"],
  ["Ust-Luga", "Ukrainian drones strike Russia’s Ust-Luga port; Estonia scrambles NATO jets", "Kyiv Post"],
  ["Brazil", "Bolsonaro moved to intensive care; ex-president, 71, bowel obstruction", "Reuters"],
  ["Basra", "fire at power station kills 4+, 30+ hurt", "INA, Reuters"],
  ["Pretoria", "UN and AU chiefs honour Mlambo-Ngcuka", "UN"],
  ["Las Vegas", "Russell fastest in final F1 practice", "Formula 1"],
  ["Twickenham", "England rout NZ 37-12, a record margin", "Reuters"],
  ["Cook Islands", "relief ship ready as Cyclone Xavier weakens", "RNZ"],
  ["Kyiv", "Zelensky warns Crimea bridge “will not stay”", "NBC"],
  ["Antalya", "EU warns COP31 risks a “fossil summit”", "AFP"],
  ["Antalya", "Panama may block the climate deal", "Al Jazeera"],
  ["Yemen", "Houthis threaten Jeddah and Red Sea ports", "Al Jazeera"],
  ["Washington", "Vance says Iran strikes were Trump’s decision", "Reuters"],
  ["Texas", "execution of a man of 70 takes 63 minutes", "ABC"],
  ["Vancouver", "Canada rests defence in climate trial", "AFP"],
  ["Pyongyang", "Kim tours factories after no Trump meeting", "KCNA"],
  ["Bangkok", "six-point plan on arsenic in rivers", "The Nation"],
  ["Melbourne", "Cummins keeps the Australian captaincy", "ABC"],
];

const DATE_CHECK = "Left out as earlier news: Wall Street’s fall into a correction (Fri 20 Nov) · Russian barrage on Kyiv’s bridges (Fri) · missile that landed in Poland (Fri 20 Nov) · UK–EU deal (Fri) · Cyclone Akvan’s landfall (Fri) · Denmark’s expulsion of a Russian attaché (20 Nov) · ICJ Myanmar ruling (19 Nov) · Trump–Xi–Putin Shenzhen summit (19–20 Nov). Not yet known when drawn: COP31’s final vote (Sun 09:00) · BepiColombo Mercury orbit insertion.";
const FOOTER1 = "Every story here happened, or was first reported, on Saturday 21 November 2026. Officials’ counts and claims are attributed.";
const FOOTER2A = "CONFIRMED = 2+ outlets · ";
const FOOTER2B = "REPORTED = one outlet · ";
const FOOTER2C = "OFFICIAL = as stated by authorities · Sources named beside each story · Original drawings";

// ---------- world map ----------
// Coarse equirectangular land mask, 72 cols (lon -180..180, 5 deg) x 36 rows
// (lat 80..-60, 4 deg). Rows are padded/truncated to 72 chars at draw time.
const LAND = [
"............##########..#########.....####..............................",
"..........#############.##########....#####....####....#####............",
"........#################.######..#...#####...##################......",
"......#####################......#########...######################..",
"....#########################...#..#########.######################..",
"..###########################....##########..#######################..",
"..############################...#########...#######################..",
"..##############################..###############################....",
"....############################..##############################.....",
"......##########################...#########..##################.....",
"......#########################....#########...#################.....",
"........#######################...#########....###############......",
"........#####################......###..########..############.......",
"..........###############..........#########......############.......",
"............#############..........#########.......##########........",
"..............##########...........#########.......##########........",
"................######.............#########.......#########.........",
".................#####.............#########........#######..........",
"..................#######..........#######.........##########........",
"....................#######........#######.........##########........",
".....................#######.......######..........##########........",
"......................#######......####............########..........",
"......................#######......####.............#####............",
".......................#######.....###......#.......#######...........",
".......................#######.....###......##......######............",
"........................######.....###......##......######............",
"........................######.....##...............#####.............",
"........................######.....##................####............",
".........................#####.....##................###......##.....",
".........................####...............................##......",
".........................###................................##......",
".........................###........................................",
".........................##.........................................",
".........................#..........................................",
"....................................................................",
"....................................................................",
];
// pin lat/lon for stories 1..36 (story 11 Bitcoin is global: no pin)
const PINS: Record<number, [number, number, number, number]> = {
  1: [36.9, 30.7, -8, -8], 2: [24.7, 46.7, 0, 0], 3: [-10.9, -76.0, 0, 0],
  4: [26.1, 50.55, 0, 0], 5: [26.2, 56.25, 0, 0], 6: [59.8, 24.5, 0, 0],
  7: [50.45, 30.52, -8, -8], 8: [25.57, -108.47, 0, 0], 9: [50.85, 4.35, 0, 0],
  10: [31.5, 34.47, 0, 0], 12: [48.85, 2.35, 0, 0], 13: [-41.29, 174.78, 0, 0],
  14: [47.91, 33.39, 0, 0], 15: [49.84, 24.03, 0, 0], 16: [7.07, 125.6, 0, 0],
  17: [-8.52, 127.0, 0, 0], 18: [46.2, 6.14, 0, 0], 19: [23.7, 121.0, 0, 0],
  20: [59.67, 28.27, 0, 0], 21: [-15.79, -47.88, 0, 0], 22: [30.5, 47.78, 0, 0],
  23: [-25.75, 28.19, 0, 0], 24: [36.17, -115.14, 0, 0], 25: [51.45, -0.34, 0, 0],
  26: [-21.24, -159.77, 0, 0], 27: [50.45, 30.52, 9, 7], 28: [36.9, 30.7, 9, 6],
  29: [36.9, 30.7, 8, -9], 30: [15.35, 44.21, 0, 0], 31: [38.9, -77.04, 0, 0],
  32: [30.27, -97.74, 0, 0], 33: [49.28, -123.12, 0, 0], 34: [39.02, 125.75, 0, 0],
  35: [13.76, 100.5, 0, 0], 36: [-37.81, 144.96, 0, 0],
};

// ---------- layout ----------
const MX = 8;             // left margin
const RX = 1016;          // right edge
const CW = RX - MX;       // 1008 content width
const HERO_X = [8, 346, 684];
const HERO_W = 332;
const MID_X = [8, 210, 412, 614, 816];
const MID_W = 196;
const MID_ROWS = [448, 578]; // row tops, 130px each

function star5(cx: number, cy: number, ro: number, ri: number, rot: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? ro : ri;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
function tagChip(x: number, y: number, text: string, bg: C, size: number, h: number): number {
  const w = measure(F_SANS_BOLD, size, text) + 10;
  fillRect(x, y, w, h, bg);
  drawText(F_SANS_BOLD, size, x + w / 2, y + h - 3, text, WHITE, 0, "c");
  return w;
}
function labelBar(x: number, y: number, w: number, text: string, tag: string, tagColor: C, size: number, h: number): void {
  fillRect(x, y, w, h, INK);
  // auto-fit: shrink the label (never below 9px) so it never runs under the tag chip
  let ls = size;
  let chipSize = size - 2.5;
  while (ls > 9 && measure(F_SANS_BOLD, ls, text) + measure(F_SANS_BOLD, chipSize, tag) + 24 > w) {
    ls -= 0.5;
    chipSize = Math.max(7, ls - 2.5);
  }
  drawText(F_SANS_BOLD, ls, x + 8, y + h - 3.5, text, WHITE);
  const tw = measure(F_SANS_BOLD, chipSize, tag) + 8;
  fillRect(x + w - tw - 4, y + 2, tw, h - 4, tagColor);
  drawText(F_SANS_BOLD, chipSize, x + w - 4 - tw / 2, y + h - 4.5, tag, WHITE, 0, "c");
}

// ---------- header (v10 fix: masthead descenders get clear air) ----------
// Masthead baseline y=69 (52px serif bold): descender tip ~y=80.
// Rule moved to y=86, red line caps start ~y=91, sub-kicker descenders end
// ~y=124, rule at y=132. No descender touches any rule or line anywhere.
function drawHeader(): void {
  fillRect(MX, 0, CW, 1, INK);
  drawText(F_SANS_BOLD, 11, MX, 11, KICKER_L, INK, 2);
  drawText(F_SANS_BOLD, 11, 512, 11, KICKER_C, RED, 2, "c");
  drawText(F_SANS_BOLD, 11, RX, 11, KICKER_R, INK, 2, "r");
  fillRect(MX, 15, CW, 1, INK);
  drawText(F_SERIF_BOLD, 52, 512, 69, MASTHEAD, INK, 0, "c");
  fillRect(MX, 86, CW, 1, INK);
  drawText(F_SANS_BOLD, 12, 512, 100, REDLINE, RED, 3, "c");
  drawText(F_SERIF_ITALIC, 16, 512, 120, SUBKICK, INK, 0, "c");
  fillRect(MX, 132, CW, 1, INK);
  // stat strip
  const cellW = CW / 6;
  for (let i = 0; i < 6; i++) {
    const cx = MX + i * cellW;
    if (i > 0) fillRect(cx, 138, 1, 26, [205, 205, 195]);
    const [num, l1, l2] = STATS[i];
    let size = 10.5;
    let lines = [l1, l2];
    const numW = measure(F_SANS_BOLD, 28, num);
    let avail = cellW - numW - 16;
    while (size > 8.5 && (measure(F_SANS, size, l1) > avail || measure(F_SANS, size, l2) > avail)) size -= 0.5;
    drawText(F_SANS_BOLD, 28, cx + 4, 160, num, INK);
    const lx = cx + 4 + numW + 6;
    drawText(F_SANS, size, lx, 148, lines[0], [70, 70, 70]);
    drawText(F_SANS, size, lx, 160, lines[1], [70, 70, 70]);
  }
  fillRect(MX, 166, CW, 1, INK);
  // region bar
  let rx = MX;
  for (const r of REGIONS) {
    const w = (r.count / 36) * CW;
    fillRect(rx, 168, w, 14, r.color);
    const label = r.count > 1 ? `${r.name} ${r.count}` : `${r.count}`;
    drawText(F_SANS_BOLD, 10, rx + w / 2, 179, label, WHITE, 0, "c");
    rx += w;
  }
  // timeline
  fillRect(MX, 184, CW, 16, INK);
  drawText(F_SANS_BOLD, 11, MX + 8, 196, "THE DAY IN UTC", WHITE, 1);
  const slotX = 132, slotW = (RX - 8 - slotX) / 7;
  for (let i = 0; i < TIMELINE.length; i++) {
    const x = slotX + i * slotW;
    if (i > 0) fillRect(x - 4, 187, 1, 10, [90, 90, 90]);
    drawText(F_SANS_BOLD, 11, x, 196, TIMELINE[i][0], GOLD);
    drawText(F_SANS, 11, x + measure(F_SANS_BOLD, 11, TIMELINE[i][0]) + 5, 196, TIMELINE[i][1], WHITE);
  }
}

// ---------- hero visuals ----------
function heroVisual1(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [15, 118, 110]);
  // globe
  fillCircle(x + 88, y + 54, 50, [168, 216, 203]);
  ring(x + 88, y + 54, 50, 1.5, INK);
  fillPoly([[[x + 62, y + 30], [x + 82, y + 22], [x + 96, y + 34], [x + 88, y + 52], [x + 70, y + 50]]], [46, 139, 109]);
  fillPoly([[[x + 100, y + 40], [x + 122, y + 34], [x + 130, y + 52], [x + 114, y + 66], [x + 100, y + 58]]], [46, 139, 109]);
  fillPoly([[[x + 70, y + 66], [x + 92, y + 62], [x + 100, y + 80], [x + 84, y + 96], [x + 68, y + 84]]], [46, 139, 109]);
  thickLine(x + 88, y + 4, x + 88, y + 104, 1.5, [240, 240, 235]);
  thickLine(x + 38, y + 54, x + 138, y + 54, 1.5, [240, 240, 235]);
  // draft card
  fillRect(x + 172, y + 12, 148, 80, WHITE);
  drawText(F_SANS_BOLD, 11, x + 182, y + 30, "DRAFT TEXT", RED, 1);
  drawText(F_SERIF_BOLD, 21, x + 182, y + 56, "fossil fuels", RED);
  drawText(F_SANS, 10, x + 182, y + 74, "no mention in the draft", [110, 110, 110]);
  thickLine(x + 182, y + 82, x + 310, y + 82, 1, [200, 200, 195]);
  thickLine(x + 182, y + 88, x + 310, y + 88, 1, [200, 200, 195]);
  // clock
  fillCircle(x + 302, y + 28, 13, WHITE);
  ring(x + 302, y + 28, 13, 1.5, INK);
  thickLine(x + 302, y + 28, x + 302, y + 19, 1.5, INK);
  thickLine(x + 302, y + 28, x + 308, y + 31, 1.5, INK);
  // bottom strip
  fillRect(x + 172, y + 96, 74, 12, RED);
  drawText(F_SANS_BOLD, 10, x + 209, y + 105, "OVERTIME", WHITE, 1, "c");
  drawText(F_SANS_BOLD, 12, x + 256, y + 105, "DAY 13", GOLD, 1);
}
function heroVisual2(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [16, 30, 60]);
  const stars: number[][] = [[20,14],[52,26],[88,10],[120,30],[150,12],[186,22],[214,10],[248,28],[278,14],[306,24],[36,44],[96,52],[168,44],[230,50],[292,46],[64,66],[140,70],[206,66],[262,72],[110,84],[180,86],[240,84]];
  for (const [sx, sy] of stars) fillCircle(x + sx, y + sy, 1.1, [230, 230, 220]);
  // skyline
  const bld: [number, number, number][] = [[0, 62, 34], [38, 48, 44], [86, 70, 30], [120, 40, 48], [172, 66, 32], [208, 52, 42], [254, 72, 28], [286, 58, 46]];
  for (const [bx, bt, bw] of bld) {
    fillRect(x + bx, y + bt, bw, h - bt, [28, 52, 96]);
    for (let wy = bt + 6; wy < h - 8; wy += 9) {
      for (let wx = bx + 5; wx < bx + bw - 4; wx += 9) {
        if ((wx * 7 + wy * 13) % 3 !== 0) fillRect(x + wx, y + wy, 2, 3, GOLD);
      }
    }
  }
  // missile trails — endpoints/stars kept BELOW the "3 DOWNED" headline
  // (text spans y+21..58; stars sit at y+80..84, trails pass under it)
  const trails: [number, number, number, number][] = [[30, 104, 150, 80], [110, 106, 228, 82], [190, 106, 302, 84]];
  for (const [x0, y0, x1, y1] of trails) {
    thickLine(x + x0, y + y0, x + x1, y + y1, 2.5, [234, 128, 44]);
    fillPoly([star5(x + x1, y + y1, 11, 4.5, -Math.PI / 2)], GOLD);
  }
  drawText(F_SANS_BOLD, 38, x + 16, y + 58, "3 DOWNED", GOLD, 1);
  drawText(F_SANS_BOLD, 13, x + 16, y + 80, "02:00 · RIYADH", WHITE, 1);
}
function heroVisual3(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [239, 230, 207]);
  fillCircle(x + 298, y + 30, 18, [240, 196, 80]);
  // mountains
  fillPoly([[[x, y + 108], [x + 70, y + 34], [x + 140, y + 108]]], [139, 115, 85]);
  fillPoly([[[x + 55, y + 48], [x + 70, y + 34], [x + 86, y + 50]]], WHITE);
  fillPoly([[[x + 110, y + 108], [x + 185, y + 44], [x + 260, y + 108]]], [120, 98, 70]);
  fillPoly([[[x + 172, y + 56], [x + 185, y + 44], [x + 199, y + 58]]], WHITE);
  fillPoly([[[x + 240, y + 108], [x + 300, y + 58], [x + 332, y + 108]]], [139, 115, 85]);
  // seismograph strip
  fillRect(x + 8, y + 72, w - 16, 28, WHITE);
  const zz: number[][] = [];
  let zx = x + 12;
  let zy = y + 86;
  zz.push([zx, zy]);
  const steps: [number, number][] = [[14, -8], [10, 10], [12, -12], [10, 12], [12, -6], [10, 8], [14, -10], [10, 10], [12, -8], [10, 6], [14, -12], [10, 12], [12, -6], [10, 8], [14, -10], [10, 8], [12, -6], [10, 6], [12, -8], [10, 6]];
  for (const [dx, dy] of steps) { zx += dx; zy += dy; zz.push([zx, zy]); }
  polyline(zz, 1.8, RED);
  drawText(F_SERIF_BOLD, 46, x + 14, y + 52, "6.7", RED);
  drawText(F_SANS_BOLD, 14, x + 104, y + 38, "108 KM DEEP", INK, 1);
  drawText(F_SANS, 12, x + 104, y + 56, "00:09 UTC", [90, 90, 90]);
}
function drawHeroes(): void {
  const visuals = [heroVisual1, heroVisual2, heroVisual3];
  for (let i = 0; i < 3; i++) {
    const x = HERO_X[i];
    const hv = HEROES[i];
    labelBar(x, 202, HERO_W, `${hv.n} ${hv.label}`, hv.tag, hv.tagColor, 12, 16);
    visuals[i](x, 218, HERO_W, 108);
    const hl = wrapText(F_SERIF_BOLD, 26, hv.headline, HERO_W - 8);
    drawText(F_SERIF_BOLD, 26, x + 2, 354, hl[0], INK);
    if (hl[1]) drawText(F_SERIF_BOLD, 26, x + 2, 383, hl[1], INK);
    const bl = wrapText(F_SANS, 13, hv.body, HERO_W - 8);
    drawText(F_SANS, 13, x + 2, 400, bl[0], INK);
    if (bl[1]) drawText(F_SANS, 13, x + 2, 414.5, bl[1], INK);
    if (bl[2]) drawText(F_SANS, 13, x + 2, 429, bl[2], INK);
    drawText(F_SANS, 10.5, x + 2, 444, hv.source, GREY);
  }
}

// ---------- mid icons ----------
function midIcon(n: number, x: number, y: number): void {
  if (n === 4) {
    fillPoly([[[x + 20, y + 4], [x + 32, y + 16], [x + 30, y + 30], [x + 10, y + 30], [x + 8, y + 16]]], [234, 88, 12]);
    fillPoly([[[x + 20, y + 16], [x + 27, y + 24], [x + 20, y + 30], [x + 13, y + 24]]], [250, 204, 21]);
  } else if (n === 5 || n === 6) {
    fillPoly([[[x + 2, y + 22], [x + 38, y + 22], [x + 32, y + 32], [x + 8, y + 32]]], [23, 42, 84]);
    fillRect(x + 12, y + 12, 16, 10, [23, 42, 84]);
    if (n === 6) {
      fillRect(x + 16, y + 4, 4, 8, [234, 88, 12]);
      fillRect(x + 24, y + 4, 4, 8, [234, 88, 12]);
    } else {
      fillRect(x + 28, y + 6, 4, 6, [23, 42, 84]);
    }
  } else if (n === 7) {
    thickLine(x + 6, y + 30, x + 32, y + 6, 3, [185, 28, 28]);
    fillCircle(x + 33, y + 5, 4, [234, 128, 44]);
  } else if (n === 8) {
    fillPoly([star5(x + 20, y + 18, 15, 6, -Math.PI / 2)], [212, 160, 20]);
  } else if (n === 9) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      fillCircle(x + 20 + Math.cos(a) * 12, y + 18 + Math.sin(a) * 12, 2, [29, 78, 216]);
    }
  } else if (n === 10) {
    fillRect(x + 2, y + 14, 22, 12, [60, 60, 60]);
    fillRect(x + 24, y + 18, 12, 8, [60, 60, 60]);
    fillCircle(x + 10, y + 28, 3.5, INK);
    fillCircle(x + 28, y + 28, 3.5, INK);
  } else if (n === 11) {
    fillCircle(x + 20, y + 18, 15, [212, 160, 20]);
    ring(x + 20, y + 18, 15, 1.5, [146, 110, 10]);
    drawText(F_SANS_BOLD, 17, x + 20, y + 24, "B", WHITE, 0, "c");
  } else if (n === 12) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) fillCircle(x + 10 + c * 10, y + 8 + r * 10, 2.6, [29, 78, 216]);
  } else if (n === 13) {
    thickLine(x + 8, y + 30, x + 30, y + 6, 5, [146, 110, 60]);
    fillCircle(x + 33, y + 28, 4, [185, 28, 28]);
  }
}
function drawMids(): void {
  for (let r = 0; r < 2; r++) {
    const top = MID_ROWS[r];
    for (let c = 0; c < 5; c++) {
      const m = MIDS[r * 5 + c];
      const x = MID_X[c];
      labelBar(x, top, MID_W, `${m.n} ${m.label}`, m.tag, m.tagColor, 11, 13);
      fillRect(x, top + 13, MID_W, 34, m.tint);
      let bs = 22;
      while (bs > 15 && measure(F_SANS_BOLD, bs, m.big) + 6 + measure(F_SANS_BOLD, 10, m.bigNote) > MID_W - 52) bs -= 1;
      drawText(F_SANS_BOLD, bs, x + 6, top + 42, m.big, INK);
      drawText(F_SANS_BOLD, 10, x + 6 + measure(F_SANS_BOLD, bs, m.big) + 5, top + 42, m.bigNote, [70, 70, 70]);
      midIcon(m.n, x + MID_W - 44, top + 15);
      const hl = wrapText(F_SERIF_BOLD, 16, m.headline, MID_W - 4);
      drawText(F_SERIF_BOLD, 16, x + 2, top + 66, hl[0], INK);
      if (hl[1]) drawText(F_SERIF_BOLD, 16, x + 2, top + 84.5, hl[1], INK);
      const bl = wrapText(F_SANS, 12, m.body, MID_W - 4);
      drawText(F_SANS, 12, x + 2, top + 100, bl[0], INK);
      if (bl[1]) drawText(F_SANS, 12, x + 2, top + 113.5, bl[1], INK);
      drawText(F_SANS, 10, x + 2, top + 126, m.source, GREY);
    }
  }
}

// ---------- map + list ----------
function drawMapList(): void {
  fillRect(MX, 712, CW, 16, INK);
  drawText(F_SANS_BOLD, 11, MX + 8, 724, "WHERE IT HAPPENED", WHITE, 1);
  drawText(F_SANS_BOLD, 11, 346, 724, "ALSO ON SATURDAY 21 NOVEMBER — 23 MORE STORIES", WHITE, 1);
  // dotted world map: lat 80..-60 over y 732..856, lon -180..180 over x 8..338
  const mapX0 = 8, mapX1 = 338, mapY0 = 732, mapY1 = 856;
  for (let row = 0; row < 36; row++) {
    const line = (LAND[row] + ".".repeat(72)).slice(0, 72);
    const lat = 80 - row * 4;
    const y = mapY0 + ((80 - lat) / 140) * (mapY1 - mapY0);
    for (let col = 0; col < 72; col++) {
      if (line[col] !== "#") continue;
      const lon = -180 + col * 5 + 2.5;
      const x = mapX0 + ((lon + 180) / 360) * (mapX1 - mapX0);
      fillCircle(x, y, 1.15, [105, 105, 100]);
    }
  }
  drawText(F_SANS, 9, 24, 842, "ATLANTIC", GREY, 2);
  drawText(F_SANS, 9, 24, 856, "PACIFIC", GREY, 2);
  drawText(F_SANS, 9, 268, 856, "INDIAN", GREY, 2);
  // numbered pins (story 11 Bitcoin is global: no pin)
  for (let n = 1; n <= 36; n++) {
    const p = PINS[n];
    if (!p) continue;
    const [lat, lon, dx, dy] = p;
    // clamp so the 6.5px pin circle never clips the panel edge (Wellington, pin 13)
    const px = Math.min(Math.max(mapX0 + ((lon + 180) / 360) * (mapX1 - mapX0) + dx, mapX0 + 7), mapX1 - 7);
    const py = mapY0 + ((80 - lat) / 140) * (mapY1 - mapY0) + dy;
    const col = REGIONS[STORY_REGION[n - 1]].color;
    fillCircle(px, py, 6.5, WHITE);
    ring(px, py, 6.5, 1.5, col);
    drawText(F_SANS_BOLD, 8, px, py + 3, String(n), INK, 0, "c");
  }
  // map legend
  drawText(F_SANS, 9.5, MX + 2, 872, "pin colour = the region · 11 Bitcoin is global, no pin", [70, 70, 70]);
  drawText(F_SANS_BOLD, 10.5, MX + 2, 888, "STORIES BY REGION", INK, 0.5);
  const leg: [string, C | null][] = [
    ["Europe 13", REGIONS[0].color], ["Middle East 6", REGIONS[1].color],
    ["Asia 5", REGIONS[2].color], ["Africa 1", REGIONS[3].color],
    ["Americas 7", REGIONS[4].color], ["Oceania 3", REGIONS[5].color],
    ["Global 1", REGIONS[6].color], ["36 stories · 7 regions", null],
  ];
  for (let i = 0; i < 8; i++) {
    const lx = MX + 2 + (i % 2) * 168;
    const ly = 902 + Math.floor(i / 2) * 12;
    const [txt, col] = leg[i];
    if (col) fillRect(lx, ly - 7.5, 8, 8, col);
    drawText(F_SANS, 10, lx + (col ? 12 : 0), ly, txt, INK);
  }
  // list, two columns
  const cols: [number, number, [string, string, string][], number][] = [
    [346, 326, LIST.slice(0, 9), 14],
    [682, 334, LIST.slice(9), 23],
  ];
  for (const [cx, cw, items, startN] of cols) {
    let y = 740;
    for (let i = 0; i < items.length; i++) {
      const n = startN + i;
      const [place, text, src] = items[i];
      const full = `${place}: ${text} (${src})`;
      const lines = wrapText(F_SANS, 10.5, full, cw - 18);
      const col = REGIONS[STORY_REGION[n - 1]].color;
      fillCircle(cx + 7, y - 3.5, 6.5, col);
      drawText(F_SANS_BOLD, 8, cx + 7, y - 0.5, String(n), WHITE, 0, "c");
      for (const ln of lines) {
        drawText(F_SANS, 10.5, cx + 18, y, ln, INK);
        y += 12;
      }
      y += 0.5;
    }
  }
}

// ---------- date check + footer ----------
function drawBottom(): void {
  // date check box
  fillRect(MX, 942, CW, 2, RED);
  fillRect(MX, 986, CW, 2, RED);
  fillRect(MX, 942, 2, 46, RED);
  fillRect(RX - 2, 942, 2, 46, RED);
  const prefix = "DATE CHECK — ";
  const pw = measure(F_SANS_BOLD, 10.5, prefix);
  drawText(F_SANS_BOLD, 10.5, MX + 8, 956, prefix, RED);
  const lines = wrapText(F_SANS, 10.5, DATE_CHECK, RX - 8 - (MX + 8 + pw));
  drawText(F_SANS, 10.5, MX + 8 + pw, 956, lines[0], INK);
  if (lines[1]) drawText(F_SANS, 10.5, MX + 8, 969, lines[1], INK);
  if (lines[2]) drawText(F_SANS, 10.5, MX + 8, 982, lines[2], INK);
  // footer
  drawText(F_SANS, 11, 512, 1002, FOOTER1, INK, 0, "c");
  const f1 = measure(F_SANS, 10, FOOTER2A);
  const f2 = measure(F_SANS, 10, FOOTER2B);
  const f3 = measure(F_SANS, 10, FOOTER2C);
  const total = 10 + 4 + f1 + 12 + 4 + f2 + 12 + 4 + f3;
  let fx = 512 - total / 2;
  drawCheck(fx, 1010, 9, GREEN_TAG); fx += 14;
  drawText(F_SANS, 10, fx, 1016, FOOTER2A, INK); fx += f1;
  drawCircledLetter(F_SANS, fx, 1016, "R", BROWN_TAG); fx += 16;
  drawText(F_SANS, 10, fx, 1016, FOOTER2B, INK); fx += f2;
  drawCircledLetter(F_SANS, fx, 1016, "O", BLUE_TAG); fx += 16;
  drawText(F_SANS, 10, fx, 1016, FOOTER2C, INK);
}

// ---------- main ----------
function main(): void {
  fillAll(CREAM);
  drawHeader();
  drawHeroes();
  drawMids();
  drawMapList();
  drawBottom();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(downsample(), W, H);
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  if (process.env.MAKEFUN_FONT_CHECK === "1") {
    for (const [name, f] of [["serifBold", F_SERIF_BOLD], ["sans", F_SANS], ["sansBold", F_SANS_BOLD], ["serifItalic", F_SERIF_ITALIC]] as const) {
      let n = 0, sx = 0, sy = 0;
      for (const g of f.glyphs.values()) {
        for (const c of g.c) for (const [px, py] of c) { n++; sx += px; sy += py; }
      }
      console.log(name, f.glyphs.size, n, sx, sy);
    }
  }
}
const SB0 = "32:512|;33:682|397,420 -115,0 -92,921 299,0|340,-29 -64,12 -54,36 -36,53 -12,65 12,64 36,53 54,37 64,12 64,-12 54,-36 36,-53 12,-65 -12,-64 -36,-53 -54,-37 -64,-12;34:1137|653,1341 258,0 -78,-481 -104,0|227,1341 258,0 -78,-481 -104,0;35:1024|741,411 -76,-411 -143,0 76,411 -270,0 -74,-411 -146,0 76,411 -157,0 0,123 182,0 53,287 -235,0 0,123 258,0 73,397 144,0 -74,-397 270,0 74,397 143,0 -74,-397 156,0 0,-123 -178,0 -51,-287 229,0 0,-123|405,821 -53,-287 270,0 54,287;36:1024|466,-20 -222,24 -101,23 -70,24 0,320 93,0 36,-186 44,-39 70,-34 80,-24 70,-10 0,488 -143,63 -92,57 -60,59 -45,72 -28,88 -9,109 26,131 77,104 120,72 154,33 0,129 102,0 0,-127 306,-43 0,-279 -91,0 -32,143 -79,51 -104,28 0,-415 106,-44 70,-33 91,-62 69,-77 46,-103 16,-135 -27,-158 -81,-125 -126,-83 -164,-37 0,-140 -102,0|752,330 -18,84 -52,60 -46,26 -68,28 0,-451 79,28 57,51 36,76 12,98|303,1067 15,-79 45,-56 41,-25 62,-28 0,375 -70,-21 -51,-41 -31,-56 -11,-69;37:2048|640,-20 -150,0 948,1382 151,0|861,995 -21,-163 -62,-116 -103,-70 -144,-23 -141,24 -100,71 -60,117 -20,160 20,161 62,114 102,69 143,23 140,-23 101,-69 62,-115 21,-160|645,995 -7,125 -20,84 -36,48 -51,16 -48,-15 -33,-46 -19,-83 -6,-129 6,-132 19,-85 33,-46 48,-16 51,16 35,49 21,86 7,128|1856,346 -21,-163 -61,-117 -103,-70 -144,-23 -141,24 -100,71 -61,117 -20,161 20,157 61,115 102,71 145,24 140,-23 101,-69 62,-115 20,-160|1641,346 -7,125 -20,85 -36,47 -51,16 -48,-15 -33,-46 -19,-84 -6,-128 6,-132 19,-85 33,-47 48,-15 51,16 35,49 21,86 7,128;38:1706|1043,1073 -7,-71 -23,-61 -87,-99 -71,-43 -103,-46 380,-343 40,142 19,165 -111,26 0,64 477,0 0,-64 -110,-26 -27,-91 -68,-188 -82,-152 220,-198 116,-25 0,-63 -384,0 -119,110 -94,-57 -105,-41 -116,-24 -128,-8 -129,6 -111,18 -93,29 -75,41 -59,53 -42,65 -25,76 -8,88 9,90 26,78 97,122 75,51 105,48 -94,153 -32,169 24,124 74,93 119,58 160,20 155,-18 114,-56 70,-91 23,-124|660,86 99,8 90,22 80,38 70,52 -477,444 -58,-52 -40,-63 -22,-77 -8,-91 18,-125 53,-87 84,-52 111,-17|554,1089 22,-119 32,-60 53,-66 64,44 40,52 21,65 7,84 -7,76 -21,54 -35,32 -49,11 -58,-11 -39,-33 -23,-54 -7,-75;39:569|156,1341 258,0 -78,-481 -104,0;40:682|363,494 6,-214 19,-168 34,-136 48,-119 64,-100 82,-79 0,-114 -176,110 -134,120 -96,135 -68,157 -39,187 -13,222 13,221 39,185 68,157 96,135 134,119 176,109 0,-114 -82,-79 -64,-99 -48,-118 -33,-136 -19,-168 -7,-213;41:682|66,-436 0,114 82,80 64,100 48,119 34,137 19,169 6,211 -7,214 -19,168 -33,136 -48,117 -64,99 -82,79 0,114 178,-111 133,-120 96,-134 67,-156 39,-185 13,-220 -13,-221 -39,-186 -67,-158 -97,-136 -133,-119 -177,-111;42:1024|556,895 73,-316 -233,0 70,320 -287,-236 -94,213 307,88 -307,90 94,213 287,-233 -70,317 233,0 -73,-317 288,227 95,-209 -312,-88 312,-86 -95,-211;43:1167|655,608 0,-405 -143,0 0,405 -404,0 0,143 404,0 0,406 143,0 0,-406 405,0 0,-143;44:512|434,106 -26,-144 -78,-120 -128,-93 -175,-66 0,92 108,50 69,69 25,71 -15,38 -60,41 -57,51 -19,73 11,57 34,42 51,25 63,9 78,-14 63,-41 42,-62 14,-78;45:682|75,395 0,174 532,0 0,-174;46:512|256,-29 -64,12 -54,36 -36,53 -12,65 12,64 36,53 54,37 64,12 64,-12 54,-36 36,-53 12,-65 -12,-64 -36,-53 -54,-37 -64,-12;47:569|121,-20 -141,0 470,1369 140,0;48:1024|946,676 -7,-163 -21,-141 -34,-120 -48,-98 -62,-76 -76,-54 -89,-33 -103,-11 -100,11 -86,33 -74,56 -60,78 -47,99 -34,119 -20,140 -7,160 7,157 20,137 34,117 47,99 61,77 75,55 89,33 103,11 100,-11 86,-33 75,-54 61,-76 48,-98 34,-118 21,-138 7,-158|653,676 -2,145 -7,123 -11,101 -15,79 -45,103 -65,34 -63,-33 -43,-99 -13,-78 -10,-101 -6,-125 -2,-149 2,-151 6,-127 10,-104 14,-79 42,-101 63,-34 64,35 46,103 15,81 11,103 7,126 2,148;49:1024|685,110 233,-24 0,-86 -754,0 0,86 232,24 0,1011 -231,-76 0,85 378,222 142,0;50:1024|936,0 -850,0 0,189 159,165 139,141 95,107 109,188 25,104 9,117 -13,99 -40,77 -62,50 -79,17 -99,-13 -68,-39 -43,-194 -87,0 0,305 157,31 166,12 104,-6 91,-17 78,-28 65,-40 52,-50 37,-60 22,-70 7,-79 -9,-100 -26,-90 -111,-167 -47,-47 -65,-60 -85,-72 -103,-85 -186,-159 658,0;51:1024|954,365 -8,-86 -25,-77 -41,-65 -57,-56 -72,-44 -85,-32 -97,-19 -110,-6 -370,40 -12,325 92,0 52,-215 89,-37 93,-12 108,19 81,58 51,93 17,124 -14,107 -40,78 -72,51 -105,22 -116,7 0,121 112,8 77,19 54,46 32,75 11,105 -13,100 -38,76 -61,48 -82,16 -89,-16 -65,-36 -43,-194 -87,0 0,305 176,35 146,8 106,-5 91,-16 78,-25 63,-36 50,-47 35,-57 21,-67 7,-77 -18,-123 -54,-97 -88,-68 -118,-36 148,-36 106,-69 63,-100 21,-132;52:1024|852,265 0,-265 -269,0 0,265 -555,0 0,163 604,920 220,0 0,-878 134,0 0,-205|583,867 10,212 -399,-609 389,0;53:1024|480,793 111,-6 96,-19 81,-30 66,-43 50,-55 36,-68 22,-80 7,-93 -8,-95 -23,-84 -40,-71 -54,-61 -70,-47 -83,-34 -97,-20 -110,-7 -370,40 -12,325 92,0 52,-215 96,-36 103,-13 101,19 72,58 43,96 14,135 -15,138 -44,93 -75,54 -111,18 -130,-26 -31,-13 -100,0 0,688 700,0 0,-223 -589,0 0,-352 116,20 104,7;54:1024|964,416 -7,-99 -20,-87 -34,-75 -48,-63 -60,-49 -72,-35 -83,-21 -95,-7 -108,11 -95,33 -82,54 -68,77 -53,97 -38,117 -23,137 -8,156 16,201 48,172 78,138 103,101 125,62 142,20 153,-11 148,-32 0,-305 -87,0 -43,194 -72,39 -79,13 -91,-32 -71,-96 -50,-154 -24,-204 108,35 108,12 162,-26 120,-77 75,-126 25,-170|541,81 62,20 39,59 21,99 7,138 -10,125 -29,92 -49,57 -67,19 -151,-23 0,-5 11,-254 33,-182 56,-109 77,-36;55:1024|204,958 -87,0 0,383 857,0 0,-79 -521,-1262 -239,0 565,1118 -529,0;56:1024|925,1011 -13,-102 -41,-85 -65,-67 -87,-46 101,-55 75,-78 46,-99 15,-117 -7,-89 -20,-77 -35,-66 -48,-54 -62,-42 -77,-30 -93,-18 -108,-6 -103,6 -89,18 -75,30 -61,42 -48,53 -35,66 -20,77 -7,90 16,118 46,100 74,78 98,53 -86,47 -64,67 -40,86 -13,103 27,146 82,110 130,69 176,23 173,-23 129,-71 82,-111 27,-146|672,362 -10,133 -30,91 -52,52 -74,18 -70,-17 -48,-51 -27,-90 -9,-136 9,-132 27,-86 48,-47 70,-16 74,17 52,49 30,87 10,128|641,1011 -8,113 -25,78 -42,44 -58,15 -56,-15 -38,-44 -23,-77 -8,-114 7,-116 23,-76 39,-42 56,-14 60,14 41,43 24,77 8,114;57:1024|56,932 7,96 22,84 37,73 51,61 64,48 76,34 87,21 98,7 110,-10 93,-31 78,-52 63,-72 47,-94 34,-118 20,-141 7,-164 -16,-208 -48,-173 -77,-136 -105,-98 -131,-59 -155,-20 -161,11 -150,32 0,305 87,0 43,-194 83,-39 94,-14 96,31 72,92 48,149 23,205 -207,-37 -162,27 -124,81 -78,130 -26,173|350,928 10,-125 29,-89 49,-54 68,-18 150,18 0,14 -9,253 -25,182 -21,64 -27,45 -34,28 -40,9 -66,-20 -46,-62 -29,-102 -9,-143;58:682|333,-29 -64,12 -53,36 -36,53 -12,65 12,65 36,53 53,36 64,12 64,-12 53,-36 37,-53 12,-65 -12,-64 -36,-53 -53,-37 -65,-12|333,628 -64,12 -53,36 -36,54 -12,64 12,64 34,54 53,36 66,12 65,-12 54,-36 35,-54 12,-64 -12,-64 -36,-54 -53,-36 -65,-12;59:682|335,628 -64,12 -53,36 -36,54 -12,64 12,64 34,54 53,36 66,12 65,-12 54,-36 35,-54 12,-64 -12,-64 -36,-54 -53,-36 -65,-12|514,106 -26,-144 -78,-119 -128,-93 -176,-67 0,92 108,50 70,69 25,71 -16,39 -61,40 -58,51 -19,73 11,54 32,42 52,28 67,9 77,-14 63,-41 43,-62 14,-78;60:1167|102,635 0,90 952,468 0,-143 -767,-370 767,-371 0,-143;61:1167|1054,547 0,-144 -952,0 0,144|1054,956 0,-143 -952,0 0,143;62:1167|104,166 0,143 768,371 -768,370 0,143 952,-468 0,-90;63:1024|445,-29 -64,12 -53,36 -36,53 -12,65 12,65 36,53 53,36 64,12 64,-12 53,-36 37,-53 12,-65 -12,-64 -36,-53 -53,-37 -65,-12|491,390 -103,0 -57,313 95,25 88,36 58,56 31,75 10,99 -12,118 -36,80 -64,47 -96,15 -79,-10 -70,-32 -43,-194 -89,0 0,295 164,32 160,11 106,-6 93,-16 78,-28 63,-39 50,-50 36,-61 21,-72 7,-83 -19,-134 -59,-111 -93,-85 -126,-55 -87,-24;64:1905|1798,752 -24,-183 -73,-173 -115,-151 -149,-118 -171,-77 -181,-25 -55,8 -39,23 -25,39 -9,55 -52,-43 -105,-61 -114,-21 -77,17 -59,53 -38,82 -12,106 13,127 38,124 61,114 80,98 96,77 107,56 128,34 161,11 183,-11 -121,-541 -16,-87 -7,-70 9,-39 41,-17 90,20 82,60 70,95 53,125 35,143 11,149 -9,115 -27,101 -44,87 -62,74 -78,59 -92,42 -105,26 -118,8 -214,-28 -191,-85 -159,-136 -121,-184 -77,-221 -26,-246 18,-179 55,-158 89,-130 121,-98 148,-62 173,-20 143,10 133,30 131,54 134,81 44,-64 -144,-98 -147,-67 -156,-38 -169,-13 -214,23 -186,71 -152,113 -112,152 -70,184 -23,208 32,272 97,245 70,109 82,96 94,83 106,70 235,95 260,32 161,-10 142,-30 122,-50 103,-70 82,-89 58,-105 35,-121 12,";
const SB1 = "-137|740,316 5,-63 17,-47 49,-37 79,20 75,48 120,561 -61,5 -90,-13 -66,-40 -50,-71 -41,-108 -37,-255;65:1479|428,73 0,-73 -408,0 0,73 100,27 477,1252 290,0 475,-1252 102,-27 0,-73 -597,0 0,73 155,27 -128,347 -515,0 -123,-347|641,1150 -221,-593 436,0;66:1366|878,1010 -13,101 -37,68 -67,39 -100,13 -139,0 0,-467 147,0 93,14 65,42 38,76 13,114|979,391 -17,116 -50,82 -87,49 -130,16 -173,0 0,-544 129,-4 98,-2 102,18 71,53 43,89 14,127|34,0 0,73 173,27 0,1142 -173,26 0,73 651,0 125,-4 107,-14 90,-22 72,-31 56,-42 39,-52 24,-64 8,-74 -19,-112 -56,-95 -88,-72 -113,-42 164,-35 119,-66 72,-98 24,-127 -9,-92 -27,-79 -45,-69 -63,-56 -80,-44 -95,-32 -111,-19 -127,-6 -456,6;67:1479|815,-20 -159,11 -141,34 -122,56 -104,78 -83,98 -59,115 -35,133 -12,150 11,162 34,141 57,120 78,100 102,78 122,55 144,34 166,11 237,-17 246,-50 6,-322 -90,0 -28,194 -143,67 -164,23 -108,-9 -93,-27 -77,-45 -61,-64 -47,-82 -33,-102 -20,-122 -7,-142 7,-132 21,-116 35,-98 49,-82 62,-64 76,-46 87,-28 101,-9 106,7 92,23 132,71 32,220 91,0 -6,-340 -103,-32 -131,-28 -268,-24;68:1479|1047,670 -7,135 -20,116 -33,97 -46,78 -61,59 -78,42 -95,26 -111,8 -74,0 0,-1117 174,-8 116,14 90,42 65,72 45,104 26,142 9,190|673,1341 169,-10 145,-31 121,-51 98,-71 76,-93 54,-114 32,-136 11,-157 -10,-161 -31,-140 -52,-117 -72,-96 -93,-73 -114,-53 -136,-31 -156,-11 -449,4 -230,0 0,73 172,27 0,1142 -172,26 0,73;69:1366|35,73 172,27 0,1142 -172,26 0,73 1142,0 0,-341 -91,0 -32,217 -137,11 -187,3 -208,0 0,-492 351,0 31,148 89,0 0,-412 -89,0 -31,152 -351,0 0,-517 253,0 118,1 95,3 74,5 51,7 57,248 91,0 -19,-374 -1207,0;70:1251|522,572 0,-472 223,-27 0,-73 -697,0 0,73 159,27 0,1142 -172,26 0,73 1118,0 0,-361 -94,0 -32,237 -65,6 -97,5 -101,2 -77,1 -165,0 0,-549 327,0 31,170 89,0 0,-452 -89,0 -31,172;71:1593|1406,70 -134,-37 -154,-29 -156,-18 -139,-6 -205,20 -178,60 -144,98 -108,135 -66,167 -22,195 12,159 36,139 60,120 84,101 107,80 127,56 148,35 168,11 158,-7 134,-19 88,-21 140,-38 0,-308 -90,0 -24,174 -174,84 -196,30 -109,-9 -92,-27 -77,-46 -62,-63 -46,-82 -33,-103 -20,-122 -7,-142 7,-133 21,-116 35,-98 49,-82 63,-63 75,-46 88,-27 100,-9 221,35 0,388 -172,26 0,74 618,0 0,-74 -131,-26;72:1593|35,0 0,74 172,26 0,1141 -172,27 0,73 659,0 0,-73 -172,-27 0,-496 548,0 0,496 -172,27 0,73 661,0 0,-73 -173,-27 0,-1141 173,-26 0,-74 -661,0 0,74 172,26 0,535 -548,0 0,-535 172,-26 0,-74;73:797|556,100 172,-26 0,-74 -659,0 0,74 172,26 0,1141 -172,27 0,73 659,0 0,-73 -172,-27;74:1024|501,1242 -172,26 0,73 639,0 0,-73 -152,-26 0,-810 -8,-102 -22,-90 -38,-78 -52,-64 -66,-52 -80,-37 -91,-22 -105,-7 -148,8 -115,22 0,304 89,0 30,-179 54,-36 77,-13 63,12 52,36 34,60 11,82;75:1593|1469,1341 0,-73 -164,-26 -443,-391 590,-751 125,-27 0,-73 -438,0 -501,646 -116,-100 0,-446 193,-27 0,-73 -680,0 0,73 172,27 0,1142 -172,26 0,73 660,0 0,-73 -173,-26 0,-546 611,546 -123,26 0,73;76:1366|729,1268 -207,-26 0,-1136 273,0 185,5 128,15 82,279 90,0 -38,-405 -1207,0 0,73 172,27 0,1142 -171,26 0,73 693,0;77:1933|882,0 -55,0 -495,1133 0,-1033 180,-27 0,-73 -477,0 0,73 172,27 0,1142 -172,26 0,73 527,0 383,-882 391,882 538,0 0,-73 -172,-26 0,-1142 172,-27 0,-73 -667,0 0,73 180,27 0,1033;78:1479|1155,1242 -180,26 0,73 477,0 0,-73 -172,-26 0,-1242 -117,0 -827,1078 0,-978 180,-27 0,-73 -477,0 0,73 172,27 0,1142 -172,26 0,73 459,0 657,-857;79:1593|432,672 5,-148 17,-125 27,-103 39,-80 50,-59 63,-43 75,-25 89,-9 88,9 76,25 62,43 51,60 38,80 27,102 17,125 5,148 -5,147 -17,124 -27,101 -38,78 -51,58 -62,42 -76,25 -88,8 -89,-8 -75,-25 -63,-42 -50,-58 -39,-78 -27,-101 -17,-124 -5,-147|100,672 11,160 33,139 54,118 76,96 98,75 120,53 142,32 163,11 161,-11 141,-32 119,-55 99,-76 77,-96 55,-118 33,-138 11,-158 -11,-160 -34,-140 -55,-118 -78,-98 -99,-77 -120,-55 -139,-33 -160,-11 -159,11 -140,33 -120,54 -99,77 -78,98 -56,119 -34,139 -11,161;80:1251|871,944 -15,136 -44,88 -83,47 -127,16 -79,0 0,-595 83,0 120,18 82,52 47,94 16,144|523,526 0,-426 223,-27 0,-73 -698,0 0,73 159,27 0,1142 -172,26 0,73 591,0 134,-6 115,-18 97,-30 80,-41 62,-55 44,-68 26,-82 9,-95 -8,-98 -23,-86 -38,-72 -54,-59 -68,-46 -85,-33 -99,-19 -115,-7;81:1593|100,672 11,160 33,139 54,118 76,96 98,75 120,53 142,32 163,11 161,-11 141,-32 119,-55 99,-76 77,-96 55,-118 33,-138 11,-158 -23,-226 -70,-182 -117,-138 -164,-94 50,-61 71,-81 66,-57 60,-35 55,-11 82,8 0,-86 -35,-11 -62,-14 -139,-16 -129,14 -106,42 -94,74 -62,69 -91,113 -157,12 -137,34 -117,55 -98,77 -77,99 -55,118 -33,139 -11,158|432,672 5,-148 17,-125 27,-103 39,-80 50,-59 63,-43 75,-25 89,-9 88,9 76,25 62,43 51,60 38,80 27,102 17,125 5,148 -5,147 -17,124 -27,101 -38,78 -51,58 -62,42 -76,25 -88,8 -89,-8 -75,-25 -63,-42 -50,-58 -39,-78 -27,-101 -17,-124 -5,-147;82:1479|523,568 0,-468 172,-27 0,-73 -647,0 0,73 159,27 0,1142 -172,26 0,73 641,0 139,-6 119,-17 102,-28 82,-40 64,-52 46,-64 27,-78 9,-90 -17,-131 -51,-105 -84,-80 -118,-54 358,-496 145,-27 0,-73 -434,0 -374,568|952,964 -16,127 -46,81 -88,44 -139,15 -140,0 0,-553 145,0 132,16 87,48 49,88 16,134;83:1139|109,411 88,0 45,-215 53,-45 74,-37 176,-33 126,15 89,44 54,74 18,103 -14,68 -40,57 -71,48 -101,43 -148,52 -100,41 -127,83 -83,117 -23,76 -8,92 8,83 22,73 38,62 53,52 67,40 81,29 95,17 109,6 177,-11 195,-32 0,-319 -89,0 -45,184 -110,56 -128,18 -109,-11 -80,-35 -49,-57 -17,-82 14,-62 41,-53 70,-44 102,-40 193,-70 121,-60 76,-63 55,-75 34,-89 11,-104 -8,-100 -23,-87 -40,-73 -55,-60 -70,-47 -87,-33 -102,-20 -118,-7 -235,20 -205,51;84:1366|310,0 0,73 213,27 0,1135 -51,0 -195,-5 -127,-15 -27,-249 -91,0 0,375 1303,0 0,-375 -92,0 -27,249 -124,13 -204,5 -49,0 0,-1133 213,-27 0,-73;85:1479|838,122 133,21 99,63 62,104 20,143 0,789 -180,26 0,73 456,0 0,-73 -152,-26 0,-781 -8,-109 -26,-96 -41,-82 -59,-69 -74,-54 -89,-39 -103,-23 -117,-8 -127,8 -111,23 -95,40 -80,54 -62,70 -45,84 -27,97 -9,112 0,773 -152,26 0,73 639,0 0,-73 -172,-26 0,-787 20,-142 62,-105 100,-64 138,-22;86:1479|1456,1341 0,-73 -127,-27 -518,-1272 -133,0 -545,1272 -110,27 0,73 583,0 0,-73 -139,-27 377,-879 352,879 -135,27 0,73;87:2048|1501,-31 -123,0 -334,827 -331,-827 -123,0 -444,1273 -117,26 0,73 602,0 0,-73 -157,-26 286,-799 314,784 125,0 315,-782 237,797 -169,26 0,73 434,0 0,-73 -117,-26;88:1479|330,100 166,-27 0,-73 -458,0 0,73 148,27 431,548 -384,594 -151,26 0,73 653,0 0,-73 -170,-26 234,-362 285,362 -166,26 0,73 459,0 0,-73 -148,-26 -365,-463 439,-679 152,-27 0,-73 -653,0 0,73 170,27 -290,447;89:1479|911,528 0,-428 213,-27 0,-73 -742,0 0,73 213,27 0,422 -408,720 -151,26 0,73 690,0 0,-73 -180,-26 306,-562 296,562 -164,26 0,73 456,0 0,-73 -142,-26;90:1366|98,114 742,1121 -240,0 -194,-5 -126,-15 -31,-211 -89,0 0,337 1036,0 0,-106 -747,-1131 280,0 225,11 95,11 64,11 59,256 90,0 -27,-393 -1137,0;91:682|152,-274 0,1695 456,0 0,-67 -203,-41 0,-1479 203,-41 0,-67;92:569|-20,1349 140,0 470,-1369 -141,0;93:682|74,-274 0,67 203,41 0,1479 -203,41 0,67 456,0 0,-1695;94:1190|925,389 -330,761 -330,-761 -143,0 428,952 90,0 428,-952;95:1024|-16,-285 0,144 1056,0 0,-144;96:682|452,1118 -364,268 0,37 285,0 165,-273 0,-32;97:1024|546,961 154,-16 111,-49 66,-81 22,-114 0,-611 94,-24 0,-66 -346,0 -22,72 -74,-45 -67,-27 -127,-20 -127,18 -91,52 -55,88 -18,122 11,95 32,75 53,55 71,39 104,23 151,11 122,3 0,137 -9,74 -26,54 -43,31 -61,11 -89,-13 -99,-39 -38,-117 -66,0 0,227 131,19 91,10 145,6|610,472 -84,-3 -82,-15 -52,-36 -29,-62 -9,-90 8,-74 22,-51 34,-30 44,-10 148,35;98:1139|763,497 -11,160 -34,111 -61,64 -89,22 -83,-8 -74,-26 0,-719 157,-16 86,24 61,73 36,127 12,188|122,1333 -96,23 0,65 385,0 0,-345 -10,-189 115,55 148,23 95,-7 81,-21 68,-35 54,-49 41,-64 29,-81 18,-98 6,-114 -8,-114 -22,-102 -38,-88 -52,-75 -67,-60 -79,-43 -91,-25 -103,-9 -90,4 -110,13 -127,21 -147,30;99:909|858,57 -54,-32 -70,-24 -164,-20 -118,8 -101,22 -86,38 -71,53 -54,68 -39,85 -23,101 -8,116 14,144 42,122 69,97 93,71 114,44 130,15 146,-9 159,-26 0,-278 -72,0 -42,165 -67,35 -87,10 -56,-12 -51,-35 -43,-57 -31,-76 -20,-93 -7,-111 16,-172 47,-115 80,-65 118,-21 128,7 108,22;100:1139|733,53 -49,-30 -37,-17 -68,-19 -84,-7 -97,7 -84,23 -71,37 -58,53 -45,67 -32,84 -19,100 -6,116 7,115 20,100 35,85";
const SB2 = " 47,71 61,56 74,39 85,24 98,8 220,-27 -4,55 -2,100 0,238 -96,24 0,66 385,0 0,-1331 103,-24 0,-66 -362,0|376,475 12,-165 35,-120 57,-74 78,-25 82,11 84,32 0,708 -158,21 -80,-25 -60,-74 -38,-121 -12,-168;101:909|494,963 89,-6 76,-19 62,-32 49,-45 38,-58 27,-72 16,-87 5,-100 0,-82 -493,0 0,-16 6,-128 18,-84 31,-56 47,-40 64,-25 84,-8 99,7 123,22 0,-77 -143,-55 -170,-21 -108,8 -93,22 -78,38 -63,53 -48,68 -34,85 -21,102 -7,118 7,115 19,100 33,84 47,68 59,53 73,38 86,22 100,8|483,862 -52,-16 -37,-49 -23,-90 -7,-140 218,0 -2,114 -7,75 -31,80 -59,26;102:682|157,836 -142,0 0,69 142,39 0,101 25,170 73,125 119,76 162,26 91,-5 75,-14 0,-224 -64,0 -29,109 -63,24 -44,-16 -31,-48 -19,-79 -6,-112 0,-137 191,0 0,-104 -191,0 0,-746 153,-24 0,-66 -544,0 0,66 102,24;103:1024|257,347 -78,46 -55,65 -34,82 -11,100 27,138 82,102 132,64 180,21 110,-7 99,-18 225,111 35,-43 -114,-162 47,-90 15,-116 -27,-141 -80,-103 -133,-65 -181,-21 -153,12 -24,-76 37,-54 86,-26 219,0 150,-16 107,-50 65,-82 21,-116 -15,-101 -45,-87 -73,-69 -101,-53 -130,-33 -158,-11 -181,15 -135,43 -84,70 -28,91 36,87 54,47 88,56 -55,31 -45,49 -42,120|785,-166 -8,42 -24,29 -39,18 -56,6 -317,0 -66,-68 -22,-77 15,-56 46,-40 73,-24 96,-8 128,12 95,35 59,56 20,75|494,410 64,14 43,44 25,71 8,101 -8,100 -24,70 -44,40 -64,14 -60,-14 -40,-40 -24,-70 -8,-100 8,-101 23,-71 41,-44 60,-14;104:1139|436,1014 -6,-156 69,35 135,54 120,18 114,-17 81,-52 49,-87 16,-121 0,-598 94,-24 0,-66 -467,0 0,66 84,24 0,559 -9,75 -26,56 -44,35 -58,12 -152,-34 0,-703 86,-24 0,-66 -467,0 0,66 92,24 0,1241 -96,24 0,66 385,0;105:569|436,90 103,-24 0,-66 -494,0 0,66 102,24 0,760 -96,24 0,66 385,0|137,1268 11,60 34,49 50,33 59,11 59,-11 50,-34 33,-49 11,-59 -11,-59 -33,-49 -49,-35 -60,-11 -59,11 -50,33 -34,50 -11,60;106:682|553,1268 -11,-59 -34,-50 -49,-34 -59,-11 -59,11 -50,33 -34,50 -11,60 11,58 33,50 50,34 60,11 58,-11 50,-34 34,-49 11,-59|545,-39 -25,-167 -76,-126 -123,-78 -166,-26 -172,18 0,225 64,0 43,-114 49,-19 48,17 37,49 24,81 8,108 0,911 -166,34 0,66 455,0;107:1139|436,451 367,400 -100,23 0,66 358,0 0,-66 -108,-22 -224,-236 323,-526 84,-24 0,-66 -452,0 0,66 55,24 -188,329 -115,-80 0,-249 93,-24 0,-66 -471,0 0,66 89,24 0,1241 -96,24 0,66 385,0;108:569|431,90 103,-24 0,-66 -494,0 0,66 102,24 0,1241 -96,24 0,66 385,0;109:1706|434,858 68,35 133,54 118,18 77,-8 63,-23 49,-38 35,-53 189,91 157,31 111,-17 80,-52 47,-87 16,-121 0,-598 94,-24 0,-66 -467,0 0,66 84,24 0,559 -8,75 -24,56 -41,35 -58,12 -77,-11 -83,-31 10,-97 0,-598 94,-24 0,-66 -467,0 0,66 84,24 0,559 -8,75 -24,56 -41,35 -58,12 -71,-10 -80,-29 0,-698 86,-24 0,-66 -467,0 0,66 92,24 0,760 -92,24 0,66 365,0;110:1139|434,858 68,35 133,54 119,18 114,-17 81,-52 49,-87 16,-121 0,-598 94,-24 0,-66 -467,0 0,66 84,24 0,559 -9,75 -26,56 -44,35 -58,12 -152,-34 0,-703 86,-24 0,-66 -467,0 0,66 92,24 0,760 -92,24 0,66 365,0;111:1024|946,475 -7,-118 -20,-102 -34,-85 -47,-69 -62,-53 -76,-38 -90,-22 -104,-8 -101,8 -87,23 -74,38 -60,53 -46,70 -34,85 -19,101 -7,117 7,116 20,101 33,84 48,68 60,53 75,38 90,22 103,8 104,-8 89,-23 75,-39 60,-55 45,-69 33,-84 19,-99 7,-113|653,475 -8,186 -25,119 -44,63 -68,21 -65,-20 -42,-61 -23,-117 -7,-191 8,-194 23,-119 41,-62 65,-20 68,22 44,64 25,121 8,188;112:1139|409,892 119,55 141,18 92,-7 79,-22 66,-36 54,-50 42,-66 30,-82 18,-99 6,-116 -7,-116 -21,-101 -34,-87 -49,-73 -62,-57 -73,-40 -86,-25 -98,-8 -214,27 6,-148 0,-205 138,-24 0,-66 -529,0 0,66 102,24 0,1196 -103,24 0,66 381,0|763,480 -11,164 -32,116 -55,71 -76,23 -89,-10 -82,-28 0,-709 169,-21 77,25 55,73 33,124 11,172;113:1139|377,448 12,-157 35,-111 61,-67 92,-22 81,11 71,27 0,716 -152,17 -89,-25 -62,-76 -37,-129 -12,-184|1018,-346 102,-24 0,-66 -529,0 0,66 138,24 0,215 10,189 -110,-58 -135,-20 -98,8 -84,23 -70,38 -58,55 -43,69 -32,85 -19,100 -6,116 7,113 21,99 35,84 49,70 63,55 77,39 90,23 103,8 106,-6 173,-17 119,43 91,0;114:909|461,745 102,103 91,70 82,39 75,13 54,0 0,-343 -56,0 -59,126 -143,-27 -141,-65 0,-571 151,-24 0,-66 -562,0 0,66 122,24 0,760 -122,24 0,66 395,0;115:797|747,298 -24,-138 -73,-100 -118,-60 -162,-20 -168,16 -138,35 0,256 66,0 38,-132 92,-59 116,-23 76,9 54,28 31,43 11,53 -10,50 -31,38 -65,36 -114,40 -124,53 -82,70 -45,87 -15,105 24,115 71,89 109,57 136,19 121,-7 156,-22 0,-241 -66,0 -32,110 -81,47 -100,19 -63,-7 -43,-22 -26,-35 -9,-46 11,-48 32,-39 66,-36 111,-38 125,-52 82,-66 46,-83 15,-101;116:682|438,-20 -120,15 -88,46 -56,75 -18,101 0,619 -123,0 0,65 145,39 117,213 150,0 0,-213 198,0 0,-104 -198,0 0,-601 7,-57 20,-41 31,-25 40,-8 130,16 0,-85 -103,-38 -132,-17;117:1139|705,82 -68,-35 -133,-54 -119,-18 -114,17 -81,52 -49,87 -16,121 0,598 -94,24 0,66 383,0 0,-649 9,-75 27,-56 43,-35 58,-12 152,34 0,703 -86,24 0,66 375,0 0,-850 92,-24 0,-66 -365,0;118:1024|580,-20 -121,0 -393,870 -66,24 0,66 481,0 0,-66 -112,-26 241,-536 217,538 -110,24 0,66 307,0 0,-66 -68,-20;119:1479|874,846 217,-535 182,539 -110,24 0,66 305,0 0,-66 -72,-20 -316,-874 -121,0 -215,527 -214,-527 -121,0 -333,870 -70,24 0,66 465,0 0,-66 -112,-26 202,-537 218,535;120:1024|31,875 0,65 502,0 0,-65 -105,-27 137,-211 181,213 -94,25 0,65 320,0 0,-65 -83,-21 -264,-310 298,-458 90,-21 0,-65 -502,0 0,65 105,23 -164,253 -218,-255 94,-21 0,-65 -320,0 0,65 84,16 300,352 -270,417;121:1024|462,-29 -376,879 -66,24 0,66 481,0 0,-66 -112,-26 221,-520 197,522 -110,24 0,66 307,0 0,-66 -68,-20 -371,-913 -60,-141 -52,-96 -107,-110 -62,-27 -71,-9 -165,19 0,242 60,0 43,-126 74,-23 67,18 54,52 49,84 28,61 39,86;122:909|40,0 0,45 432,805 -107,0 -108,-10 -72,-25 -31,-155 -72,0 0,280 730,0 0,-49 -432,-801 150,0 120,14 89,33 53,217 72,0 -27,-354;123:807|592,-274 -133,19 -97,58 -61,93 -20,124 0,295 -13,93 -38,67 -67,41 -97,17 0,85 91,15 67,37 43,66 14,98 0,294 19,125 59,92 97,57 136,19 135,0 0,-87 -62,0 -59,-11 -40,-33 -22,-55 -7,-76 0,-330 -14,-88 -41,-75 -64,-56 -83,-32 0,-3 84,-33 64,-55 41,-75 13,-90 0,-334 7,-76 22,-54 40,-34 59,-11 62,0 0,-87;124:451|154,-442 0,1863 143,0 0,-1863;125:807|80,-274 0,87 62,0 59,11 39,34 23,54 7,76 0,334 14,90 40,75 64,55 84,33 0,3 -83,31 -64,55 -41,75 -14,90 0,330 -7,76 -23,55 -39,33 -59,11 -62,0 0,87 135,0 136,-19 97,-57 58,-92 20,-125 0,-294 14,-98 42,-66 68,-37 91,-15 0,-85 -97,-17 -67,-42 -38,-67 -13,-92 0,-295 -20,-124 -61,-93 -98,-58 -132,-19;126:1065|761,481 -118,29 -135,92 -75,60 -53,36 -74,25 -61,-14 -43,-41 -27,-75 -18,-112 -141,0 20,131 28,94 39,68 53,50 66,32 84,10 116,-27 65,-37 79,-59 69,-58 52,-36 74,-25 58,14 41,44 28,74 20,110 144,0 -24,-132 -30,-94 -40,-68 -52,-50 -65,-31 -80,-10;183:683|341,511 -64,12 -53,36 -37,53 -12,65 12,64 36,53 53,37 65,12 64,-12 53,-36 37,-53 12,-65 -12,-64 -36,-53 -53,-37 -65,-12;8212:2048|2062,549 0,-143 -2076,0 0,143;8211:1024|1038,549 0,-143 -1052,0 0,143;8216:682|161,936 26,143 77,121 128,94 177,68 0,-92 -107,-49 -70,-69 -26,-73 16,-39 61,-39 58,-51 19,-73 -11,-55 -33,-42 -52,-28 -66,-9 -78,14 -63,41 -42,61 -14,77;8217:682|535,1167 -26,-145 -78,-119 -128,-93 -176,-67 0,93 109,50 70,69 24,71 -19,42 -57,37 -57,50 -19,74 11,55 33,42 50,27 66,9 77,-14 63,-40 43,-62 14,-79;8220:1024|99,936 26,143 77,121 128,94 177,68 0,-92 -107,-49 -70,-69 -26,-73 16,-39 61,-39 58,-51 19,-73 -11,-55 -33,-42 -52,-28 -66,-9 -78,14 -63,41 -42,61 -14,77|549,936 26,143 77,121 128,94 177,68 0,-92 -107,-49 -70,-69 -26,-73 16,-39 61,-39 58,-51 19,-73 -11,-55 -33,-42 -52,-28 -66,-9 -78,14 -63,41 -42,61 -14,77;8221:1024|932,1167 -26,-144 -76,-119 -127,-94 -176,-67 0,93 108,50 69,68 25,72 -19,42 -57,37 -58,51 -19,73 11,55 33,42 52,27 66,9 77,-14 62,-40 41,-63 14,-78|484,1167 -26,-143 -78,-120 -128,-95 -175,-66 0,93 108,50 69,68 25,72 -19,42 -57,37 -58,51 -19,73 11,55 33,42 52,27 66,9 77,-14 63,-42 42,-62 14,-77;252:1139|705,82 -68,-35 -133,-54 -119,-18 -114,17 -81,52 -49,87 -16,121 0,598 -94,24 0,66 383,0 0,-649 9,-75 27,-56 43,-35 58,-12 152,34 0,703 -86,24 0,66 375,0 0,-850 92,-24 0,-66 -365,0|735,1130 -85,36 -27,39 -9,46 9,46 27,39 85,34 84,-34 26,-38 9,-47 -9,-46 -26,-39 -39,-27 -45,-9|399,1130 -45,9 -40,28 -36,84 9,45 27,38 39,27 46,9 45,-9 39,-27 35,-83 -9,-46 -26,-39 -39,-27 -45,-9";
const SERIF_BOLD_DATA = SB0 + SB1 + SB2;
const SN0 = "32:569|;33:569|359,397 -148,0 -24,1012 196,0|185,0 0,201 194,0 0,-201;34:727|618,966 -142,0 -20,443 184,0|249,966 -141,0 -21,443 184,0;35:1139|896,885 -78,-369 260,0 0,-108 -283,0 -88,-408 -110,0 86,408 -363,0 -84,-408 -110,0 84,408 -201,0 0,108 225,0 78,369 -252,0 0,108 274,0 89,408 110,0 -88,-408 363,0 88,408 110,0 -88,-408 211,0 0,-108|425,885 -80,-369 362,0 78,369;36:1139|518,20 -191,29 -146,70 -102,110 -57,150 170,37 39,-104 65,-75 96,-47 126,-22 0,496 -150,42 -94,37 -110,81 -60,97 -18,125 28,138 84,104 137,68 183,29 0,131 124,0 0,-131 166,-26 123,-59 87,-96 57,-139 -174,-33 -30,84 -51,62 -75,43 -103,21 0,-445 153,-40 101,-37 120,-79 67,-104 23,-141 -30,-149 -91,-116 -146,-78 -197,-33 0,-162 -124,0|934,394 -6,59 -20,48 -75,69 -72,30 -119,35 0,-468 125,21 91,46 57,69 19,91|258,1048 25,-100 75,-69 64,-28 96,-28 0,421 -114,-18 -81,-38 -49,-60 -16,-80;37:1821|1748,434 -20,-190 -61,-140 -45,-51 -55,-36 -65,-22 -74,-7 -137,28 -99,84 -59,140 -20,194 5,107 14,92 24,77 34,64 43,48 55,35 67,21 77,7 76,-7 66,-22 54,-35 44,-51 57,-141 19,-195|527,0 -155,0 922,1409 157,0|394,1421 74,-7 64,-21 54,-35 44,-49 58,-139 19,-195 -20,-192 -59,-142 -45,-51 -55,-37 -64,-22 -74,-7 -74,7 -64,22 -55,36 -45,51 -59,142 -20,193 19,195 58,140 44,48 56,35 66,21 78,7|1600,434 -10,154 -28,106 -52,60 -78,20 -78,-20 -54,-59 -30,-105 -10,-156 10,-149 30,-105 52,-61 78,-21 76,21 53,63 31,104 10,148|560,975 -10,152 -28,105 -51,61 -77,20 -80,-20 -54,-59 -30,-105 -10,-154 10,-150 30,-105 53,-62 79,-21 75,21 53,63 30,105 10,149;38:1366|1193,-12 -163,32 -135,95 -80,-57 -91,-43 -201,-35 -101,6 -90,20 -77,32 -65,46 -52,56 -36,67 -23,77 -7,87 21,131 65,115 107,100 150,83 -57,147 -24,155 23,133 69,99 110,62 149,21 136,-19 107,-57 70,-90 23,-118 -23,-111 -68,-99 -126,-91 -192,-91 129,-205 164,-207 99,185 72,225 145,-43 -85,-242 -127,-227 100,-73 108,-25 117,16 0,-135 -63,-16 -78,-6|869,1133 -13,65 -37,52 -59,35 -77,11 -85,-13 -61,-39 -37,-61 -13,-81 16,-118 49,-126 114,50 78,42 94,84 31,99|795,217 -179,231 -140,226 -103,-56 -74,-69 -44,-82 -15,-94 19,-108 59,-83 91,-53 120,-18 142,27 124,79;39:391|266,966 -141,0 -21,443 184,0;40:682|127,532 23,274 68,245 114,223 164,210 174,0 -162,-214 -112,-228 -66,-245 -22,-267 22,-266 64,-244 113,-228 163,-216 -174,0 -164,211 -115,223 -67,245 -23,273;41:682|555,528 -23,-274 -68,-245 -114,-223 -164,-210 -174,0 163,216 112,226 65,245 22,267 -22,268 -66,244 -112,227 -162,215 174,0 164,-211 115,-223 67,-245 23,-273;42:797|456,1114 264,103 45,-132 -282,-73 185,-250 -119,-72 -150,258 -156,-256 -119,72 189,248 -280,73 45,134 267,-107 -12,297 136,0;43:1196|671,608 0,-428 -147,0 0,428 -424,0 0,146 424,0 0,428 147,0 0,-428 424,0 0,-146;44:569|385,219 0,-168 -5,-97 -14,-80 -59,-136 -123,0 70,134 24,128 -88,0 0,219;45:682|91,464 0,160 500,0 0,-160;46:569|187,0 0,219 195,0 0,-219;47:569|0,-20 411,1504 158,0 -407,-1504;48:1139|1059,705 -8,-166 -23,-145 -39,-125 -55,-103 -69,-81 -85,-59 -99,-34 -114,-12 -114,12 -99,34 -83,58 -69,81 -53,103 -39,124 -22,146 -8,167 7,170 23,147 37,125 51,102 68,79 85,57 103,34 119,11 116,-11 100,-35 84,-57 67,-80 52,-103 37,-124 23,-146 7,-169|876,705 -4,142 -14,121 -22,100 -30,79 -41,60 -53,43 -64,25 -75,9 -77,-8 -66,-26 -53,-42 -43,-59 -31,-78 -23,-101 -13,-121 -5,-144 5,-140 13,-120 23,-99 33,-80 42,-61 53,-43 63,-26 75,-9 74,9 64,26 53,45 42,62 32,81 24,99 13,119 5,137;49:1139|156,0 0,153 359,0 0,1084 -318,-227 0,170 333,229 166,0 0,-1256 343,0 0,-153;50:1139|103,0 0,127 57,110 68,97 154,162 160,134 144,124 104,130 29,72 10,82 -17,103 -51,77 -81,48 -108,16 -105,-16 -85,-46 -59,-76 -28,-100 -184,17 46,152 97,117 142,75 176,25 100,-6 88,-19 76,-32 64,-43 50,-56 35,-66 22,-77 7,-87 -38,-163 -111,-162 -45,-46 -63,-57 -79,-69 -96,-79 -103,-89 -80,-81 -98,-145 735,0 0,-153;51:1139|1049,389 -8,-92 -23,-81 -39,-70 -54,-59 -69,-47 -82,-33 -95,-20 -108,-7 -192,24 -149,72 -58,55 -44,65 -32,77 -18,89 186,17 33,-109 62,-78 91,-47 121,-16 121,17 92,50 59,83 19,116 -22,102 -66,77 -109,49 -147,16 -102,0 0,156 98,0 131,16 99,49 61,76 20,102 -17,101 -50,77 -82,50 -115,16 -108,-15 -85,-46 -58,-73 -27,-99 -181,14 46,154 98,116 141,73 176,24 100,-6 88,-19 77,-30 64,-43 52,-55 37,-63 22,-74 7,-83 -19,-122 -57,-97 -92,-71 -127,-44 0,-4 141,-35 105,-71 66,-101 22,-123;52:1139|881,319 0,-319 -170,0 0,319 -664,0 0,140 645,950 189,0 0,-948 198,0 0,-142|711,1206 -8,-16 -20,-37 -39,-66 -361,-532 -54,-74 -16,-20 498,0;53:1139|1053,459 -8,-106 -25,-93 -42,-82 -58,-70 -72,-56 -86,-40 -98,-24 -111,-8 -178,22 -140,64 -99,105 -54,144 182,21 40,-91 62,-66 84,-39 107,-13 129,22 98,65 62,104 20,137 -21,120 -61,95 -97,62 -126,20 -136,-23 -126,-78 -176,0 47,758 801,0 0,-153 -637,0 -27,-447 131,67 160,23 99,-8 88,-23 77,-38 68,-53 54,-66 38,-75 23,-84 8,-93;54:1139|1049,461 -8,-106 -22,-93 -38,-83 -53,-70 -66,-56 -78,-41 -89,-24 -101,-8 -112,11 -98,33 -84,56 -70,77 -55,99 -39,118 -24,139 -8,159 8,172 25,152 41,129 57,109 72,86 87,61 100,37 114,12 145,-18 115,-54 86,-89 56,-126 -172,-31 -34,75 -50,54 -66,32 -82,11 -73,-9 -64,-27 -55,-45 -46,-63 -37,-79 -27,-96 -16,-112 -5,-128 59,80 79,59 95,35 109,12 92,-8 83,-23 72,-38 62,-53 51,-66 35,-77 22,-87 7,-98|866,453 -19,135 -56,101 -90,62 -119,21 -114,-18 -90,-56 -58,-87 -19,-115 20,-148 61,-119 91,-78 115,-26 116,22 88,65 56,104 18,137;55:1139|1036,1263 -100,-156 -84,-138 -69,-121 -52,-102 -78,-186 -55,-183 -34,-185 -11,-192 -188,0 29,277 86,291 66,155 86,167 106,177 124,189 -757,0 0,153 931,0;56:1139|1050,393 -8,-92 -23,-81 -39,-71 -54,-60 -69,-48 -82,-34 -96,-20 -109,-7 -107,7 -94,20 -83,33 -70,47 -55,59 -40,70 -24,82 -8,93 20,127 59,105 90,75 112,39 0,4 -103,43 -79,74 -49,98 -17,113 30,146 90,115 142,75 182,25 186,-24 142,-74 91,-115 30,-150 -17,-113 -50,-98 -79,-73 -104,-40 0,-4 120,-40 90,-75 56,-104 19,-127|828,1057 -16,105 -50,74 -81,45 -115,15 -112,-15 -82,-45 -49,-75 -17,-104 17,-107 51,-78 83,-47 111,-16 112,15 82,44 49,76 17,113|863,410 -19,115 -59,83 -94,49 -125,17 -122,-18 -92,-54 -58,-84 -19,-112 19,-127 55,-91 93,-55 130,-18 128,18 91,53 54,91 18,133;57:1139|1042,733 -8,-171 -25,-150 -42,-129 -57,-108 -74,-85 -87,-61 -102,-37 -115,-12 -149,17 -115,53 -86,90 -57,134 172,27 35,-77 52,-55 67,-33 84,-11 73,9 64,27 56,45 47,63 37,80 28,95 17,110 7,126 -54,-81 -83,-63 -102,-41 -111,-14 -90,8 -81,25 -71,40 -62,57 -50,70 -36,81 -21,92 -7,102 8,105 23,92 39,81 54,70 68,55 80,39 93,24 104,8 110,-11 97,-33 81,-54 68,-76 53,-98 38,-120 22,-141 8,-164|846,907 -20,153 -58,120 -91,78 -118,26 -116,-22 -89,-66 -56,-105 -19,-135 19,-138 56,-106 88,-67 115,-22 145,35 60,43 46,58 28,69 10,79;58:569|187,875 0,207 195,0 0,-207|187,0 0,207 195,0 0,-207;59:569|385,207 0,-156 -5,-97 -14,-80 -59,-136 -123,0 70,134 24,128 -88,0 0,207|190,875 0,207 195,0 0,-207;60:1196|101,571 0,205 995,418 0,-154 -858,-366 858,-367 0,-153;61:1196|100,856 0,148 995,0 0,-148|100,344 0,148 995,0 0,-148;62:1196|101,154 0,153 858,367 -858,366 0,154 995,-418 0,-205;63:1139|1063,1032 -22,-134 -63,-109 -54,-55 -80,-63 -80,-59 -107,-110 -36,-125 -175,0 22,121 50,92 70,72 79,60 79,56 68,64 48,79 19,103 -19,102 -58,78 -94,50 -124,16 -126,-18 -96,-52 -65,-83 -31,-109 -184,12 20,93 32,82 46,70 58,59 151,80 193,26 106,-7 93,-19 82,-33 70,-47 56,-57 40,-68 24,-79 8,-88|438,0 0,201 195,0 0,-201;64:2079|1902,755 -14,-177 -44,-160 -68,-133 -92,-99 -108,-62 -121,-20 -88,11 -65,33 -40,55 -14,77 3,70 -6,0 -74,-108 -89,-76 -102,-47 -109,-15 -139,26 -104,76 -65,122 -22,161 16,158 49,147 77,126 103,98 122,62 135,21 101,-11 84,-34 66,-57 50,-80 6,0 39,160 156,0 -116,-506 -28,-145 -9,-108 20,-70 61,-24 77,17 70,52 61,82 46,108 29,127 10,141 -19,169 -58,148 -94,123 -128,91 -157,55 -182,19 -228,-27 -200,-80 -166,-131 -126,-178 -80,-213 -26,-238 20,-182 58,-159 96,-130 132,-96 160,-59 186,-20 294,37 152,50 157,75 55,-112 -151,-77 -163,-56 -171,-34 -173,-11 -226,24 -196,71 -159,116 -117,156 -71,190 -24,217 31,267 94,242 68,108 80,96 93,82 104,70 234,96 261,32 224,-23 192,-67 154,-110 114,-146 69,-178 23,-205|1296,747 -16,92 -50,73 -77,46 -99,16 -95,-16 -85,-48 -70,-75 -53,-101 -34,-117";
const SN1 = " -11,-126 12,-107 36,-81 60,-51 86,-17 120,26 109,79 88,118 56,144 17,82 6,63;65:1366|1167,0 -161,412 -642,0 -162,-412 -198,0 575,1409 217,0 566,-1409|685,1265 -9,-28 -31,-95 -43,-118 -180,-463 527,0 -181,465 -56,156;66:1366|1258,397 -9,-89 -25,-78 -43,-68 -60,-58 -75,-45 -89,-33 -102,-19 -115,-7 -572,0 0,1409 512,0 116,-5 101,-16 85,-27 70,-37 54,-49 39,-58 23,-70 8,-80 -18,-115 -52,-95 -84,-71 -114,-43 149,-38 110,-75 68,-104 23,-129|984,1044 -20,98 -58,65 -96,37 -130,12 -321,0 0,-446 321,0 134,14 94,44 57,72 19,104|1065,412 -22,109 -65,78 -110,46 -153,16 -356,0 0,-508 371,0 151,16 104,49 60,81 20,113;67:1479|792,1274 -110,-9 -98,-29 -84,-47 -72,-65 -57,-83 -41,-96 -24,-110 -8,-124 8,-123 26,-111 42,-97 60,-86 73,-68 86,-50 97,-29 110,-10 139,18 120,55 102,92 84,128 156,-78 -105,-160 -140,-117 -170,-71 -195,-24 -199,22 -170,66 -136,108 -100,146 -62,179 -20,210 11,159 35,142 56,122 80,105 100,84 117,59 135,36 152,12 206,-22 170,-66 131,-109 91,-152 -181,-60 -64,109 -93,79 -119,49 -139,16;68:1479|1381,719 -21,-204 -64,-177 -103,-145 -138,-106 -168,-65 -192,-22 -527,0 0,1409 466,0 169,-11 148,-34 128,-56 107,-78 86,-100 60,-118 37,-137 12,-156|1189,719 -9,123 -27,108 -45,92 -62,76 -80,61 -96,43 -112,25 -128,9 -271,0 0,-1103 314,0 146,17 127,51 103,83 77,113 47,139 16,163;69:1366|168,0 0,1409 1069,0 0,-156 -878,0 0,-452 818,0 0,-154 -818,0 0,-491 919,0 0,-156;70:1251|359,1253 0,-524 786,0 0,-158 -786,0 0,-571 -191,0 0,1409 1001,0 0,-156;71:1593|103,711 11,162 35,142 57,123 81,104 101,82 120,59 139,35 157,12 212,-20 168,-59 129,-103 96,-150 -182,-54 -71,104 -94,71 -119,41 -144,14 -115,-9 -100,-28 -86,-46 -72,-65 -56,-81 -41,-96 -24,-112 -8,-126 9,-126 25,-113 43,-98 60,-84 75,-68 88,-48 102,-29 114,-10 133,11 124,31 109,49 85,65 0,254 -421,0 0,160 597,0 0,-486 -125,-101 -149,-76 -170,-46 -183,-16 -206,22 -175,66 -141,107 -103,147 -64,180 -21,209;72:1479|1121,0 0,653 -762,0 0,-653 -191,0 0,1409 191,0 0,-596 762,0 0,596 191,0 0,-1409;73:569|189,0 0,1409 191,0 0,-1409;74:1024|457,-20 -161,23 -124,69 -88,116 -52,162 187,31 29,-103 52,-78 71,-49 87,-16 93,18 71,53 45,89 15,121 0,837 -271,0 0,156 461,0 0,-989 -7,-97 -21,-86 -34,-75 -49,-64 -61,-52 -70,-37 -82,-22 -91,-7;75:1366|1106,0 -563,680 -184,-140 0,-540 -191,0 0,1409 191,0 0,-706 679,706 225,0 -600,-612 680,-797;76:1139|168,0 0,1409 191,0 0,-1253 712,0 0,-156;77:1706|1366,0 0,940 9,300 -47,-160 -41,-120 -364,-960 -134,0 -369,960 -56,170 -33,110 3,-111 4,-189 0,-940 -170,0 0,1409 251,0 375,-977 38,-126 16,-59 9,-39 12,50 21,72 22,66 13,36 368,977 245,0 0,-1409;78:1479|1082,0 -754,1200 5,-97 5,-167 0,-936 -170,0 0,1409 222,0 762,-1208 -9,169 -3,115 0,924 172,0 0,-1409;79:1593|1495,711 -21,-207 -64,-180 -102,-147 -140,-108 -172,-67 -201,-22 -202,22 -173,66 -138,108 -102,146 -62,181 -21,208 12,160 34,141 58,123 81,105 102,83 119,59 138,36 156,12 201,-21 172,-65 139,-104 103,-144 62,-178 21,-207|1300,711 -8,124 -25,111 -41,96 -58,82 -72,66 -86,46 -100,29 -113,9 -114,-9 -101,-28 -86,-46 -73,-65 -58,-81 -41,-97 -25,-111 -8,-126 8,-126 25,-112 42,-98 58,-85 74,-68 86,-48 99,-29 112,-10 115,9 101,29 86,47 73,66 57,83 40,98 25,114 8,130;80:1366|1258,985 -8,-95 -25,-84 -40,-75 -57,-64 -72,-52 -82,-37 -95,-22 -106,-7 -414,0 0,-549 -191,0 0,1409 593,0 112,-7 98,-21 85,-34 72,-49 57,-61 41,-73 24,-84 8,-95|1066,983 -20,119 -62,86 -102,51 -144,17 -379,0 0,-556 387,0 140,18 100,53 60,88 20,124;81:1593|1495,711 -9,-142 -28,-129 -47,-116 -66,-103 -82,-86 -97,-67 -112,-47 -126,-27 47,-108 61,-74 75,-42 93,-14 115,13 0,-134 -178,-22 -138,21 -111,64 -88,115 -71,171 -184,30 -157,70 -127,109 -93,143 -56,175 -19,200 12,160 34,141 58,123 81,105 102,83 119,59 138,36 156,12 201,-21 172,-65 139,-104 103,-144 62,-178 21,-207|1300,711 -8,124 -25,111 -41,96 -58,82 -72,66 -86,46 -100,29 -113,9 -114,-9 -101,-28 -86,-46 -73,-65 -58,-81 -41,-97 -25,-111 -8,-126 8,-126 25,-112 42,-98 58,-85 74,-68 86,-48 99,-29 112,-10 115,9 101,29 86,47 73,66 57,83 40,98 25,114 8,130;82:1479|1164,0 -366,585 -439,0 0,-585 -191,0 0,1409 663,0 112,-7 99,-20 85,-33 71,-47 57,-58 41,-69 24,-79 8,-90 -23,-144 -69,-120 -108,-87 -144,-48 400,-607|1136,1004 -21,108 -63,80 -101,48 -139,16 -453,0 0,-520 461,0 134,18 100,52 61,85 21,113;83:1366|1272,389 -10,-92 -28,-81 -48,-70 -66,-59 -85,-47 -99,-33 -115,-20 -131,-7 -122,6 -108,16 -95,28 -82,40 -68,50 -54,61 -41,73 -27,84 185,37 50,-110 86,-77 123,-44 160,-15 164,16 121,47 76,79 25,108 -8,63 -23,49 -89,71 -136,47 -175,41 -147,37 -107,37 -136,82 -76,107 -27,140 9,85 26,75 43,65 61,54 76,43 92,31 106,18 122,6 212,-18 155,-56 108,-99 70,-151 -188,-33 -45,97 -73,66 -104,37 -137,13 -149,-14 -109,-42 -67,-70 -22,-97 9,-59 26,-48 99,-72 97,-33 162,-40 130,-31 123,-36 111,-51 89,-71 59,-99 22,-134;84:1251|720,1253 0,-1253 -190,0 0,1253 -484,0 0,156 1158,0 0,-156;85:1479|731,-20 -162,16 -140,47 -115,77 -85,106 -53,132 -18,154 0,897 191,0 0,-881 25,-170 73,-123 120,-75 163,-25 169,26 127,77 46,58 33,70 19,81 7,94 0,868 190,0 0,-879 -18,-159 -55,-136 -87,-109 -117,-80 -145,-50 -168,-16;86:1366|782,0 -198,0 -575,1409 201,0 390,-992 84,-249 84,249 388,992 201,0;87:1933|1511,0 -228,0 -244,895 -29,117 -41,184 -44,-194 -8,-33 -16,-59 -23,-85 -30,-113 -38,-138 -45,-165 -53,-191 -60,-218 -228,0 -415,1409 199,0 253,-895 83,-346 56,240 11,44 18,67 24,91 32,113 38,137 44,160 52,183 58,206 183,0 245,-877 50,-198 38,-166 9,35 24,104 20,83 8,32 16,59 23,87 32,113 39,141 46,169 55,195 62,223 199,0;88:1366|1112,0 -423,616 -432,-616 -211,0 536,732 -495,677 211,0 392,-553 381,553 211,0 -482,-670 523,-739;89:1366|777,584 0,-584 -190,0 0,584 -542,825 210,0 429,-671 427,671 210,0;90:1251|1187,0 -1122,0 0,143 858,1110 -785,0 0,156 1002,0 0,-139 -858,-1114 905,0;91:569|146,-425 0,1909 407,0 0,-129 -233,0 0,-1651 233,0 0,-129;92:569|407,-20 -407,1504 158,0 411,-1504;93:569|16,-425 0,129 233,0 0,1651 -233,0 0,129 407,0 0,-1909;94:961|787,673 -309,633 -306,-633 -162,0 368,736 203,0 370,-736;95:1139|-31,-407 0,130 1193,0 0,-130;96:682|436,1201 -330,278 0,29 207,0 217,-287 0,-20;97:1139|414,-20 -143,22 -102,64 -61,102 -21,134 28,148 83,110 63,40 81,29 97,19 115,8 243,4 0,59 -14,113 -42,76 -72,43 -104,14 -105,-10 -71,-31 -44,-53 -22,-78 -188,17 44,128 87,91 130,55 173,18 96,-6 83,-17 70,-30 58,-41 77,-114 26,-156 0,-466 5,-70 16,-50 30,-31 50,-10 59,7 0,-112 -139,-16 -86,13 -60,39 -35,68 -16,97 -6,0 -75,-106 -86,-69 -101,-39 -121,-13|455,115 93,11 83,34 69,53 52,71 34,79 11,82 0,89 -197,-4 -112,-8 -80,-18 -58,-30 -43,-44 -26,-58 -9,-73 12,-78 36,-58 57,-36 78,-12;98:1139|1053,546 -6,-133 -19,-115 -31,-97 -43,-79 -56,-62 -69,-45 -81,-26 -93,-9 -113,11 -92,33 -73,59 -59,85 -2,0 -4,-94 -4,-51 -2,-23 -174,0 4,83 2,140 0,1261 180,0 0,-423 -4,-153 4,0 58,89 74,60 93,34 112,11 96,-9 82,-25 68,-44 55,-60 43,-78 30,-96 18,-113 6,-131|864,540 -15,195 -45,130 -79,73 -116,25 -131,-26 -90,-78 -53,-135 -17,-195 17,-185 51,-130 89,-76 132,-25 117,25 80,76 45,131 15,195;99:1024|275,546 17,-188 51,-132 85,-78 120,-26 88,13 72,39 53,66 27,94 182,-12 -44,-140 -89,-109 -127,-70 -157,-23 -107,9 -93,27 -80,45 -67,63 -52,79 -37,97 -23,113 -7,129 7,128 23,113 37,96 53,79 67,63 79,45 93,27 105,9 152,-22 123,-64 90,-102 48,-135 -185,-14 -25,81 -46,62 -69,40 -93,13 -123,-24 -84,-71 -28,-56 -20,-72 -12,-88 -4,-104;100:1139|821,174 -58,-89 -75,-60 -92,-34 -112,-11 -96,9 -82,25 -68,44 -56,60 -42,78 -30,96 -18,113 -6,131 6,133 19,115 31,97 44,79 55,62 69,45 81,26 93,9 113,-11 92,-34 74,-58 58,-85 2,0 -2,121 0,449 180,0 0,-1261 1,-140 5,-83 -172,0 -7,74 -3,100|275,542 15,-195 45,-130 79,-73 116,-25 132,27 90,79 52,135 17,194 -17,186 -52,129 -90,75 -130,25 -117,-25 -79,-76 -46,-131 -15,-195;101:1139|276,503 19,-165 58,-122 95,-76 130,-25 105,12 83,35 59,53 36,66 158,-45 -64,-112 -95,-80 -125,-48 -157,-16 -113,9 -98,27 -85,44 -70,63 -54,80 -40,98 -23,115 -8,132 8,126 23,111 40,95 54,79 70,63 83,44 96,27 110,9 112,-9 97,-27 82,-45 67,-63 52,-81 37,-98 23,-117 7,-135 0,-24|862,641 -29,148 -58,101 -88,59 -119,20 -117,-22 -91,-65 -58,-104 -24,-137;102:569|361,951 0,-951 -180,0 0,951 -152";
const SN2 = ",0 0,131 152,0 0,122 16,127 49,86 82,49 117,16 127,-12 0,-137 -80,8 -60,-9 -40,-26 -23,-49 -8,-78 0,-97 211,0 0,-131;103:1139|548,-425 -159,17 -123,52 -86,85 -49,113 181,26 29,-66 51,-50 71,-30 90,-10 118,20 84,59 50,98 17,138 0,174 -2,0 -60,-91 -80,-66 -96,-39 -112,-13 -93,8 -80,25 -66,41 -53,58 -41,75 -30,95 -17,113 -6,132 6,134 19,115 32,97 43,77 57,60 70,43 83,25 96,9 107,-13 93,-40 74,-63 56,-86 2,0 4,104 4,57 4,24 171,0 -5,-83 -1,-141 0,-827 -7,-107 -21,-92 -36,-79 -49,-64 -64,-50 -78,-35 -92,-22 -106,-7|822,541 -9,123 -27,104 -43,85 -59,61 -69,38 -79,13 -119,-25 -82,-75 -47,-131 -16,-193 15,-191 44,-128 80,-73 122,-24 80,13 71,37 58,61 44,82 27,103 9,120;104:1139|317,897 64,92 75,63 93,38 114,12 153,-22 106,-66 37,-51 26,-66 16,-80 5,-96 0,-721 -181,0 0,686 -5,99 -16,71 -28,48 -41,33 -57,19 -76,7 -114,-22 -90,-66 -57,-103 -19,-134 0,-638 -180,0 0,1484 180,0 0,-386 -4,-126 -2,-51 -2,-24;105:455|137,1312 0,172 180,0 0,-172|137,0 0,1082 180,0 0,-1082;106:455|137,1312 0,172 180,0 0,-172|317,-134 -15,-132 -45,-90 -75,-52 -105,-17 -127,9 0,139 62,-6 59,9 38,27 21,53 7,87 0,1189 180,0;107:1024|816,0 -366,494 -132,-109 0,-385 -180,0 0,1484 180,0 0,-927 475,525 211,0 -439,-465 462,-617;108:455|138,0 0,1484 180,0 0,-1484;109:1706|768,0 0,686 -11,133 -32,84 -60,45 -95,15 -103,-22 -79,-66 -50,-106 -17,-142 0,-627 -179,0 0,851 -2,152 -4,79 170,0 2,-27 2,-51 2,-41 2,-66 3,0 62,97 71,63 83,34 100,11 110,-12 85,-37 60,-63 39,-93 3,0 62,94 74,63 87,36 105,12 142,-22 96,-67 56,-117 19,-175 0,-721 -178,0 0,686 -11,133 -32,84 -60,45 -95,15 -105,-22 -78,-65 -50,-106 -16,-143 0,-627;110:1139|825,0 0,686 -5,95 -16,71 -27,51 -40,34 -57,19 -78,7 -116,-22 -89,-67 -56,-106 -19,-141 0,-627 -180,0 0,851 -2,152 -4,79 170,0 2,-27 2,-51 2,-41 2,-66 3,0 67,96 76,63 92,34 111,12 154,-22 107,-66 36,-52 25,-66 16,-80 5,-95 0,-721;111:1139|1053,542 -8,-133 -23,-115 -39,-96 -55,-79 -70,-61 -83,-43 -98,-26 -112,-9 -111,9 -97,27 -82,45 -68,63 -53,81 -38,96 -22,113 -8,128 8,131 22,114 38,96 53,79 68,61 84,44 98,26 114,9 116,-9 99,-25 83,-43 67,-59 51,-78 37,-97 22,-115 7,-134|864,542 -17,193 -49,133 -90,76 -134,25 -136,-26 -92,-77 -53,-133 -18,-191 17,-187 52,-135 90,-80 129,-27 75,7 64,19 52,33 40,45 53,133 17,192;112:1139|1053,546 -6,-133 -19,-115 -31,-97 -43,-79 -56,-62 -69,-45 -81,-26 -93,-9 -115,12 -94,35 -74,59 -53,82 -5,0 3,-46 1,-124 0,-423 -180,0 0,1286 -2,139 -4,82 174,0 3,-28 5,-76 2,-70 4,0 56,87 71,59 91,35 117,12 94,-8 81,-25 68,-42 56,-59 43,-77 31,-95 19,-115 6,-134|864,542 -15,194 -46,129 -79,73 -115,24 -95,-11 -72,-34 -54,-58 -38,-83 -24,-109 -8,-139 17,-185 51,-129 89,-76 132,-25 116,25 79,74 27,57 20,74 11,91 4,108;113:1139|484,-20 -96,9 -82,26 -69,43 -55,61 -42,78 -30,96 -18,113 -6,130 6,133 19,115 31,97 44,79 55,62 69,45 81,26 93,9 112,-11 91,-33 73,-57 61,-87 2,0 4,104 4,56 4,22 173,0 -5,-103 -2,-192 0,-1226 -180,0 0,439 4,164 -2,0 -60,-92 -73,-60 -91,-35 -115,-11|821,554 -17,184 -52,129 -90,77 -130,25 -118,-25 -79,-77 -45,-132 -15,-193 15,-195 46,-130 78,-73 116,-25 71,7 61,20 50,34 40,48 52,136 17,190;114:682|142,0 0,830 -6,252 170,0 6,-147 2,-74 4,0 46,117 53,73 67,38 91,13 73,-10 0,-165 -96,10 -99,-24 -72,-73 -44,-117 -15,-159 0,-564;115:1024|950,299 -29,-135 -87,-101 -138,-62 -185,-21 -179,17 -132,49 -91,86 -52,122 159,31 35,-75 60,-52 86,-31 114,-10 119,11 82,31 47,53 16,73 -11,58 -33,46 -57,37 -85,29 -129,34 -133,40 -87,39 -103,93 -28,61 -9,74 26,130 80,96 129,58 178,19 161,-16 124,-47 86,-82 47,-120 -162,-20 -28,64 -53,46 -76,29 -99,10 -106,-9 -74,-28 -43,-46 -15,-66 24,-76 71,-51 73,-25 125,-33 123,-35 83,-32 100,-67 56,-85 20,-111;116:569|554,8 -182,-24 -94,15 -68,46 -40,77 -14,107 0,722 -125,0 0,131 132,0 53,242 120,0 0,-242 200,0 0,-131 -200,0 0,-683 6,-66 20,-44 34,-23 54,-8 104,14;117:1139|314,1082 0,-686 5,-95 16,-71 27,-51 40,-34 57,-19 78,-7 116,22 89,67 56,106 19,141 0,627 180,0 0,-851 1,-152 5,-79 -170,0 -2,27 -3,51 -1,41 -2,66 -3,0 -67,-96 -77,-63 -91,-34 -111,-12 -154,22 -106,66 -37,52 -25,66 -16,80 -5,95 0,721;118:1024|613,0 -213,0 -393,1082 192,0 238,-704 9,-30 15,-49 20,-69 25,-89 35,117 39,118 246,706 191,0;119:1479|1174,0 -209,0 -189,765 -36,169 -12,-55 -16,-75 -7,-31 -13,-50 -18,-71 -22,-91 -29,-110 -33,-131 -38,-150 -44,-170 -208,0 -303,1082 178,0 183,-735 14,-61 29,-137 17,74 226,859 193,0 189,-743 46,-190 31,139 205,794 176,0;120:1024|801,0 -291,444 -293,-444 -194,0 385,556 -367,526 199,0 270,-421 268,421 201,0 -367,-524 390,-558;121:1024|191,-425 -124,11 0,135 84,-6 80,15 71,47 62,77 53,108 17,43 -429,1077 192,0 228,-598 12,-34 15,-42 30,-88 29,-86 12,-38 70,197 237,689 190,0 -416,-1082 -65,-151 -60,-107 -61,-73 -68,-53 -75,-31 -84,-10;122:1024|83,0 0,137 605,806 -571,0 0,139 784,0 0,-137 -606,-806 627,0 0,-139;123:684|513,-425 -112,19 -83,58 -52,92 -17,124 0,361 -13,102 -40,73 -66,44 -96,18 0,127 95,17 67,44 40,73 13,102 0,362 17,125 50,92 82,57 115,19 135,0 0,-129 -63,0 -78,-13 -51,-40 -29,-68 -10,-94 0,-356 -13,-88 -40,-74 -62,-57 -79,-33 0,-2 80,-33 61,-56 40,-75 13,-90 0,-357 10,-93 29,-68 51,-40 78,-14 63,0 0,-129;124:532|183,-434 0,1918 166,0 0,-1918;125:684|94,-296 78,14 52,40 30,68 10,93 0,357 13,90 39,76 61,56 80,32 0,2 -78,32 -61,56 -41,74 -13,90 0,356 -10,94 -30,68 -52,40 -78,13 -60,0 0,129 132,0 115,-19 83,-57 49,-92 17,-125 0,-362 13,-101 40,-73 67,-45 97,-17 0,-127 -97,-18 -68,-44 -39,-73 -13,-102 0,-361 -17,-123 -51,-93 -84,-58 -112,-19 -132,0 0,129;126:1196|844,553 -142,22 -145,48 -119,34 -98,11 -125,-20 -123,-68 0,143 121,63 142,21 115,-13 81,-21 113,-38 91,-29 105,-16 126,23 118,69 0,-149 -116,-61 -144,-19;183:682|243,446 0,220 195,0 0,-220;8212:2048|0,451 0,137 2048,0 0,-137;8211:1139|0,451 0,137 1138,0 0,-137;8216:455|127,952 0,146 19,170 61,141 121,0 -71,-134 -24,-128 89,0 0,-195;8217:455|328,1264 -5,-97 -14,-79 -59,-136 -123,0 71,133 23,127 -88,0 0,197 195,0;8220:682|407,952 0,146 18,170 60,141 122,0 -71,-133 -23,-129 88,0 0,-195|75,952 0,146 19,170 61,141 121,0 -71,-134 -24,-128 89,0 0,-195;8221:682|607,1264 -17,-166 -62,-146 -121,0 71,134 23,128 -88,0 0,195 194,0|276,1264 -5,-97 -14,-79 -59,-136 -123,0 71,134 23,128 -88,0 0,195 195,0;252:1139|320,1082 0,-686 5,-95 16,-71 27,-51 40,-34 57,-19 78,-7 116,22 89,67 56,106 19,141 0,627 180,0 0,-851 1,-152 5,-79 -170,0 -2,27 -3,51 -1,41 -2,66 -3,0 -67,-96 -77,-63 -91,-34 -111,-12 -154,22 -106,66 -37,52 -25,66 -16,80 -5,95 0,721|676,1219 0,184 163,0 0,-184|282,1219 0,184 165,0 0,-184";
const SANS_DATA = SN0 + SN1 + SN2;
const SBD0 = "32:569|;33:682|455,426 -230,0 -32,983 294,0|193,0 0,270 288,0 0,-270;34:971|807,898 -219,0 -27,511 275,0|381,898 -219,0 -27,511 273,0;35:1139|909,862 -69,-332 215,0 0,-149 -246,0 -82,-381 -156,0 80,381 -307,0 -80,-381 -153,0 79,381 -155,0 0,149 188,0 70,332 -207,0 0,148 238,0 84,385 153,0 -82,-385 307,0 84,385 156,0 -84,-385 164,0 0,-148|449,862 -72,-332 309,0 70,332;36:1139|1110,412 -8,-85 -22,-76 -38,-65 -54,-54 -68,-45 -82,-32 -97,-22 -112,-10 0,-175 -109,0 0,172 -191,29 -144,73 -99,118 -59,168 256,47 28,-98 47,-67 69,-42 93,-21 0,391 -15,4 -16,3 -142,40 -103,47 -73,58 -54,70 -34,87 -11,103 29,147 85,110 141,70 193,29 0,134 109,0 0,-134 120,-13 99,-29 78,-44 62,-62 49,-86 38,-116 -264,-39 -22,77 -37,58 -52,38 -71,20 0,-352 11,-2 59,-12 117,-36 129,-59 92,-83 55,-105 18,-129|520,1194 -81,-15 -59,-32 -34,-48 -12,-65 16,-73 44,-48 47,-22 79,-29|850,408 -18,82 -52,51 -55,23 -96,30 0,-367 97,17 69,36 41,54 14,74;37:1821|1767,432 -6,-103 -17,-89 -28,-77 -39,-64 -50,-50 -61,-36 -71,-22 -82,-7 -83,7 -71,21 -61,36 -50,50 -39,64 -28,76 -16,91 -6,103 5,105 16,91 27,77 38,63 49,50 62,35 74,21 87,7 84,-7 72,-21 61,-36 48,-49 37,-64 27,-77 16,-91 5,-104|552,0 -206,0 920,1409 209,0|408,1425 84,-7 72,-21 60,-36 50,-49 37,-63 27,-77 17,-91 5,-104 -6,-103 -17,-89 -28,-77 -39,-64 -51,-51 -61,-36 -72,-22 -83,-7 -82,7 -71,22 -60,35 -50,50 -39,64 -28,77 -16,91 -6,103 5,106 16,92 27,77 38,62 49,49 62,34 74,21 86,7|1552,432 -8,136 -22,91 -42,51 -63,17 -68,-17 -43,-52 -22,-91 -8,-135 8,-136 24,-90 43,-49 64,-16 63,17 42,51 24,90 8,133|543,977 -8,135 -23,90 -41,51 -63,17 -68,-17 -43,-51 -23,-90 -8,-135 8,-135 24,-90 44,-51 64,-17 63,17 43,51 23,90 8,135;38:1479|90,385 20,128 61,113 105,99 152,88 -56,145 -18,134 24,138 74,102 119,64 160,21 150,-20 115,-60 74,-94 24,-123 -10,-73 -29,-66 -111,-115 -96,-60 -146,-73 110,-171 134,-165 92,170 66,193 209,-70 -82,-222 -111,-198 88,-55 90,-18 117,16 0,-203 -131,-22 -172,31 -158,90 -180,-97 -199,-32 -109,7 -96,20 -83,33 -70,46 -56,59 -39,69 -24,80 -8,91|870,1118 -10,52 -28,41 -45,27 -58,9 -68,-11 -49,-32 -31,-50 -10,-64 13,-92 41,-101 90,41 61,35 70,66 24,79|788,246 -151,187 -121,190 -75,-45 -54,-54 -32,-63 -11,-72 16,-89 49,-70 77,-45 100,-15 118,24 84,52;39:487|354,898 -219,0 -26,511 272,0;40:682|399,-425 -135,226 -92,225 -52,239 -18,266 18,265 52,238 92,225 135,225 281,0 -136,-228 -94,-226 -53,-238 -18,-262 18,-261 53,-237 93,-226 137,-231;41:682|2,-425 138,231 92,226 53,237 18,261 -18,263 -54,239 -93,226 -136,226 281,0 136,-226 91,-226 53,-238 17,-263 -17,-265 -53,-238 -91,-226 -136,-227;42:797|492,1135 235,104 68,-197 -250,-61 186,-213 -184,-121 -146,252 -149,-252 -186,123 190,211 -250,61 68,197 239,-104 -18,274 215,0;43:1196|711,569 0,-408 -226,0 0,408 -399,0 0,224 399,0 0,408 226,0 0,-408 402,0 0,-224;44:569|432,66 -6,-113 -20,-99 -82,-171 -185,0 96,156 37,161 -129,0 0,305 289,0;45:682|80,409 0,244 520,0 0,-244;46:569|139,0 0,305 289,0 0,-305;47:569|20,-41 291,1525 238,0 -286,-1525;48:1139|1055,705 -8,-168 -23,-146 -38,-124 -54,-103 -68,-80 -85,-58 -99,-34 -115,-12 -113,11 -99,34 -83,57 -68,79 -53,102 -38,125 -22,147 -8,170 13,230 40,183 66,139 93,97 123,57 157,19 117,-11 100,-34 83,-57 66,-79 51,-102 36,-125 22,-147 7,-170|773,705 -5,173 -14,130 -25,93 -36,62 -51,35 -71,12 -75,-12 -54,-36 -37,-62 -25,-92 -13,-130 -5,-173 5,-172 15,-129 25,-94 37,-62 52,-35 71,-12 71,12 52,37 38,65 26,94 14,129 5,167;49:1139|129,0 0,209 349,0 0,961 -338,-211 0,221 353,229 266,0 0,-1200 323,0 0,-209;50:1139|71,0 0,195 67,119 90,117 114,117 141,123 126,109 81,89 45,77 15,76 -12,80 -34,58 -58,34 -81,12 -79,-12 -58,-36 -40,-61 -22,-85 -283,16 49,173 98,126 144,77 189,26 107,-6 94,-20 81,-32 68,-46 53,-57 38,-68 23,-78 8,-89 -10,-94 -29,-85 -100,-147 -136,-127 -144,-115 -128,-113 -85,-122 654,0 0,-231;51:1139|1065,391 -8,-93 -25,-82 -40,-71 -57,-60 -72,-47 -85,-34 -100,-20 -113,-7 -108,7 -96,19 -84,33 -73,46 -60,58 -46,69 -33,81 -18,93 286,25 25,-89 46,-63 69,-38 91,-13 90,13 67,37 42,63 14,90 -17,83 -51,61 -85,38 -117,12 -98,0 0,227 92,0 106,12 76,37 46,61 15,81 -12,78 -36,58 -60,38 -82,12 -79,-12 -61,-36 -43,-58 -19,-78 -281,20 49,162 102,123 149,77 188,26 104,-6 93,-19 80,-31 68,-44 55,-54 39,-64 23,-74 8,-83 -19,-120 -58,-97 -95,-71 -129,-42 0,-4 143,-36 107,-71 65,-99 22,-124;52:1139|940,287 0,-287 -268,0 0,287 -641,0 0,211 595,911 314,0 0,-913 188,0 0,-209|672,957 4,117 5,81 -37,-69 -57,-93 -327,-497 412,0;53:1139|1082,469 -9,-106 -26,-95 -43,-84 -62,-72 -76,-57 -89,-42 -102,-25 -115,-8 -191,24 -149,72 -103,116 -54,160 281,23 30,-78 48,-53 63,-31 78,-10 94,17 73,50 47,82 16,111 -15,100 -44,77 -71,50 -94,17 -106,-23 -85,-68 -274,0 49,793 847,0 0,-209 -592,0 -23,-356 115,68 140,22 95,-8 86,-23 75,-39 66,-55 52,-68 38,-79 22,-91 8,-102;54:1139|1065,461 -8,-106 -23,-95 -40,-82 -55,-70 -69,-56 -81,-40 -93,-24 -105,-8 -117,11 -103,33 -89,54 -74,76 -58,98 -42,119 -25,140 -8,161 8,177 26,153 42,131 59,107 76,83 89,59 104,36 119,12 160,-20 122,-59 89,-101 58,-144 -265,-37 -25,61 -37,43 -48,26 -60,9 -101,-28 -77,-85 -48,-142 -16,-201 54,66 71,49 85,30 96,10 90,-7 79,-23 70,-37 60,-53 48,-65 35,-76 20,-87 7,-98|783,453 -14,106 -41,77 -66,48 -87,16 -84,-15 -65,-45 -42,-69 -14,-88 15,-112 43,-91 68,-61 86,-20 84,17 64,50 40,81 13,106;55:1139|1049,1186 -179,-291 -148,-283 -100,-294 -27,-154 -9,-164 -293,0 11,173 35,167 133,336 52,95 70,115 88,136 106,156 -700,0 0,231 961,0;56:1139|1076,397 -8,-93 -25,-83 -41,-71 -57,-60 -73,-48 -86,-35 -100,-20 -115,-7 -114,7 -100,20 -86,34 -73,48 -58,60 -42,71 -25,82 -8,93 19,124 59,103 91,75 118,40 0,4 -103,41 -81,72 -52,95 -18,108 8,82 23,73 38,63 53,55 68,44 80,31 93,19 106,6 108,-6 94,-18 82,-31 67,-43 54,-53 38,-65 23,-74 8,-85 -17,-108 -52,-94 -82,-71 -105,-39 0,-4 121,-39 92,-72 59,-103 19,-128|752,1040 -12,87 -34,59 -58,35 -81,12 -80,-12 -57,-36 -34,-61 -11,-84 11,-88 35,-64 57,-37 81,-13 80,12 57,35 35,62 11,93|785,420 -14,97 -41,69 -69,41 -96,14 -90,-15 -67,-43 -40,-71 -14,-96 14,-107 40,-74 68,-43 97,-14 95,14 66,43 38,75 13,110;57:1139|1063,727 -9,-176 -25,-152 -43,-128 -60,-105 -76,-81 -90,-59 -104,-34 -119,-12 -166,20 -125,60 -91,102 -59,149 264,37 26,-64 38,-46 52,-28 64,-9 104,28 78,85 48,140 17,195 -50,-67 -75,-50 -89,-32 -97,-11 -88,8 -79,24 -69,39 -60,56 -47,68 -35,80 -20,92 -7,102 8,105 24,93 40,80 57,69 70,55 85,39 97,23 111,8 118,-11 103,-33 86,-55 70,-77 54,-98 38,-121 23,-143 8,-165|766,924 -14,118 -44,90 -66,59 -86,19 -83,-17 -63,-51 -41,-80 -13,-106 13,-105 40,-83 63,-52 85,-18 82,15 67,47 45,71 15,93;58:682|197,752 0,282 288,0 0,-282|197,0 0,281 288,0 0,-281;59:682|199,752 0,282 288,0 0,-282|487,66 -6,-113 -19,-99 -83,-171 -184,0 99,163 34,154 -129,0 0,281 288,0;60:1196|86,516 0,322 1027,391 0,-228 -833,-325 833,-324 0,-227;61:1196|85,842 0,223 1027,0 0,-223|85,291 0,221 1027,0 0,-221;62:1196|86,125 0,227 832,324 -832,325 0,228 1027,-391 0,-322;63:1251|1133,1026 -11,-92 -32,-82 -63,-79 -100,-83 -76,-55 -101,-99 -37,-110 -267,0 17,96 41,86 63,78 88,72 91,70 60,60 33,60 11,66 -14,79 -44,60 -69,38 -94,13 -93,-15 -76,-44 -55,-69 -26,-87 -285,12 21,96 34,85 49,73 63,62 75,49 86,36 96,21 107,7 112,-7 100,-20 86,-33 75,-48 59,-58 42,-69 26,-80 8,-89|438,0 0,270 289,0 0,-270;64:1997|1878,725 -16,-174 -48,-158 -75,-134 -100,-101 -117,-63 -125,-21 -81,11 -60,35 -38,54 -12,72 6,67 -6,0 -62,-95 -86,-77 -100,-50 -102,-17 -139,25 -105,77 -64,121 -22,162 16,158 48,148 78,128 102,97 121,61 135,20 90,-11 74,-32 58,-55 42,-76 6,0 39,152 156,0 -117,-506 -28,-146 -9,-94 6,-43 17,-28 55,-21 78,17 75,52 65,82 51,104 31,123 11,134 -19,165 -57,144 -94,120 -127,88 -156,55 -179,18 -226,-26 -197,-79 -163,-128 -124,-175 -79,-210 -26,-234 20,-183 59,-160 96,-129 128,-93 156,-57 182,-19 294,39 295,116 62,-122 -166,-81 -163,-55 -162,-31 -167,-10 -222,24 -193,72 -160,116 -120,160 -76,193 -25,220 32,269 95,243 69,108 81,95 94,83 105,69 236,94 263,32 227,-23 194,-67 157,-110 114,-146 71,-178 23,-205|1231,721 -15,86 -44,69 -69,45 -85,15 -89,-16 -79,-46 -67,-76 -49,-102 -42,-235 12,-102 36,-78 62,-49 87,-17 129,42 59,51 52,70 75";
const SBD1 = ",182 20,91 7,70;65:1479|1133,0 -125,360 -537,0 -125,-360 -295,0 514,1409 348,0 512,-1409|739,1192 -6,-22 -24,-82 -16,-49 -34,-101 -52,-152 -70,-204 405,0 -139,405 -43,136;66:1479|1386,402 -9,-91 -27,-79 -45,-69 -63,-58 -79,-46 -93,-33 -107,-19 -121,-7 -705,0 0,1409 645,0 121,-6 106,-16 89,-28 74,-39 58,-51 42,-60 25,-72 8,-82 -17,-111 -50,-92 -83,-69 -119,-42 151,-37 109,-70 68,-102 22,-130|1008,1015 -15,81 -45,54 -76,30 -104,10 -336,0 0,-349 338,0 108,11 74,32 42,55 14,76|1090,425 -18,87 -53,62 -89,37 -124,12 -374,0 0,-404 385,0 123,13 84,38 50,65 16,90;67:1479|795,212 123,17 103,50 83,84 62,117 257,-97 -102,-178 -141,-125 -177,-75 -208,-25 -160,12 -141,36 -122,60 -102,84 -82,106 -58,125 -34,145 -12,163 11,163 34,144 56,123 78,103 100,81 119,59 140,34 160,12 225,-25 179,-75 133,-122 86,-170 -260,-71 -49,95 -80,74 -106,46 -122,16 -94,-8 -82,-23 -70,-39 -58,-54 -45,-69 -32,-84 -20,-98 -6,-112 7,-114 20,-100 33,-86 47,-71 59,-56 71,-40 82,-24 95,-8;68:1479|1393,715 -21,-204 -64,-177 -104,-143 -138,-105 -168,-64 -191,-22 -570,0 0,1409 510,0 168,-11 148,-34 127,-56 108,-78 85,-100 61,-119 37,-138 12,-158|1096,715 -7,107 -23,93 -36,80 -52,67 -65,52 -78,37 -91,23 -103,7 -209,0 0,-953 250,0 90,8 80,25 71,41 61,57 49,71 35,84 21,94 7,107;69:1366|137,0 0,1409 1108,0 0,-228 -813,0 0,-354 752,0 0,-228 -752,0 0,-371 854,0 0,-228;70:1251|432,1181 0,-436 721,0 0,-228 -721,0 0,-517 -295,0 0,1409 1039,0 0,-228;71:1593|806,211 223,33 96,39 71,47 0,195 -344,0 0,218 614,0 0,-518 -129,-103 -163,-77 -183,-49 -193,-16 -162,12 -142,36 -123,59 -102,83 -81,106 -58,125 -34,145 -12,165 12,164 34,143 59,124 81,102 103,82 124,58 144,34 164,12 225,-23 181,-69 135,-114 90,-161 -272,-82 -56,94 -82,68 -102,41 -119,14 -98,-8 -85,-24 -73,-39 -60,-55 -47,-70 -34,-83 -20,-97 -7,-111 7,-113 21,-99 35,-85 48,-72 62,-58 73,-40 84,-25 95,-8;72:1479|1046,0 0,604 -614,0 0,-604 -295,0 0,1409 295,0 0,-561 614,0 0,561 295,0 0,-1409;73:569|137,0 0,1409 295,0 0,-1409;74:1139|524,-20 -103,6 -91,18 -77,29 -65,42 -54,55 -44,69 -35,84 -24,99 293,43 26,-95 41,-66 58,-40 77,-13 77,15 57,44 34,72 11,97 0,739 -281,0 0,231 575,0 0,-963 -8,-104 -23,-92 -39,-79 -55,-68 -69,-54 -81,-38 -94,-23 -106,-8;75:1479|1112,0 -506,647 -174,-133 0,-514 -295,0 0,1409 295,0 0,-639 635,639 344,0 -602,-596 651,-813;76:1251|137,0 0,1409 295,0 0,-1181 756,0 0,-228;77:1706|1307,0 0,854 1,58 0,26 2,51 3,74 4,98 -33,-124 -29,-104 -24,-84 -19,-63 -254,-786 -210,0 -254,786 -107,375 9,-193 3,-114 0,-854 -262,0 0,1409 395,0 252,-788 22,-76 48,-189 63,226 259,827 393,0 0,-1409;78:1479|995,0 -614,1085 13,-143 5,-111 0,-831 -262,0 0,1409 337,0 623,-1094 -18,275 0,819 262,0 0,-1409;79:1593|1507,711 -22,-207 -65,-180 -106,-147 -143,-109 -175,-66 -203,-22 -157,12 -139,37 -121,61 -104,86 -82,106 -59,125 -35,143 -12,161 12,160 35,142 59,123 82,104 103,83 122,59 140,36 158,12 158,-12 140,-36 122,-60 103,-84 83,-105 59,-123 35,-140 12,-159|1206,711 -7,108 -20,95 -34,84 -47,70 -59,57 -71,41 -81,24 -92,8 -93,-8 -82,-24 -71,-40 -60,-56 -47,-71 -34,-83 -20,-96 -7,-109 7,-110 21,-97 34,-86 49,-72 60,-59 70,-42 81,-25 90,-8 93,8 82,24 71,41 59,57 48,72 33,85 20,99 7,113;80:1366|1296,963 -16,-129 -46,-114 -75,-95 -103,-71 -126,-43 -148,-15 -350,0 0,-496 -295,0 0,1409 633,0 119,-7 105,-22 90,-37 76,-51 59,-64 43,-76 25,-89 9,-100|999,958 -16,97 -49,69 -82,42 -115,14 -305,0 0,-457 313,0 108,15 80,46 49,73 17,101;81:1593|1507,711 -9,-135 -26,-123 -43,-112 -61,-99 -76,-86 -89,-68 -103,-50 -117,-34 41,-85 54,-58 74,-33 99,-11 119,10 -2,-202 -242,-28 -149,23 -121,68 -96,121 -76,181 -135,24 -118,44 -103,64 -86,86 -69,102 -50,119 -29,133 -10,149 12,160 35,142 59,123 82,104 103,83 122,59 140,36 158,12 158,-12 140,-36 122,-60 103,-84 83,-105 59,-123 35,-140 12,-159|1206,711 -7,108 -20,95 -34,84 -47,70 -59,57 -71,41 -81,24 -92,8 -93,-8 -82,-24 -71,-40 -60,-56 -47,-71 -34,-83 -20,-96 -7,-109 7,-110 20,-97 35,-86 48,-73 60,-59 71,-42 80,-25 91,-8 93,8 82,25 71,40 59,57 48,72 33,85 20,100 7,113;82:1479|1105,0 -327,535 -346,0 0,-535 -295,0 0,1409 704,0 119,-7 104,-20 90,-34 76,-48 60,-60 43,-72 25,-83 9,-96 -21,-138 -63,-117 -99,-90 -128,-52 381,-592|1070,977 -16,89 -49,63 -81,38 -114,13 -378,0 0,-416 386,0 109,14 79,42 48,67 16,90;83:1366|1286,406 -10,-97 -28,-86 -48,-73 -68,-60 -85,-48 -104,-35 -121,-20 -140,-7 -128,6 -114,18 -99,30 -84,42 -70,54 -57,67 -42,79 -29,91 285,47 43,-97 70,-65 100,-38 133,-13 135,12 97,35 58,59 19,82 -9,55 -26,44 -100,65 -95,29 -153,34 -134,33 -86,27 -112,52 -85,74 -55,101 -19,133 9,90 27,79 45,67 62,56 80,45 97,32 112,19 129,6 123,-5 106,-15 91,-26 74,-36 59,-48 49,-61 36,-74 25,-88 -286,-39 -33,80 -56,57 -83,35 -111,11 -117,-11 -84,-31 -50,-53 -17,-73 7,-50 21,-40 85,-59 85,-28 142,-34 174,-41 116,-39 79,-39 60,-45 78,-116 27,-156;84:1251|773,1181 0,-1181 -295,0 0,1181 -455,0 0,228 1206,0 0,-228;85:1479|723,-20 -137,9 -120,27 -103,44 -85,62 -68,79 -48,93 -29,110 -10,124 0,881 295,0 0,-858 20,-147 60,-106 98,-65 135,-22 140,23 103,68 64,110 21,149 0,848 295,0 0,-866 -10,-126 -31,-112 -52,-96 -73,-81 -91,-65 -108,-46 -124,-28 -142,-9;86:1366|834,0 -299,0 -521,1409 308,0 290,-905 32,-110 42,-156 21,86 51,180 289,905 305,0;87:1933|1567,0 -350,0 -191,815 -59,301 -22,-115 -17,-85 -7,-29 -12,-53 -18,-78 -24,-103 -29,-127 -35,-151 -41,-175 -47,-200 -350,0 -363,1409 299,0 204,-910 46,-220 55,265 22,102 41,178 59,254 77,331 330,0 178,-750 12,-55 16,-82 20,-108 23,-135 25,116 53,230 170,784 299,0;88:1366|1038,0 -354,561 -354,-561 -312,0 488,741 -447,668 312,0 313,-498 313,498 310,0 -428,-668 469,-741;89:1366|831,578 0,-578 -294,0 0,578 -502,831 309,0 338,-596 342,596 309,0;90:1251|1192,0 -1131,0 0,209 762,969 -686,0 0,231 1014,0 0,-205 -762,-973 803,0;91:682|115,-425 0,1909 542,0 0,-190 -276,0 0,-1528 276,0 0,-191;92:569|307,-41 -286,1526 238,0 291,-1526;93:682|25,-425 0,191 278,0 0,1528 -278,0 0,190 542,0 0,-1909;94:1196|922,514 -326,752 -324,-752 -227,0 391,895 322,0 393,-895;95:1139|-20,-250 0,78 1177,0 0,-78;96:682|406,1183 -340,276 0,43 258,0 251,-288 0,-31;97:1139|393,-20 -140,21 -105,65 -66,102 -22,138 27,148 83,108 134,66 183,24 233,4 0,55 -9,92 -28,65 -49,39 -72,13 -68,-9 -46,-27 -30,-47 -16,-70 -293,14 50,139 95,100 138,62 182,20 97,-6 85,-19 73,-32 61,-44 49,-56 34,-66 21,-77 7,-88 0,-394 5,-77 16,-49 27,-25 41,-9 62,6 0,-152 -45,-11 -40,-8 -43,-5 -52,-2 -92,13 -64,39 -41,64 -20,89 -6,0 -67,-93 -81,-67 -97,-40 -111,-13|720,501 -144,-2 -84,-7 -55,-14 -63,-54 -21,-96 9,-67 26,-47 42,-29 53,-9 121,36 48,43 37,57 31,134;98:1251|1167,545 -7,-127 -20,-111 -33,-97 -47,-82 -60,-64 -71,-47 -83,-28 -94,-9 -107,12 -92,38 -74,61 -55,83 -2,0 -4,-96 -10,-78 -273,0 6,108 2,139 0,1237 281,0 0,-414 -4,-176 4,0 57,91 77,65 96,39 116,13 90,-9 80,-27 68,-46 56,-64 45,-80 32,-95 20,-111 6,-125|874,545 -14,160 -40,113 -69,67 -98,22 -100,-24 -73,-71 -45,-117 -15,-159 15,-153 43,-115 73,-72 100,-24 98,23 69,70 42,117 14,163;99:1139|594,-20 -116,9 -102,28 -88,45 -74,64 -59,81 -41,95 -26,109 -8,124 8,127 26,111 42,97 59,82 75,66 88,47 103,28 117,9 174,-24 142,-72 102,-114 55,-151 -283,-14 -21,75 -39,58 -58,37 -78,12 -95,-23 -68,-68 -40,-113 -14,-159 14,-164 41,-116 69,-71 97,-23 74,13 60,37 44,63 23,88 282,-13 -27,-105 -52,-93 -75,-77 -95,-57 -112,-36 -124,-12;100:1251|844,0 -10,76 -5,100 -4,0 -56,-86 -76,-61 -97,-37 -117,-12 -89,9 -78,28 -68,46 -57,65 -45,81 -32,95 -20,111 -6,125 7,127 20,111 34,97 47,81 60,64 72,45 82,28 94,9 107,-12 91,-36 74,-60 55,-83 2,0 -2,178 0,395 281,0 0,-1248 8,-236|831,547 -15,155 -44,114 -72,71 -100,24 -98,-23 -70,-68 -41,-116 -14,-164 14,-161 41,-115 69,-69 97,-23 98,24 74,74 46,118 15,159;101:1139|586,-20 -115,9 -101,27 -86,45 -73,63 -57,81 -41,97 -25,114 -8,130 8,126 25,111 42,95 58,80 73,63 88,45 101,27 115,9 110,-10 96,-29 82,-48 68,-67 54,-87 38,-104 23,-122 8,-140 0,-8 -694,0 15,-139 44,-100 70,-60 96,-20 68,8 54,24 40,41 26,56 265,-23 -72,-129 -102,-91 -132,-56 -161,-18|586,925 -88,-17 -64,-52 -41,-83 -16,-110 420,0 -20,115 -43,82 -64,49 -84,16;102:682|473,892 0,-892 -280,0 0,892 -158,0 0,190 158,0 0,113 19,128 59,90 9";
const SBD2 = "8,53 139,18 178,-16 0,-181 -82,9 -61,-7 -41,-21 -22,-40 -7,-61 0,-85 213,0 0,-190;103:1251|596,-434 -179,19 -139,57 -98,91 -51,124 281,33 24,-58 40,-44 58,-28 72,-9 101,18 70,54 41,89 13,125 0,57 2,107 -2,0 -57,-87 -76,-62 -98,-38 -117,-12 -89,9 -79,27 -68,44 -57,62 -46,79 -32,93 -20,110 -6,124 7,125 20,110 33,94 47,80 60,63 71,45 84,27 96,9 109,-12 91,-37 72,-61 55,-85 5,0 4,95 10,79 266,0 -6,-250 0,-799 -8,-108 -25,-95 -41,-80 -57,-66 -73,-52 -88,-36 -102,-23 -118,-7|831,556 -15,149 -44,111 -73,71 -97,23 -98,-22 -71,-68 -42,-112 -14,-158 14,-154 42,-111 69,-66 98,-22 99,23 73,70 44,114 15,152;104:1251|420,866 64,107 79,73 94,42 111,14 152,-26 112,-80 69,-130 23,-180 0,-686 -280,0 0,606 -12,125 -36,89 -61,53 -84,18 -92,-22 -73,-65 -46,-100 -16,-125 0,-579 -281,0 0,1484 281,0 0,-405 -8,-213;105:569|143,1277 0,207 281,0 0,-207|143,0 0,1082 281,0 0,-1082;106:569|144,1277 0,207 281,0 0,-207|138,-425 -170,9 0,198 51,-4 61,8 38,24 19,48 7,82 0,1142 281,0 0,-1210 -18,-126 -55,-94 -89,-58 -125,-19;107:1139|834,0 -289,490 -121,-84 0,-406 -281,0 0,1484 281,0 0,-850 386,448 302,0 -380,-422 409,-660;108:569|143,0 0,1484 281,0 0,-1484;109:1821|780,0 0,607 -10,125 -31,89 -51,53 -72,18 -77,-22 -61,-65 -41,-100 -13,-125 0,-580 -281,0 0,840 -3,142 -5,100 268,0 3,-35 5,-67 4,-69 1,-44 4,0 58,107 72,73 85,42 100,14 112,-15 87,-44 63,-74 39,-103 6,0 60,108 72,73 88,41 108,14 139,-27 102,-80 62,-131 21,-178 0,-687 -279,0 0,607 -10,125 -31,89 -51,53 -72,18 -75,-20 -60,-60 -40,-94 -17,-125 0,-593;110:1251|844,0 0,607 -12,125 -36,89 -61,53 -84,18 -92,-22 -73,-66 -46,-99 -16,-125 0,-580 -281,0 0,840 -3,142 -5,100 268,0 3,-35 5,-67 4,-69 1,-44 4,0 64,107 79,73 94,42 111,14 152,-27 112,-79 69,-131 23,-179 0,-687;111:1251|1171,542 -9,-124 -28,-111 -45,-96 -64,-81 -80,-66 -94,-47 -108,-28 -122,-9 -120,9 -106,29 -92,46 -79,66 -63,82 -45,96 -27,110 -9,124 9,124 27,109 45,96 63,81 79,66 94,47 108,28 122,9 125,-9 109,-27 93,-45 78,-63 61,-81 43,-96 26,-111 9,-128|877,542 -16,166 -47,114 -77,65 -106,22 -112,-23 -80,-69 -48,-114 -16,-161 16,-159 47,-117 76,-70 104,-24 113,23 81,69 49,116 16,162;112:1251|1167,546 -7,-128 -20,-112 -34,-97 -48,-81 -59,-65 -71,-46 -83,-28 -93,-9 -107,12 -91,38 -75,60 -55,82 -6,0 4,-60 2,-122 0,-415 -281,0 0,1258 -2,139 -6,110 273,0 8,-71 4,-105 4,0 57,87 77,62 96,38 116,12 89,-9 79,-27 68,-46 57,-63 45,-81 33,-96 19,-111 7,-126|874,546 -14,159 -42,114 -69,68 -98,23 -99,-24 -72,-74 -45,-118 -15,-156 15,-155 45,-115 72,-72 97,-24 98,23 71,71 42,116 14,164;113:1251|84,540 7,126 20,112 35,96 48,82 60,64 71,46 83,28 94,9 109,-12 91,-37 72,-61 55,-85 5,102 10,72 270,0 -6,-249 0,-1258 -279,0 0,450 5,155 -2,0 -57,-88 -78,-62 -98,-38 -120,-12 -89,9 -78,28 -68,46 -57,65 -45,81 -32,95 -20,111 -6,125|831,546 -15,154 -43,114 -72,72 -99,24 -98,-23 -71,-69 -42,-116 -14,-162 14,-161 42,-115 69,-69 98,-23 98,24 72,74 46,117 15,159;114:797|143,0 0,828 -3,148 -5,106 268,0 3,-36 5,-74 4,-76 1,-45 4,0 39,97 34,64 76,68 110,23 87,-15 0,-235 -120,15 -93,-21 -71,-64 -43,-105 -15,-147 0,-531;115:1139|1055,316 -8,-74 -24,-66 -40,-58 -57,-48 -153,-68 -202,-22 -197,18 -144,52 -99,91 -59,129 247,37 29,-66 44,-43 70,-24 109,-8 102,8 70,22 41,38 13,56 -11,47 -32,35 -59,29 -89,23 -199,45 -122,43 -73,46 -54,58 -32,72 -11,87 30,138 89,103 145,65 194,22 174,-19 137,-56 95,-92 51,-125 -249,-26 -21,58 -38,41 -61,24 -88,8 -87,-6 -63,-20 -37,-34 -13,-51 10,-42 29,-33 51,-25 78,-20 225,-53 89,-31 69,-35 96,-98 26,-67 9,-85;116:682|420,-18 -110,17 -81,51 -50,84 -17,120 0,638 -137,0 0,190 151,0 88,254 176,0 0,-254 205,0 0,-190 -205,0 0,-562 8,-69 22,-47 38,-29 55,-9 94,14 0,-174 -111,-26 -126,-8;117:1251|408,1082 0,-607 12,-125 36,-89 60,-53 84,-18 92,22 72,66 47,99 16,125 0,580 281,0 0,-840 8,-242 -268,0 -9,126 -3,89 -5,0 -64,-106 -79,-73 -94,-42 -111,-14 -152,26 -112,80 -69,130 -23,179 0,687;118:1139|731,0 -336,0 -387,1082 297,0 189,-605 25,-87 46,-163 15,57 26,87 26,83 47,146 68,210 89,272 294,0;119:1593|1313,0 -297,0 -172,660 -18,78 -29,144 -52,-224 -174,-658 -297,0 -280,1082 264,0 178,-827 14,74 25,117 170,636 301,0 166,-636 17,-74 24,-117 28,132 156,695 260,0;120:1139|819,0 -252,392 -254,-392 -299,0 396,559 -377,523 303,0 231,-354 230,354 305,0 -377,-520 399,-562;121:1139|283,-425 -177,13 0,200 97,-8 99,19 72,63 33,59 37,90 -428,1071 297,0 170,-507 45,-138 56,-196 25,95 65,235 160,511 294,0 -428,-1139 -88,-176 -90,-112 -106,-60 -133,-20;122:1024|82,0 0,199 509,680 -468,0 0,203 778,0 0,-201 -506,-676 555,0 0,-205;123:797|557,-425 -121,20 -94,59 -60,94 -20,126 0,328 -14,100 -41,70 -71,43 -103,16 0,195 104,18 71,44 40,70 14,99 0,328 20,129 58,94 94,57 123,19 197,0 0,-190 -58,0 -78,-13 -54,-39 -30,-65 -10,-92 0,-301 -14,-88 -44,-76 -66,-56 -83,-32 0,-4 85,-34 66,-56 42,-75 14,-87 0,-301 10,-92 30,-65 54,-39 78,-13 58,0 0,-191;124:573|156,-455 0,1939 262,0 0,-1939;125:797|43,-234 57,0 80,13 52,39 30,65 10,92 0,301 14,86 42,75 66,57 85,34 0,4 -83,31 -66,57 -44,75 -14,89 0,301 -10,92 -30,65 -52,39 -80,13 -57,0 0,190 197,0 123,-19 93,-57 59,-94 20,-129 0,-328 14,-98 41,-71 72,-44 104,-18 0,-195 -104,-16 -72,-44 -41,-71 -14,-98 0,-328 -20,-126 -60,-94 -94,-59 -121,-20 -197,0;126:1196|852,516 -148,21 -147,47 -123,35 -98,12 -130,-21 -125,-67 0,213 124,63 147,21 113,-12 129,-35 112,-37 70,-21 95,-12 129,23 119,69 0,-219 -123,-62 -144,-18;183:682|141,531 0,305 288,0 0,-305;8212:2048|0,448 0,203 2048,0 0,-203;8211:1139|62,448 0,203 1014,0 0,-203;8216:569|139,831 0,195 7,114 19,100 82,169 183,0 -96,-161 -35,-156 127,0 0,-261;8217:569|430,1214 -6,-113 -18,-97 -85,-173 -182,0 98,163 33,155 -127,0 0,260 287,0;8220:1024|579,831 0,195 7,116 20,99 84,168 182,0 -96,-161 -35,-156 127,0 0,-261|151,831 0,195 7,114 19,100 82,169 183,0 -96,-161 -35,-156 127,0 0,-261;8221:1024|872,1217 -6,-114 -20,-99 -83,-173 -184,0 100,163 33,155 -127,0 0,260 287,0|442,1217 -6,-116 -19,-99 -84,-171 -182,0 98,163 33,155 -127,0 0,260 287,0;252:1251|408,1082 0,-607 12,-125 36,-89 60,-53 84,-18 92,22 72,66 47,99 16,125 0,580 281,0 0,-840 8,-242 -268,0 -9,126 -3,89 -5,0 -64,-106 -79,-73 -94,-42 -111,-14 -152,26 -112,80 -69,130 -23,179 0,687|732,1199 0,219 217,0 0,-219|298,1199 0,219 214,0 0,-219";
const SANS_BOLD_DATA = SBD0 + SBD1 + SBD2;
const SI0 = "32:512|;46:512|327,92 -35,-85 -38,-27 -48,-9 -48,9 -38,27 -35,85 9,47 26,39 39,26 47,9 47,-9 39,-26 26,-39 9,-47;49:1024|534,80 270,-27 -10,-53 -721,0 10,53 279,27 193,1094 -288,-97 10,53 430,222 52,0;51:1024|357,-20 -188,17 -172,44 37,282 66,0 12,-188 108,-49 137,-23 161,19 111,58 65,101 22,148 -17,107 -50,80 -84,51 -118,24 -115,8 14,82 145,9 123,25 86,57 50,92 17,127 -13,96 -39,69 -67,42 -96,14 -112,-15 -103,-38 -64,-164 -66,0 45,258 92,22 73,13 142,8 165,-19 124,-57 79,-92 26,-123 -22,-135 -65,-108 -112,-77 -159,-43 128,-35 95,-63 59,-88 20,-108 -9,-94 -28,-83 -46,-73 -64,-63 -80,-50 -92,-36 -104,-22 -117,-7;54:1024|477,-20 -88,8 -77,23 -68,38 -57,54 -45,68 -33,79 -19,92 -7,104 20,239 61,219 99,188 131,143 157,91 172,30 141,-13 150,-40 -41,-231 -66,0 -11,140 -90,45 -90,15 -75,-9 -70,-29 -65,-46 -60,-66 -97,-179 -64,-237 161,71 158,26 145,-20 109,-61 67,-96 23,-127 -14,-143 -42,-126 -69,-105 -94,-79 -117,-50 -135,-16|260,411 14,-149 42,-111 69,-69 94,-23 120,29 89,86 56,136 18,179 -12,95 -36,68 -63,41 -89,14 -129,-15 -157,-47 -16,-234;55:1024|274,1024 -66,0 56,317 830,0 -14,-77 -821,-1264 -139,0 797,1188 -579,0;67:1366|699,-19 -130,9 -115,27 -100,45 -85,63 -68,79 -48,92 -29,107 -10,120 26,233 78,205 125,168 169,125 204,76 231,26 215,-13 223,-38 -45,-293 -65,0 0,174 -150,66 -184,24 -172,-24 -153,-72 -127,-117 -95,-157 -60,-189 -20,-214 7,-101 19,-88 33,-76 45,-62 58,-50 69,-35 80,-21 91,-7 223,34 99,39 78,48 72,201 65,0 -61,-315 -248,-66 -245,-23;77:1706|721,0 -35,0 -231,1153 -189,-1073 176,-27 -10,-53 -456,0 10,53 175,27 209,1182 -168,26 10,53 382,0 206,-1023 598,1023 402,0 -10,-53 -176,-26 -209,-1182 168,-27 -10,-53 -544,0 10,53 184,27 189,1073;80:1251|612,616 170,22 121,67 73,112 24,156 -18,124 -54,87 -91,50 -128,17 -148,0 -112,-635|433,526 -79,-446 219,-27 -10,-53 -574,0 10,53 162,27 209,1182 -168,26 10,53 537,0 191,-22 142,-67 51,-51 37,-61 22,-71 7,-83 -9,-105 -28,-93 -45,-78 -65,-66 -81,-52 -96,-36 -113,-23 -128,-7;82:1251|444,588 -90,-508 179,-27 -10,-53 -534,0 10,53 162,27 209,1182 -168,26 10,53 532,0 193,-21 141,-62 86,-102 29,-140 -22,-144 -65,-114 -110,-86 -153,-56 227,-536 147,-27 -10,-53 -308,0 -246,588|616,678 161,22 119,64 74,105 25,141 -18,105 -53,76 -90,45 -125,15 -148,0 -101,-573;84:1139|176,0 10,53 217,27 207,1175 -51,0 -173,-5 -121,-15 -64,-209 -67,0 56,315 1070,0 -56,-315 -68,0 10,209 -118,13 -176,5 -49,0 -207,-1173 209,-27 -10,-53;97:1024|789,70 113,-25 -8,-45 -285,0 29,156 -83,-77 -79,-56 -75,-33 -72,-11 -109,22 -86,67 -55,106 -18,139 19,169 58,158 89,136 115,102 134,65 144,21 118,-10 110,-32 45,34 54,0|760,837 -73,37 -84,11 -96,-19 -87,-56 -75,-89 -57,-115 -36,-131 -12,-136 11,-96 33,-75 52,-48 68,-16 118,35 129,104;99:909|774,142 -86,-67 -96,-51 -98,-33 -94,-11 -143,23 -106,70 -66,111 -22,146 17,166 53,152 85,129 114,101 133,65 139,22 151,-15 132,-37 -45,-262 -55,0 -16,174 -73,47 -95,16 -93,-18 -86,-53 -76,-85 -58,-113 -38,-133 -12,-146 13,-112 39,-80 64,-48 90,-16 146,25 152,75;100:1024|783,941 6,44 13,83 21,122 28,162 -154,24 8,45 324,0 -240,-1351 113,-25 -8,-45 -285,0 29,156 -83,-77 -79,-56 -75,-33 -72,-11 -110,23 -85,70 -54,107 -18,138 18,166 56,155 87,135 114,103 134,66 147,22 165,-23|760,837 -72,36 -90,13 -91,-18 -85,-56 -74,-88 -58,-116 -38,-132 -12,-137 11,-96 33,-75 52,-48 67,-16 121,36 127,103;101:909|863,760 -11,-66 -31,-60 -53,-56 -73,-50 -197,-77 -254,-38 -4,-73 13,-111 41,-81 66,-48 92,-16 166,30 142,70 29,-42 -195,-120 -99,-32 -95,-10 -143,23 -107,67 -65,111 -22,149 18,161 53,151 84,130 111,104 128,67 134,22 111,-14 86,-43 56,-65 19,-83|252,476 178,31 139,62 89,87 30,104 -8,51 -22,41 -38,27 -51,9 -69,-14 -67,-43 -61,-67 -53,-86 -67,-202;104:1024|311,1352 -118,24 8,45 288,0 -106,-596 -16,-76 83,93 88,68 91,41 89,14 88,-14 64,-41 38,-66 13,-90 -4,-43 -8,-51 -21,-124 -34,-197 -46,-270 131,-24 -8,-45 -301,0 102,582 17,105 6,61 -24,73 -31,21 -45,7 -78,-16 -84,-47 -79,-69 -64,-84 -111,-633 -165,0;105:569|292,70 157,-25 -8,-45 -327,0 153,870 -129,25 8,45 299,0|507,1247 -32,-76 -77,-32 -76,32 -32,76 32,77 76,32 77,-32 32,-77;107:909|299,1352 -135,24 8,45 305,0 -172,-968 428,415 -94,27 8,45 292,0 -8,-45 -81,-23 -294,-281 243,-523 98,-23 -8,-45 -236,0 -218,479 -148,-139 -62,-340 -166,0;108:569|287,70 157,-25 -8,-45 -327,0 237,1352 -129,24 8,45 299,0;109:1479|873,746 73,88 81,70 84,46 81,15 75,-13 57,-40 37,-66 12,-89 -5,-57 -8,-53 -20,-123 -33,-192 -45,-262 131,-25 -9,-45 -301,0 103,582 17,102 6,64 -21,72 -27,21 -39,7 -48,-10 -57,-32 -111,-108 -59,-122 -99,-576 -166,0 102,582 19,107 6,59 -22,72 -28,21 -41,7 -49,-11 -59,-33 -113,-108 -58,-120 -99,-576 -166,0 153,870 -118,25 8,45 278,0 -28,-194 74,89 83,70 84,45 80,15 78,-14 58,-41 37,-69 12,-95;110:1024|755,748 -24,73 -31,21 -45,7 -77,-16 -84,-47 -80,-70 -65,-86 -110,-630 -166,0 153,871 -118,25 8,45 278,0 -27,-192 85,95 89,67 89,41 88,13 88,-14 64,-41 38,-66 13,-90 -4,-43 -8,-51 -21,-124 -34,-197 -46,-270 131,-24 -8,-45 -301,0 102,582 17,105 6,61;111:1024|237,340 13,-119 40,-87 62,-54 84,-18 89,18 85,55 73,86 57,113 36,132 12,140 -13,121 -39,89 -64,53 -87,18 -89,-18 -84,-55 -72,-86 -56,-114 -35,-131 -12,-143|427,-20 -149,27 -117,79 -75,126 -25,162 17,155 52,143 82,122 110,93 130,59 145,19 149,-27 117,-80 75,-125 25,-162 -17,-155 -52,-143 -82,-122 -110,-93 -130,-58 -145,-20;113:1024|419,107 141,20 117,51 121,683 -204,27 -94,-18 -86,-54 -71,-87 -55,-113 -34,-132 -11,-141 11,-102 34,-74 56,-45 75,-15|671,107 -162,-93 -159,-34 -121,21 -89,64 -54,106 -18,147 18,175 54,157 87,133 115,99 140,62 156,21 172,-13 166,-29 -233,-1288 121,-24 -8,-47 -291,0 69,381 37,162;114:797|724,965 79,-8 -44,-246 -43,0 -38,127 -81,-15 -85,-46 -81,-71 -75,-90 -107,-616 -166,0 153,870 -118,25 8,45 277,0 -31,-212 79,100 89,75 92,47 92,15;115:797|692,276 -24,-131 -72,-93 -121,-54 -170,-18 -139,16 -141,46 41,226 45,0 17,-137 74,-50 107,-22 96,11 68,34 41,56 14,78 -12,56 -34,49 -62,47 -90,50 -88,52 -62,56 -37,65 -12,75 22,117 67,87 106,55 141,18 123,-9 145,-26 -37,-209 -47,0 -14,108 -73,42 -93,14 -74,-9 -57,-28 -37,-48 -12,-69 11,-51 31,-44 61,-46 98,-55 90,-56 62,-60 36,-67 12,-76;116:569|264,174 22,-68 58,-22 152,30 21,-47 -124,-65 -125,-22 -71,12 -53,36 -35,58 -11,76 6,68 8,54 22,123 33,190 46,259 -123,0 8,45 133,39 137,213 64,0 -37,-213 215,0 -16,-84 -215,0 -97,-549 -14,-79 -4,-54;117:1024|268,193 24,-73 31,-21 45,-7 78,16 84,46 79,70 64,84 111,632 166,0 -153,-870 118,-25 -8,-45 -278,0 27,193 -85,-94 -88,-68 -89,-41 -89,-14 -89,14 -63,40 -38,67 -13,90 6,53 8,54 21,123 33,193 45,261 -111,24 8,45 281,0 -102,-581 -17,-105 -6,-61;118:909|751,807 -21,59 -45,29 8,45 190,0 26,-63 -21,-99 -62,-121 -423,-677 -73,0 -189,890 -113,25 9,45 256,0 145,-732 249,406 48,100 16,93;119:1366|900,-20 -66,0 -124,619 -318,-619 -70,0 -171,890 -102,25 8,45 245,0 131,-707 309,601 75,0 122,-605 197,389 43,104 14,85 -21,59 -45,29 8,45 190,0 26,-63 -21,-89 -62,-131;121:909|52,940 256,0 145,-732 235,406 48,104 16,89 -21,59 -45,29 8,45 190,0 26,-63 -21,-95 -62,-125 -396,-667 -102,-166 -79,-109 -131,-119 -68,-28 -73,-10 -149,18 37,203 45,0 16,-96 33,-17 49,-6 68,17 71,51 72,84 74,118 45,82 -183,858 -112,25;183:512|407,678 -9,-47 -26,-39 -39,-26 -47,-9 -47,9 -39,26 -26,39 -9,47 35,85 38,27 48,9 48,-9 38,-27 35,-85";

// ---------- fonts (decoded from the data above) ----------
const F_SERIF_BOLD = decodeFont(SERIF_BOLD_DATA, 2048);
const F_SANS = decodeFont(SANS_DATA, 2048);
const F_SANS_BOLD = decodeFont(SANS_BOLD_DATA, 2048);
const F_SERIF_ITALIC = decodeFont(SI0, 2048);

main();
