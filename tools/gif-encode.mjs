/* Turns the raw RGB dump from tools/grab-frames.ps1 into an animated GIF with no
   dependencies, because the machine has no ffmpeg and a README clip should not need one.
   Each frame carries its own 256-colour table: the materials are gradients, and a single
   global palette is what makes a rose-to-cream ramp come out as four flat stripes.
   Palette by weighted median cut over the distinct colours, pixel mapping through a
   5-5-5 nearest-colour cache so a 260k-pixel frame costs 32k searches at most.

   node tools/gif-encode.mjs frames out.gif [maxWidth] */
import fs from 'node:fs';

const [src, dst, scaleArg] = process.argv.slice(2);
if (!src || !dst) {
  console.error('usage: node tools/gif-encode.mjs <frames-prefix> <out.gif> [maxWidth]');
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(src + '.json', 'utf8'));
const raw = fs.readFileSync(src + '.rgb');
const W0 = meta.w, H0 = meta.h, N = meta.frames;
const scale = Math.min(1, (scaleArg ? +scaleArg : W0) / W0);
const W = Math.max(2, Math.round(W0 * scale));
const H = Math.max(2, Math.round(H0 * scale));
/* The grabber copies the whole LockBits buffer in one go now, which is what took the
   capture from 2 fps to fast enough to catch a one-second animation, so rows carry
   padding and the wire order is BGR. Both come from the manifest rather than being
   assumed. */
const stride = meta.stride ? Math.abs(meta.stride) : W0 * 3;
const bytes = meta.bytes || stride * H0;
const b2r = meta.bgr === true;
const counts = new Map();
const frames = [];
for (let f = 0; f < N; f++) {
  const base = f * bytes;
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(H0 - 1, Math.floor(y / scale));
    const rowOff = base + sy * stride;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W0 - 1, Math.floor(x / scale));
      const i = rowOff + sx * 3;
      const p = (y * W + x) * 3;
      if (b2r) { px[p] = raw[i + 2]; px[p + 1] = raw[i + 1]; px[p + 2] = raw[i]; }
      else { px[p] = raw[i]; px[p + 1] = raw[i + 1]; px[p + 2] = raw[i + 2]; }
    }
  }
  frames.push(px);
  for (let o = 0; o < px.length; o += 3) {
    const k = (px[o] << 16) | (px[o + 1] << 8) | px[o + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
}

function medianCut(list, limit) {
  let buckets = [list];
  const range = (b) => {
    let lo = [255, 255, 255], hi = [0, 0, 0], n = 0;
    for (const it of b) {
      n += it.c;
      for (let ch = 0; ch < 3; ch++) {
        if (it.v[ch] < lo[ch]) lo[ch] = it.v[ch];
        if (it.v[ch] > hi[ch]) hi[ch] = it.v[ch];
      }
    }
    return { axis: hi[0] - lo[0] >= hi[1] - lo[1] && hi[0] - lo[0] >= hi[2] - lo[2] ? 0
      : (hi[1] - lo[1] >= hi[2] - lo[2] ? 1 : 2), span: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), n };
  };
  while (buckets.length < limit) {
    let pick = -1, best = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      const r = range(buckets[i]);
      const score = r.span * r.n;
      if (score > best) { best = score; pick = i; }
    }
    if (pick < 0) break;
    const b = buckets[pick];
    const ax = range(b).axis;
    b.sort((p, q) => p.v[ax] - q.v[ax] || q.c - p.c);
    let acc = 0;
    const total = b.reduce((s, it) => s + it.c, 0);
    let mid = 1;
    for (let i = 0; i < b.length; i++) { acc += b[i].c; if (acc >= total / 2) { mid = i + 1; break; } }
    if (mid >= b.length) mid = b.length - 1;
    buckets.splice(pick, 1, b.slice(0, mid), b.slice(mid));
  }
  return buckets.map((b) => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const it of b) { r += it.v[0] * it.c; g += it.v[1] * it.c; bl += it.v[2] * it.c; n += it.c; }
    if (!n) return [0, 0, 0];
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
}

function buildPalette(countsMap) {
  const list = [];
  for (const [k, c] of countsMap) list.push({ v: [(k >> 16) & 255, (k >> 8) & 255, k & 255], c });
  if (list.length <= 256) {
    const pal = list.map((it) => it.v);
    while (pal.length < 256) pal.push([0, 0, 0]);
    return { pal, direct: new Map(list.map((it, i) => [keyOf(it.v), i])) };
  }
  return { pal: medianCut(list, 256), direct: null };
}
const keyOf = (v) => (v[0] << 16) | (v[1] << 8) | v[2];

