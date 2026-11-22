// The parrot, drawn from a handful of shapes on a 32 x 32 grid, and the frames the mod shows.
// The sketch (sketch/moods.html) draws the same parrot from the same shapes.
import { deflateSync } from "node:zlib";

export const S = 32;

export const PAL = {
  R: "#e0303f", r: "#a81c31", L: "#f0596b", Y: "#f7bd1d", G: "#38a35f", B: "#2d6fe0", b: "#1c438f",
  W: "#f7f3ec", H: "#efe1c6", h: "#bfae8a", K: "#1c1719", F: "#7f7b86", P: "#a8723c", p: "#6c4421",
  o: "#3a0f1d", X: "#ff3b4f", N: "#f7bd1d",
};

function wingFrom(sx, sy, tx, ty, rx) {
  const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy);
  return { cx: (sx + tx) / 2, cy: (sy + ty) / 2, rx, ry: len / 2, ex: dx / len, ey: dy / len };
}

const WING = {
  fold: wingFrom(19.5, 11, 22.5, 24.5, 3.8),
  mid: wingFrom(19.5, 13, 28, 7.5, 3.2),
  up: wingFrom(19.5, 13.5, 24, 2, 3.1),
};

function wingAt(w, px, py) {
  const dx = px - w.cx, dy = py - w.cy;
  const v = (dx * w.ex + dy * w.ey) / w.ry, u = (dx * w.ey - dy * w.ex) / w.rx;
  return u * u + v * v <= 1 ? v : null;
}

function inEllipse(px, py, cx, cy, rx, ry) {
  const u = (px - cx) / rx, v = (py - cy) / ry;
  return u * u + v * v <= 1;
}

function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const TAIL = [[18, 21.5], [22.5, 21.5], [26, 31.8], [22.5, 31.8]];
const BEAK_UP = [[9.2, 7.2], [9.6, 12.2], [7.4, 14.8], [5.9, 14.6], [5.1, 12.4], [5.7, 9.6], [7.3, 7.5]];
const BEAK_LO = [[9.6, 11.6], [9.6, 13.9], [7.8, 14.5], [7.6, 12.6]];
const BEAK_LO_OPEN = [[9.6, 12.4], [9.9, 16.4], [7.9, 16.8], [7.4, 14.6]];
const EYES = {
  open: [[11, 9, "K"]],
  closed: [[10, 10, "K"], [11, 10, "K"], [12, 10, "K"]],
  wide: [[11, 8, "W"], [12, 8, "K"], [11, 9, "K"], [12, 9, "K"]],
  happy: [[10, 10, "K"], [11, 9, "K"], [12, 10, "K"]],
  up: [[11, 8, "K"]],
  down: [[10, 10, "K"]],
};
const CREST = [[11, 3], [11, 4], [13, 2], [13, 3], [14, 4], [15, 3], [15, 4]];
const FEET = [[15, 23], [19, 23], [14, 24], [15, 24], [16, 24], [18, 24], [19, 24], [20, 24]];
const GLYPHS = {
  excl: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 5], [1, 5]],
  note: [[2, 0], [3, 0], [2, 1], [2, 2], [0, 3], [1, 3], [2, 3], [0, 4], [1, 4]],
};
const GLYPH_COLOR = { excl: "X", note: "N" };
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// A pose: { wing, eye, beak, crest, dx, bob, hx, hy, g }. Returns 32 rows of palette keys or null.
export function raster(pose) {
  const f = { wing: "fold", eye: "open", ...pose };
  const g = [], bird = [];
  for (let y = 0; y < S; y++) { g.push(new Array(S).fill(null)); bird.push(new Array(S).fill(false)); }
  const ox = f.dx || 0, oy = f.bob || 0, hx = ox + (f.hx || 0), hy = oy + (f.hy || 0);
  const w = WING[f.wing];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = x + 0.5, py = y + 0.5, bx = px - ox, by = py - oy, qx = px - hx, qy = py - hy;
    let c = null, isBird = true;
    if (inPolygon(bx, by, TAIL)) c = by < 26.5 ? "R" : by < 29 ? "B" : "b";
    if ((y === 24 || y === 25) && x >= 2 && x <= 29) { c = y === 24 ? "P" : "p"; isBird = false; }
    if (inEllipse(bx, by, 17.5, 16.5, 6, 7.5)) { c = bx > 20.3 ? "r" : bx < 14.5 && by > 15 ? "L" : "R"; isBird = true; }
    const wv = wingAt(w, bx, by);
    if (wv !== null) { c = wv < -0.45 ? "Y" : wv < -0.2 ? "G" : wv < 0.55 ? "B" : "b"; isBird = true; }
    if (inEllipse(qx, qy, 13, 9.5, 5.2, 5.2)) { c = qx > 15.6 ? "r" : "R"; isBird = true; }
    if (inEllipse(qx, qy, 11.2, 9.6, 2.4, 2.1)) { c = "W"; isBird = true; }
    if (inPolygon(qx, qy, f.beak === "open" ? BEAK_LO_OPEN : BEAK_LO)) { c = "K"; isBird = true; }
    if (inPolygon(qx, qy, BEAK_UP)) { c = qy > 12.8 ? "h" : "H"; isBird = true; }
    if (c) { g[y][x] = c; bird[y][x] = isBird; }
  }
  const put = (x, y, c, isBird) => {
    if (x >= 0 && x < S && y >= 0 && y < S) { g[y][x] = c; bird[y][x] = isBird; }
  };
  if (f.crest) for (const [x, y] of CREST) put(x + hx, y + hy, "R", true);
  for (const [x, y, c] of EYES[f.eye]) put(x + hx, y + hy, c, true);
  for (const [x, y] of FEET) put(x, y, "F", false);
  const out = g.map((row) => row.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x]) continue;
    if (NEIGHBOURS.some(([a, b]) => bird[y + b] && bird[y + b][x + a])) out[y][x] = "o";
  }
  for (const gl of f.g || []) for (const [x, y] of GLYPHS[gl.k]) {
    const X = gl.x + x, Y = gl.y + y;
    if (X >= 0 && X < S && Y >= 0 && Y < S) out[Y][X] = GLYPH_COLOR[gl.k];
  }
  return out;
}

// The frames the mod shows, by file name. Moods that come in later versions add theirs here.
export const FRAMES = {
  calm: {},
  blink: { eye: "closed" },
  watch: { eye: "down", hx: -1, hy: 1 },
  "watch-blink": { eye: "closed", hx: -1, hy: 1 },
  sleep: { eye: "closed", hy: 2 },
};

// The tab bar button's icon: the parrot's head, 16 x 16 cells from the calm frame.
export const ICON = { pose: {}, x: 4, y: 2, size: 16 };

export function crop(grid, x, y, size) {
  return grid.slice(y, y + size).map((row) => row.slice(x, x + size));
}

// The same picture without colour, for the button while parrot is off.
export function grey(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = Math.round(0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255));
  return [l, l, l];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// A grid as an RGBA PNG, each cell `scale` pixels wide, transparent where the grid is empty.
export function png(grid, scale, colour = rgb) {
  const h = grid.length * scale, w = grid[0].length * scale, stride = w * 4 + 1;
  const rows = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = grid[Math.floor(y / scale)][Math.floor(x / scale)];
    if (!c) continue;
    const [r, g, b] = colour(PAL[c]), i = y * stride + 1 + x * 4;
    rows[i] = r; rows[i + 1] = g; rows[i + 2] = b; rows[i + 3] = 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Every file the mod needs, by name: the frames at 6 pixels a cell (shown at 96 points, sharp on
// a Retina screen) and the button's icon at 2 (shown at 16), in colour and in grey.
export const FRAME_SCALE = 6;
export const ICON_SCALE = 2;

export function files() {
  const out = {};
  for (const [name, pose] of Object.entries(FRAMES)) out[`${name}.png`] = png(raster(pose), FRAME_SCALE);
  const head = crop(raster(ICON.pose), ICON.x, ICON.y, ICON.size);
  out["icon.png"] = png(head, ICON_SCALE);
  out["icon-off.png"] = png(head, ICON_SCALE, grey);
  return out;
}