function indexer(pal) {
  const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const ck = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let hit = cache[ck];
    if (hit >= 0) return hit;
    let best = 0, bd = Infinity;
    const rr = (r >> 3) * 8 + 4, gg = (g >> 3) * 8 + 4, bb = (b >> 3) * 8 + 4;
    for (let i = 0; i < pal.length; i++) {
      const dr = pal[i][0] - rr, dg = pal[i][1] - gg, db = pal[i][2] - bb;
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;   // perceptual weighting
      if (d < bd) { bd = d; best = i; }
    }
    cache[ck] = best;
    return best;
  };
}

/* LZW as GIF wants it: 8-bit minimum code size, clear at 256, table reset when full */
function lzw(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let bits = minCode + 1, maxcode = (1 << bits) - 1, free = eoi + 1;
  let table = new Map();
  const out = [];
  let cur = 0, nbits = 0;
  const put = (code, size) => {
    cur |= code << nbits;
    nbits += size;
    while (nbits >= 8) { out.push(cur & 255); cur >>>= 8; nbits -= 8; }
  };
  put(clear, bits);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const found = table.get(key);
    if (found !== undefined) { prefix = found; continue; }
    put(prefix, bits);
    if (free < 4096) {
      table.set(key, free++);
      /* The decoder adds an entry for every code it receives except the first after a
         clear, so its table sits exactly one entry behind this one. Growing when free
         passes the width limit switches the encoder to a wider code one symbol too
         early and the decoder then reads the next code with the wrong width — which
         decodes to valid palette indices in the wrong places, i.e. a scrambled frame. */
      if (free - 1 > maxcode && bits < 12) { bits++; maxcode = (1 << bits) - 1; }
    } else {
      put(clear, bits);
      table = new Map(); free = eoi + 1; bits = minCode + 1; maxcode = (1 << bits) - 1;
    }
    prefix = k;
  }
  put(prefix, bits);
  put(eoi, bits);
  if (nbits > 0) out.push(cur & 255);
  return out;
}

const chunks = [];
const push = (buf) => chunks.push(Buffer.from(buf));
const le16 = (v) => [v & 255, (v >> 8) & 255];

push([...Buffer.from('GIF89a', 'ascii'), ...le16(W), ...le16(H), 0, 0, 0]);
push([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0, 0, 0x00]);

let written = 0;
for (let f = 0; f < N; f++) {
  const px = frames[f];
  /* a frame's own palette, but built from a window of neighbours so a static UI does not
     flicker between two near-identical tables */
  const win = new Map();
  for (let g = Math.max(0, f - 2); g <= Math.min(N - 1, f + 2); g++) {
    const q = frames[g];
    for (let o = 0; o < q.length; o += 3) {
      const k = (q[o] << 16) | (q[o + 1] << 8) | q[o + 2];
      win.set(k, (win.get(k) || 0) + (g === f ? 2 : 1));
    }
  }
  const { pal, direct } = buildPalette(win);
  const near = indexer(pal);
  const idx = new Uint8Array(W * H);
  for (let p = 0, o = 0; p < W * H; p++, o += 3) {
    const r = px[o], g = px[o + 1], b = px[o + 2];
    idx[p] = direct ? (direct.get((r << 16) | (g << 8) | b) ?? near(r, g, b)) : near(r, g, b);
  }
  const data = lzw(Array.from(idx), 8);
  const delay = Math.max(2, Math.round((meta.delays[f] || 80) / 10));
  push([0x21, 0xf9, 0x04, 0x04, ...le16(delay), 0, 0x00]);
  push([0x2c, 0, 0, 0, 0, ...le16(W), ...le16(H), 0x87]);
  const tbl = [];
  for (let i = 0; i < 256; i++) tbl.push(pal[i][0], pal[i][1], pal[i][2]);
  push(tbl);
  push([8]);
  for (let o = 0; o < data.length; o += 255) {
    const slice = data.slice(o, o + 255);
    push([slice.length, ...slice]);
  }
  push([0x00]);
  written++;
  if (written % 5 === 0) console.error('encoded ' + written + '/' + N);
}
push([0x3b]);
fs.writeFileSync(dst, Buffer.concat(chunks));
console.log(dst + ': ' + written + ' frames ' + W + 'x' + H + ' = ' +
  (fs.statSync(dst).size / 1024).toFixed(0) + ' KiB');
