/* ===== Loose Leaf: rendering, input, sound and screens ===== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const WL = WORLDS.filter((w) => !w.wip); // worlds still being built stay hidden
  const BUILT = WL.map((w) => buildWorld(w.rooms));
  let wi = 0, world = BUILT[0];
  const STEP = 1000 / 60;
  const MASTER_GAIN = 13; // about 10 dB louder than before: the old mix was too quiet on computer speakers
  const SAVE_V1 = 'looseLeaf.save.v1', SAVE_KEY = 'looseLeaf.save.v2', SET_KEY = 'looseLeaf.settings.v1';
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
  const settings = Object.assign({ sound: true, music: true }, store.get(SET_KEY) || {});
  delete settings.boxes;
  let showBoxes = false;
  const saveSettings = () => store.set(SET_KEY, settings);

  const COL = {
    paper: '#f7f5ee', graphite: '#2e2d35', graphite2: '#6c6a74', solid: '#d9d5c9', hatch: 'rgba(58,56,68,.30)',
    ink: '#3566cf', inkDark: '#1d3a85', red: '#d4473d', redDark: '#86231c', hilite: '#ffe14a', eraser: '#f4a3b9',
    sleeve: '#5d86de', wood: '#f2d58a', spike: '#e0574c', blot: '#232a4f', bug: '#36343d', ruler: '#f3e1a8', note: 'rgba(46,78,160,.62)',
  };
  const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // per-world look: solid fill, what the spikes are, which enemy skins, map background
  const THEME = [
    { solid: '#d9d5c9', spikes: 'ink', enemy: 'ink', mapBg: '#fbfaf5' },
    { solid: '#d9c39d', spikes: 'tacks', enemy: 'desk', mapBg: '#f3ead8' },
    { solid: '#ddd0ea', spikes: 'pencils', enemy: 'art', mapBg: '#f6f0fa' },
    { solid: '#d3e2ea', spikes: 'icicles', enemy: 'fridge', mapBg: '#f0f7fa' },
    { solid: '#c9b696', spikes: 'nibs', enemy: 'library', mapBg: '#f7f1e6' },
    { solid: '#e3c296', spikes: 'jacks', enemy: 'toy', mapBg: '#fff6e8', gloss: 'toy' },
    { solid: '#6f7c9c', spikes: 'thorns', enemy: 'night', mapBg: '#e6eaf4', fireflies: true },
  ];
  const NIGHT = ['porch', 'lawn', 'pond', 'shed', 'sandbox', 'garden', 'doghouse', 'treehouse', 'rooftop', 'moonhill'];
  const theme = () => THEME[wi] || THEME[0];
  const ROOM_NAME = (ri) => (world.rooms[ri] ? world.rooms[ri].name : '');

  /* ---------- small utilities ---------- */
  function mulberry(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function sketchLine(c, x1, y1, x2, y2, r, amp) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const o1 = 0.9 * r(), o2 = 0.9 * r(), a1 = (r() - 0.5) * 2 * amp, a2 = (r() - 0.5) * 2 * amp;
    c.beginPath();
    c.moveTo(x1 - ux * o1, y1 - uy * o1);
    c.bezierCurveTo(x1 + dx * 0.33 + nx * a1, y1 + dy * 0.33 + ny * a1, x1 + dx * 0.66 + nx * a2, y1 + dy * 0.66 + ny * a2, x2 + ux * o2, y2 + uy * o2);
    c.stroke();
  }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ================= the drawing (the picture you are rebuilding) ================= */
  const PIC = { W: 240, H: 150, C: 4, R: 3 };
  const PIECE_OFS = [[5, 0, 10, 3, 8, 1, 6, 11, 2, 9, 4, 7], [7, 2, 9, 0, 11, 4, 1, 6, 10, 3, 8, 5], [3, 10, 6, 1, 8, 11, 0, 5, 9, 2, 7, 4], [8, 1, 11, 4, 6, 0, 9, 2, 5, 10, 3, 7], [6, 11, 2, 9, 0, 7, 4, 1, 10, 5, 8, 3], [2, 9, 5, 0, 11, 6, 3, 10, 7, 1, 8, 4], [10, 3, 7, 0, 5, 11, 1, 8, 4, 9, 2, 6]]; // scrap id -> piece of each world's picture
  function buildPieces(seed) {
    const r = mulberry(seed), cw = PIC.W / PIC.C, ch = PIC.H / PIC.R, V = [];
    for (let i = 0; i <= PIC.C; i++) {
      V[i] = [];
      for (let j = 0; j <= PIC.R; j++) {
        const ex = i === 0 || i === PIC.C, ey = j === 0 || j === PIC.R;
        V[i][j] = [i * cw + (ex ? 0 : (r() - 0.5) * 14), j * ch + (ey ? 0 : (r() - 0.5) * 12)];
      }
    }
    const edge = (a, b, border) => {
      const pts = [a];
      if (!border) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        for (let k = 1; k < 9; k++) {
          const t = k / 9, o = (k % 2 ? 1 : -1) * (1.1 + r() * 2.3);
          pts.push([a[0] + (b[0] - a[0]) * t + nx * o, a[1] + (b[1] - a[1]) * t + ny * o]);
        }
      }
      pts.push(b); return pts;
    };
    const Hh = [], Vv = [];
    for (let j = 0; j <= PIC.R; j++) { Hh[j] = []; for (let i = 0; i < PIC.C; i++) Hh[j][i] = edge(V[i][j], V[i + 1][j], j === 0 || j === PIC.R); }
    for (let i = 0; i <= PIC.C; i++) { Vv[i] = []; for (let j = 0; j < PIC.R; j++) Vv[i][j] = edge(V[i][j], V[i][j + 1], i === 0 || i === PIC.C); }
    const polys = [], boxes = [];
    for (let j = 0; j < PIC.R; j++) for (let i = 0; i < PIC.C; i++) {
      const top = Hh[j][i], right = Vv[i + 1][j], bottom = Hh[j + 1][i].slice().reverse(), left = Vv[i][j].slice().reverse();
      const poly = [...top, ...right.slice(1), ...bottom.slice(1), ...left.slice(1, -1)];
      polys.push(poly);
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]);
    }
    return { polys, boxes };
  }
  const PIECES = [buildPieces(4242), buildPieces(9157), buildPieces(2718), buildPieces(6151), buildPieces(3319), buildPieces(8086), buildPieces(7777)];
  const piecePath = (i, w) => { const p = new Path2D(), poly = PIECES[w].polys[i]; p.moveTo(poly[0][0], poly[0][1]); for (let k = 1; k < poly.length; k++) p.lineTo(poly[k][0], poly[k][1]); p.closePath(); return p; };

  function crayon(c, path, color, o) {
    o = o || {};
    const r = mulberry(o.seed || 1), b = o.b || [0, 0, PIC.W, PIC.H];
    c.save(); c.clip(path);
    c.globalAlpha = o.wash === undefined ? 0.5 : o.wash; c.fillStyle = color; c.fill(path);
    c.globalAlpha = o.a === undefined ? 0.7 : o.a; c.strokeStyle = color; c.lineWidth = o.lw || 1.5; c.lineCap = 'round';
    const ang = o.angle === undefined ? -0.5 : o.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, R = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 3;
    for (let d = -R; d < R; d += (o.sp || 2.3) * (0.7 + r() * 0.6)) {
      const j1 = (r() - 0.5) * 6, j2 = (r() - 0.5) * 6;
      c.beginPath();
      c.moveTo(cx - sa * d - ca * R + j1, cy + ca * d - sa * R);
      c.lineTo(cx - sa * (d + (r() - 0.5)) + ca * R + j2, cy + ca * (d + (r() - 0.5)) + sa * R);
      c.stroke();
    }
    c.restore();
  }
  function inkLine(c, path, color, lw) {
    c.save(); c.strokeStyle = color; c.lineWidth = lw || 1.2; c.lineJoin = 'round'; c.lineCap = 'round';
    c.globalAlpha = 0.45; c.translate(0.5, 0.35); c.stroke(path); c.restore();
    c.save(); c.strokeStyle = color; c.lineWidth = lw || 1.2; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(path); c.restore();
  }
  function paintPicture(c) {
    const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
    c.fillStyle = '#fffdf7'; c.fillRect(0, 0, PIC.W, PIC.H);
    crayon(c, rect(0, 0, 240, 118), '#9fd0f5', { seed: 2, angle: -0.35, sp: 2.6, wash: 0.42, b: [0, 0, 240, 118] });
    // sun
    const sun = new Path2D(); sun.arc(206, 28, 15, 0, Math.PI * 2);
    c.strokeStyle = '#f39c12'; c.lineWidth = 2.2; c.lineCap = 'round';
    for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + 0.2; c.beginPath(); c.moveTo(206 + Math.cos(a) * 19, 28 + Math.sin(a) * 19); c.lineTo(206 + Math.cos(a) * 26.5, 28 + Math.sin(a) * 26.5); c.stroke(); }
    crayon(c, sun, '#ffd23f', { seed: 3, angle: 0.7, sp: 1.8, wash: 0.85, b: [190, 12, 222, 44] });
    inkLine(c, sun, '#e08e0b', 1.4);
    // clouds: stroke first, then fill, so only the outer outline shows
    for (const [cx, cy, k] of [[54, 27, 1], [126, 17, 0.8]]) {
      const p = new Path2D();
      p.arc(cx - 12 * k, cy + 3 * k, 8 * k, 0, 7); p.moveTo(cx + 11 * k, cy - 2 * k); p.arc(cx, cy - 2 * k, 11 * k, 0, 7);
      p.moveTo(cx + 21 * k, cy + 3 * k); p.arc(cx + 13 * k, cy + 3 * k, 8 * k, 0, 7); p.rect(cx - 12 * k, cy + 2 * k, 25 * k, 9 * k);
      c.strokeStyle = '#6f8fb6'; c.lineWidth = 2.6; c.stroke(p); c.fillStyle = '#ffffff'; c.fill(p);
    }
    // birds
    c.strokeStyle = COL.graphite; c.lineWidth = 1.1;
    for (const [bx, by, k] of [[92, 34, 1], [104, 27, 0.8]]) { c.beginPath(); c.moveTo(bx - 4 * k, by - 2 * k); c.quadraticCurveTo(bx - 1.5 * k, by - 3 * k, bx, by); c.quadraticCurveTo(bx + 1.5 * k, by - 3 * k, bx + 4 * k, by - 2 * k); c.stroke(); }
    // far hill
    const far = new Path2D(); far.moveTo(0, 104); far.bezierCurveTo(60, 80, 150, 70, 240, 98); far.lineTo(240, 150); far.lineTo(0, 150); far.closePath();
    crayon(c, far, '#a9db86', { seed: 4, angle: 0.3, sp: 2.4, wash: 0.55, b: [0, 70, 240, 150] });
    // near hill
    const near = new Path2D(); near.moveTo(0, 112); near.bezierCurveTo(50, 92, 110, 96, 160, 114); near.bezierCurveTo(190, 124, 220, 118, 240, 116); near.lineTo(240, 150); near.lineTo(0, 150); near.closePath();
    crayon(c, near, '#5fb85b', { seed: 5, angle: -0.25, sp: 2.1, wash: 0.6, b: [0, 92, 240, 150] });
    c.save(); c.strokeStyle = '#3f8a3e'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(0, 112); c.bezierCurveTo(50, 92, 110, 96, 160, 114); c.bezierCurveTo(190, 124, 220, 118, 240, 116); c.stroke(); c.restore();
    // path to the door
    const path = new Path2D(); path.moveTo(57, 107); path.lineTo(68, 107); path.lineTo(94, 150); path.lineTo(38, 150); path.closePath();
    crayon(c, path, '#e8d29a', { seed: 6, angle: 1.2, sp: 2, wash: 0.75, b: [38, 107, 94, 150] });
    // house
    const chim = rect(74, 52, 9, 16); crayon(c, chim, '#9a6644', { seed: 7, angle: 1.4, wash: 0.8, b: [74, 52, 83, 68] }); inkLine(c, chim, COL.graphite, 1.1);
    const body = rect(37, 72, 52, 36); crayon(c, body, '#f6b26b', { seed: 8, angle: 0.9, sp: 1.9, wash: 0.75, b: [37, 72, 89, 108] }); inkLine(c, body, COL.graphite, 1.3);
    const roof = new Path2D(); roof.moveTo(30, 74); roof.lineTo(63, 47); roof.lineTo(96, 74); roof.closePath();
    crayon(c, roof, '#d4473d', { seed: 9, angle: -0.6, sp: 1.8, wash: 0.85, b: [30, 47, 96, 74] }); inkLine(c, roof, COL.graphite, 1.3);
    const door = rect(57, 88, 12, 20); crayon(c, door, '#7b4b2a', { seed: 10, angle: 1.5, wash: 0.85, b: [57, 88, 69, 108] }); inkLine(c, door, COL.graphite, 1.1);
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(66.5, 98.5, 1.1, 0, 7); c.fill();
    for (const wx of [42, 75]) {
      const win = rect(wx, 80, 10, 10); c.fillStyle = '#d6efff'; c.fill(win); inkLine(c, win, COL.graphite, 1.1);
      c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.beginPath(); c.moveTo(wx + 5, 80); c.lineTo(wx + 5, 90); c.moveTo(wx, 85); c.lineTo(wx + 10, 85); c.stroke();
    }
    // tree
    const trunk = rect(182, 86, 10, 34); crayon(c, trunk, '#8a5a3b', { seed: 11, angle: 1.5, wash: 0.8, b: [182, 86, 192, 120] }); inkLine(c, trunk, COL.graphite, 1.1);
    const crown = new Path2D(); crown.arc(187, 72, 20, 0, 7); crown.moveTo(183, 86); crown.arc(170, 86, 13, 0, 7); crown.moveTo(217, 86); crown.arc(204, 86, 13, 0, 7);
    c.strokeStyle = '#2f7a39'; c.lineWidth = 2.4; c.stroke(crown);
    crayon(c, crown, '#3f9b4a', { seed: 12, angle: 0.4, sp: 1.9, wash: 0.8, b: [157, 52, 217, 99] });
    c.fillStyle = '#e8413c'; for (const [ax, ay] of [[178, 70], [195, 64], [200, 82], [172, 88], [187, 84]]) { c.beginPath(); c.arc(ax, ay, 2, 0, 7); c.fill(); }
    // kite and its tail
    const kl = new Path2D(); kl.moveTo(140, 24); kl.lineTo(129, 40); kl.lineTo(140, 57); kl.closePath();
    const kr = new Path2D(); kr.moveTo(140, 24); kr.lineTo(151, 40); kr.lineTo(140, 57); kr.closePath();
    crayon(c, kl, '#4f7cff', { seed: 13, angle: 0.8, sp: 1.6, wash: 0.9, b: [129, 24, 140, 57] });
    crayon(c, kr, '#e94f64', { seed: 14, angle: -0.8, sp: 1.6, wash: 0.9, b: [140, 24, 151, 57] });
    const kite = new Path2D(); kite.moveTo(140, 24); kite.lineTo(151, 40); kite.lineTo(140, 57); kite.lineTo(129, 40); kite.closePath(); kite.moveTo(129, 40); kite.lineTo(151, 40); kite.moveTo(140, 24); kite.lineTo(140, 57);
    inkLine(c, kite, COL.graphite, 1.1);
    c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.beginPath(); c.moveTo(140, 57); c.bezierCurveTo(146, 63, 136, 68, 146, 74); c.bezierCurveTo(150, 78, 146, 82, 151, 86); c.stroke();
    c.fillStyle = '#ffd23f'; for (const [tx, ty] of [[143, 64], [143, 74], [149, 82]]) { c.beginPath(); c.moveTo(tx - 3, ty - 2); c.lineTo(tx + 3, ty + 2); c.lineTo(tx + 3, ty - 2); c.lineTo(tx - 3, ty + 2); c.closePath(); c.fill(); }
    c.strokeStyle = 'rgba(46,45,53,.7)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(140, 57); c.quadraticCurveTo(122, 76, 129, 97); c.stroke();
    // the doodle, home at last
    c.fillStyle = COL.hilite; c.fillRect(114, 96, 14, 16);
    c.strokeStyle = COL.graphite; c.lineWidth = 1.4; c.strokeRect(114.7, 96.7, 12.6, 14.6);
    c.fillStyle = COL.graphite; c.fillRect(118, 101, 1.8, 2.4); c.fillRect(122.5, 101, 1.8, 2.4);
    c.beginPath(); c.lineWidth = 1; c.arc(121, 105.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.beginPath(); c.moveTo(127.3, 102); c.lineTo(129.5, 97.5); c.stroke();
    // flowers and grass
    for (const [fx, fy, col] of [[18, 132, '#f29ad6'], [104, 139, '#b58cf2'], [150, 131, '#f29ad6'], [226, 140, '#ff9f68'], [12, 144, '#b58cf2']]) {
      c.strokeStyle = '#3f8a3e'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(fx, fy + 3); c.lineTo(fx, fy + 9); c.stroke();
      c.fillStyle = col; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; c.beginPath(); c.arc(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 1.9, 0, 7); c.fill(); }
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(fx, fy, 1.3, 0, 7); c.fill();
    }
    c.strokeStyle = '#3f8a3e'; c.lineWidth = 0.8; const gr = mulberry(77);
    for (let i = 0; i < 26; i++) { const gx = gr() * 240, gy = 122 + gr() * 26; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - 1.2, gy - 3.2); c.moveTo(gx + 1.5, gy); c.lineTo(gx + 2.2, gy - 2.8); c.stroke(); }
    // a little heart in the corner, like a signature
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(231, 146); c.bezierCurveTo(224, 141, 226, 136, 229, 137); c.bezierCurveTo(230, 137, 231, 138, 231, 139); c.bezierCurveTo(231, 138, 232, 137, 233, 137); c.bezierCurveTo(236, 136, 238, 141, 231, 146); c.fill();
  }

  /* World 2's drawing: a night flight over town */
  function paintPicture2(c) {
    const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
    c.fillStyle = '#1d2753'; c.fillRect(0, 0, PIC.W, PIC.H);
    crayon(c, rect(0, 0, 240, 150), '#2d3f8c', { seed: 21, angle: -0.3, sp: 2.4, wash: 0.6, b: [0, 0, 240, 150] });
    crayon(c, rect(0, 62, 240, 88), '#6d4f9e', { seed: 22, angle: 0.25, sp: 2.8, wash: 0.25, a: 0.35, b: [0, 62, 240, 150] });
    // stars
    const sr = mulberry(31);
    for (let i = 0; i < 46; i++) {
      const x = sr() * 240, y = sr() * 92, big = sr() < 0.22;
      c.fillStyle = sr() < 0.5 ? '#fff6c8' : '#ffe27a';
      if (big) { c.strokeStyle = '#fff2a8'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke(); }
      else { c.beginPath(); c.arc(x, y, 0.7 + sr() * 0.6, 0, 7); c.fill(); }
    }
    // full moon
    const moon = new Path2D(); moon.arc(198, 30, 16, 0, Math.PI * 2);
    c.save(); c.fillStyle = 'rgba(255,240,170,.18)'; c.beginPath(); c.arc(198, 30, 26, 0, 7); c.fill(); c.restore();
    crayon(c, moon, '#fff1a6', { seed: 23, angle: 0.6, sp: 1.6, wash: 0.95, b: [182, 14, 214, 46] });
    c.fillStyle = 'rgba(214,190,110,.55)'; for (const [mx, my, mr] of [[192, 25, 3.2], [204, 35, 2.4], [201, 22, 1.6]]) { c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill(); }
    inkLine(c, moon, '#c9a64a', 1.1);
    // wispy cloud lit by the moon
    c.strokeStyle = 'rgba(200,205,240,.55)'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(150, 60); c.bezierCurveTo(170, 54, 200, 62, 228, 56); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.moveTo(20, 30); c.bezierCurveTo(40, 25, 60, 32, 82, 27); c.stroke();
    // looping flight trail
    c.save(); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.3; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(6, 100); c.bezierCurveTo(36, 62, 74, 108, 64, 74); c.bezierCurveTo(56, 44, 88, 44, 104, 50); c.stroke(); c.restore();
    // the paper airplane
    const wing = new Path2D(); wing.moveTo(156, 44); wing.lineTo(100, 34); wing.lineTo(119, 51); wing.closePath();
    const keel = new Path2D(); keel.moveTo(156, 44); keel.lineTo(119, 51); keel.lineTo(108, 64); keel.closePath();
    c.fillStyle = '#ffffff'; c.fill(wing); c.fillStyle = '#d9dcef'; c.fill(keel);
    inkLine(c, wing, COL.graphite, 1.2); inkLine(c, keel, COL.graphite, 1.2);
    c.strokeStyle = 'rgba(46,45,53,.4)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(119, 51); c.lineTo(131, 46); c.stroke();
    // the doodle riding it
    c.fillStyle = COL.hilite; c.fillRect(118, 24, 12, 14);
    c.strokeStyle = COL.graphite; c.lineWidth = 1.3; c.strokeRect(118.6, 24.6, 10.8, 12.8);
    c.fillStyle = COL.graphite; c.fillRect(123, 28.5, 1.6, 2.2); c.fillRect(126.5, 28.5, 1.6, 2.2);
    c.beginPath(); c.lineWidth = 0.9; c.arc(125.2, 32.6, 2.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(131, 26); c.lineTo(136, 21); c.stroke();
    // hills and the sleeping town
    const hill = new Path2D(); hill.moveTo(0, 128); hill.bezierCurveTo(60, 114, 120, 120, 170, 130); hill.bezierCurveTo(200, 136, 225, 126, 240, 124); hill.lineTo(240, 150); hill.lineTo(0, 150); hill.closePath();
    crayon(c, hill, '#1f4a3c', { seed: 24, angle: -0.2, sp: 2, wash: 0.85, b: [0, 114, 240, 150] });
    const wr = mulberry(41);
    const bld = [[2, 96, 22], [26, 110, 18], [46, 88, 22], [70, 104, 18], [150, 100, 20], [172, 112, 16], [190, 92, 22], [214, 106, 24]];
    for (const [bx, by, bw] of bld) {
      const p = rect(bx, by, bw, 150 - by);
      crayon(c, p, '#171b40', { seed: bx + 50, angle: 1.4, sp: 1.6, wash: 0.92, b: [bx, by, bx + bw, 150] });
      inkLine(c, p, '#0d0f26', 0.9);
      for (let wy = by + 5; wy < 140; wy += 8) for (let wx = bx + 3; wx < bx + bw - 4; wx += 6) {
        if (wr() < 0.45) { c.fillStyle = wr() < 0.5 ? '#ffd860' : '#ffeaa0'; c.fillRect(wx, wy, 3, 4); }
      }
    }
    // water tower and a house with a lit window in the middle
    c.strokeStyle = '#0d0f26'; c.lineWidth = 1; c.fillStyle = '#171b40';
    c.beginPath(); c.moveTo(52, 88); c.lineTo(54, 78); c.moveTo(62, 88); c.lineTo(60, 78); c.stroke(); c.fillRect(50, 70, 14, 9);
    c.beginPath(); c.moveTo(49, 70); c.lineTo(57, 64); c.lineTo(65, 70); c.closePath(); c.fill();
    const house = rect(106, 118, 26, 20); crayon(c, house, '#28305e', { seed: 61, angle: 1.2, wash: 0.9, b: [106, 118, 132, 138] }); inkLine(c, house, '#0d0f26', 1);
    const roof = new Path2D(); roof.moveTo(102, 119); roof.lineTo(119, 106); roof.lineTo(136, 119); roof.closePath();
    crayon(c, roof, '#5b2a3a', { seed: 62, angle: -0.5, wash: 0.9, b: [102, 106, 136, 119] }); inkLine(c, roof, '#0d0f26', 1);
    c.fillStyle = '#ffd860'; c.fillRect(110, 123, 6, 6); c.fillRect(122, 123, 6, 6);
    // tree silhouette
    c.fillStyle = '#123227'; c.beginPath(); c.arc(146, 118, 9, 0, 7); c.arc(139, 124, 7, 0, 7); c.arc(153, 125, 7, 0, 7); c.fill();
    c.fillRect(144, 124, 4, 14);
    // signature heart
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(231, 146); c.bezierCurveTo(224, 141, 226, 136, 229, 137); c.bezierCurveTo(230, 137, 231, 138, 231, 139); c.bezierCurveTo(231, 138, 232, 137, 233, 137); c.bezierCurveTo(236, 136, 238, 141, 231, 146); c.fill();
  }

  /* World 3's drawing: sunflowers by the art room window */
  function paintPicture3(c) {
    const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
    c.fillStyle = '#fff6ea'; c.fillRect(0, 0, PIC.W, PIC.H);
    crayon(c, rect(0, 0, 240, 110), '#f6c9a8', { seed: 71, angle: 0.4, sp: 2.8, wash: 0.35, a: 0.4, b: [0, 0, 240, 110] });
    // window with sky and a rainbow
    const win = rect(16, 12, 88, 66);
    c.save(); c.clip(win);
    c.fillStyle = '#bfe4ff'; c.fillRect(16, 12, 88, 66);
    const bands = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'];
    bands.forEach((col, i) => { c.strokeStyle = col; c.lineWidth = 4.2; c.beginPath(); c.arc(60, 92, 50 - i * 4.2, Math.PI, 0); c.stroke(); });
    c.fillStyle = '#ffffff'; for (const [cx, cy] of [[30, 30], [86, 24]]) { c.beginPath(); c.arc(cx, cy, 6, 0, 7); c.arc(cx + 7, cy + 1, 5, 0, 7); c.arc(cx - 6, cy + 2, 4, 0, 7); c.fill(); }
    c.restore();
    c.strokeStyle = '#8a5a3b'; c.lineWidth = 3.4; c.strokeRect(16, 12, 88, 66);
    c.lineWidth = 2; c.beginPath(); c.moveTo(60, 12); c.lineTo(60, 78); c.moveTo(16, 45); c.lineTo(104, 45); c.stroke();
    // table
    const table = rect(0, 108, 240, 42);
    crayon(c, table, '#c98a52', { seed: 72, angle: 0.05, sp: 2.2, wash: 0.8, b: [0, 108, 240, 150] });
    c.strokeStyle = '#7b4b2a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, 108); c.lineTo(240, 108); c.stroke();
    // vase
    const vase = new Path2D(); vase.moveTo(128, 78); vase.bezierCurveTo(112, 84, 110, 104, 120, 110); vase.lineTo(152, 110); vase.bezierCurveTo(162, 104, 160, 84, 144, 78); vase.closePath();
    crayon(c, vase, '#3f7be0', { seed: 73, angle: 1.0, sp: 1.7, wash: 0.85, b: [110, 78, 162, 110] });
    inkLine(c, vase, COL.graphite, 1.3);
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(121, 88); c.quadraticCurveTo(118, 98, 123, 106); c.stroke();
    // stems, leaves and sunflowers
    const heads = [[118, 34, 13], [146, 26, 15], [168, 48, 12]];
    c.strokeStyle = '#3f8a3e'; c.lineWidth = 2.2;
    for (const [hx, hy] of heads) { c.beginPath(); c.moveTo(136, 80); c.quadraticCurveTo((hx + 136) / 2, (hy + 80) / 2 + 6, hx, hy); c.stroke(); }
    c.fillStyle = '#5fb85b'; for (const [lx, ly, a] of [[128, 62, -0.6], [152, 58, 0.7], [140, 70, 0.1]]) { c.save(); c.translate(lx, ly); c.rotate(a); c.beginPath(); c.ellipse(0, 0, 8, 3.4, 0, 0, 7); c.fill(); c.restore(); }
    for (const [hx, hy, rr] of heads) {
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; c.save(); c.translate(hx + Math.cos(a) * rr * 0.75, hy + Math.sin(a) * rr * 0.75); c.rotate(a); c.fillStyle = i % 2 ? '#ffd23f' : '#ffc12e'; c.beginPath(); c.ellipse(0, 0, rr * 0.42, rr * 0.2, 0, 0, 7); c.fill(); c.restore(); }
      c.fillStyle = '#7b4b2a'; c.beginPath(); c.arc(hx, hy, rr * 0.45, 0, 7); c.fill();
      c.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(hx + Math.cos(k * 2.4) * rr * 0.25, hy + Math.sin(k * 2.4) * rr * 0.25, 0.9, 0, 7); c.fill(); }
    }
    // palette with paint dabs, and a brush
    const pal = new Path2D(); pal.ellipse(200, 124, 30, 13, -0.1, 0, Math.PI * 2);
    c.fillStyle = '#e8c48e'; c.fill(pal); inkLine(c, pal, '#7b4b2a', 1.1);
    c.fillStyle = '#c98a52'; c.beginPath(); c.arc(214, 128, 4, 0, 7); c.fill();
    [['#ff6b6b', 182, 120], ['#ffd23f', 192, 115], ['#4dabf7', 204, 114], ['#69db7c', 186, 130], ['#9775fa', 198, 132]].forEach(([col, x, y]) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); });
    c.save(); c.translate(70, 128); c.rotate(-0.25);
    c.fillStyle = '#c0392b'; c.fillRect(-28, -2, 34, 4); c.fillStyle = '#b8bcc6'; c.fillRect(6, -2.5, 7, 5); c.fillStyle = '#ff8c2e'; c.beginPath(); c.moveTo(13, -2.5); c.quadraticCurveTo(22, 0, 13, 2.5); c.fill(); c.restore();
    // the doodle, sitting on the table
    c.fillStyle = COL.hilite; c.fillRect(92, 94, 12, 14);
    c.strokeStyle = COL.graphite; c.lineWidth = 1.3; c.strokeRect(92.6, 94.6, 10.8, 12.8);
    c.fillStyle = COL.graphite; c.fillRect(96, 98.5, 1.6, 2.2); c.fillRect(99.6, 98.5, 1.6, 2.2);
    c.beginPath(); c.lineWidth = 0.9; c.arc(98.4, 102.6, 2.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = '#ff8c2e'; c.beginPath(); c.arc(95, 105, 1.6, 0, 7); c.fill();
    // signature heart
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(231, 146); c.bezierCurveTo(224, 141, 226, 136, 229, 137); c.bezierCurveTo(230, 137, 231, 138, 231, 139); c.bezierCurveTo(231, 138, 232, 137, 233, 137); c.bezierCurveTo(236, 136, 238, 141, 231, 146); c.fill();
  }
  function paintPicture4(c) {
    const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
    c.fillStyle = '#f4fbff'; c.fillRect(0, 0, PIC.W, PIC.H);
    crayon(c, rect(0, 0, 240, 104), '#bfe6f0', { seed: 81, angle: -0.3, sp: 2.8, wash: 0.35, a: 0.4, b: [0, 0, 240, 104] });
    // snowflakes on the wall
    c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.2; c.lineCap = 'round';
    for (const [fx, fy, fr] of [[30, 24, 7], [196, 30, 9], [62, 62, 5], [214, 76, 5], [172, 12, 4]]) {
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(fx - Math.cos(a) * fr, fy - Math.sin(a) * fr); c.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); c.stroke(); }
    }
    // gingham tablecloth
    c.fillStyle = '#ffffff'; c.fillRect(0, 104, 240, 46);
    c.fillStyle = 'rgba(226,85,75,.32)';
    for (let x = 0; x < 240; x += 16) c.fillRect(x, 104, 8, 46);
    for (let y = 104; y < 150; y += 16) c.fillRect(0, y, 240, 8);
    c.strokeStyle = '#b5443b'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 104); c.lineTo(240, 104); c.stroke();
    // three scoops
    const scoop = (cx, cy, r, col, seed) => {
      const p = new Path2D(); p.moveTo(cx - r, cy + 2);
      p.bezierCurveTo(cx - r, cy - r * 1.25, cx + r, cy - r * 1.25, cx + r, cy + 2);
      for (let k = 0; k <= 6; k++) { const t = 1 - k / 6, x = cx - r + 2 * r * t; p.quadraticCurveTo(x + r / 6, cy + 2 + (k % 2 ? 5 : -1), x, cy + 3); }
      p.closePath();
      crayon(c, p, col, { seed, angle: 0.6, sp: 1.9, wash: 0.85, b: [cx - r, cy - r, cx + r, cy + r] });
      inkLine(c, p, COL.graphite, 1.2);
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(cx - r * 0.45, cy - r * 0.45, r * 0.22, r * 0.13, -0.6, 0, 7); c.fill();
    };
    scoop(103, 78, 17, '#ff9fb7', 82);
    scoop(137, 78, 17, '#8fdcb9', 83);
    scoop(120, 60, 18, '#ffe7a8', 84);
    // chocolate drizzle with drips
    c.strokeStyle = '#6b3a1f'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(104, 52); c.quadraticCurveTo(112, 46, 120, 50); c.quadraticCurveTo(128, 54, 136, 49); c.stroke();
    c.lineWidth = 2.2; c.beginPath(); c.moveTo(110, 49); c.lineTo(110, 57); c.moveTo(126, 52); c.lineTo(126, 61); c.moveTo(133, 50); c.lineTo(133, 55); c.stroke();
    c.fillStyle = '#6b3a1f'; for (const [dx, dy] of [[110, 58], [126, 62], [133, 56]]) { c.beginPath(); c.arc(dx, dy, 1.6, 0, 7); c.fill(); }
    // sprinkles
    const sr = mulberry(85), spc = ['#e2554b', '#3f7be0', '#f2c230', '#4bb36a', '#9b6ef0', '#ff8c2e'];
    for (let i = 0; i < 30; i++) {
      const which = i % 3, cx = [103, 137, 120][which] + (sr() - 0.5) * 22, cy = [76, 76, 60][which] + (sr() - 0.6) * 18;
      c.save(); c.translate(cx, cy); c.rotate(sr() * 3); c.fillStyle = spc[i % spc.length]; c.fillRect(-1.8, -0.6, 3.6, 1.2); c.restore();
    }
    // whipped cream and a cherry
    c.fillStyle = '#ffffff'; c.strokeStyle = COL.graphite; c.lineWidth = 1;
    for (const [wx, wy, wr] of [[120, 44, 9], [114, 40, 6], [126, 40, 6], [120, 34, 6]]) { c.beginPath(); c.ellipse(wx, wy, wr, wr * 0.7, 0, 0, 7); c.fill(); c.stroke(); }
    c.fillStyle = '#ffffff'; c.fillRect(110, 38, 20, 5);
    c.strokeStyle = '#3f6b2a'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(122, 24); c.quadraticCurveTo(124, 15, 131, 11); c.stroke();
    c.fillStyle = '#d6242a'; c.beginPath(); c.arc(121, 27, 6, 0, 7); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(119, 25, 1.6, 0, 7); c.fill();
    // a wafer stuck in the side
    c.save(); c.translate(150, 50); c.rotate(0.45);
    c.fillStyle = '#e9b86a'; c.fillRect(-4, -16, 8, 30); c.strokeStyle = '#9a6a2a'; c.lineWidth = 0.7;
    for (let k = -12; k < 14; k += 4) { c.beginPath(); c.moveTo(-4, k); c.lineTo(4, k); c.stroke(); }
    c.strokeStyle = COL.graphite; c.lineWidth = 1; c.strokeRect(-4, -16, 8, 30); c.restore();
    // the glass dish (drawn over the bottom of the scoops)
    const base = new Path2D(); base.ellipse(120, 133, 22, 5, 0, 0, Math.PI * 2);
    const stem = new Path2D(); stem.moveTo(116, 111); stem.lineTo(124, 111); stem.lineTo(126, 131); stem.lineTo(114, 131); stem.closePath();
    const bowl = new Path2D(); bowl.moveTo(82, 84); bowl.quadraticCurveTo(84, 112, 120, 113); bowl.quadraticCurveTo(156, 112, 158, 84); bowl.closePath();
    for (const g of [base, stem, bowl]) { c.fillStyle = 'rgba(205,236,248,.78)'; c.fill(g); inkLine(c, g, '#4f7f98', 1.2); }
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(90, 90); c.quadraticCurveTo(92, 102, 102, 107); c.stroke();
    c.strokeStyle = '#4f7f98'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(80, 84); c.lineTo(160, 84); c.stroke();
    // a spoon on the tablecloth
    c.save(); c.translate(196, 124); c.rotate(-0.18);
    c.fillStyle = '#d5dbe3'; c.strokeStyle = COL.graphite; c.lineWidth = 1;
    rrect(c, -26, -1.6, 30, 3.2, 1.6); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(10, 0, 8, 4.6, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(8, -1.4, 3, 1.2, 0, 0, 7); c.fill();
    c.restore();
    // the doodle, sitting on the table
    c.fillStyle = COL.hilite; c.fillRect(48, 90, 12, 14);
    c.strokeStyle = COL.graphite; c.lineWidth = 1.3; c.strokeRect(48.6, 90.6, 10.8, 12.8);
    c.fillStyle = COL.graphite; c.fillRect(53.5, 94.5, 1.6, 2.2); c.fillRect(57, 94.5, 1.6, 2.2);
    c.beginPath(); c.lineWidth = 0.9; c.arc(55.8, 98.6, 2.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    // signature heart
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(231, 146); c.bezierCurveTo(224, 141, 226, 136, 229, 137); c.bezierCurveTo(230, 137, 231, 138, 231, 139); c.bezierCurveTo(231, 138, 232, 137, 233, 137); c.bezierCurveTo(236, 136, 238, 141, 231, 146); c.fill();
  }
  function paintPicture5(c) {
    const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
    c.fillStyle = '#1f2a4a'; c.fillRect(0, 0, PIC.W, PIC.H);
    crayon(c, rect(0, 0, 240, 150), '#33416e', { seed: 91, angle: 0.3, sp: 2.6, wash: 0.5, a: 0.45, b: [0, 0, 240, 150] });
    // stars and a crescent moon
    const sr = mulberry(92);
    for (let i = 0; i < 26; i++) { const x = sr() * 240, y = sr() * 70, r = 0.6 + sr() * 1.2; c.fillStyle = `rgba(255,240,190,${0.5 + sr() * 0.5})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(198, 28, 14, 0, 7); c.fill();
    c.fillStyle = '#2b3866'; c.beginPath(); c.arc(205, 23, 12, 0, 7); c.fill();
    // the open storybook
    const left = new Path2D(); left.moveTo(120, 112); left.quadraticCurveTo(84, 102, 30, 110); left.lineTo(30, 140); left.quadraticCurveTo(84, 132, 120, 142); left.closePath();
    const right = new Path2D(); right.moveTo(120, 112); right.quadraticCurveTo(156, 102, 210, 110); right.lineTo(210, 140); right.quadraticCurveTo(156, 132, 120, 142); right.closePath();
    c.fillStyle = '#7a3b2a'; c.beginPath(); c.moveTo(24, 112); c.lineTo(216, 112); c.lineTo(216, 146); c.lineTo(24, 146); c.closePath(); c.fill();
    for (const pg of [left, right]) { c.fillStyle = '#fff8e8'; c.fill(pg); inkLine(c, pg, COL.graphite, 1.1); }
    c.strokeStyle = 'rgba(46,45,53,.25)'; c.lineWidth = 0.7;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(44, 120 + k * 6); c.quadraticCurveTo(80, 114 + k * 6, 110, 121 + k * 6); c.stroke(); c.beginPath(); c.moveTo(130, 121 + k * 6); c.quadraticCurveTo(160, 114 + k * 6, 196, 120 + k * 6); c.stroke(); }
    // pop-up castle rising out of the pages
    const castle = new Path2D();
    castle.moveTo(88, 112); castle.lineTo(88, 66); castle.lineTo(100, 66); castle.lineTo(100, 80); castle.lineTo(112, 80); castle.lineTo(112, 54); castle.lineTo(128, 54); castle.lineTo(128, 80); castle.lineTo(140, 80); castle.lineTo(140, 66); castle.lineTo(152, 66); castle.lineTo(152, 112); castle.closePath();
    crayon(c, castle, '#b9bfd6', { seed: 93, angle: 1.2, sp: 2, wash: 0.9, b: [88, 54, 152, 112] });
    inkLine(c, castle, COL.graphite, 1.2);
    c.fillStyle = '#5a3b2a'; c.beginPath(); c.moveTo(114, 112); c.lineTo(114, 98); c.arc(120, 98, 6, Math.PI, 0); c.lineTo(126, 112); c.closePath(); c.fill();
    c.fillStyle = '#ffd56b'; for (const [wx, wy] of [[93, 74], [145, 74], [118, 62]]) c.fillRect(wx, wy, 4, 6);
    // pointy roofs and flags
    for (const [rx, rw, ry] of [[86, 16, 66], [110, 20, 54], [138, 16, 66]]) {
      c.fillStyle = '#d64538'; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + rw / 2, ry - 16); c.lineTo(rx + rw, ry); c.closePath(); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
      c.strokeStyle = COL.graphite; c.beginPath(); c.moveTo(rx + rw / 2, ry - 16); c.lineTo(rx + rw / 2, ry - 24); c.stroke();
      c.fillStyle = '#ffe14a'; c.beginPath(); c.moveTo(rx + rw / 2, ry - 24); c.lineTo(rx + rw / 2 + 7, ry - 21.5); c.lineTo(rx + rw / 2, ry - 19); c.closePath(); c.fill();
    }
    // a small green dragon peeking around the castle
    const dr = new Path2D(); dr.moveTo(152, 100); dr.quadraticCurveTo(166, 84, 176, 90); dr.quadraticCurveTo(184, 94, 178, 100); dr.quadraticCurveTo(170, 104, 160, 108); dr.closePath();
    crayon(c, dr, '#5fb85b', { seed: 94, angle: 0.4, sp: 1.6, wash: 0.9, b: [152, 84, 184, 108] }); inkLine(c, dr, COL.graphite, 1.1);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(174, 92, 2.2, 0, 7); c.fill(); c.fillStyle = COL.graphite; c.beginPath(); c.arc(174.6, 92.2, 1, 0, 7); c.fill();
    c.strokeStyle = '#ff8c2e'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(181, 97); c.quadraticCurveTo(188, 95, 192, 99); c.moveTo(181, 98); c.quadraticCurveTo(187, 101, 190, 104); c.stroke();
    c.fillStyle = '#3f8a3e'; for (const [sx, sy] of [[160, 92], [166, 87], [171, 85]]) { c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 2, sy - 4); c.lineTo(sx + 4, sy); c.closePath(); c.fill(); }
    // the doodle, sitting on the corner of the page with a tiny book
    c.fillStyle = COL.hilite; c.fillRect(50, 98, 12, 14);
    c.strokeStyle = COL.graphite; c.lineWidth = 1.3; c.strokeRect(50.6, 98.6, 10.8, 12.8);
    c.fillStyle = COL.graphite; c.fillRect(55, 102, 1.6, 2.2); c.fillRect(58.4, 102, 1.6, 2.2);
    c.beginPath(); c.lineWidth = 0.9; c.arc(57.6, 106.4, 2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = '#3f7be0'; c.fillRect(62, 104, 7, 6); c.fillStyle = '#fff'; c.fillRect(63, 105, 5, 4);
    // signature heart
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(231, 146); c.bezierCurveTo(224, 141, 226, 136, 229, 137); c.bezierCurveTo(230, 137, 231, 138, 231, 139); c.bezierCurveTo(231, 138, 232, 137, 233, 137); c.bezierCurveTo(236, 136, 238, 141, 231, 146); c.fill();
  }
  function paintPicture6(c) {
    const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
    c.fillStyle = '#fff4dc'; c.fillRect(0, 0, PIC.W, PIC.H);
    crayon(c, rect(0, 0, 240, 108), '#ffe39a', { seed: 101, angle: -0.4, sp: 2.8, wash: 0.35, a: 0.4, b: [0, 0, 240, 108] });
    // striped rug
    const rug = ['#ff8f8f', '#ffd166', '#8fd3ff', '#9be39b'];
    for (let i = 0; i < 6; i++) { c.fillStyle = rug[i % 4]; c.fillRect(0, 108 + i * 7, 240, 7); }
    c.strokeStyle = '#b37a4a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 108); c.lineTo(240, 108); c.stroke();
    // a red balloon on a string
    const bal = new Path2D(); bal.ellipse(62, 30, 13, 16, 0, 0, Math.PI * 2);
    crayon(c, bal, '#e2554b', { seed: 102, angle: 0.8, sp: 1.6, wash: 0.9, b: [49, 14, 75, 46] }); inkLine(c, bal, COL.graphite, 1.1);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(57, 24, 3, 5, -0.4, 0, 7); c.fill();
    c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.beginPath(); c.moveTo(62, 46); c.bezierCurveTo(58, 60, 70, 70, 78, 82); c.stroke();
    // three alphabet blocks
    const block = (x, y, s, col, letter) => {
      c.fillStyle = col; c.fillRect(x, y, s, s); c.strokeStyle = COL.graphite; c.lineWidth = 1.2; c.strokeRect(x, y, s, s);
      c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1; c.strokeRect(x + 3, y + 3, s - 6, s - 6);
      c.fillStyle = '#ffffff'; c.font = '700 ' + Math.round(s * 0.62) + 'px Kalam, "Comic Sans MS", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letter, x + s / 2, y + s / 2 + 1);
      c.textAlign = 'left';
    };
    block(140, 82, 26, '#3f7be0', 'A'); block(168, 82, 26, '#4bb36a', 'B'); block(154, 56, 26, '#e2554b', 'C');
    // the teddy bear
    const bear = '#c58b52', dark = '#8a5a2e';
    const ell = (x, y, rx, ry, col) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = col; c.fill(p); c.strokeStyle = COL.graphite; c.lineWidth = 1.1; c.stroke(p); };
    ell(84, 94, 20, 18, bear); ell(70, 108, 8, 6, bear); ell(98, 108, 8, 6, bear);
    ell(66, 86, 6, 9, bear); ell(102, 86, 6, 9, bear);
    ell(70, 52, 7, 7, bear); ell(98, 52, 7, 7, bear); ell(70, 52, 3.4, 3.4, '#f2c9a0'); ell(98, 52, 3.4, 3.4, '#f2c9a0');
    ell(84, 64, 17, 15, bear); ell(84, 70, 7, 5, '#f2c9a0');
    c.fillStyle = COL.graphite; c.beginPath(); c.arc(78, 61, 1.8, 0, 7); c.arc(90, 61, 1.8, 0, 7); c.fill();
    c.beginPath(); c.ellipse(84, 68, 2.4, 1.6, 0, 0, 7); c.fill();
    c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.beginPath(); c.arc(84, 70, 2.4, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
    ell(84, 98, 10, 9, '#e3b483');
    c.fillStyle = '#e2554b'; c.beginPath(); c.moveTo(84, 78); c.lineTo(76, 74); c.lineTo(76, 82); c.closePath(); c.moveTo(84, 78); c.lineTo(92, 74); c.lineTo(92, 82); c.closePath(); c.fill();
    c.fillStyle = dark; c.beginPath(); c.arc(84, 78, 2, 0, 7); c.fill();
    // a spinning top
    c.save(); c.translate(206, 96); c.rotate(0.15);
    c.fillStyle = '#9b6ef0'; c.beginPath(); c.moveTo(-12, 0); c.quadraticCurveTo(0, -12, 12, 0); c.lineTo(0, 12); c.closePath(); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#ffd166'; c.fillRect(-12, -1.5, 24, 3); c.strokeStyle = COL.graphite; c.strokeRect(-12, -1.5, 24, 3);
    c.fillStyle = '#7a5a3a'; c.fillRect(-1.2, -14, 2.4, 6); c.restore();
    // the doodle, sitting on the blue block
    c.fillStyle = COL.hilite; c.fillRect(146, 68, 12, 14);
    c.strokeStyle = COL.graphite; c.lineWidth = 1.3; c.strokeRect(146.6, 68.6, 10.8, 12.8);
    c.fillStyle = COL.graphite; c.fillRect(151.5, 72.5, 1.6, 2.2); c.fillRect(155, 72.5, 1.6, 2.2);
    c.beginPath(); c.lineWidth = 0.9; c.arc(153.8, 76.6, 2.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    // signature heart
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(231, 146); c.bezierCurveTo(224, 141, 226, 136, 229, 137); c.bezierCurveTo(230, 137, 231, 138, 231, 139); c.bezierCurveTo(231, 138, 232, 137, 233, 137); c.bezierCurveTo(236, 136, 238, 141, 231, 146); c.fill();
  }
  function paintPicture7(c) {
    const g = c.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#141b38'); g.addColorStop(1, '#2c3a6a'); c.fillStyle = g; c.fillRect(0, 0, PIC.W, PIC.H);
    const sr = mulberry(111);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,245,210,${0.4 + sr() * 0.6})`; c.beginPath(); c.arc(sr() * 240, sr() * 90, 0.5 + sr() * 1.1, 0, 7); c.fill(); }
    // the full moon
    const mg = c.createRadialGradient(196, 34, 10, 196, 34, 40); mg.addColorStop(0, 'rgba(255,240,190,.45)'); mg.addColorStop(1, 'rgba(255,240,190,0)'); c.fillStyle = mg; c.fillRect(150, 0, 90, 80);
    c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(196, 34, 17, 0, 7); c.fill();
    c.fillStyle = 'rgba(200,180,120,.35)'; for (const [mx, my, mr] of [[190, 30, 3.5], [201, 40, 2.6], [203, 27, 2]]) { c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill(); }
    // the house, with a lit window
    c.fillStyle = '#5b4a62'; c.fillRect(12, 60, 64, 56); c.strokeStyle = COL.graphite; c.lineWidth = 1.2; c.strokeRect(12, 60, 64, 56);
    c.fillStyle = '#3a2f44'; c.beginPath(); c.moveTo(6, 62); c.lineTo(44, 34); c.lineTo(82, 62); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd56b'; c.fillRect(22, 72, 16, 14); c.strokeRect(22, 72, 16, 14); c.beginPath(); c.moveTo(30, 72); c.lineTo(30, 86); c.moveTo(22, 79); c.lineTo(38, 79); c.stroke();
    const wg = c.createRadialGradient(30, 79, 2, 30, 79, 26); wg.addColorStop(0, 'rgba(255,214,107,.35)'); wg.addColorStop(1, 'rgba(255,214,107,0)'); c.fillStyle = wg; c.fillRect(4, 53, 52, 52);
    c.fillStyle = '#2b2233'; c.fillRect(50, 88, 14, 28); c.strokeRect(50, 88, 14, 28);
    // the tree and its treehouse
    c.fillStyle = '#5a3b2a'; c.fillRect(158, 66, 10, 50); c.strokeRect(158, 66, 10, 50);
    c.fillStyle = '#2f5a3a'; for (const [tx, ty, tr] of [[150, 52, 16], [172, 48, 18], [162, 36, 16], [182, 64, 12], [140, 66, 11]]) { c.beginPath(); c.arc(tx, ty, tr, 0, 7); c.fill(); }
    c.fillStyle = '#9a6a3a'; c.fillRect(146, 54, 32, 16); c.strokeRect(146, 54, 32, 16);
    c.fillStyle = '#d64538'; c.beginPath(); c.moveTo(142, 55); c.lineTo(162, 42); c.lineTo(182, 55); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd56b'; c.fillRect(156, 58, 8, 7);
    // the grassy hill
    const hill = new Path2D(); hill.moveTo(0, 116); hill.quadraticCurveTo(70, 104, 130, 112); hill.quadraticCurveTo(190, 120, 240, 108); hill.lineTo(240, 150); hill.lineTo(0, 150); hill.closePath();
    crayon(c, hill, '#2f6a3e', { seed: 112, angle: -0.2, sp: 2.2, wash: 0.85, b: [0, 104, 240, 150] });
    c.strokeStyle = '#1f3d26'; c.lineWidth = 1.1; c.stroke(hill);
    // a red umbrella stuck in the grass
    c.save(); c.translate(116, 104); c.rotate(-0.25);
    c.fillStyle = '#e2554b'; c.beginPath(); c.arc(0, 0, 14, Math.PI, 0); for (let i = 0; i < 4; i++) c.quadraticCurveTo(10.5 - i * 7 + 3.5, 3.5, 7 - i * 7, 0); c.closePath(); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(0, -14); c.lineTo(0, -17); c.moveTo(0, 0); c.lineTo(0, 16); c.stroke();
    c.restore();
    // the doodle, lying on the grass, fast asleep
    c.save(); c.translate(86, 120); c.rotate(-Math.PI / 2 + 0.08);
    c.fillStyle = COL.hilite; c.fillRect(-7, -6, 14, 12); c.strokeStyle = COL.graphite; c.lineWidth = 1.2; c.strokeRect(-6.4, -5.4, 12.8, 10.8);
    c.lineWidth = 0.9; c.beginPath(); c.moveTo(-3, 2); c.lineTo(-1.5, 2); c.moveTo(-3, -1.5); c.lineTo(-1.5, -1.5); c.stroke();
    c.restore();
    c.fillStyle = 'rgba(255,245,210,.9)'; c.font = '700 8px Kalam, "Comic Sans MS", cursive'; c.fillText('z', 96, 106); c.font = '700 6px Kalam, "Comic Sans MS", cursive'; c.fillText('z', 102, 100);
    // fireflies
    for (let i = 0; i < 14; i++) { const fx = 20 + sr() * 210, fy = 70 + sr() * 70; const fg = c.createRadialGradient(fx, fy, 0, fx, fy, 5); fg.addColorStop(0, 'rgba(255,245,140,.95)'); fg.addColorStop(1, 'rgba(255,245,140,0)'); c.fillStyle = fg; c.fillRect(fx - 5, fy - 5, 10, 10); }
    // signature heart
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(231, 146); c.bezierCurveTo(224, 141, 226, 136, 229, 137); c.bezierCurveTo(230, 137, 231, 138, 231, 139); c.bezierCurveTo(231, 138, 232, 137, 233, 137); c.bezierCurveTo(236, 136, 238, 141, 231, 146); c.fill();
  }
  const PAINTERS = [paintPicture, paintPicture2, paintPicture3, paintPicture4, paintPicture5, paintPicture6, paintPicture7];
  const picCanvases = [];
  function picture(w) {
    if (!picCanvases[w]) {
      const cv = document.createElement('canvas'); cv.width = PIC.W * 3; cv.height = PIC.H * 3;
      const c = cv.getContext('2d'); c.scale(3, 3); (PAINTERS[w] || paintPicture)(c);
      picCanvases[w] = cv;
    }
    return picCanvases[w];
  }
  function gotPieces(st, w) { const g = new Set(), P = PIECE_OFS[w === undefined ? wi : w]; if (st) for (let i = 0; i < 12; i++) if (st.got.has('s' + i)) g.add(P[i]); return g; }
  function drawPuzzle(c, x, y, w, h, got, hl, widx) {
    const W = widx === undefined ? wi : widx, sx = w / PIC.W, sy = h / PIC.H, pic = picture(W);
    c.save(); c.translate(x, y); c.scale(sx, sy);
    c.fillStyle = '#e7e2d3'; c.fillRect(0, 0, PIC.W, PIC.H);
    c.save(); c.globalAlpha = 0.13; if ('filter' in c) c.filter = 'grayscale(1)'; c.drawImage(pic, 0, 0, PIC.W, PIC.H); c.restore();
    c.strokeStyle = 'rgba(46,45,53,.32)'; c.lineWidth = 1 / sx; c.setLineDash([3 / sx, 2.5 / sx]);
    for (let i = 0; i < 12; i++) if (!got.has(i)) c.stroke(piecePath(i, W));
    c.setLineDash([]);
    for (let i = 0; i < 12; i++) {
      if (!got.has(i)) continue;
      const p = piecePath(i, W);
      c.save(); c.clip(p); c.drawImage(pic, 0, 0, PIC.W, PIC.H); c.restore();
      c.strokeStyle = 'rgba(46,45,53,.45)'; c.lineWidth = 0.7 / Math.min(1, sx); c.stroke(p);
    }
    if (hl !== undefined && hl >= 0) { c.strokeStyle = 'rgba(255,200,0,.95)'; c.lineWidth = 3.2 / Math.min(1.2, sx); c.stroke(piecePath(hl, W)); }
    c.restore();
  }

  /* ================= room art (cached per room) ================= */
  const DECOR = {
    margin: [['note', 1.6, 1.9, 'somebody tore my drawing to bits'], ['note', 1.6, 2.85, 'I need all 12 scraps back'], ['arrow', 16.3, 8.4, 0], ['star', 5.5, 5.6], ['ring', 15.2, 1.6], ['note', 1.3, 7.1, 'cellar']],
    hall: [['note', 1.5, 1.9, 'psst... look down there'], ['arrow', 5.9, 8.5, Math.PI / 2], ['spiral', 16.8, 6.6], ['star', 8.2, 3.2]],
    cellar: [['note', 6.4, 1.8, 'scribbles everywhere!'], ['star', 7.6, 7.8], ['spiral', 16.8, 8.2]],
    nook: [['note', 10.6, 6.4, 'rub out the scribbles'], ['arrow', 16.4, 7.4, 0], ['heart', 16.5, 2.4], ['star', 13.4, 2.2]],
    tower: [['note', 7.2, 19.2, 'jump, then jump again in midair'], ['note', 7.2, 20.1, 'to draw a line, then jump off it'], ['spiral', 9.5, 9.4], ['star', 15.6, 15.4], ['ring', 3.2, 6.6]],
    gallery: [['note', 4.8, 1.9, 'dotted lines tear right open'], ['note', 4.8, 2.8, 'if you dash into them'], ['arrow', 13.1, 8.4, 0], ['frame', 13.4, 3.6], ['tape', 0.2, 0.2]],
    inkwell: [['note', 1.4, 2.6, 'jump, dash, draw a line,'], ['note', 1.4, 3.5, 'then jump and dash again'], ['ring', 3.5, 5.3]],
    lookout: [['note', 6.2, 1.9, 'flip the page!'], ['note', 6.2, 2.85, 'blue is solid on the front,'], ['note', 6.2, 3.75, 'red is solid on the back'], ['star', 16.5, 4.4]],
    rooftops: [['note', 22.4, 2.1, 'flip in midair to swap'], ['note', 22.4, 3.05, 'which blocks are there'], ['star', 9.5, 2.2], ['star', 31, 1.6], ['spiral', 4.5, 6.6]],
    attic: [['note', 5.4, 2.2, 'almost home...'], ['arrow', 6.95, 8.6, Math.PI / 2], ['cat', 14.2, 9.3], ['heart', 3.2, 6.4]],
    // world 2: the desk
    desk: [['note', 1.5, 1.9, 'the desk! 12 more scraps out here'], ['note', 1.5, 2.85, 'for a brand new drawing'], ['clip', 4.6, 5.8], ['arrow', 16.3, 8.4, 0], ['crumbs', 12.5, 9.7]],
    sticky: [['note', 11.4, 2.2, 'tape sticks to paper and wood,'], ['note', 11.4, 3.15, 'but never to shiny plastic'], ['arrow', 15.5, 7.2, Math.PI / 2]],
    cup: [['note', 8.6, 13.2, 'hold toward a wall'], ['note', 8.6, 14.1, 'and keep jumping to climb'], ['star', 3, 17]],
    stapler: [['stapler', 4.4, 7.6], ['note', 5.0, 1.9, 'mind the tacks'], ['arrow', 12.4, 3.1, 0]],
    keys: [['note', 7.4, 3.3, 'rub out the scribble'], ['crumbs', 15.5, 9.7]],
    coffee: [['note', 7.0, 8.3, 'the page flips here too'], ['star', 15, 7]],
    fan: [['note', 13.3, 4.3, 'updrafts only lift'], ['note', 13.3, 5.25, 'a paper airplane']],
    lamp: [['lampArm', 3, 5], ['note', 13.4, 1.7, 'almost there']],
    shelf: [['note', 16.5, 2.0, 'hold jump to glide across'], ['clip', 24, 7.4]],
    // world 3: art class
    art: [['note', 1.3, 1.9, 'Art Class! 12 more scraps'], ['note', 1.3, 2.85, 'and a paintbrush somewhere'], ['arrow', 9.5, 2.6, -Math.PI / 2], ['splat', 15, 8.6]],
    easel: [['note', 7.3, 1.9, 'wet paint! only'], ['note', 7.3, 2.85, 'that color gets through'], ['splat', 4, 7.4]],
    cabinet: [['note', 1.5, 7.3, 'dip into a pot to change color'], ['splat', 8, 18]],
    clay: [['note', 6, 2.2, 'squish!'], ['note', 6.6, 6.2, 'rub out the scribble'], ['splat', 9, 3.6]],
    sink: [['note', 6.4, 2.2, 'drip... drip...'], ['splat', 10, 6]],
    crayon: [['note', 7.5, 5.25, 'violet only']],
    scissors: [['note', 2, 2.2, 'snip snip!'], ['arrow', 14.6, 2.3, 0]],
    rack: [['note', 6, 1.9, 'paintings drying, do not touch'], ['splat', 30, 6]],
    loft: [['note', 2, 1.9, 'so much glitter']],
    kiln: [['note', 5.6, 1.9, 'hot air rises'], ['note', 5.6, 2.85, 'only violet gets in']],
    // world 7: the backyard at night
    porch: [['note', 7, 1.9, 'the backyard at night'], ['note', 7, 2.85, 'the last 12 scraps!'], ['note', 6.6, 8.2, 'rain from the gutter']],
    lawn: [['note', 1.4, 1.9, 'downpours shove you down,'], ['note', 1.4, 2.85, 'but you can still walk through']],
    pond: [['note', 1.4, 6.2, 'ribbit'], ['note', 13.2, 7.2, 'drip']],
    shed: [['note', 6.6, 1.9, 'the garden shed'], ['note', 1.4, 3.2, 'what is this?']],
    sandbox: [['note', 1.5, 1.9, 'sandcastles by moonlight']],
    garden: [['note', 8.6, 2.2, 'tomatoes, carrots, peas...'], ['note', 8.6, 3.15, 'and very soggy dirt']],
    doghouse: [['note', 1.5, 1.9, 'shh, the dog is asleep']],
    treehouse: [['note', 6.6, 1.9, 'the treehouse!'], ['note', 12.6, 15.2, 'climb up...'], ['note', 12.6, 16.15, 'if the rain lets you']],
    roof: [['note', 18, 1.9, 'up on the roof'], ['note', 18, 2.85, 'look at all the stars']],
    moon: [['note', 1.4, 1.9, 'so close to the moon']],
    // world 6: the toy box
    lid: [['note', 6.5, 1.9, 'the toy box! 12 more scraps'], ['note', 6.5, 2.85, 'and a bouncy surprise'], ['arrow', 3.5, 0.9, -Math.PI / 2]],
    train: [['note', 1.5, 1.9, 'choo choo!']],
    plush: [['note', 9, 1.9, 'so soft'], ['note', 7.6, 5.2, 'tear through it']],
    marbles: [['note', 12, 5.2, 'whee!'], ['arrow', 18.3, 8.4, 0]],
    jack: [['note', 1.4, 1.9, 'jump again the moment you land'], ['note', 1.4, 2.85, 'to bounce higher and higher'], ['arrow', 13.5, 1.3, 0]],
    blocks: [['note', 1.4, 1.9, 'plastic blocks:'], ['note', 1.4, 2.85, 'no tape, just bounce']],
    dollhouse: [['note', 6, 1.9, 'the attic'], ['note', 7, 18.2, 'boing, boing, BOING'], ['arrow', 15.9, 17.4, -Math.PI / 2]],
    toyshelf: [['note', 14, 1.9, 'the top shelf'], ['note', 14, 2.85, 'way up high']],
    kite: [['note', 12.4, 2.2, 'catch the breeze']],
    rocket: [['note', 4, 1.9, '3... 2... 1...'], ['note', 4, 2.85, 'liftoff!']],
    // world 5: the library
    lobby: [['note', 6.5, 1.9, 'the library! 12 more scraps'], ['note', 6.5, 2.85, 'shhh...'], ['note', 1.2, 3.6, 'a story door'], ['arrow', 2.2, 4.0, Math.PI * 0.75], ['books', 9, 9.2]],
    reading: [['note', 10.5, 1.9, 'quiet please'], ['lampG', 15, 7.6], ['books', 3, 9.2]],
    stacks: [['note', 12.4, 2.2, 'every door has a twin'], ['note', 12.4, 3.15, 'with the same color and mark'], ['books', 13, 21.2]],
    kids: [['note', 9.2, 9.3, 'story time!'], ['blocks', 14, 9]],
    catalog: [['note', 1.3, 1.9, 'the card catalog'], ['note', 1.3, 2.85, 'your library card is up there'], ['arrow', 14.2, 2.5, 0]],
    atlas: [['note', 1.3, 1.9, 'here be dragons'], ['globe', 5, 6.6]],
    archive: [['note', 9.2, 6.3, 'old newspapers. very dusty.'], ['books', 2, 9.2]],
    balcony: [['note', 2, 1.9, 'the mezzanine'], ['note', 24, 2.2, 'mind the pen nibs'], ['books', 5, 9.2], ['books', 33, 2.2]],
    dome: [['note', 10.4, 2.2, 'the reading dome'], ['note', 10.4, 3.15, 'glide up the warm air']],
    rare: [['note', 5.6, 1.9, 'rare books. do not touch!'], ['books', 15, 9.2]],
    // world 4: kitchen fridge
    counter: [['note', 8, 1.9, 'the kitchen! 12 more scraps'], ['note', 8, 2.85, 'and something magnetic'], ['arrow', 16.3, 8.4, 0], ['crumbs', 12, 9.7]],
    toaster: [['note', 1.3, 1.9, 'hot crumbs!'], ['crumbs', 2.5, 9.7], ['arrow', 9.5, 2.6, -Math.PI / 2]],
    cereal: [['note', 8.5, 2.2, 'a magnet in the cereal!'], ['fmag', 15, 6]],
    door: [['note', 1.5, 11.2, 'press Dash near a bolt to zip to it'], ['note', 1.5, 12.15, 'then Dash again to zip to the next one'], ['drawing', 8.4, 2.6], ['list', 2, 16.3], ['fmag', 9.5, 19.2]],
    freezer: [['note', 7, 17.2, 'ice is slippery,'], ['note', 7, 18.15, 'and tape will not stick to it'], ['flake', 10, 6], ['flake', 16, 14.5], ['flake', 8.5, 2.5]],
    icetray: [['note', 6, 1.9, 'brrr!'], ['flake', 15, 3], ['flake', 2, 5]],
    crisper: [['note', 1.4, 2.4, 'rub out the scribble'], ['note', 15, 3, 'lettuce in!']],
    spice: [['note', 1.5, 4.2, 'a pinch of salt'], ['note', 1.5, 5.15, 'and a dash of magnet']],
    fridgetop: [['note', 9, 6.2, 'so dusty up here'], ['fmag', 13, 2.4]],
    jars: [['note', 7, 2.2, 'jam jars, all sealed shut'], ['fmag', 16, 6]],
    tray: [['note', 1.3, 1.9, 'hold jump while you fall'], ['note', 1.3, 2.85, 'to glide'], ['note', 7.6, 5.0, 'shiny plastic: no tape']],
    cork: [['note', 4.6, 1.75, 'glide, stick, climb, repeat'], ['pins', 16, 6], ['pins', 5.5, 16], ['pins', 16.4, 15], ['note', 15.2, 10.3, 'tacks below!']],
  };
  function paintPaper(c, r) {
    const x = r.px, y = r.py, w = r.pw, h = r.ph, st = r.paper;
    c.fillStyle = { ruled: '#f7f5ee', graph: '#f1f5f0', dots: '#f8f4ea', blank: '#fbf9f3', kraft: '#e4d2ad', wood: '#ecd7ae', sticky: '#fbf4d2', cup: '#dde6ee', keys: '#e3e4e9', coffee: '#ecd7ae', fan: '#e8dcc5', lamp: '#2a3354', shelf: '#e2c79c', tray: '#eceef3', cork: '#cfa678', easel: '#f5f0e6', construction: '#fbeee6', cabinet: '#ecdfc9', clay: '#ddd3c8', sinktile: '#eef4f7', crayonbox: '#f7ecbf', scissors: '#eaf1fb', rack: '#f4f0e7', glitter: '#3a2b57', kiln: '#ecd0b2', backsplash: '#f3f6f4', chrome: '#dfe4ea', fridgedoor: '#f5f7f6', freezer: '#e1f0f7', crisper: '#e8f3e3', pantry: '#ecdcbf', fridgetop: '#efede7', wallpaper: '#efe6d6', reading: '#e1e9d8', shelves: '#eadcc3', kids: '#fdf3e1', catalog: '#dcc39b', atlas: '#efe2c0', archive: '#2d2b33', balcony: '#ece2d0', dome: '#1f2a4a', vault: '#24372e', toybox: '#efd6ae', trainset: '#eef3e6', plush: '#fbe6ee', marbles: '#eaf2fb', jackbox: '#fbf0dd', blocks: '#f4efe4', dollhouse: '#fbeef0', toyshelf: '#ead2a8', kite: '#eef7ff', rocket: '#1d2140', porch: '#2a2433', lawn: '#1b2a3a', pond: '#14263a', shed: '#2b2522', sandbox: '#26283a', garden: '#1d2a26', doghouse: '#2c2128', treehouse: '#20261f', rooftop: '#1a2140', moonhill: '#1c2140' }[st] || '#f7f5ee';
    c.fillRect(x, y, w, h);
    const rr = mulberry(r.x0 * 7 + r.y0 * 13 + 1);
    c.fillStyle = st === 'kraft' ? 'rgba(90,60,30,.10)' : 'rgba(80,70,50,.05)';
    for (let i = 0; i < w * h / 70; i++) c.fillRect(x + rr() * w, y + rr() * h, 1, 1);
    c.lineWidth = 0.8;
    if (st === 'ruled') {
      c.strokeStyle = 'rgba(100,145,205,.45)';
      for (let yy = y + 16; yy < y + h; yy += 16) { c.beginPath(); c.moveTo(x, yy - 0.5); c.lineTo(x + w, yy - 0.5); c.stroke(); }
      if (r.id === 'margin') { c.strokeStyle = 'rgba(212,71,61,.5)'; c.lineWidth = 1; for (const mx of [x + 44, x + 46.5]) { c.beginPath(); c.moveTo(mx, y); c.lineTo(mx, y + h); c.stroke(); } }
    } else if (st === 'graph') {
      for (let gx = x; gx <= x + w; gx += 8) { c.strokeStyle = (gx - x) % 16 ? 'rgba(70,150,140,.12)' : 'rgba(70,150,140,.30)'; c.beginPath(); c.moveTo(gx + 0.5, y); c.lineTo(gx + 0.5, y + h); c.stroke(); }
      for (let gy = y; gy <= y + h; gy += 8) { c.strokeStyle = (gy - y) % 16 ? 'rgba(70,150,140,.12)' : 'rgba(70,150,140,.30)'; c.beginPath(); c.moveTo(x, gy + 0.5); c.lineTo(x + w, gy + 0.5); c.stroke(); }
    } else if (st === 'dots') {
      c.fillStyle = 'rgba(90,110,165,.38)';
      for (let gy = y + 16; gy < y + h; gy += 16) for (let gx = x + 16; gx < x + w; gx += 16) { c.beginPath(); c.arc(gx, gy, 0.8, 0, 7); c.fill(); }
    } else if (st === 'kraft') {
      c.strokeStyle = 'rgba(120,85,45,.16)';
      for (let i = 0; i < w * h / 260; i++) { const fx = x + rr() * w, fy = y + rr() * h, a = rr() * Math.PI; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + Math.cos(a) * 5, fy + Math.sin(a) * 5); c.stroke(); }
    }
    const woody = st === 'wood' || st === 'coffee' || st === 'fan' || st === 'shelf' || st === 'lamp';
    if (woody) {
      c.strokeStyle = st === 'lamp' ? 'rgba(160,170,220,.08)' : 'rgba(150,100,55,.17)'; c.lineWidth = 0.9;
      for (let yy = y + 5; yy < y + h; yy += 7 + rr() * 6) {
        const ph = rr() * 6, amp = 0.8 + rr() * 1.6;
        c.beginPath(); c.moveTo(x, yy);
        for (let xx = x; xx <= x + w; xx += 16) c.lineTo(xx, yy + Math.sin(xx / 37 + ph) * amp);
        c.stroke();
      }
      if (st !== 'lamp') for (let i = 0; i < w * h / 26000; i++) { const kx = x + rr() * w, ky = y + rr() * h; c.beginPath(); c.ellipse(kx, ky, 5, 2.4, 0, 0, 7); c.ellipse(kx, ky, 2.5, 1.1, 0, 0, 7); c.stroke(); }
    }
    if (st === 'sticky') {
      const cols = ['rgba(255,236,110,.45)', 'rgba(255,190,215,.4)', 'rgba(185,230,255,.45)'];
      for (let i = 0; i < 7; i++) {
        const nx = x + 10 + rr() * (w - 70), ny = y + 10 + rr() * (h - 70), sz = 40 + rr() * 20;
        c.save(); c.translate(nx + sz / 2, ny + sz / 2); c.rotate((rr() - 0.5) * 0.4);
        c.fillStyle = cols[i % 3]; c.fillRect(-sz / 2, -sz / 2, sz, sz);
        c.strokeStyle = 'rgba(120,110,60,.15)'; c.lineWidth = 0.8;
        for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(-sz / 2 + 6, -sz / 2 + 12 + k * 8); c.lineTo(sz / 2 - 6 - rr() * 10, -sz / 2 + 12 + k * 8); c.stroke(); }
        c.restore();
      }
    } else if (st === 'cup') {
      c.strokeStyle = 'rgba(80,100,130,.13)'; c.lineWidth = 2;
      for (let gx = x + 4; gx < x + w; gx += 9) { c.beginPath(); c.moveTo(gx, y); c.lineTo(gx, y + h); c.stroke(); }
      c.fillStyle = 'rgba(80,100,130,.07)'; for (let gy = y + 40; gy < y + h; gy += 96) c.fillRect(x, gy, w, 10);
    } else if (st === 'keys') {
      c.lineWidth = 0.9;
      for (let ky = y + 6; ky < y + h - 20; ky += 34) for (let kx = x + 4 + ((ky - y) / 34 % 2) * 14; kx < x + w - 24; kx += 34) {
        rrect(c, kx, ky, 28, 28, 4); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill(); c.strokeStyle = 'rgba(80,80,95,.2)'; c.stroke();
      }
    } else if (st === 'coffee') {
      for (const [cx, cy, rad] of [[x + w * 0.66, y + h * 0.42, 46], [x + w * 0.3, y + h * 0.7, 30]]) {
        c.strokeStyle = 'rgba(120,70,30,.20)'; c.lineWidth = 7; c.beginPath(); c.arc(cx, cy, rad, 0.2, Math.PI * 2 - 0.4); c.stroke();
        c.strokeStyle = 'rgba(120,70,30,.28)'; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, rad + 3, 0, 7); c.stroke();
      }
    } else if (st === 'fan') {
      const cx = x + 10 * T, cy = y + 6 * T;
      c.strokeStyle = 'rgba(80,85,100,.16)'; c.lineWidth = 1.4;
      for (const rad of [40, 62, 84]) { c.beginPath(); c.arc(cx, cy, rad, 0, 7); c.stroke(); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); c.lineTo(cx + Math.cos(a) * 84, cy + Math.sin(a) * 84); c.stroke(); }
    } else if (st === 'lamp') {
      const g = c.createRadialGradient(x + 3.5 * T, y + 6 * T, 4, x + 3.5 * T, y + 6 * T, 150);
      g.addColorStop(0, 'rgba(255,214,140,.55)'); g.addColorStop(0.5, 'rgba(255,190,110,.16)'); g.addColorStop(1, 'rgba(255,190,110,0)');
      c.fillStyle = g; c.fillRect(x, y, w, h);
    } else if (st === 'shelf') {
      const palette = ['rgba(120,60,60,.30)', 'rgba(60,90,130,.30)', 'rgba(70,120,80,.30)', 'rgba(150,120,60,.30)', 'rgba(100,80,130,.30)'];
      let bx = x + 20;
      while (bx < x + w - 20) {
        const bw = 9 + rr() * 9, bh = 34 + rr() * 26;
        c.fillStyle = palette[Math.floor(rr() * palette.length)]; c.fillRect(bx, y + 16 + 70 - bh, bw, bh);
        c.strokeStyle = 'rgba(60,40,20,.18)'; c.lineWidth = 0.7; c.strokeRect(bx, y + 16 + 70 - bh, bw, bh);
        bx += bw + (rr() < 0.15 ? 26 : 1.5);
      }
    } else if (st === 'easel') {
      c.strokeStyle = 'rgba(150,130,100,.10)'; c.lineWidth = 0.6;
      for (let gx = x; gx < x + w; gx += 3) { c.beginPath(); c.moveTo(gx, y); c.lineTo(gx, y + h); c.stroke(); }
      for (let gy = y; gy < y + h; gy += 3) { c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke(); }
      const cols = ['rgba(255,140,46,.18)', 'rgba(79,191,90,.16)', 'rgba(155,110,240,.16)', 'rgba(63,123,224,.15)'];
      for (let i = 0; i < 9; i++) { c.fillStyle = cols[i % 4]; c.beginPath(); c.ellipse(x + rr() * w, y + rr() * h, 10 + rr() * 16, 6 + rr() * 9, rr() * 3, 0, 7); c.fill(); }
    } else if (st === 'construction' || st === 'scissors') {
      const cols = st === 'construction' ? ['rgba(255,180,160,.45)', 'rgba(170,215,255,.45)', 'rgba(190,240,170,.45)'] : ['rgba(255,220,140,.45)', 'rgba(255,190,220,.4)', 'rgba(200,190,255,.4)'];
      for (let i = 0; i < 6; i++) {
        const cx = x + rr() * w, cy = y + rr() * h, rad = 28 + rr() * 34;
        c.fillStyle = cols[i % 3]; c.beginPath();
        for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, rd = rad * (0.7 + rr() * 0.4); k ? c.lineTo(cx + Math.cos(a) * rd, cy + Math.sin(a) * rd) : c.moveTo(cx + Math.cos(a) * rd, cy + Math.sin(a) * rd); }
        c.closePath(); c.fill();
      }
      if (st === 'scissors') { c.save(); c.strokeStyle = 'rgba(46,45,53,.22)'; c.setLineDash([5, 4]); c.lineWidth = 1; for (let k = 0; k < 3; k++) { const yy = y + 30 + k * 60; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy + 10); c.stroke(); } c.restore(); }
    } else if (st === 'cabinet') {
      c.strokeStyle = 'rgba(120,80,40,.16)'; c.lineWidth = 1;
      for (let gx = x + 40; gx < x + w; gx += 80) { c.beginPath(); c.moveTo(gx, y); c.lineTo(gx, y + h); c.stroke(); }
      const tubes = ['#ff8c2e', '#4fbf5a', '#9b6ef0', '#3f7be0', '#e2554b', '#f2c230'];
      for (let i = 0; i < 16; i++) { const tx2 = x + rr() * (w - 12), ty2 = y + rr() * (h - 8); c.fillStyle = tubes[i % 6]; c.globalAlpha = 0.22; c.fillRect(tx2, ty2, 12, 5); c.fillStyle = '#ffffff'; c.fillRect(tx2 + 9, ty2, 3, 5); c.globalAlpha = 1; }
    } else if (st === 'clay') {
      c.strokeStyle = 'rgba(110,90,70,.16)'; c.lineWidth = 0.9;
      for (let i = 0; i < 7; i++) { const cx = x + rr() * w, cy = y + rr() * h; for (let k = 2; k < 14; k += 2.5) { c.beginPath(); c.ellipse(cx, cy, k * 1.3, k, 0.3, 0, 7); c.stroke(); } }
    } else if (st === 'sinktile') {
      c.strokeStyle = 'rgba(120,150,170,.30)'; c.lineWidth = 1.4;
      for (let gx = x; gx <= x + w; gx += 32) { c.beginPath(); c.moveTo(gx, y); c.lineTo(gx, y + h); c.stroke(); }
      for (let gy = y; gy <= y + h; gy += 32) { c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke(); }
    } else if (st === 'crayonbox') {
      const cols = ['rgba(226,85,75,.16)', 'rgba(63,123,224,.16)', 'rgba(79,191,90,.16)', 'rgba(155,110,240,.16)', 'rgba(255,140,46,.16)'];
      for (let i = 0, gx = x - h; gx < x + w; gx += 22, i++) { c.fillStyle = cols[i % 5]; c.beginPath(); c.moveTo(gx, y + h); c.lineTo(gx + 12, y + h); c.lineTo(gx + 12 + h, y); c.lineTo(gx + h, y); c.closePath(); c.fill(); }
    } else if (st === 'rack') {
      c.strokeStyle = 'rgba(90,80,70,.35)'; c.lineWidth = 1;
      for (const sy of [y + 22, y + 120]) {
        c.beginPath(); c.moveTo(x, sy); c.quadraticCurveTo(x + w / 2, sy + 10, x + w, sy); c.stroke();
        for (let px2 = x + 30; px2 < x + w - 30; px2 += 70 + rr() * 30) {
          const pw2 = 26 + rr() * 16, cols = ['rgba(255,140,46,.25)', 'rgba(79,191,90,.25)', 'rgba(63,123,224,.22)', 'rgba(226,85,75,.22)'];
          c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(px2, sy + 4, pw2, pw2 * 0.75);
          c.fillStyle = cols[Math.floor(rr() * 4)]; c.beginPath(); c.ellipse(px2 + pw2 / 2, sy + 4 + pw2 * 0.37, pw2 * 0.3, pw2 * 0.22, 0, 0, 7); c.fill();
          c.strokeStyle = 'rgba(90,80,70,.3)'; c.strokeRect(px2, sy + 4, pw2, pw2 * 0.75);
          c.fillStyle = 'rgba(160,120,70,.55)'; c.fillRect(px2 + 3, sy - 2, 3, 8); c.fillRect(px2 + pw2 - 6, sy - 2, 3, 8);
        }
      }
    } else if (st === 'glitter') {
      for (let i = 0; i < w * h / 120; i++) { const gx = x + rr() * w, gy = y + rr() * h, col = ['#ffd6f6', '#fff3a0', '#a8e6ff', '#d6c4ff'][i % 4]; c.fillStyle = col; c.globalAlpha = 0.25 + rr() * 0.5; c.fillRect(gx, gy, 1.4, 1.4); }
      c.globalAlpha = 1;
    } else if (st === 'kiln') {
      c.strokeStyle = 'rgba(140,70,40,.22)'; c.lineWidth = 1;
      for (let gy = y, row = 0; gy < y + h; gy += 12, row++) {
        c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke();
        for (let gx = x + (row % 2) * 14; gx < x + w; gx += 28) { c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx, gy + 12); c.stroke(); }
      }
      const g = c.createLinearGradient(0, y + h, 0, y); g.addColorStop(0, 'rgba(255,140,60,.22)'); g.addColorStop(1, 'rgba(255,140,60,0)'); c.fillStyle = g; c.fillRect(x, y, w, h);
    } else if (st === 'cork') {
      for (let i = 0; i < w * h / 9; i++) { c.fillStyle = rr() < 0.5 ? 'rgba(110,70,30,.22)' : 'rgba(255,235,200,.25)'; c.fillRect(x + rr() * w, y + rr() * h, 1 + rr() * 1.5, 1 + rr() * 1.5); }
      c.strokeStyle = 'rgba(90,60,30,.35)'; c.lineWidth = 6; c.strokeRect(x + 3, y + 3, w - 6, h - 6);
    } else if (st === 'backsplash') {
      c.strokeStyle = 'rgba(120,140,150,.28)'; c.lineWidth = 1;
      for (let gy = y, row = 0; gy < y + h; gy += 12, row++) {
        c.beginPath(); c.moveTo(x, gy + 0.5); c.lineTo(x + w, gy + 0.5); c.stroke();
        for (let gx = x + (row % 2) * 12; gx < x + w; gx += 24) { c.beginPath(); c.moveTo(gx + 0.5, gy); c.lineTo(gx + 0.5, gy + 12); c.stroke(); }
      }
      c.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < w * h / 900; i++) c.fillRect(x + rr() * w, y + rr() * h, 6, 1.2);
    } else if (st === 'chrome') {
      for (let gx = x; gx < x + w; gx += 2) { c.fillStyle = `rgba(${rr() < 0.5 ? '255,255,255' : '90,100,115'},${0.04 + rr() * 0.06})`; c.fillRect(gx, y, 2, h); }
      const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,.35)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x, y, w, h);
    } else if (st === 'fridgedoor') {
      const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(180,195,205,.18)'); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(140,155,165,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + w - 8, y); c.lineTo(x + w - 8, y + h); c.stroke();
    } else if (st === 'freezer') {
      for (let i = 0; i < w * h / 40; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + rr() * 0.5})`; c.fillRect(x + rr() * w, y + rr() * h, 1 + rr(), 1 + rr()); }
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(120,180,215,.12)'); c.fillStyle = g; c.fillRect(x, y, w, h);
    } else if (st === 'crisper') {
      c.strokeStyle = 'rgba(90,140,90,.14)'; c.lineWidth = 1.5;
      for (let gy = y + 6; gy < y + h; gy += 7) { c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke(); }
      for (let i = 0; i < 5; i++) {
        const vx = x + 20 + rr() * (w - 40), vy = y + 20 + rr() * (h - 40);
        if (i % 2) { c.fillStyle = 'rgba(255,140,46,.22)'; c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx + 26, vy + 4); c.lineTo(vx, vy + 8); c.closePath(); c.fill(); c.fillStyle = 'rgba(79,191,90,.25)'; c.fillRect(vx - 6, vy + 2, 6, 4); }
        else { c.fillStyle = 'rgba(79,191,90,.11)'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(vx + Math.cos(k * 1.3) * 7, vy + Math.sin(k * 1.3) * 6, 8, 0, 7); c.fill(); } }
      }
    } else if (st === 'pantry') {
      c.strokeStyle = 'rgba(150,100,55,.17)'; c.lineWidth = 0.9;
      for (let yy = y + 5; yy < y + h; yy += 8 + rr() * 6) { c.beginPath(); c.moveTo(x, yy); for (let xx = x; xx <= x + w; xx += 16) c.lineTo(xx, yy + Math.sin(xx / 31) * 1.2); c.stroke(); }
      const box = ['rgba(226,85,75,.22)', 'rgba(242,194,48,.28)', 'rgba(63,123,224,.2)', 'rgba(79,191,90,.22)'];
      for (let bx = x + 70; bx < x + w - 30; bx += 22 + rr() * 26) { const bh = 30 + rr() * 22, bw = 16 + rr() * 6; c.fillStyle = box[Math.floor(rr() * 4)]; c.fillRect(bx, y + 112 - bh, bw, bh); c.strokeStyle = 'rgba(80,55,30,.18)'; c.strokeRect(bx, y + 112 - bh, bw, bh); }
    } else if (st === 'fridgetop') {
      for (let i = 0; i < w * h / 50; i++) { c.fillStyle = `rgba(120,110,95,${0.06 + rr() * 0.1})`; c.fillRect(x + rr() * w, y + rr() * h, 1.2, 1.2); }
      c.strokeStyle = 'rgba(150,140,120,.14)'; c.lineWidth = 0.8; for (let i = 0; i < 9; i++) { const fx = x + rr() * w, fy = y + rr() * h; c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx + 6, fy - 4, fx + 12, fy + 1); c.stroke(); }
    } else if (st === 'wallpaper') {
      c.fillStyle = 'rgba(140,90,60,.08)';
      for (let gy = y + 8; gy < y + h; gy += 24) for (let gx = x + ((gy - y) / 24 % 2) * 12 + 6; gx < x + w; gx += 24) { c.beginPath(); c.moveTo(gx, gy - 6); c.lineTo(gx + 5, gy); c.lineTo(gx, gy + 6); c.lineTo(gx - 5, gy); c.closePath(); c.fill(); }
      c.fillStyle = 'rgba(120,70,40,.12)'; c.fillRect(x, y + h - 64, w, 64);
      c.strokeStyle = 'rgba(120,70,40,.25)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y + h - 64); c.lineTo(x + w, y + h - 64); c.stroke();
    } else if (st === 'reading') {
      c.strokeStyle = 'rgba(70,100,70,.14)'; c.lineWidth = 1;
      for (let gx = x + 20; gx < x + w; gx += 40) c.strokeRect(gx - 14, y + 10, 28, h - 20);
      const g = c.createRadialGradient(x + w * 0.6, y + h * 0.65, 6, x + w * 0.6, y + h * 0.65, 150); g.addColorStop(0, 'rgba(255,220,140,.32)'); g.addColorStop(1, 'rgba(255,220,140,0)'); c.fillStyle = g; c.fillRect(x, y, w, h);
    } else if (st === 'shelves') {
      const pal = ['rgba(150,60,55,.26)', 'rgba(55,85,135,.26)', 'rgba(70,120,80,.26)', 'rgba(160,125,60,.28)', 'rgba(110,80,130,.26)', 'rgba(60,110,120,.24)'];
      for (let sy = y + 4; sy < y + h - 20; sy += 48) {
        let bx = x + 2;
        while (bx < x + w - 6) { const bw = 6 + rr() * 7, bh = 26 + rr() * 14; c.fillStyle = pal[Math.floor(rr() * pal.length)]; c.fillRect(bx, sy + 40 - bh, bw, bh); bx += bw + (rr() < 0.08 ? 14 : 0.8); }
        c.fillStyle = 'rgba(110,70,35,.28)'; c.fillRect(x, sy + 40, w, 5);
      }
    } else if (st === 'kids') {
      const cols = ['rgba(226,85,75,.18)', 'rgba(63,123,224,.18)', 'rgba(242,194,48,.25)', 'rgba(79,191,90,.2)'];
      for (let i = 0; i < w * h / 1400; i++) { c.fillStyle = cols[i % 4]; c.beginPath(); c.arc(x + rr() * w, y + rr() * h, 3 + rr() * 6, 0, 7); c.fill(); }
      c.font = '700 14px Kalam, "Comic Sans MS", cursive'; c.textBaseline = 'middle';
      'ABCDEFG'.split('').forEach((ch, i) => { c.fillStyle = cols[i % 4]; c.fillText(ch, x + 30 + i * 44, y + h - 40 + (i % 2) * 8); });
    } else if (st === 'catalog') {
      for (let gy = y + 4; gy < y + h - 4; gy += 22) for (let gx = x + 4; gx < x + w - 4; gx += 30) {
        c.fillStyle = 'rgba(255,240,215,.22)'; c.fillRect(gx, gy, 27, 19); c.strokeStyle = 'rgba(110,70,35,.25)'; c.lineWidth = 0.8; c.strokeRect(gx, gy, 27, 19);
        c.fillStyle = 'rgba(190,150,70,.5)'; c.fillRect(gx + 10, gy + 12, 7, 2.4); c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(gx + 9, gy + 4, 9, 5);
      }
    } else if (st === 'atlas') {
      c.strokeStyle = 'rgba(140,100,50,.18)'; c.lineWidth = 0.8;
      for (let gx = x; gx < x + w; gx += 32) { c.beginPath(); c.moveTo(gx, y); c.quadraticCurveTo(gx + 10, y + h / 2, gx, y + h); c.stroke(); }
      for (let gy = y; gy < y + h; gy += 32) { c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke(); }
      c.strokeStyle = 'rgba(80,110,140,.28)'; c.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { c.beginPath(); let px2 = x + rr() * w, py2 = y + rr() * h; c.moveTo(px2, py2); for (let i = 0; i < 9; i++) { px2 += (rr() - 0.4) * 30; py2 += (rr() - 0.5) * 24; c.lineTo(px2, py2); } c.stroke(); }
    } else if (st === 'archive' || st === 'vault') {
      if (st === 'archive') {
        c.strokeStyle = 'rgba(200,190,170,.12)'; c.lineWidth = 1;
        for (let gy = y + 30; gy < y + h; gy += 46) for (let gx = x + 8; gx < x + w - 30; gx += 34 + rr() * 10) c.strokeRect(gx, gy - 18 - rr() * 6, 26, 18);
      } else {
        c.strokeStyle = 'rgba(230,190,90,.14)'; c.lineWidth = 0.9;
        for (let gy = y + 12; gy < y + h; gy += 24) for (let gx = x + ((gy - y) / 24 % 2) * 12 + 6; gx < x + w; gx += 24) { c.beginPath(); c.arc(gx, gy, 5, 0, 7); c.stroke(); }
      }
    } else if (st === 'balcony') {
      c.strokeStyle = 'rgba(120,80,50,.16)'; c.lineWidth = 1.2;
      for (let gx = x + 40; gx < x + w; gx += 80) { c.beginPath(); c.moveTo(gx - 30, y + h - 40); c.lineTo(gx - 30, y + 50); c.arc(gx, y + 50, 30, Math.PI, 0); c.lineTo(gx + 30, y + h - 40); c.stroke(); }
      c.strokeStyle = 'rgba(120,80,50,.22)'; c.lineWidth = 2;
      for (let gx = x + 6; gx < x + w; gx += 10) { c.beginPath(); c.moveTo(gx, y + h - 54); c.lineTo(gx, y + h - 34); c.stroke(); }
      c.beginPath(); c.moveTo(x, y + h - 54); c.lineTo(x + w, y + h - 54); c.stroke();
    } else if (st === 'dome') {
      for (let i = 0; i < w * h / 160; i++) { c.fillStyle = `rgba(255,240,200,${0.2 + rr() * 0.6})`; c.beginPath(); c.arc(x + rr() * w, y + rr() * h * 0.8, 0.5 + rr() * 0.9, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(200,210,255,.12)'; c.lineWidth = 1.4;
      for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(x + w / 2, y - 40); c.lineTo(x + w / 2 + k * 70, y + h); c.stroke(); }
    } else if (st === 'toybox') {
      c.strokeStyle = 'rgba(150,100,55,.17)'; c.lineWidth = 0.9;
      for (let yy = y + 5; yy < y + h; yy += 7 + rr() * 6) { const ph = rr() * 6; c.beginPath(); c.moveTo(x, yy); for (let xx = x; xx <= x + w; xx += 16) c.lineTo(xx, yy + Math.sin(xx / 37 + ph) * 1.4); c.stroke(); }
      const stick = ['rgba(255,214,102,.55)', 'rgba(143,211,255,.55)', 'rgba(255,143,143,.5)'];
      for (let i = 0; i < 5; i++) { const sx = x + 30 + rr() * (w - 60), sy = y + 20 + rr() * (h - 70); c.fillStyle = stick[i % 3]; c.beginPath(); for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rd = k % 2 ? 5 : 11; k ? c.lineTo(sx + Math.cos(a) * rd, sy + Math.sin(a) * rd) : c.moveTo(sx + Math.cos(a) * rd, sy + Math.sin(a) * rd); } c.fill(); }
    } else if (st === 'trainset') {
      for (let gy = y; gy < y + h; gy += 16) for (let gx = x + ((gy - y) / 16 % 2) * 16; gx < x + w; gx += 32) { c.fillStyle = 'rgba(80,140,90,.08)'; c.fillRect(gx, gy, 16, 16); }
      c.strokeStyle = 'rgba(120,85,55,.35)'; c.lineWidth = 3; for (let gx = x + 4; gx < x + w; gx += 12) { c.beginPath(); c.moveTo(gx, y + h - 46); c.lineTo(gx, y + h - 36); c.stroke(); }
      c.strokeStyle = 'rgba(120,125,140,.5)'; c.lineWidth = 1.4; for (const ly of [y + h - 44, y + h - 38]) { c.beginPath(); c.moveTo(x, ly); c.lineTo(x + w, ly); c.stroke(); }
    } else if (st === 'plush') {
      c.strokeStyle = 'rgba(200,120,150,.16)'; c.lineWidth = 1;
      for (let gx = x - h; gx < x + w; gx += 14) { c.beginPath(); c.moveTo(gx, y + h); c.lineTo(gx + h, y); c.stroke(); c.beginPath(); c.moveTo(gx, y); c.lineTo(gx + h, y + h); c.stroke(); }
      for (let i = 0; i < 4; i++) { const px2 = x + 30 + rr() * (w - 60), py2 = y + 30 + rr() * (h - 60); c.fillStyle = 'rgba(200,140,90,.14)'; c.beginPath(); c.arc(px2, py2, 16, 0, 7); c.arc(px2 - 12, py2 - 13, 6, 0, 7); c.arc(px2 + 12, py2 - 13, 6, 0, 7); c.fill(); }
    } else if (st === 'marbles') {
      c.strokeStyle = 'rgba(120,150,190,.25)'; c.lineWidth = 6; c.lineCap = 'round';
      for (let k = 0; k < 4; k++) { const yy = y + 24 + k * 44; c.beginPath(); c.moveTo(x + (k % 2 ? w - 10 : 10), yy); c.lineTo(x + (k % 2 ? 10 : w - 10), yy + 22); c.stroke(); }
      c.lineCap = 'butt';
      const mc = ['rgba(226,85,75,.4)', 'rgba(63,123,224,.4)', 'rgba(79,191,90,.4)', 'rgba(242,194,48,.5)'];
      for (let i = 0; i < 10; i++) { c.fillStyle = mc[i % 4]; c.beginPath(); c.arc(x + rr() * w, y + rr() * h, 3.4, 0, 7); c.fill(); }
    } else if (st === 'jackbox') {
      for (let gx = x, i = 0; gx < x + w; gx += 20, i++) { c.fillStyle = i % 2 ? 'rgba(226,85,75,.12)' : 'rgba(242,194,48,.14)'; c.fillRect(gx, y, 20, h); }
      c.strokeStyle = 'rgba(120,90,60,.18)'; c.lineWidth = 2; c.beginPath(); for (let k = 0; k < 12; k++) { const yy = y + 40 + k * 10; c.moveTo(x + 40, yy); c.quadraticCurveTo(x + 52, yy - 5, x + 64, yy); } c.stroke();
    } else if (st === 'blocks') {
      const bc = ['rgba(226,85,75,.16)', 'rgba(63,123,224,.16)', 'rgba(79,191,90,.16)', 'rgba(242,194,48,.2)'], L = 'ABCDEFGH';
      c.font = '700 12px Kalam, "Comic Sans MS", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let gy = y + 10, i = 0; gy < y + h - 20; gy += 36) for (let gx = x + 10 + ((gy - y) / 36 % 2) * 18; gx < x + w - 20; gx += 36, i++) { c.fillStyle = bc[i % 4]; c.fillRect(gx, gy, 22, 22); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText(L[i % 8], gx + 11, gy + 12); }
      c.textAlign = 'left';
    } else if (st === 'dollhouse') {
      c.fillStyle = 'rgba(230,130,160,.12)';
      for (let gy = y + 8; gy < y + h; gy += 20) for (let gx = x + ((gy - y) / 20 % 2) * 10 + 5; gx < x + w; gx += 20) { c.beginPath(); c.arc(gx, gy, 2.4, 0, 7); c.arc(gx + 3, gy - 2, 1.6, 0, 7); c.fill(); }
      for (const [wx, wy] of [[x + w * 0.62, y + 24], [x + w * 0.3, y + 100], [x + w * 0.62, y + 200], [x + w * 0.25, y + 300]]) { c.fillStyle = 'rgba(170,215,255,.35)'; c.fillRect(wx, wy, 34, 28); c.strokeStyle = 'rgba(140,100,80,.35)'; c.lineWidth = 1.5; c.strokeRect(wx, wy, 34, 28); c.beginPath(); c.moveTo(wx + 17, wy); c.lineTo(wx + 17, wy + 28); c.moveTo(wx, wy + 14); c.lineTo(wx + 34, wy + 14); c.stroke(); }
    } else if (st === 'toyshelf') {
      c.strokeStyle = 'rgba(150,100,55,.15)'; c.lineWidth = 0.9;
      for (let yy = y + 6; yy < y + h; yy += 9 + rr() * 5) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy + (rr() - 0.5) * 2); c.stroke(); }
      const toys = ['rgba(226,85,75,.2)', 'rgba(63,123,224,.2)', 'rgba(79,191,90,.2)', 'rgba(155,110,240,.2)'];
      for (let i = 0; i < 9; i++) { const tx2 = x + 30 + rr() * (w - 60), ty2 = y + 20 + rr() * 80; c.fillStyle = toys[i % 4]; if (i % 3 === 0) { c.beginPath(); c.arc(tx2, ty2, 9, 0, 7); c.fill(); } else if (i % 3 === 1) { c.fillRect(tx2, ty2, 16, 12); c.fillRect(tx2 + 3, ty2 - 5, 10, 5); } else { c.beginPath(); c.moveTo(tx2, ty2 + 10); c.lineTo(tx2 + 8, ty2 - 6); c.lineTo(tx2 + 16, ty2 + 10); c.closePath(); c.fill(); } }
    } else if (st === 'kite') {
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(120,190,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < 4; i++) { const cx = x + 30 + rr() * (w - 60), cy = y + 20 + rr() * (h * 0.6); c.beginPath(); c.arc(cx, cy, 10, 0, 7); c.arc(cx + 12, cy + 2, 8, 0, 7); c.arc(cx - 11, cy + 3, 7, 0, 7); c.fill(); }
    } else if (st === 'rocket') {
      for (let i = 0; i < w * h / 130; i++) { c.fillStyle = `rgba(255,240,210,${0.2 + rr() * 0.6})`; c.beginPath(); c.arc(x + rr() * w, y + rr() * h, 0.5 + rr() * 0.9, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(255,170,90,.35)'; c.beginPath(); c.arc(x + 46, y + 38, 16, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,210,150,.4)'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(x + 46, y + 38, 26, 6, -0.3, 0, 7); c.stroke();
    } else if (NIGHT.includes(st)) {
      // night sky: stars over everything outdoors, then a touch for each place
      const outdoor = ['lawn', 'pond', 'sandbox', 'garden', 'rooftop', 'moonhill'].includes(st);
      if (outdoor) for (let i = 0; i < w * h / 220; i++) { c.fillStyle = `rgba(255,245,210,${0.15 + rr() * 0.55})`; c.beginPath(); c.arc(x + rr() * w, y + rr() * h * 0.75, 0.4 + rr() * 0.9, 0, 7); c.fill(); }
      if (st === 'porch' || st === 'shed' || st === 'doghouse' || st === 'treehouse') {
        c.strokeStyle = 'rgba(200,180,160,.08)'; c.lineWidth = 1;
        if (st === 'porch') for (let gy = y + 8; gy < y + h; gy += 12) { c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke(); }
        else for (let gx = x + 8; gx < x + w; gx += 14) { c.beginPath(); c.moveTo(gx, y); c.lineTo(gx, y + h); c.stroke(); }
      }
      if (st === 'porch') { const g = c.createRadialGradient(x + w * 0.62, y + 40, 4, x + w * 0.62, y + 40, 90); g.addColorStop(0, 'rgba(255,210,120,.28)'); g.addColorStop(1, 'rgba(255,210,120,0)'); c.fillStyle = g; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(255,214,107,.25)'; c.fillRect(x + w * 0.62 - 14, y + 26, 28, 24); }
      if (st === 'lawn' || st === 'garden' || st === 'sandbox') {
        c.strokeStyle = st === 'sandbox' ? 'rgba(220,200,150,.14)' : 'rgba(110,170,110,.22)'; c.lineWidth = 1;
        for (let gx = x + 2; gx < x + w; gx += 4 + rr() * 4) { const gh = 4 + rr() * 8; c.beginPath(); c.moveTo(gx, y + h - 32); c.lineTo(gx + (rr() - 0.5) * 3, y + h - 32 - gh); c.stroke(); }
      }
      if (st === 'garden') { c.fillStyle = 'rgba(110,170,110,.16)'; for (let gx = x + 140; gx < x + w - 10; gx += 26) { c.beginPath(); c.ellipse(gx, y + 120, 8, 12, 0, 0, 7); c.fill(); } }
      if (st === 'pond') { c.strokeStyle = 'rgba(150,190,240,.18)'; c.lineWidth = 1; for (let i = 0; i < 9; i++) { const px2 = x + rr() * w, py2 = y + h * 0.55 + rr() * h * 0.3; c.beginPath(); c.ellipse(px2, py2, 10 + rr() * 14, 2.4, 0, 0, 7); c.stroke(); } }
      if (st === 'shed') { c.strokeStyle = 'rgba(200,190,170,.1)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 150, y + 30); c.lineTo(x + 150, y + 120); c.moveTo(x + 142, y + 30); c.lineTo(x + 158, y + 30); c.moveTo(x + 180, y + 40); c.lineTo(x + 180, y + 125); c.stroke(); c.beginPath(); c.ellipse(x + 180, y + 128, 7, 9, 0, 0, 7); c.stroke(); }
      if (st === 'treehouse') { c.fillStyle = 'rgba(60,110,60,.18)'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(x + rr() * w, y + rr() * h * 0.45, 14 + rr() * 16, 0, 7); c.fill(); } c.fillStyle = 'rgba(110,80,50,.25)'; c.fillRect(x + w / 2 - 22, y + h * 0.5, 44, h * 0.5); }
      if (st === 'rooftop') { c.strokeStyle = 'rgba(160,120,140,.18)'; c.lineWidth = 1; for (let gy = y + h - 60, row = 0; gy < y + h; gy += 8, row++) for (let gx = x + (row % 2) * 8; gx < x + w; gx += 16) { c.beginPath(); c.arc(gx + 8, gy, 8, 0, Math.PI); c.stroke(); } }
      if (st === 'moonhill') { const g = c.createRadialGradient(x + w * 0.72, y + 50, 10, x + w * 0.72, y + 50, 90); g.addColorStop(0, 'rgba(255,240,190,.5)'); g.addColorStop(0.3, 'rgba(255,240,190,.14)'); g.addColorStop(1, 'rgba(255,240,190,0)'); c.fillStyle = g; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(255,243,196,.85)'; c.beginPath(); c.arc(x + w * 0.72, y + 50, 26, 0, 7); c.fill(); }
      if (st === 'doghouse') { c.fillStyle = 'rgba(230,220,200,.1)'; c.beginPath(); c.moveTo(x + 60, y + 150); c.lineTo(x + 90, y + 120); c.lineTo(x + 120, y + 150); c.closePath(); c.fill(); }
    } else if (st === 'tray') {
      for (let i = 0; i < 4; i++) {
        const px2 = x + 30 + i * 70 - (i % 2) * 20, py2 = y + 24 + (i % 2) * 40;
        c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(px2, py2, 70, 90);
        c.strokeStyle = 'rgba(100,145,205,.25)'; c.lineWidth = 0.7;
        for (let ly = py2 + 10; ly < py2 + 88; ly += 8) { c.beginPath(); c.moveTo(px2 + 4, ly); c.lineTo(px2 + 66, ly); c.stroke(); }
        c.strokeStyle = 'rgba(46,45,53,.12)'; c.strokeRect(px2, py2, 70, 90);
      }
    }
  }
  function paintDecor(c, r) {
    const list = DECOR[r.id] || [], rr = mulberry(r.x0 * 3 + r.y0 * 5 + 9);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const d of list) {
      const x = r.px + d[1] * T, y = r.py + d[2] * T;
      const ink = ['lamp', 'glitter', 'archive', 'dome', 'vault', 'rocket', ...NIGHT].includes(r.paper) ? 'rgba(255,236,190,.8)' : COL.note;
      c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 0.9;
      if (d[0] === 'note') { c.font = '400 8.4px Kalam, "Comic Sans MS", cursive'; c.textBaseline = 'alphabetic'; c.fillText(d[3], x, y + 8); }
      else if (d[0] === 'arrow') {
        c.save(); c.translate(x, y); c.rotate(d[3]); c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(-2, -2, 9, 0); c.moveTo(4, -4); c.lineTo(9, 0); c.lineTo(4, 4); c.stroke(); c.restore();
      } else if (d[0] === 'star') {
        c.beginPath(); for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5; const px = x + Math.cos(a) * 5, py = y + Math.sin(a) * 5; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke();
      } else if (d[0] === 'spiral') {
        c.beginPath(); for (let t = 0; t < 14; t += 0.2) { const rad = t * 0.55; const px = x + Math.cos(t) * rad, py = y + Math.sin(t) * rad; t ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke();
      } else if (d[0] === 'ring') {
        c.strokeStyle = 'rgba(150,105,60,.22)'; c.lineWidth = 2.2; c.beginPath(); c.arc(x, y, 11, 0.3, Math.PI * 2 - 0.2); c.stroke();
        c.lineWidth = 0.8; c.beginPath(); c.arc(x + 0.6, y + 0.4, 9, 0, 7); c.stroke();
      } else if (d[0] === 'heart') {
        c.beginPath(); c.moveTo(x, y + 5); c.bezierCurveTo(x - 7, y, x - 4, y - 5, x, y - 2); c.bezierCurveTo(x + 4, y - 5, x + 7, y, x, y + 5); c.stroke();
      } else if (d[0] === 'frame') {
        c.lineWidth = 1; c.strokeRect(x, y, 34, 24); c.strokeRect(x + 3, y + 3, 28, 18);
        c.beginPath(); c.moveTo(x + 6, y + 18); c.lineTo(x + 13, y + 10); c.lineTo(x + 18, y + 15); c.lineTo(x + 22, y + 11); c.lineTo(x + 28, y + 18); c.stroke();
        c.beginPath(); c.arc(x + 24, y + 8, 2.2, 0, 7); c.stroke();
      } else if (d[0] === 'tape') {
        c.fillStyle = 'rgba(235,215,150,.55)'; c.save(); c.translate(x + 12, y + 8); c.rotate(-0.6); c.fillRect(-14, -5, 28, 10); c.restore();
      } else if (d[0] === 'cat') {
        c.beginPath(); c.ellipse(x, y, 9, 6, 0, 0, 7); c.moveTo(x - 6, y - 4); c.lineTo(x - 7, y - 10); c.lineTo(x - 2, y - 6); c.moveTo(x + 2, y - 6); c.lineTo(x + 7, y - 10); c.lineTo(x + 6, y - 4);
        c.moveTo(x + 9, y + 1); c.quadraticCurveTo(x + 17, y - 1, x + 14, y - 9); c.stroke();
        c.fillRect(x - 3.5, y - 1.5, 1.4, 1.4); c.fillRect(x + 2, y - 1.5, 1.4, 1.4);
      } else if (d[0] === 'clip') {
        c.strokeStyle = 'rgba(110,115,130,.55)'; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x + 18, y + 4); c.arc(x + 18, y + 1, 3, Math.PI / 2, -Math.PI / 2, true); c.lineTo(x - 2, y - 2);
        c.arc(x - 2, y + 2, 4, -Math.PI / 2, Math.PI / 2, true); c.lineTo(x + 14, y + 6); c.stroke();
      } else if (d[0] === 'crumbs') {
        c.fillStyle = 'rgba(230,140,165,.55)';
        for (let i = 0; i < 6; i++) c.fillRect(x + rr() * 18, y + rr() * 4, 2 + rr() * 2, 1.5 + rr());
      } else if (d[0] === 'stapler') {
        c.fillStyle = 'rgba(70,75,95,.16)'; c.strokeStyle = 'rgba(46,45,53,.28)'; c.lineWidth = 1.2;
        rrect(c, x, y, 150, 14, 6); c.fill(); c.stroke();
        rrect(c, x + 4, y + 16, 146, 10, 4); c.fill(); c.stroke();
        c.beginPath(); c.arc(x + 146, y + 14, 6, -Math.PI / 2, Math.PI / 2); c.stroke();
      } else if (d[0] === 'books') {
        // a little stack of books lying on their sides
        const pc = ['rgba(150,60,55,.45)', 'rgba(55,85,135,.45)', 'rgba(70,120,80,.45)', 'rgba(160,125,60,.5)'];
        for (let i = 0; i < 3; i++) { c.fillStyle = pc[(i + Math.floor(x)) % 4]; c.fillRect(x + (rr() - 0.5) * 4, y + 6 - i * 4, 20 - i * 2, 4); }
      } else if (d[0] === 'lampG') {
        c.fillStyle = 'rgba(60,140,80,.55)'; c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x + 9, y); c.lineTo(x + 6, y - 6); c.lineTo(x - 6, y - 6); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(190,150,70,.6)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 12); c.moveTo(x - 6, y + 12); c.lineTo(x + 6, y + 12); c.stroke();
      } else if (d[0] === 'blocks') {
        const bc = ['rgba(226,85,75,.5)', 'rgba(63,123,224,.5)', 'rgba(242,194,48,.6)'], L = 'ABC';
        c.font = '700 7px Kalam, "Comic Sans MS", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) { const bx = x + i * 10 - (i === 2 ? 5 : 0), by = i === 2 ? y - 9 : y; c.fillStyle = bc[i]; c.fillRect(bx, by, 9, 9); c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText(L[i], bx + 4.5, by + 5); }
        c.textAlign = 'left';
      } else if (d[0] === 'globe') {
        c.strokeStyle = 'rgba(60,90,130,.45)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 10, 0, 7); c.stroke();
        c.beginPath(); c.ellipse(x, y, 4, 10, 0, 0, 7); c.moveTo(x - 10, y); c.lineTo(x + 10, y); c.stroke();
        c.strokeStyle = 'rgba(140,100,50,.5)'; c.beginPath(); c.arc(x, y, 13, -1.2, 1.9); c.moveTo(x, y + 13); c.lineTo(x, y + 20); c.moveTo(x - 6, y + 20); c.lineTo(x + 6, y + 20); c.stroke();
      } else if (d[0] === 'flake') {
        c.strokeStyle = 'rgba(80,150,190,.45)'; c.lineWidth = 1;
        for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6); c.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); c.stroke(); }
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, ex2 = x + Math.cos(a) * 4, ey2 = y + Math.sin(a) * 4; c.beginPath(); c.moveTo(ex2, ey2); c.lineTo(ex2 + Math.cos(a + 0.7) * 2, ey2 + Math.sin(a + 0.7) * 2); c.moveTo(ex2, ey2); c.lineTo(ex2 + Math.cos(a - 0.7) * 2, ey2 + Math.sin(a - 0.7) * 2); c.stroke(); }
      } else if (d[0] === 'fmag') {
        // a few letter magnets
        const cols = ['#e2554b', '#3f7be0', '#f2c230', '#4bb36a'], letters = 'ABC';
        c.font = '700 9px Kalam, "Comic Sans MS", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) { c.save(); c.translate(x + i * 9, y + (i % 2) * 3); c.rotate((rr() - 0.5) * 0.5); c.fillStyle = cols[i]; c.globalAlpha = 0.6; c.fillText(letters[i], 0, 0); c.restore(); }
        c.textAlign = 'left';
      } else if (d[0] === 'drawing') {
        // a kid's drawing taped to the fridge
        c.save(); c.translate(x, y); c.rotate(-0.06);
        c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(0, 0, 40, 30); c.strokeStyle = 'rgba(46,45,53,.2)'; c.lineWidth = 0.8; c.strokeRect(0, 0, 40, 30);
        c.strokeStyle = 'rgba(63,123,224,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(4, 24); c.lineTo(36, 24); c.stroke();
        c.strokeStyle = 'rgba(226,85,75,.55)'; c.beginPath(); c.moveTo(10, 24); c.lineTo(10, 14); c.lineTo(17, 8); c.lineTo(24, 14); c.lineTo(24, 24); c.stroke();
        c.strokeStyle = 'rgba(242,194,48,.8)'; c.beginPath(); c.arc(32, 7, 3.6, 0, 7); c.stroke();
        c.fillStyle = 'rgba(235,215,150,.65)'; c.fillRect(14, -3, 12, 6);
        c.restore();
      } else if (d[0] === 'list') {
        c.save(); c.translate(x, y); c.rotate(0.05);
        c.fillStyle = 'rgba(255,248,200,.85)'; c.fillRect(0, 0, 34, 40); c.strokeStyle = 'rgba(46,45,53,.18)'; c.lineWidth = 0.8; c.strokeRect(0, 0, 34, 40);
        c.fillStyle = COL.note; c.font = '400 6.4px Kalam, "Comic Sans MS", cursive'; c.textBaseline = 'alphabetic';
        ['milk', 'eggs', 'ice cream!', 'cherries'].forEach((t, i) => c.fillText(t, 3, 9 + i * 8.5));
        c.fillStyle = '#e2554b'; c.beginPath(); c.arc(17, 1, 2.6, 0, 7); c.fill();
        c.restore();
      } else if (d[0] === 'splat') {
        const col = ['rgba(255,140,46,.4)', 'rgba(79,191,90,.4)', 'rgba(155,110,240,.4)'][Math.floor(x / 37) % 3];
        c.fillStyle = col; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
        for (let i = 0; i < 7; i++) { const a = rr() * 6.28, rd = 8 + rr() * 6; c.beginPath(); c.arc(x + Math.cos(a) * rd, y + Math.sin(a) * rd, 1 + rr() * 2, 0, 7); c.fill(); }
      } else if (d[0] === 'pins') {
        const pc = ['#e2554b', '#3f7be0', '#f2c230', '#4bb36a'];
        for (let i = 0; i < 3; i++) {
          const px2 = x + (rr() - 0.5) * 30, py2 = y + (rr() - 0.5) * 24;
          c.fillStyle = 'rgba(255,255,255,.55)'; c.save(); c.translate(px2, py2 + 8); c.rotate((rr() - 0.5) * 0.4); c.fillRect(-9, -2, 18, 14); c.restore();
          c.fillStyle = pc[i % pc.length]; c.beginPath(); c.arc(px2, py2 + 6, 2.6, 0, 7); c.fill();
          c.strokeStyle = 'rgba(46,45,53,.6)'; c.lineWidth = 0.7; c.stroke();
        }
      } else if (d[0] === 'lampArm') {
        c.strokeStyle = 'rgba(255,236,190,.45)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x - 10, y + 4 * T + 6); c.lineTo(x - 20, y + 2 * T); c.lineTo(x - 4, y + 4); c.stroke();
        c.fillStyle = 'rgba(255,236,190,.25)'; c.fillRect(x - 26, y + 4 * T + 4, 30, 6);
        const g = c.createRadialGradient(x + 8, y + 22, 2, x + 8, y + 22, 26);
        g.addColorStop(0, 'rgba(255,240,180,.9)'); g.addColorStop(1, 'rgba(255,240,180,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x + 8, y + 22, 26, 0, 7); c.fill();
      }
      rr();
    }
    c.restore();
  }
  function paintSolids(c, r) {
    const path = new Path2D(), W = world.W, tl = world.tiles;
    const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= world.H) ? 1 : tl[ty * W + tx];
    for (let ty = r.y0; ty < r.y0 + r.th; ty++) for (let tx = r.x0; tx < r.x0 + r.tw; tx++) if (at(tx, ty) === 1) path.rect(tx * T, ty * T, T, T);
    c.fillStyle = r.paper === 'cork' ? '#b98a5a' : theme().solid; c.fill(path);
    c.save(); c.clip(path);
    const rr = mulberry(r.x0 * 31 + r.y0 * 17 + 3);
    c.strokeStyle = COL.hatch; c.lineWidth = 0.75;
    for (let d = -r.ph; d < r.pw; d += 4.2) {
      c.beginPath(); c.moveTo(r.px + d + (rr() - 0.5), r.py + r.ph); c.lineTo(r.px + d + r.ph + (rr() - 0.5) * 2, r.py); c.stroke();
    }
    c.strokeStyle = 'rgba(58,56,68,.12)';
    for (let d = 0; d < r.pw + r.ph; d += 9) { c.beginPath(); c.moveTo(r.px + d, r.py + r.ph); c.lineTo(r.px + d - r.ph, r.py); c.stroke(); }
    c.restore();
    c.strokeStyle = COL.graphite; c.lineCap = 'round';
    for (let ty = r.y0; ty < r.y0 + r.th; ty++) for (let tx = r.x0; tx < r.x0 + r.tw; tx++) {
      if (at(tx, ty) !== 1) continue;
      const x = tx * T, y = ty * T, er = mulberry(tx * 7919 + ty * 104729);
      if (at(tx, ty - 1) !== 1) { c.lineWidth = 2; sketchLine(c, x, y + 0.6, x + T, y + 0.6, er, 0.7); }
      if (at(tx, ty + 1) !== 1) { c.lineWidth = 1.3; sketchLine(c, x, y + T - 0.5, x + T, y + T - 0.5, er, 0.6); }
      if (at(tx - 1, ty) !== 1) { c.lineWidth = 1.4; sketchLine(c, x + 0.6, y, x + 0.6, y + T, er, 0.6); }
      if (at(tx + 1, ty) !== 1) { c.lineWidth = 1.4; sketchLine(c, x + T - 0.6, y, x + T - 0.6, y + T, er, 0.6); }
    }
  }
  function paintRulers(c, r) {
    const W = world.W, tl = world.tiles;
    for (let ty = r.y0; ty < r.y0 + r.th; ty++) {
      let tx = r.x0;
      while (tx < r.x0 + r.tw) {
        if (tl[ty * W + tx] !== 2) { tx++; continue; }
        let end = tx; while (end + 1 < r.x0 + r.tw && tl[ty * W + end + 1] === 2) end++;
        const x = tx * T, y = ty * T, w = (end - tx + 1) * T;
        c.fillStyle = COL.ruler; c.fillRect(x, y, w, 5);
        c.strokeStyle = COL.graphite; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y + 0.8); c.lineTo(x + w, y + 0.8); c.stroke();
        c.lineWidth = 0.8; c.strokeRect(x + 0.4, y + 0.8, w - 0.8, 4.4);
        c.lineWidth = 0.55;
        for (let i = 2; i < w - 1; i += 2) { const len = i % 16 === 0 ? 3.4 : i % 8 === 0 ? 2.6 : 1.4; c.beginPath(); c.moveTo(x + i, y + 5.2); c.lineTo(x + i, y + 5.2 - len); c.stroke(); }
        tx = end + 1;
      }
    }
  }
  function paintSpikes(c, r) {
    const W = world.W, tl = world.tiles;
    c.lineJoin = 'round';
    for (let ty = r.y0; ty < r.y0 + r.th; ty++) for (let tx = r.x0; tx < r.x0 + r.tw; tx++) {
      if (tl[ty * W + tx] !== 3) continue;
      const x = tx * T, y = ty * T;
      if (theme().spikes === 'pencils') {
        const pc = ['#e2554b', '#3f7be0', '#f2c230', '#4bb36a', '#9b6ef0'];
        for (let i = 0; i < 3; i++) {
          const bx = x + 1.5 + i * 4.6, col = pc[(tx * 2 + ty + i) % pc.length];
          c.fillStyle = col; c.fillRect(bx, y + 10, 4, 6); c.strokeStyle = COL.graphite; c.lineWidth = 0.7; c.strokeRect(bx, y + 10, 4, 6);
          c.fillStyle = '#f2d58a'; c.beginPath(); c.moveTo(bx, y + 10); c.lineTo(bx + 2, y + 5); c.lineTo(bx + 4, y + 10); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = COL.graphite; c.beginPath(); c.moveTo(bx + 1.3, y + 6.6); c.lineTo(bx + 2, y + 5); c.lineTo(bx + 2.7, y + 6.6); c.closePath(); c.fill();
        }
        continue;
      }
      if (theme().spikes === 'thorns') {
        // a bramble: a twisting vine with thorns pointing up
        const er = mulberry(tx * 37 + ty * 11);
        c.strokeStyle = '#2e5a2e'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + 13); c.quadraticCurveTo(x + 4, y + 9 + er() * 3, x + 8, y + 12); c.quadraticCurveTo(x + 12, y + 15, x + T, y + 12); c.stroke();
        c.fillStyle = '#4f8a45'; c.strokeStyle = '#1d3a1d'; c.lineWidth = 0.7;
        for (const [bx, h] of [[x + 3, 7], [x + 8.5, 9], [x + 13.5, 6.5]]) { c.beginPath(); c.moveTo(bx - 2, y + 13); c.lineTo(bx, y + 13 - h); c.lineTo(bx + 2, y + 13); c.closePath(); c.fill(); c.stroke(); }
        c.fillStyle = '#d64538'; c.beginPath(); c.arc(x + 11, y + 14.4, 1.2, 0, 7); c.fill();
        continue;
      }
      if (theme().spikes === 'jacks') {
        // toy jacks: little metal stars with ball tips
        for (let i = 0; i < 2; i++) {
          const cx = x + 4 + i * 8, cy = y + 11;
          c.strokeStyle = COL.graphite; c.lineWidth = 2.2; c.beginPath(); c.moveTo(cx - 3.5, cy + 3); c.lineTo(cx + 3.5, cy - 3); c.moveTo(cx + 3.5, cy + 3); c.lineTo(cx - 3.5, cy - 3); c.moveTo(cx, cy + 4); c.lineTo(cx, cy - 6); c.stroke();
          c.strokeStyle = '#c9ced8'; c.lineWidth = 1; c.stroke();
          c.fillStyle = '#e2554b'; for (const [bx, by] of [[cx, cy - 6], [cx - 3.5, cy - 3], [cx + 3.5, cy - 3]]) { c.beginPath(); c.arc(bx, by, 1.3, 0, 7); c.fill(); }
        }
        continue;
      }
      if (theme().spikes === 'nibs') {
        // fountain pen nibs, points up
        for (let i = 0; i < 2; i++) {
          const bx = x + 1 + i * 7.5;
          c.beginPath(); c.moveTo(bx, y + T); c.lineTo(bx, y + 11); c.quadraticCurveTo(bx + 0.5, y + 7, bx + 3.5, y + 3.5); c.quadraticCurveTo(bx + 6.5, y + 7, bx + 7, y + 11); c.lineTo(bx + 7, y + T); c.closePath();
          c.fillStyle = '#e1c068'; c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 0.8; c.stroke();
          c.beginPath(); c.moveTo(bx + 3.5, y + 4); c.lineTo(bx + 3.5, y + 10); c.stroke();
          c.fillStyle = COL.graphite; c.beginPath(); c.arc(bx + 3.5, y + 10.6, 0.9, 0, 7); c.fill();
          c.fillStyle = '#26304f'; c.fillRect(bx, y + 13, 7, 3);
        }
        continue;
      }
      if (theme().spikes === 'icicles') {
        for (let i = 0; i < 3; i++) {
          const bx = x + i * (T / 3), tip = y + 5 + ((tx + i) % 2) * 2;
          c.beginPath(); c.moveTo(bx + 0.4, y + T); c.lineTo(bx + T / 6, tip); c.lineTo(bx + T / 3 - 0.4, y + T); c.closePath();
          c.fillStyle = 'rgba(196,234,248,.97)'; c.fill(); c.strokeStyle = '#4f7f98'; c.lineWidth = 0.9; c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(bx + T / 6 - 0.4, tip + 2.5); c.lineTo(bx + 1.5, y + T - 1.5); c.stroke();
        }
        continue;
      }
      if (theme().spikes === 'tacks') {
        const heads = ['#e2554b', '#3f7be0', '#f2c230', '#4bb36a'];
        for (let i = 0; i < 2; i++) {
          const px2 = x + 4 + i * 8, col = heads[(tx * 3 + ty + i) % heads.length];
          c.strokeStyle = COL.graphite; c.lineWidth = 2.2; c.beginPath(); c.moveTo(px2, y + 12); c.lineTo(px2, y + 6.5); c.stroke();
          c.strokeStyle = '#dfe3ea'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(px2, y + 12); c.lineTo(px2, y + 7); c.stroke();
          c.fillStyle = col; c.beginPath(); c.ellipse(px2, y + 13.2, 3.6, 2.4, 0, 0, 7); c.fill();
          c.strokeStyle = COL.graphite; c.lineWidth = 0.8; c.stroke();
          c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(px2 - 1.2, y + 12.6, 1.2, 0.7, 0, 0, 7); c.fill();
        }
        continue;
      }
      for (let i = 0; i < 3; i++) {
        const bx = x + i * (T / 3);
        c.beginPath(); c.moveTo(bx + 0.3, y + T); c.lineTo(bx + T / 6, y + 6); c.lineTo(bx + T / 3 - 0.3, y + T); c.closePath();
        c.fillStyle = COL.spike; c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(bx + T / 6 - 0.6, y + 8.5); c.lineTo(bx + 1.6, y + 14.5); c.stroke();
      }
    }
  }
  function paintGloss(c, r) {
    const W = world.W, tl = world.tiles, at = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= world.H) ? 1 : tl[ty * W + tx];
    for (let ty = r.y0; ty < r.y0 + r.th; ty++) for (let tx = r.x0; tx < r.x0 + r.tw; tx++) {
      if (at(tx, ty) !== 8) continue;
      if (theme().gloss === 'toy') {
        // shiny plastic toy bricks, with studs on top
        const x = tx * T, y = ty * T, cols = [['#e2554b', '#a8322a'], ['#f2c230', '#b88a10'], ['#3f7be0', '#2a529c'], ['#4bb36a', '#2f7a46']], [col, dk] = cols[((tx >> 1) + ty * 3) & 3];
        c.fillStyle = col; c.fillRect(x, y, T, T);
        c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 1.5, y + 1.5, T - 3, 2.5);
        c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + 1.5, y + T - 3, T - 3, 1.5);
        if (at(tx, ty - 1) !== 8) { c.fillStyle = col; for (const sx of [x + 4.5, x + 11.5]) { c.beginPath(); c.ellipse(sx, y - 0.4, 2.4, 1.6, 0, 0, 7); c.fill(); c.strokeStyle = dk; c.lineWidth = 0.8; c.stroke(); } }
        c.strokeStyle = dk; c.lineWidth = 1.3; c.beginPath();
        if (at(tx, ty - 1) !== 8) { c.moveTo(x, y + 0.7); c.lineTo(x + T, y + 0.7); }
        if (at(tx, ty + 1) !== 8) { c.moveTo(x, y + T - 0.7); c.lineTo(x + T, y + T - 0.7); }
        if (at(tx - 1, ty) !== 8) { c.moveTo(x + 0.7, y); c.lineTo(x + 0.7, y + T); }
        if (at(tx + 1, ty) !== 8) { c.moveTo(x + T - 0.7, y); c.lineTo(x + T - 0.7, y + T); }
        c.stroke();
        continue;
      }
      const x = tx * T, y = ty * T, g = c.createLinearGradient(x, y, x + T, y + T);
      g.addColorStop(0, '#e9f0f8'); g.addColorStop(0.5, '#b8c8dc'); g.addColorStop(1, '#d7e2ee');
      c.fillStyle = g; c.fillRect(x, y, T, T);
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x + 3, y + T - 3); c.lineTo(x + T - 3, y + 3); c.stroke();
      c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + 8, y + T - 2); c.lineTo(x + T - 2, y + 8); c.stroke();
      c.strokeStyle = COL.graphite; c.lineWidth = 1.4;
      c.beginPath();
      if (at(tx, ty - 1) !== 8) { c.moveTo(x, y + 0.7); c.lineTo(x + T, y + 0.7); }
      if (at(tx, ty + 1) !== 8) { c.moveTo(x, y + T - 0.7); c.lineTo(x + T, y + T - 0.7); }
      if (at(tx - 1, ty) !== 8) { c.moveTo(x + 0.7, y); c.lineTo(x + 0.7, y + T); }
      if (at(tx + 1, ty) !== 8) { c.moveTo(x + T - 0.7, y); c.lineTo(x + T - 0.7, y + T); }
      c.stroke();
    }
  }
  function paintIce(c, r) {
    const W = world.W, tl = world.tiles, at = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= world.H) ? 1 : tl[ty * W + tx];
    for (let ty = r.y0; ty < r.y0 + r.th; ty++) for (let tx = r.x0; tx < r.x0 + r.tw; tx++) {
      if (at(tx, ty) !== TL.ICE) continue;
      const x = tx * T, y = ty * T, g = c.createLinearGradient(x, y, x + T, y + T), er = mulberry(tx * 613 + ty * 997);
      g.addColorStop(0, '#eefaff'); g.addColorStop(0.6, '#bfe6f4'); g.addColorStop(1, '#a6d8ec');
      c.fillStyle = g; c.fillRect(x, y, T, T);
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x + 3 + er() * 3, y + T - 3); c.lineTo(x + T - 3, y + 3 + er() * 3); c.stroke();
      c.strokeStyle = 'rgba(70,140,175,.35)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x + 2 + er() * 10, y + 2 + er() * 4); c.lineTo(x + 2 + er() * 10, y + 8 + er() * 6); c.stroke();
      c.strokeStyle = '#4f7f98'; c.lineWidth = 1.3; c.beginPath();
      const open = (a, b) => { const v = at(a, b); return v !== TL.ICE && v !== 1; };
      if (open(tx, ty - 1)) { c.moveTo(x, y + 0.7); c.lineTo(x + T, y + 0.7); }
      if (open(tx, ty + 1)) { c.moveTo(x, y + T - 0.7); c.lineTo(x + T, y + T - 0.7); }
      if (open(tx - 1, ty)) { c.moveTo(x + 0.7, y); c.lineTo(x + 0.7, y + T); }
      if (open(tx + 1, ty)) { c.moveTo(x + T - 0.7, y); c.lineTo(x + T - 0.7, y + T); }
      c.stroke();
      if (open(tx, ty - 1)) { c.fillStyle = '#ffffff'; for (let k = 1; k < T; k += 4) { c.beginPath(); c.arc(x + k + 1, y + 1, 1.6, 0, 7); c.fill(); } }
    }
  }
  function paintVents(c, r) {
    const W = world.W, tl = world.tiles;
    for (let ty = r.y0; ty < r.y0 + r.th; ty++) for (let tx = r.x0; tx < r.x0 + r.tw; tx++) {
      if (tl[ty * W + tx] !== 9 || ty + 1 >= world.H || tl[(ty + 1) * W + tx] !== 1) continue;
      const x = tx * T, y = (ty + 1) * T;
      c.fillStyle = '#3b404c'; c.fillRect(x, y + 1, T, 7);
      c.strokeStyle = '#aab2c0'; c.lineWidth = 1.2;
      for (let k = 2; k < T; k += 4) { c.beginPath(); c.moveTo(x + k, y + 2); c.lineTo(x + k, y + 7); c.stroke(); }
      c.strokeStyle = COL.graphite; c.lineWidth = 1; c.strokeRect(x, y + 1, T, 7);
    }
  }
  function drawWind(c, tx, ty, frame) {
    const x = tx * T, y = ty * T, r = mulberry(tx * 7331 + ty * 911);
    c.fillStyle = 'rgba(150,200,255,.13)'; c.fillRect(x, y, T, T);
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1; c.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const sx = x + 3 + r() * 10, ph = r() * 16, yy = y + T - ((frame * 1.7 + ph) % (T + 8));
      if (yy < y - 4 || yy > y + T) continue;
      c.beginPath(); c.moveTo(sx, yy + 6); c.quadraticCurveTo(sx + 2.5, yy + 3, sx, yy); c.stroke();
    }
  }
  const roomCache = new Map();
  let cacheScale = 2, fontsReady = false;
  function roomCanvas(ri) {
    const hit = roomCache.get(ri);
    if (hit && hit.k === cacheScale && hit.f === fontsReady) { hit.used = performance.now(); return hit.cv; }
    const r = world.rooms[ri];
    const cv = document.createElement('canvas'); cv.width = Math.ceil(r.pw * cacheScale); cv.height = Math.ceil(r.ph * cacheScale);
    const c = cv.getContext('2d'); c.scale(cacheScale, cacheScale); c.translate(-r.px, -r.py);
    paintPaper(c, r); paintDecor(c, r); paintSolids(c, r); paintGloss(c, r); paintIce(c, r); paintVents(c, r); paintRulers(c, r); paintSpikes(c, r);
    roomCache.set(ri, { cv, k: cacheScale, f: fontsReady, used: performance.now() });
    if (roomCache.size > 5) {
      let old = null, oldT = Infinity;
      for (const [k, v] of roomCache) if (k !== ri && v.used < oldT) { old = k; oldT = v.used; }
      roomCache.delete(old);
    }
    return cv;
  }

  /* ================= live drawing ================= */
  function drawScribble(c, tx, ty, frame) {
    const x = tx * T, y = ty * T, r = mulberry(tx * 928371 + ty * 12345 + Math.floor(frame / 9) * 7);
    c.fillStyle = '#c9c5bb'; c.fillRect(x, y, T, T);
    c.strokeStyle = '#26252c'; c.lineWidth = 1.15; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 2 + r() * 12, y + 2 + r() * 12);
    for (let i = 0; i < 8; i++) c.quadraticCurveTo(x + r() * T, y + r() * T, x + 1 + r() * 14, y + 1 + r() * 14);
    c.stroke();
  }
  function drawPerf(c, tx, ty, s) {
    const x = tx * T, y = ty * T;
    c.fillStyle = '#efe2bd'; c.fillRect(x, y, T, T);
    c.strokeStyle = 'rgba(46,45,53,.8)'; c.lineWidth = 0.8;
    c.setLineDash([2, 2]); c.beginPath(); c.moveTo(x + 3.5, y); c.lineTo(x + 3.5, y + T); c.moveTo(x + 12.5, y); c.lineTo(x + 12.5, y + T); c.stroke(); c.setLineDash([]);
    for (let yy = y + 2; yy < y + T; yy += 4) { c.beginPath(); c.arc(x + 8, yy, 1.25, 0, 7); c.fillStyle = '#f9f7f1'; c.fill(); c.stroke(); }
    const tAt = (a, b) => tileAt(s, a, b);
    c.lineWidth = 1.2; c.strokeStyle = COL.graphite;
    if (tAt(tx - 1, ty) !== TL.PERF) { c.beginPath(); c.moveTo(x + 0.6, y); c.lineTo(x + 0.6, y + T); c.stroke(); }
    if (tAt(tx + 1, ty) !== TL.PERF) { c.beginPath(); c.moveTo(x + T - 0.6, y); c.lineTo(x + T - 0.6, y + T); c.stroke(); }
  }
  function drawLayerTile(c, tx, ty, code, s) {
    const x = tx * T, y = ty * T, on = (code === TL.LA && s.layer === 0) || (code === TL.LB && s.layer === 1);
    const col = code === TL.LA ? COL.ink : COL.red, dark = code === TL.LA ? COL.inkDark : COL.redDark;
    const same = (a, b) => tileAt(s, a, b) === code;
    if (on) {
      c.fillStyle = col; c.fillRect(x, y, T, T);
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 0.8;
      c.save(); c.beginPath(); c.rect(x, y, T, T); c.clip();
      c.beginPath();
      if (code === TL.LA) { for (let yy = y + 3; yy < y + T; yy += 4) { c.moveTo(x + 1, yy); c.lineTo(x + T - 1, yy + 0.5); } }
      else { for (let d = -T; d < T; d += 4) { c.moveTo(x + d, y + T); c.lineTo(x + d + T, y); } }
      c.stroke(); c.restore();
      c.strokeStyle = dark; c.lineWidth = 1.6;
      if (!same(tx, ty - 1)) { c.beginPath(); c.moveTo(x, y + 0.8); c.lineTo(x + T, y + 0.8); c.stroke(); }
      if (!same(tx, ty + 1)) { c.beginPath(); c.moveTo(x, y + T - 0.8); c.lineTo(x + T, y + T - 0.8); c.stroke(); }
      if (!same(tx - 1, ty)) { c.beginPath(); c.moveTo(x + 0.8, y); c.lineTo(x + 0.8, y + T); c.stroke(); }
      if (!same(tx + 1, ty)) { c.beginPath(); c.moveTo(x + T - 0.8, y); c.lineTo(x + T - 0.8, y + T); c.stroke(); }
    } else {
      c.save(); c.globalAlpha = 0.55; c.strokeStyle = col; c.lineWidth = 1; c.setLineDash([2.5, 2]);
      c.beginPath();
      if (!same(tx, ty - 1)) { c.moveTo(x, y + 1); c.lineTo(x + T, y + 1); }
      if (!same(tx, ty + 1)) { c.moveTo(x, y + T - 1); c.lineTo(x + T, y + T - 1); }
      if (!same(tx - 1, ty)) { c.moveTo(x + 1, y); c.lineTo(x + 1, y + T); }
      if (!same(tx + 1, ty)) { c.moveTo(x + T - 1, y); c.lineTo(x + T - 1, y + T); }
      c.stroke(); c.setLineDash([]);
      c.fillStyle = col; c.globalAlpha = 0.35; c.beginPath(); c.arc(x + 8, y + 8, 1, 0, 7); c.fill();
      c.restore();
    }
  }

  const PAINT = { 1: ['#ff8c2e', '#b4560c'], 2: ['#4fbf5a', '#25782f'], 3: ['#9b6ef0', '#5a39ad'] };
  function drawPaintTile(c, tx, ty, code, s, frame) {
    const x = tx * T, y = ty * T, k = code - TL.PO + 1, [col, dark] = PAINT[k];
    const same = (a, b) => tileAt(s, a, b) === code;
    if (solidCode(s, code)) {
      c.fillStyle = col; c.fillRect(x, y, T, T);
      c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(x + 2, y + 2, 2.2, T - 4);
      c.strokeStyle = dark; c.lineWidth = 1.5; c.beginPath();
      if (!same(tx, ty - 1)) { c.moveTo(x, y + 0.8); c.lineTo(x + T, y + 0.8); }
      if (!same(tx - 1, ty)) { c.moveTo(x + 0.8, y); c.lineTo(x + 0.8, y + T); }
      if (!same(tx + 1, ty)) { c.moveTo(x + T - 0.8, y); c.lineTo(x + T - 0.8, y + T); }
      c.stroke();
      if (!same(tx, ty + 1)) {
        // wet drips hang off the bottom edge
        c.fillStyle = col; const r2 = mulberry(tx * 31 + ty * 7);
        for (let i = 0; i < 2; i++) { const dx = x + 3 + r2() * 9, len = 2 + ((frame * 0.05 + r2() * 6) % 4); c.beginPath(); c.moveTo(dx - 1.5, y + T - 1); c.lineTo(dx + 1.5, y + T - 1); c.lineTo(dx + 0.8, y + T - 1 + len); c.arc(dx, y + T - 1 + len, 0.9, 0, Math.PI); c.closePath(); c.fill(); }
        c.strokeStyle = dark; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + T - 0.8); c.lineTo(x + T, y + T - 0.8); c.stroke();
      }
    } else {
      c.save(); c.globalAlpha = 0.28; c.fillStyle = col; c.fillRect(x, y, T, T); c.globalAlpha = 0.85;
      c.strokeStyle = col; c.lineWidth = 1; c.setLineDash([2.5, 2]); c.beginPath();
      if (!same(tx, ty - 1)) { c.moveTo(x, y + 1); c.lineTo(x + T, y + 1); }
      if (!same(tx, ty + 1)) { c.moveTo(x, y + T - 1); c.lineTo(x + T, y + T - 1); }
      if (!same(tx - 1, ty)) { c.moveTo(x + 1, y); c.lineTo(x + 1, y + T); }
      if (!same(tx + 1, ty)) { c.moveTo(x + T - 1, y); c.lineTo(x + T - 1, y + T); }
      c.stroke(); c.restore();
    }
  }
  function drawPot(c, e, frame) {
    const [col, dark] = PAINT[e.color], x = e.x, y = e.y, open = s.powers.brush;
    c.save();
    if (open && s.p.color !== e.color) { const g = 0.5 + 0.5 * Math.sin(frame * 0.08 + e.color); c.fillStyle = col; c.globalAlpha = 0.18 + g * 0.18; c.beginPath(); c.arc(x + 7, y + 8, 10, 0, 7); c.fill(); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(255,255,255,.85)'; rrect(c, x + 1, y + 3, 12, 11, 2); c.fill();
    c.fillStyle = col; rrect(c, x + 1.5, y + 6, 11, 7.5, 1.6); c.fill();
    c.strokeStyle = COL.graphite; c.lineWidth = 1; rrect(c, x + 1, y + 3, 12, 11, 2); c.stroke();
    if (open) { c.fillStyle = col; c.beginPath(); c.ellipse(x + 7, y + 3.2, 5.5, 1.5, 0, 0, 7); c.fill(); c.strokeStyle = dark; c.lineWidth = 0.7; c.stroke(); c.beginPath(); c.moveTo(x + 4, y + 6); c.lineTo(x + 4, y + 8.5); c.strokeStyle = col; c.lineWidth = 1.4; c.stroke(); }
    else { c.fillStyle = '#9aa0ad'; c.fillRect(x, y + 1, 14, 3); c.strokeStyle = COL.graphite; c.lineWidth = 0.8; c.strokeRect(x, y + 1, 14, 3); }
    c.restore();
  }
  function powerIcon(c, pw, x, y, size) {
    c.save(); c.translate(x, y); c.scale(size / 14, size / 14);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 1; c.strokeStyle = COL.graphite;
    if (pw === 'erase') {
      c.translate(7, 7.5); c.rotate(-0.38);
      c.fillStyle = COL.eraser; c.fillRect(-6.5, -3.6, 13, 7.2); c.fillStyle = COL.sleeve; c.fillRect(-6.5, -3.6, 6, 7.2);
      c.strokeRect(-6.5, -3.6, 13, 7.2); c.beginPath(); c.moveTo(-0.5, -3.6); c.lineTo(-0.5, 3.6); c.stroke();
    } else if (pw === 'pencil') {
      c.translate(7, 7); c.rotate(-Math.PI / 4);
      c.fillStyle = COL.hilite; c.fillRect(-4.5, -2.1, 8, 4.2); c.strokeRect(-4.5, -2.1, 8, 4.2);
      c.fillStyle = '#c9ccd2'; c.fillRect(-6, -2.1, 1.5, 4.2); c.strokeRect(-6, -2.1, 1.5, 4.2);
      c.fillStyle = COL.eraser; c.fillRect(-7.6, -2.1, 1.6, 4.2); c.strokeRect(-7.6, -2.1, 1.6, 4.2);
      c.fillStyle = COL.wood; c.beginPath(); c.moveTo(3.5, -2.1); c.lineTo(7.4, 0); c.lineTo(3.5, 2.1); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = COL.graphite; c.beginPath(); c.moveTo(6.1, -0.7); c.lineTo(7.4, 0); c.lineTo(6.1, 0.7); c.closePath(); c.fill();
    } else if (pw === 'dash') {
      c.strokeStyle = COL.ink; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0.8, 5); c.lineTo(5.5, 5); c.moveTo(0.5, 8); c.lineTo(6.5, 8); c.moveTo(1, 11); c.lineTo(5, 11); c.stroke();
      c.fillStyle = COL.blot; c.strokeStyle = COL.graphite; c.beginPath(); c.moveTo(9.5, 2.2); c.bezierCurveTo(13.8, 5.5, 14.2, 12, 9.6, 12.6); c.bezierCurveTo(5.8, 12.6, 6.6, 6.4, 9.5, 2.2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(8.6, 9.6, 1, 0, 7); c.fill();
    } else if (pw === 'flip') {
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(2, 1.5); c.lineTo(9.2, 1.5); c.lineTo(12.5, 4.8); c.lineTo(12.5, 12.8); c.lineTo(2, 12.8); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#f3aaa2'; c.beginPath(); c.moveTo(9.2, 1.5); c.lineTo(9.2, 4.8); c.lineTo(12.5, 4.8); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = COL.ink; c.lineWidth = 0.7; for (const yy of [6.5, 8.6, 10.7]) { c.beginPath(); c.moveTo(3.5, yy); c.lineTo(11, yy); c.stroke(); }
    } else if (pw === 'tape') {
      // a roll of sticky tape with a loose end
      c.fillStyle = '#f0e2a8'; c.beginPath(); c.moveTo(9.5, 9); c.lineTo(13.4, 12.6); c.lineTo(11.6, 13.6); c.lineTo(8.4, 10.4); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#e9d58c'; c.beginPath(); c.arc(7, 7, 5.6, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(7, 7, 2.6, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.7; c.beginPath(); c.arc(7, 7, 4.2, 3.6, 4.8); c.stroke();
    } else if (pw === 'plane') {
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(13.5, 4.5); c.lineTo(0.8, 2.5); c.lineTo(5.2, 7.6); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#d9dcef'; c.beginPath(); c.moveTo(13.5, 4.5); c.lineTo(5.2, 7.6); c.lineTo(3.2, 12.2); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = COL.ink; c.lineWidth = 0.6; c.setLineDash([1.2, 1.2]); c.beginPath(); c.moveTo(0.5, 12.5); c.quadraticCurveTo(1.5, 9.5, 3.2, 10.5); c.stroke(); c.setLineDash([]);
    } else if (pw === 'magnet') {
      // a red horseshoe magnet with silver tips, opening upward
      c.lineCap = 'butt';
      c.strokeStyle = COL.graphite; c.lineWidth = 5.4; c.beginPath(); c.moveTo(3.4, 1.6); c.lineTo(3.4, 7); c.arc(7, 7, 3.6, Math.PI, 0, true); c.lineTo(10.6, 1.6); c.stroke();
      c.strokeStyle = '#d64538'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(3.4, 4.6); c.lineTo(3.4, 7); c.arc(7, 7, 3.6, Math.PI, 0, true); c.lineTo(10.6, 4.6); c.stroke();
      c.strokeStyle = '#e8ebf0'; c.beginPath(); c.moveTo(3.4, 2.4); c.lineTo(3.4, 4.6); c.moveTo(10.6, 2.4); c.lineTo(10.6, 4.6); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 0.8; c.beginPath(); c.arc(7, 7, 3.6, 2.4, 2.9); c.stroke();
      c.strokeStyle = COL.ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(1, 0.6); c.lineTo(2, 1.4); c.moveTo(13, 0.6); c.lineTo(12, 1.4); c.moveTo(7, 0); c.lineTo(7, 1); c.stroke();
    } else if (pw === 'umbrella') {
      // a red umbrella with a hooked handle
      c.fillStyle = '#e2554b'; c.beginPath(); c.arc(7, 6.4, 6.2, Math.PI, 0);
      for (let i = 0; i < 3; i++) c.quadraticCurveTo(13.2 - i * 4.13 - 2.07, 8.2, 13.2 - (i + 1) * 4.13, 6.4);
      c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(7, 0.2); c.lineTo(7, 1.6); c.moveTo(7, 6.4); c.lineTo(7, 12); c.arc(5.6, 12, 1.4, 0, Math.PI); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.7; c.beginPath(); c.arc(7, 6.4, 4.4, Math.PI * 1.15, Math.PI * 1.5); c.stroke();
    } else if (pw === 'spring') {
      // a red sneaker on a coil spring
      c.fillStyle = '#e2554b'; c.beginPath(); c.moveTo(2, 7.4); c.lineTo(2, 3.2); c.quadraticCurveTo(2.4, 1.6, 4.6, 1.8); c.lineTo(6.6, 2); c.quadraticCurveTo(8.4, 4.6, 12.2, 5.2); c.quadraticCurveTo(13.4, 5.6, 13.2, 7.4); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffffff'; c.fillRect(2, 6.4, 11.2, 1.4); c.strokeRect(2, 6.4, 11.2, 1.4);
      c.strokeStyle = '#8a909c'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(5, 8.2); for (let i = 0; i < 4; i++) { c.lineTo(i % 2 ? 5 : 10, 9.4 + i * 1.1); } c.lineTo(7.5, 13); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(4.4, 3.6); c.lineTo(6.6, 4.2); c.stroke();
    } else if (pw === 'card') {
      // a library card with a date stamp
      c.save(); c.translate(7, 7); c.rotate(-0.18);
      c.fillStyle = '#fbf1d3'; c.fillRect(-6.4, -4.6, 12.8, 9.2); c.strokeRect(-6.4, -4.6, 12.8, 9.2);
      c.fillStyle = '#3f7be0'; c.fillRect(-6.4, -4.6, 12.8, 2.4); c.strokeRect(-6.4, -4.6, 12.8, 2.4);
      c.strokeStyle = 'rgba(46,45,53,.5)'; c.lineWidth = 0.5; for (const yy of [0, 1.8, 3.4]) { c.beginPath(); c.moveTo(-5.4, yy); c.lineTo(1, yy); c.stroke(); }
      c.strokeStyle = '#d64538'; c.lineWidth = 0.8; c.beginPath(); c.arc(3.6, 1.6, 2, 0, 7); c.stroke();
      c.restore();
    } else if (pw === 'brush') {
      // a paintbrush, handle down-left, wet orange tip up-right
      c.translate(7, 7); c.rotate(-Math.PI / 4);
      c.fillStyle = '#c0392b'; c.fillRect(-7, -1.3, 8, 2.6); c.strokeRect(-7, -1.3, 8, 2.6);
      c.fillStyle = '#c9ccd2'; c.fillRect(1, -1.7, 2.6, 3.4); c.strokeRect(1, -1.7, 2.6, 3.4);
      c.fillStyle = '#ff8c2e'; c.beginPath(); c.moveTo(3.6, -1.9); c.quadraticCurveTo(8.4, -1.2, 7.6, 0); c.quadraticCurveTo(8.4, 1.2, 3.6, 1.9); c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
  }

  const shapeCache = [];
  const scrapShapesFor = (w) => shapeCache[w] || (shapeCache[w] = BUILT[w].ents.filter(e => e.k === 'scrap').map(e => {
    const r = mulberry(500 + e.id + w * 97), pts = [];
    const side = (ax, ay, bx, by) => { for (let k = 0; k < 4; k++) { const t = k / 4, j = (k % 2 ? 1 : -1) * (0.4 + r() * 0.8); pts.push([ax + (bx - ax) * t + (ay === by ? 0 : j), ay + (by - ay) * t + (ay === by ? j : 0)]); } };
    side(0.5, 0.8, 11.5, 0.3); side(11.5, 0.3, 11.7, 11.5); side(11.7, 11.5, 0.3, 11.7); side(0.3, 11.7, 0.5, 0.8);
    return pts;
  }));
  function drawScrapItem(c, e, frame) {
    const pts = scrapShapesFor(wi)[e.id], pic = picture(wi), bb = PIECES[wi].boxes[PIECE_OFS[wi][e.id]];
    c.save(); c.translate(e.x, e.y);
    const glow = 0.5 + 0.5 * Math.sin(frame * 0.08 + e.id);
    c.fillStyle = `rgba(255,225,74,${0.25 + glow * 0.25})`; c.beginPath(); c.arc(6, 6, 9.5, 0, 7); c.fill();
    const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (const q of pts) p.lineTo(q[0], q[1]); p.closePath();
    c.fillStyle = '#fffdf8'; c.fill(p);
    c.save(); c.clip(p); c.drawImage(pic, bb[0] * 3, bb[1] * 3, bb[2] * 3, bb[3] * 3, 1, 1, 10, 10); c.restore();
    c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.stroke(p);
    if ((frame + e.id * 23) % 110 < 18) {
      const a = ((frame + e.id * 23) % 110) / 18, sx = 11, sy = 1;
      c.strokeStyle = `rgba(255,255,255,${1 - a})`; c.lineWidth = 1.1; c.beginPath(); c.moveTo(sx - 3, sy); c.lineTo(sx + 3, sy); c.moveTo(sx, sy - 3); c.lineTo(sx, sy + 3); c.stroke();
    }
    c.restore();
  }
  function drawBook(c, e, active, frame) {
    const x = e.x, y = e.y;
    c.save();
    c.fillStyle = active ? COL.red : '#e9a299';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10, y); c.lineTo(x + 10, y + 30); c.lineTo(x + 5, y + 25.5); c.lineTo(x, y + 30); c.closePath(); c.fill();
    c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x + 2.5, y + 3); c.lineTo(x + 2.5, y + 24); c.stroke();
    c.fillStyle = COL.graphite; c.beginPath(); c.arc(x + 5, y + 2.2, 1.3, 0, 7); c.fill();
    if (active) { const b = Math.sin(frame * 0.1) * 0.8; c.strokeStyle = '#fff'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x + 2.6, y + 12 + b); c.lineTo(x + 4.6, y + 14.4 + b); c.lineTo(x + 7.8, y + 9.6 + b); c.stroke(); }
    c.restore();
  }
  function drawArtEnemy(c, e, frame) {
    const f = e.type === 'crawl' ? (e.vx > 0 ? 1 : -1) : (Math.sin(e.t * 0.05) > 0 ? 1 : -1);
    if (e.type === 'crawl') {
      // glue blob: a white puddle with a drip, filling its 12x8 box
      c.fillStyle = '#f7f6ef'; c.beginPath(); c.moveTo(e.x, e.y + e.h);
      c.bezierCurveTo(e.x, e.y + 1, e.x + e.w, e.y + 1, e.x + e.w, e.y + e.h); c.closePath(); c.fill();
      c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
      c.fillStyle = 'rgba(160,190,220,.5)'; c.beginPath(); c.ellipse(e.x + 4, e.y + 4, 1.6, 1, -0.4, 0, 7); c.fill();
      const ex = f > 0 ? e.x + 6.4 : e.x + 2;
      c.fillStyle = COL.graphite; c.fillRect(ex, e.y + 3.4, 1.3, 1.8); c.fillRect(ex + 2.6, e.y + 3.4, 1.3, 1.8);
    } else {
      // paint drop: a floating teardrop of paint
      const col = ['#ff8c2e', '#4fbf5a', '#9b6ef0'][Math.floor(e.bx / 16) % 3], cx = e.x + e.w / 2;
      c.fillStyle = col; c.beginPath(); c.moveTo(cx, e.y);
      c.bezierCurveTo(cx + 2, e.y + 3, e.x + e.w, e.y + 4.5, e.x + e.w, e.y + 6.6); c.arc(cx, e.y + 6.6, 5, 0, Math.PI); c.bezierCurveTo(e.x, e.y + 4.5, cx - 2, e.y + 3, cx, e.y);
      c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(cx - 2, e.y + 5.5, 1, 0, 7); c.fill();
      const ex = f > 0 ? cx - 0.4 : cx - 3.4;
      c.fillStyle = '#fff'; c.fillRect(ex, e.y + 6, 1.8, 2); c.fillRect(ex + 2.4, e.y + 6, 1.8, 2);
      c.fillStyle = COL.graphite; c.fillRect(ex + 0.5, e.y + 6.6, 0.9, 1.1); c.fillRect(ex + 2.9, e.y + 6.6, 0.9, 1.1);
    }
  }
  function drawDeskEnemy(c, e, frame) {
    const f = e.type === 'crawl' ? (e.vx > 0 ? 1 : -1) : (Math.sin(e.t * 0.05) > 0 ? 1 : -1);
    if (e.type === 'crawl') {
      // paperclip bug: a bent silver clip that fills its box exactly
      c.fillStyle = '#c9ced8'; rrect(c, e.x, e.y + 0.5, e.w, e.h - 0.5, 3.5); c.fill();
      c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
      c.strokeStyle = '#7d8494'; c.lineWidth = 0.8; rrect(c, e.x + 2.2, e.y + 2.6, e.w - 4.4, e.h - 4.4, 1.8); c.stroke();
      const ex = f > 0 ? e.x + 6.6 : e.x + 1.6;
      c.fillStyle = '#fff'; c.fillRect(ex, e.y + 2, 2, 2.2); c.fillRect(ex + 2.6, e.y + 2, 2, 2.2);
      c.fillStyle = COL.graphite; c.fillRect(ex + (f > 0 ? 1 : 0), e.y + 2.8, 1, 1.2); c.fillRect(ex + 2.6 + (f > 0 ? 1 : 0), e.y + 2.8, 1, 1.2);
      const step = Math.floor(frame / 6) % 2;
      c.strokeStyle = '#5d6370'; c.lineWidth = 0.8; c.beginPath();
      for (let i = 0; i < 3; i++) { const lx = e.x + 2.5 + i * 3.5 + (step ? 0.8 : -0.4); c.moveTo(lx, e.y + e.h - 1.6); c.lineTo(lx + (step ? -0.8 : 0.8), e.y + e.h - 0.4); }
      c.stroke();
    } else {
      // dust bunny: a fluffy grey ball that stays inside its box
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2, wob = Math.floor(frame / 7);
      c.fillStyle = '#a3a1ad'; c.beginPath();
      for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rad = 4.1 + ((i + wob) % 2 ? 0.8 : 0); const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad; i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.fill(); c.strokeStyle = '#6d6b78'; c.lineWidth = 0.8; c.stroke();
      const ex = f > 0 ? cx - 0.5 : cx - 3.5;
      c.fillStyle = '#fff'; c.fillRect(ex, cy - 2, 1.8, 2.2); c.fillRect(ex + 2.6, cy - 2, 1.8, 2.2);
      c.fillStyle = COL.graphite; c.fillRect(ex + 0.5, cy - 1.4, 1, 1.2); c.fillRect(ex + 3.1, cy - 1.4, 1, 1.2);
    }
  }
  function drawFridgeEnemy(c, e, frame) {
    const f = e.type === 'crawl' ? (e.vx > 0 ? 1 : -1) : (Math.sin(e.t * 0.05) > 0 ? 1 : -1);
    if (e.type === 'crawl') {
      // pea pod: a green pod with three peas, filling its 12x8 box
      c.fillStyle = '#7cc85a'; c.beginPath(); c.moveTo(e.x, e.y + e.h - 1);
      c.quadraticCurveTo(e.x + 1, e.y + 1, e.x + e.w / 2, e.y + 1); c.quadraticCurveTo(e.x + e.w - 1, e.y + 1, e.x + e.w, e.y + e.h - 1); c.closePath(); c.fill();
      c.strokeStyle = '#2f6b25'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#a6e07f'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(e.x + 3 + i * 3, e.y + 5.6, 1.5, 0, 7); c.fill(); }
      const ex = f > 0 ? e.x + 6.6 : e.x + 2;
      c.fillStyle = '#fff'; c.fillRect(ex, e.y + 2.2, 1.8, 2); c.fillRect(ex + 2.4, e.y + 2.2, 1.8, 2);
      c.fillStyle = COL.graphite; c.fillRect(ex + (f > 0 ? 0.8 : 0), e.y + 2.8, 1, 1.2); c.fillRect(ex + 2.4 + (f > 0 ? 0.8 : 0), e.y + 2.8, 1, 1.2);
    } else {
      // ice cube: a frosty block with a face, exactly its 10x10 box
      c.fillStyle = 'rgba(200,236,250,.95)'; rrect(c, e.x, e.y, e.w, e.h, 2); c.fill();
      c.strokeStyle = '#4f7f98'; c.lineWidth = 1; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(e.x + 2, e.y + 6); c.lineTo(e.x + 2, e.y + 2); c.lineTo(e.x + 6, e.y + 2); c.stroke();
      const ex = f > 0 ? e.x + 4.4 : e.x + 1.8;
      c.fillStyle = COL.graphite; c.fillRect(ex, e.y + 4, 1.3, 1.8); c.fillRect(ex + 2.6, e.y + 4, 1.3, 1.8);
      c.strokeStyle = COL.graphite; c.lineWidth = 0.7; c.beginPath(); c.moveTo(ex - 0.2, e.y + 7.6); c.lineTo(ex + 1, e.y + 7); c.lineTo(ex + 2.2, e.y + 7.6); c.lineTo(ex + 3.4, e.y + 7); c.stroke();
    }
  }
  function drawBolt(c, e, target, frame) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (target) {
      const g = 0.5 + 0.5 * Math.sin(frame * 0.2);
      c.strokeStyle = `rgba(214,69,56,${0.55 + g * 0.4})`; c.lineWidth = 1.4; c.beginPath(); c.arc(cx, cy, 8.5 + g * 1.5, 0, 7); c.stroke();
    }
    c.fillStyle = '#cdd2da'; c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; i ? c.lineTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5) : c.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5); }
    c.closePath(); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(cx - 1.6, cy - 1.6, 1.2, 0, 7); c.fill();
    c.strokeStyle = '#6d7482'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - 2.4, cy + 0.6); c.lineTo(cx + 2.4, cy + 0.6); c.stroke();
  }
  // the little horseshoe magnet the doodle holds up (tips at x,y, pointing up)
  function drawHandMagnet(c, x, y) {
    c.save(); c.lineCap = 'butt';
    c.strokeStyle = COL.graphite; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x - 3, y + 2); c.arc(x, y + 2, 3, Math.PI, 0, true); c.lineTo(x + 3, y); c.stroke();
    c.strokeStyle = '#d64538'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x - 3, y + 1.4); c.lineTo(x - 3, y + 2); c.arc(x, y + 2, 3, Math.PI, 0, true); c.lineTo(x + 3, y + 1.4); c.stroke();
    c.strokeStyle = '#e8ebf0'; c.beginPath(); c.moveTo(x - 3, y - 0.6); c.lineTo(x - 3, y + 1.4); c.moveTo(x + 3, y - 0.6); c.lineTo(x + 3, y + 1.4); c.stroke();
    c.restore();
  }
  function drawLibraryEnemy(c, e, frame) {
    const f = e.type === 'crawl' ? (e.vx > 0 ? 1 : -1) : (Math.sin(e.t * 0.05) > 0 ? 1 : -1);
    if (e.type === 'crawl') {
      // bookworm: three round segments with little glasses, filling its 12x8 box
      const wig = Math.floor(frame / 8) % 2;
      for (let i = 0; i < 3; i++) { const cx = e.x + 2.5 + i * 3.5 + (f < 0 ? 0 : 0), cy = e.y + e.h - 3 - ((i + wig) % 2) * 0.8; c.fillStyle = i === (f > 0 ? 2 : 0) ? '#8fd16a' : '#7cc85a'; c.beginPath(); c.arc(cx, cy, 2.8, 0, 7); c.fill(); c.strokeStyle = '#2f6b25'; c.lineWidth = 0.8; c.stroke(); }
      const hx = f > 0 ? e.x + 9.5 : e.x + 2.5, hy = e.y + e.h - 3.6;
      c.strokeStyle = COL.graphite; c.lineWidth = 0.6; c.beginPath(); c.arc(hx - 1.3, hy, 1.1, 0, 7); c.arc(hx + 1.3, hy, 1.1, 0, 7); c.stroke();
      c.fillStyle = COL.graphite; c.fillRect(hx - 1.6, hy - 0.3, 0.7, 0.7); c.fillRect(hx + 1, hy - 0.3, 0.7, 0.7);
    } else {
      // flying book: a little cover flapping its pages, inside its 10x10 box
      const flap = Math.sin(frame * 0.3) * 0.5 + 0.5, cx = e.x + e.w / 2, cy = e.y + e.h / 2 + 1;
      const col = ['#d64538', '#3f7be0', '#3f9b5a'][Math.floor(e.bx / 16) % 3];
      c.fillStyle = col; c.strokeStyle = COL.graphite; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(cx, cy + 3); c.lineTo(e.x, cy - 1 - flap * 3); c.lineTo(e.x + 1, cy + 3.5); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 3); c.lineTo(e.x + e.w, cy - 1 - flap * 3); c.lineTo(e.x + e.w - 1, cy + 3.5); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff8e8'; c.beginPath(); c.moveTo(cx, cy + 2); c.lineTo(cx - 3.4, cy - 2 - flap * 2); c.lineTo(cx, cy - 3); c.lineTo(cx + 3.4, cy - 2 - flap * 2); c.closePath(); c.fill();
      const ex = f > 0 ? cx + 0.6 : cx - 2.6;
      c.fillStyle = COL.graphite; c.fillRect(ex, cy - 1.2, 0.9, 1.3); c.fillRect(ex + 1.6, cy - 1.2, 0.9, 1.3);
    }
  }
  // story doors: book-shaped doors; each pair shares a color and a mark
  const DOOR_LOOK = { q: ['#d64538', 'heart'], r: ['#3f9b5a', 'star'], u: ['#3f7be0', 'moon'], v: ['#ff8c2e', 'sun'], w: ['#9b6ef0', 'diamond'], x: ['#2aa3a3', 'drop'], y: ['#d9a21e', 'crown'], g: ['#e05a9b', 'dot'], z: ['#7a5a3a', 'dot'], j: ['#5a6b7a', 'dot'] };
  function doorMark(c, kind, x, y, r) {
    c.beginPath();
    if (kind === 'heart') { c.moveTo(x, y + r); c.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.4); c.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r); }
    else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rd = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rd, y + Math.sin(a) * rd); } c.closePath(); }
    else if (kind === 'moon') { c.arc(x, y, r, 0.6, Math.PI * 2 - 0.6); c.arc(x + r * 0.5, y, r * 0.75, Math.PI * 2 - 0.9, 0.9, true); c.closePath(); }
    else if (kind === 'sun') { c.arc(x, y, r * 0.6, 0, 7); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.18, 0, 7); } }
    else if (kind === 'diamond') { c.moveTo(x, y - r); c.lineTo(x + r * 0.7, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.7, y); c.closePath(); }
    else if (kind === 'drop') { c.moveTo(x, y - r); c.quadraticCurveTo(x + r, y + r * 0.2, x, y + r); c.quadraticCurveTo(x - r, y + r * 0.2, x, y - r); }
    else if (kind === 'crown') { c.moveTo(x - r, y + r * 0.7); c.lineTo(x - r, y - r * 0.5); c.lineTo(x - r * 0.4, y); c.lineTo(x, y - r); c.lineTo(x + r * 0.4, y); c.lineTo(x + r, y - r * 0.5); c.lineTo(x + r, y + r * 0.7); c.closePath(); }
    else c.arc(x, y, r * 0.7, 0, 7);
    c.fill();
  }
  function drawDoor(c, e, open, frame) {
    const [col, mark] = DOOR_LOOK[e.ch] || ['#888', 'dot'], x = e.x - 1, y = e.y, w = e.w + 2, h = e.h;
    c.save();
    if (open) {
      const g = 0.5 + 0.5 * Math.sin(frame * 0.06 + x);
      const gr = c.createRadialGradient(x + w / 2, y + h * 0.55, 2, x + w / 2, y + h * 0.55, 20); gr.addColorStop(0, `rgba(255,220,120,${0.35 + g * 0.2})`); gr.addColorStop(1, 'rgba(255,220,120,0)');
      c.fillStyle = gr; c.fillRect(x - 12, y - 6, w + 24, h + 8);
      c.fillStyle = '#fff3c4'; rrect(c, x + 1, y + 1, w - 2, h - 1, 5); c.fill();
    }
    // the cover (swung a little open when you have the card)
    c.fillStyle = col; c.strokeStyle = COL.graphite; c.lineWidth = 1;
    if (open) { c.beginPath(); c.moveTo(x, y + 4); c.quadraticCurveTo(x, y, x + 4, y); c.lineTo(x + w * 0.55, y + 3); c.lineTo(x + w * 0.55, y + h - 1); c.lineTo(x, y + h); c.closePath(); c.fill(); c.stroke(); }
    else { rrect(c, x, y, w, h, 4); c.fill(); c.stroke(); }
    const cw2 = open ? w * 0.55 : w;
    c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(x + 2, y + 4, 2, h - 8);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.7; c.strokeRect(x + 2.5, y + 3.5, cw2 - 5, h - 7);
    c.fillStyle = '#fff8e8'; doorMark(c, mark, x + cw2 / 2, y + 11, open ? 2.6 : 3.4);
    if (!open) {
      // padlock
      c.fillStyle = '#d9b44a'; c.fillRect(x + w / 2 - 3, y + 19, 6, 5); c.strokeStyle = COL.graphite; c.lineWidth = 0.7; c.strokeRect(x + w / 2 - 3, y + 19, 6, 5);
      c.beginPath(); c.arc(x + w / 2, y + 19, 2, Math.PI, 0); c.stroke();
    } else { c.fillStyle = '#d9b44a'; c.beginPath(); c.arc(x + cw2 - 2.6, y + h * 0.6, 1.1, 0, 7); c.fill(); }
    c.restore();
  }
  function drawToyEnemy(c, e, frame) {
    const f = e.type === 'crawl' ? (e.vx > 0 ? 1 : -1) : (Math.sin(e.t * 0.05) > 0 ? 1 : -1);
    if (e.type === 'crawl') {
      // wind-up mouse: a grey body with a turning key, filling its 12x8 box
      c.fillStyle = '#b9bcc6'; c.beginPath(); c.moveTo(e.x, e.y + e.h); c.quadraticCurveTo(e.x + e.w / 2, e.y - 1, e.x + e.w, e.y + e.h); c.closePath(); c.fill();
      c.strokeStyle = COL.graphite; c.lineWidth = 1; c.stroke();
      const nx = f > 0 ? e.x + e.w : e.x;
      c.fillStyle = '#f4a3b9'; c.beginPath(); c.arc(nx, e.y + e.h - 1.6, 1.2, 0, 7); c.fill();
      c.fillStyle = '#d6d8de'; c.beginPath(); c.arc(e.x + e.w / 2 + f * 1.5, e.y + 2.6, 1.8, 0, 7); c.fill(); c.stroke();
      c.fillStyle = COL.graphite; c.fillRect(e.x + e.w / 2 + f * 3.2 - 0.5, e.y + 3.4, 1.1, 1.3);
      const kx = f > 0 ? e.x + 1.5 : e.x + e.w - 1.5, spin = Math.cos(frame * 0.3);
      c.strokeStyle = '#d9b44a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(kx, e.y + 3); c.lineTo(kx - spin * 2.2, e.y + 1); c.moveTo(kx, e.y + 3); c.lineTo(kx + spin * 2.2, e.y + 1); c.stroke();
    } else {
      // toy helicopter: a little bubble cab with a spinning rotor, inside its 10x10 box
      const cx = e.x + e.w / 2, cy = e.y + 6.2, col = ['#e2554b', '#3f7be0', '#4bb36a'][Math.floor(e.bx / 16) % 3];
      c.fillStyle = col; c.beginPath(); c.arc(cx, cy, 3.6, 0, 7); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = 'rgba(200,236,250,.95)'; c.beginPath(); c.arc(cx + f * 1.2, cy - 0.6, 1.8, 0, 7); c.fill();
      c.strokeStyle = COL.graphite; c.beginPath(); c.moveTo(cx - f * 3.4, cy); c.lineTo(cx - f * 5, cy - 1); c.moveTo(cx, cy - 3.6); c.lineTo(cx, e.y + 1.2); c.stroke();
      const rl = 4.6 * Math.abs(Math.cos(frame * 0.5)) + 0.6;
      c.strokeStyle = '#5d6370'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - rl, e.y + 1); c.lineTo(cx + rl, e.y + 1); c.stroke();
      c.strokeStyle = COL.graphite; c.lineWidth = 0.7; c.beginPath(); c.moveTo(cx - 3, e.y + e.h - 0.5); c.lineTo(cx + 3, e.y + e.h - 0.5); c.stroke();
    }
  }
  function drawNightEnemy(c, e, frame) {
    const f = e.type === 'crawl' ? (e.vx > 0 ? 1 : -1) : (Math.sin(e.t * 0.05) > 0 ? 1 : -1);
    if (e.type === 'crawl') {
      // snail: a spiral shell on a soft body, filling its 12x8 box
      c.fillStyle = '#9fb59a'; c.beginPath(); c.moveTo(e.x, e.y + e.h); c.lineTo(e.x + e.w, e.y + e.h); c.lineTo(e.x + e.w, e.y + e.h - 2.4); c.lineTo(e.x, e.y + e.h - 2.4); c.closePath(); c.fill();
      const hx = f > 0 ? e.x + e.w - 2 : e.x + 2;
      c.strokeStyle = '#9fb59a'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx, e.y + e.h - 2); c.lineTo(hx + f * 1, e.y + 1.2); c.stroke();
      c.fillStyle = COL.graphite; c.beginPath(); c.arc(hx + f * 1, e.y + 1.2, 0.8, 0, 7); c.fill();
      const sx = e.x + e.w / 2 - f * 1, sy = e.y + 3.6;
      c.fillStyle = '#c98a52'; c.beginPath(); c.arc(sx, sy, 3.4, 0, 7); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 0.8; c.stroke();
      c.strokeStyle = '#7b4b2a'; c.beginPath(); for (let t = 0; t < 9; t += 0.4) { const rr2 = t * 0.32; const px2 = sx + Math.cos(t) * rr2, py2 = sy + Math.sin(t) * rr2; t ? c.lineTo(px2, py2) : c.moveTo(px2, py2); } c.stroke();
    } else {
      // moth: a fuzzy body with flapping wings and a faint glow, inside its 10x10 box
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2, flap = Math.abs(Math.sin(frame * 0.35));
      const gl = c.createRadialGradient(cx, cy, 0, cx, cy, 8); gl.addColorStop(0, 'rgba(255,240,180,.35)'); gl.addColorStop(1, 'rgba(255,240,180,0)'); c.fillStyle = gl; c.fillRect(cx - 8, cy - 8, 16, 16);
      c.fillStyle = '#d9cfb8'; c.strokeStyle = COL.graphite; c.lineWidth = 0.7;
      for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(cx + sd * (2.4 + flap * 0.8), cy - 0.6, 2.4 + flap * 0.6, 3.4 - flap, sd * 0.4, 0, 7); c.fill(); c.stroke(); }
      c.fillStyle = '#8a7a5e'; c.beginPath(); c.ellipse(cx, cy + 0.4, 1.4, 3.2, 0, 0, 7); c.fill();
      c.fillStyle = COL.graphite; c.fillRect(cx + f * 0.4 - 0.4, cy - 2.4, 0.9, 0.9);
    }
  }
  function drawRain(c, tx, ty, frame) {
    const x = tx * T, y = ty * T, r = mulberry(tx * 4111 + ty * 733);
    c.fillStyle = s.powers.umbrella ? 'rgba(110,140,210,.12)' : 'rgba(110,140,210,.2)'; c.fillRect(x, y, T, T);
    c.strokeStyle = 'rgba(200,215,255,.75)'; c.lineWidth = 1; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const sx = x + 2 + r() * 12, ph = r() * T, yy = y + ((frame * 4.5 + ph) % (T + 6)) - 6;
      const a = Math.max(y, yy), b = Math.min(y + T, yy + 5);
      if (b > a) { c.beginPath(); c.moveTo(sx, a); c.lineTo(sx - (b - a) * 0.15, b); c.stroke(); }
    }
    const above = tileAt(s, tx, ty - 1);
    if (above !== TL.RAIN && above !== TL.ONEWAY) {
      // a little storm cloud where the downpour starts
      c.fillStyle = '#4a5270'; c.beginPath(); c.arc(x + 4, y + 3, 4.5, 0, 7); c.arc(x + 10, y + 2, 5.5, 0, 7); c.arc(x + 15, y + 4, 4, 0, 7); c.fill();
    }
    const below = tileAt(s, tx, ty + 1);
    if (solidCode(s, below)) {
      c.strokeStyle = 'rgba(200,215,255,.6)'; c.lineWidth = 0.8;
      const sp = (frame * 0.25 + tx) % 4;
      for (const sx of [x + 4, x + 11]) { c.beginPath(); c.arc(sx, y + T, 1.5 + sp, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    }
  }
  function drawEnemy(c, e, frame) {
    if (e.gone) {
      if (e.squish > 0) {
        c.save(); c.globalAlpha = e.squish / 24; c.fillStyle = e.type === 'crawl' ? COL.bug : COL.blot;
        const cx = e.x + e.w / 2, by = e.y + e.h;
        c.beginPath(); c.ellipse(cx, by - 1.5, e.w * 0.75, 1.8, 0, 0, 7); c.fill();
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI + 0.3; c.beginPath(); c.arc(cx + Math.cos(a) * e.w * 0.9, by - 2 - Math.sin(a) * 4, 1, 0, 7); c.fill(); }
        c.restore();
      }
      return;
    }
    if (theme().enemy === 'desk') { drawDeskEnemy(c, e, frame); return; }
    if (theme().enemy === 'art') { drawArtEnemy(c, e, frame); return; }
    if (theme().enemy === 'fridge') { drawFridgeEnemy(c, e, frame); return; }
    if (theme().enemy === 'library') { drawLibraryEnemy(c, e, frame); return; }
    if (theme().enemy === 'toy') { drawToyEnemy(c, e, frame); return; }
    if (theme().enemy === 'night') { drawNightEnemy(c, e, frame); return; }
    const f = e.type === 'crawl' ? (e.vx > 0 ? 1 : -1) : (Math.sin(e.t * 0.05) > 0 ? 1 : -1);
    if (e.type === 'crawl') {
      c.fillStyle = COL.bug; c.fillRect(e.x, e.y, e.w, e.h);
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 0.6;
      const r = mulberry(Math.floor(frame / 8) + Math.floor(e.bx));
      c.beginPath(); c.moveTo(e.x + 2, e.y + 4); for (let i = 0; i < 4; i++) c.quadraticCurveTo(e.x + 1 + r() * 10, e.y + 1 + r() * 5, e.x + 1 + r() * 10, e.y + 2 + r() * 4); c.stroke();
      const ex = f > 0 ? e.x + 6.5 : e.x + 1.5;
      c.fillStyle = '#fff'; c.fillRect(ex, e.y + 2, 2, 2.2); c.fillRect(ex + 2.8, e.y + 2, 2, 2.2);
      c.fillStyle = COL.graphite; c.fillRect(ex + (f > 0 ? 1 : 0), e.y + 2.8, 1, 1.2); c.fillRect(ex + 2.8 + (f > 0 ? 1 : 0), e.y + 2.8, 1, 1.2);
      c.strokeStyle = '#ff8a7a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex - 0.2, e.y + 1.2 - (f > 0 ? 0.6 : 0)); c.lineTo(ex + 2.2, e.y + 1.2 + (f > 0 ? 0.4 : -0.4)); c.moveTo(ex + 2.6, e.y + 1.2 + (f > 0 ? 0.4 : -0.4)); c.lineTo(ex + 5, e.y + 1.2 - (f > 0 ? 0 : 0.6)); c.stroke();
      const step = Math.floor(frame / 6) % 2;
      c.strokeStyle = '#bdbac4'; c.lineWidth = 0.8; c.beginPath();
      for (let i = 0; i < 3; i++) { const lx = e.x + 2.5 + i * 3.5 + (step ? 0.8 : -0.4); c.moveTo(lx, e.y + e.h - 2.2); c.lineTo(lx + (step ? -0.8 : 0.8), e.y + e.h - 0.6); }
      c.stroke();
    } else {
      c.fillStyle = COL.blot; rrect(c, e.x, e.y, e.w, e.h, 2.2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.arc(e.x + 2.8, e.y + 2.8, 1.2, 0, 7); c.fill();
      const ex = f > 0 ? e.x + 4.5 : e.x + 1.8;
      c.fillStyle = '#fff'; c.fillRect(ex, e.y + 3, 1.8, 2.2); c.fillRect(ex + 2.6, e.y + 3, 1.8, 2.2);
      c.fillStyle = '#ff8a7a'; c.fillRect(e.x + 3, e.y + 7, 4, 1);
    }
  }
  function drawPlayer(c, s, frame) {
    const p = s.p;
    if (s.dead > 0) {
      const t = 70 - s.dead, cx = p.x + p.w / 2, cy = p.y + p.h / 2 + Math.min(t, 18) * 0.3;
      c.save(); c.translate(cx, cy); c.rotate(t * 0.12);
      c.fillStyle = '#fff6b8'; c.strokeStyle = COL.graphite; c.lineWidth = 1;
      c.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rad = 5.5 + (i % 2 ? 1.6 : 0); i ? c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-3, -2); c.lineTo(2, 1); c.lineTo(-1, 4); c.moveTo(3, -4); c.lineTo(1, -1); c.stroke();
      c.restore();
      return;
    }
    if (s.freeze > 0 && Math.floor(s.freeze / 3) % 2 === 0) return;
    const blink = p.inv > 0 && Math.floor(p.inv / 4) % 2 === 0;
    // ink after-images while dashing
    for (let i = 0; i < trail.length; i++) {
      const g = trail[i]; c.fillStyle = `rgba(53,102,207,${0.12 + i * 0.05})`; c.fillRect(g.x, g.y, p.w, p.h);
    }
    c.save();
    if (blink) c.globalAlpha = 0.35;
    c.fillStyle = hurtFlash > 0 ? '#ff9b8c' : p.color ? PAINT[p.color][0] : COL.hilite; c.fillRect(p.x, p.y, p.w, p.h);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x + 2.5, p.y + 3); c.lineTo(p.x + 2.5, p.y + 9); c.stroke();
    c.strokeStyle = COL.graphite; c.lineWidth = 1.5; c.strokeRect(p.x + 0.75, p.y + 0.75, p.w - 1.5, p.h - 1.5);
    const f = p.face, ex = f > 0 ? p.x + 5.4 : p.x + 2.8, eyeY = p.y + 3.8 + (p.vy > 2 ? -0.6 : p.vy < -2 ? 0.6 : 0);
    c.fillStyle = COL.graphite;
    if (s.freeze > 0 || p.kb > 0) {
      c.lineWidth = 0.9; c.beginPath(); c.moveTo(ex, eyeY); c.lineTo(ex + 1.8, eyeY + 1.8); c.moveTo(ex + 1.8, eyeY); c.lineTo(ex, eyeY + 1.8);
      c.moveTo(ex + 3, eyeY); c.lineTo(ex + 4.8, eyeY + 1.8); c.moveTo(ex + 4.8, eyeY); c.lineTo(ex + 3, eyeY + 1.8); c.stroke();
    } else if (frame % 190 < 6) { c.fillRect(ex, eyeY + 1, 1.8, 0.8); c.fillRect(ex + 3, eyeY + 1, 1.8, 0.8); }
    else { c.fillRect(ex, eyeY, 1.8, 2.4); c.fillRect(ex + 3, eyeY, 1.8, 2.4); }
    c.lineWidth = 0.9; c.strokeStyle = COL.graphite; c.beginPath();
    const mx = ex + 2.4, my = p.y + 8.6;
    if (p.dashT > 0 || p.kb > 0) { c.ellipse(mx, my + 0.3, 1.1, 0.9, 0, 0, 7); }
    else if (!p.onGround && p.vy < 0) { c.arc(mx, my - 0.6, 1.4, 0.1 * Math.PI, 0.9 * Math.PI); }
    else { c.moveTo(mx - 1.4, my); c.quadraticCurveTo(mx, my + 1.1, mx + 1.4, my); }
    c.stroke();
    // feet ticks inside the box (little red coils once you have the spring shoes)
    if (s.powers.spring) {
      c.strokeStyle = '#e2554b'; c.lineWidth = 0.9; c.beginPath();
      for (const fx of [p.x + 2.6, p.x + 7.6]) { c.moveTo(fx, p.y + p.h - 3.6); c.lineTo(fx + 1.8, p.y + p.h - 2.8); c.lineTo(fx, p.y + p.h - 2); c.lineTo(fx + 1.8, p.y + p.h - 1.3); }
      c.stroke(); c.strokeStyle = COL.graphite;
    }
    c.lineWidth = 1; c.beginPath();
    const walk = p.onGround && Math.abs(p.vx) > 0.3 ? Math.floor(frame / 5) % 2 : 0;
    c.moveTo(p.x + 3.5 + walk, p.y + p.h - 3.2); c.lineTo(p.x + 3.5 + walk, p.y + p.h - 1.5);
    c.moveTo(p.x + 8.5 - walk, p.y + p.h - 3.2); c.lineTo(p.x + 8.5 - walk, p.y + p.h - 1.5);
    c.stroke();
    c.restore();
    if (p.wallDir) {
      // a strip of tape holds the doodle to the wall
      const tx = p.wallDir > 0 ? p.x + p.w : p.x;
      c.save(); c.translate(tx, p.y + 6); c.rotate(0.3 * p.wallDir);
      c.fillStyle = 'rgba(240,226,170,.95)'; c.fillRect(-2.2, -4.5, 4.4, 9);
      c.strokeStyle = 'rgba(120,100,50,.7)'; c.lineWidth = 0.6; c.strokeRect(-2.2, -4.5, 4.4, 9); c.restore();
    }
    if (s.powers.umbrella && !p.glide && overlapsCode(s, p.x, p.y, p.w, p.h, TL.RAIN)) {
      // the umbrella, open overhead while you are in a downpour
      const cx = p.x + p.w / 2 + p.face * 1.5, top = p.y - 4;
      c.save(); c.strokeStyle = COL.graphite; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(cx, top); c.lineTo(cx, p.y + 6); c.stroke();
      c.fillStyle = '#e2554b'; c.beginPath(); c.arc(cx, top, 10, Math.PI, 0);
      for (let i = 0; i < 4; i++) c.quadraticCurveTo(cx + 7.5 - i * 5 + 2.5, top + 2.6, cx + 5 - i * 5, top);
      c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(cx, top, 7, Math.PI * 1.15, Math.PI * 1.45); c.stroke();
      c.restore();
    }
    if (p.hangB || p.zipB) {
      // hold the fridge magnet up toward the bolt
      const b = p.hangB || p.zipB, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      if (p.zipB) {
        c.save(); c.strokeStyle = 'rgba(214,69,56,.55)'; c.lineWidth = 1; c.setLineDash([2, 2]);
        c.beginPath(); c.moveTo(p.x + p.w / 2, p.y - 2); c.lineTo(bx, by); c.stroke(); c.restore();
      }
      const mx = p.x + p.w / 2, my = p.hangB ? by + 0.5 : p.y - 6;
      c.save(); c.strokeStyle = COL.graphite; c.lineWidth = 0.9; c.beginPath(); c.moveTo(p.x + 2.5, p.y + 1); c.lineTo(mx - 2, my + 4.5); c.moveTo(p.x + p.w - 2.5, p.y + 1); c.lineTo(mx + 2, my + 4.5); c.stroke(); c.restore();
      drawHandMagnet(c, mx, my);
    }
    if (p.glide) {
      // the paper airplane, held overhead
      const fx = p.face, cx = p.x + p.w / 2, top = p.y - 2;
      c.save(); c.lineJoin = 'round'; c.strokeStyle = COL.graphite; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx + fx * 11, top - 3); c.lineTo(cx - fx * 10, top - 8); c.lineTo(cx - fx * 4, top - 2.5); c.closePath();
      c.fillStyle = '#ffffff'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(cx + fx * 11, top - 3); c.lineTo(cx - fx * 4, top - 2.5); c.lineTo(cx - fx * 7, top + 0.8); c.closePath();
      c.fillStyle = '#d9dcef'; c.fill(); c.stroke();
      c.lineWidth = 0.9; c.beginPath(); c.moveTo(p.x + 2.5, p.y + 1); c.lineTo(cx - 2.5, top - 2.2); c.moveTo(p.x + p.w - 2.5, p.y + 1); c.lineTo(cx + 2.5, top - 2.2); c.stroke();
      c.restore();
    }
    // eraser: the pink block is exactly what it touches
    if (p.eraseT > 0) {
      const b = eraseBox(p);
      c.save();
      c.fillStyle = COL.eraser; c.fillRect(b.x, b.y, b.w, b.h);
      c.fillStyle = COL.sleeve; if (p.face > 0) c.fillRect(b.x, b.y, 5, b.h); else c.fillRect(b.x + b.w - 5, b.y, 5, b.h);
      c.strokeStyle = COL.graphite; c.lineWidth = 1; c.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.moveTo(p.face > 0 ? b.x + 7 : b.x + 3, b.y + 3); c.lineTo(p.face > 0 ? b.x + b.w - 3 : b.x + b.w - 7, b.y + 3); c.stroke();
      c.restore();
    }
  }
  function drawFireflies(c, camX, camY, VW, VH, frame) {
    world.rooms.forEach((r, ri) => {
      if (r.px >= camX + VW || r.px + r.pw <= camX || r.py >= camY + VH || r.py + r.ph <= camY) return;
      const rr = mulberry(ri * 977 + 31), n = Math.round(r.pw * r.ph / 7000);
      for (let i = 0; i < n; i++) {
        const bx = r.px + 16 + rr() * (r.pw - 32), by = r.py + 16 + rr() * (r.ph - 40), ph = rr() * 6.28, sp = 0.006 + rr() * 0.01;
        const fx = bx + Math.sin(frame * sp + ph) * 18, fy = by + Math.cos(frame * sp * 1.3 + ph) * 10, glow = 0.5 + 0.5 * Math.sin(frame * 0.05 + ph * 3);
        const g = c.createRadialGradient(fx, fy, 0, fx, fy, 6); g.addColorStop(0, `rgba(255,245,140,${0.35 + glow * 0.55})`); g.addColorStop(1, 'rgba(255,245,140,0)');
        c.fillStyle = g; c.fillRect(fx - 6, fy - 6, 12, 12);
        c.fillStyle = `rgba(255,255,210,${0.5 + glow * 0.5})`; c.fillRect(fx - 0.7, fy - 0.7, 1.4, 1.4);
      }
    });
  }
  function drawPlats(c, s) {
    for (const pl of s.plats) {
      const age = pl.max - pl.t, grow = Math.min(1, (age + 1) / 3), w = pl.w * grow, x = pl.x + (pl.w - w) / 2;
      const a = pl.t < 60 ? (Math.floor(pl.t / 5) % 2 ? 0.35 : 0.95) : 1;
      c.save(); c.globalAlpha = a;
      const r = mulberry(Math.floor(pl.x * 13 + pl.y * 7));
      c.strokeStyle = 'rgba(46,45,53,.28)'; c.lineWidth = 0.8;
      for (let xx = x + 2; xx < x + w - 2; xx += 3) { c.beginPath(); c.moveTo(xx, pl.y + 2); c.lineTo(xx - 2, pl.y + 5); c.stroke(); }
      c.strokeStyle = COL.graphite; c.lineCap = 'round'; c.lineWidth = 2.2; sketchLine(c, x, pl.y + 1.1, x + w, pl.y + 1.1, r, 0.5);
      c.lineWidth = 0.8; sketchLine(c, x + 1, pl.y + 2.6, x + w - 1, pl.y + 2.6, r, 0.8);
      c.restore();
    }
  }
  function drawBoxes(c, s, view) {
    const p = s.p, lw = 1 / viewK * 1.4;
    c.save(); c.lineWidth = lw;
    const box = (b, stroke, fill) => { c.fillStyle = fill; c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = stroke; c.strokeRect(b.x, b.y, b.w, b.h); };
    for (let ty = view.ty0; ty <= view.ty1; ty++) for (let tx = view.tx0; tx <= view.tx1; tx++) if (tileAt(s, tx, ty) === TL.SPIKE) box(spikeBox(tx, ty), '#ff1f4b', 'rgba(255,31,75,.28)');
    for (const e of s.enemies) if (!e.gone) box(hurtBox(e), '#ff1f4b', 'rgba(255,31,75,.28)');
    for (const pl of s.plats) { c.strokeStyle = '#ff8a00'; c.lineWidth = lw * 1.4; c.beginPath(); c.moveTo(pl.x, pl.y); c.lineTo(pl.x + pl.w, pl.y); c.stroke(); c.lineWidth = lw; }
    for (const e of world.ents) {
      if (e.room !== s.room) continue;
      if ((e.k === 'scrap' && !s.got.has('s' + e.id)) || (e.k === 'power' && !s.powers[e.pw])) { c.setLineDash([lw * 2, lw * 2]); c.strokeStyle = '#18a558'; c.strokeRect(e.x, e.y, e.w, e.h); c.setLineDash([]); }
    }
    if (p.eraseT > 0) box(eraseBox(p), '#c21bd6', 'rgba(194,27,214,.22)');
    if (!s.dead) box(p, '#008fb3', 'rgba(0,170,210,.22)');
    c.restore();
  }

  /* ---------- particles & juice ---------- */
  const parts = [], trail = [];
  let hurtFlash = 0, flipSweep = 0, caption = null, winT = 0;
  function burst(x, y, n, o) {
    for (let i = 0; i < n && parts.length < 320; i++) {
      const a = (o.a0 === undefined ? 0 : o.a0) + Math.random() * (o.spread === undefined ? Math.PI * 2 : o.spread), sp = (o.sp || 1.5) * (0.4 + Math.random());
      parts.push({ x: x + (Math.random() - 0.5) * (o.jx || 0), y: y + (Math.random() - 0.5) * (o.jy || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
        g: o.g === undefined ? 0.12 : o.g, life: o.life || 30, max: o.life || 30, col: o.cols[Math.floor(Math.random() * o.cols.length)], size: o.size || 1.6, kind: o.kind || 'dot', rot: Math.random() * 6 });
    }
  }
  function updateParts() {
    for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.vy += q.g; q.x += q.vx; q.y += q.vy; q.vx *= 0.97; q.rot += 0.2; if (--q.life <= 0) parts.splice(i, 1); }
    if (s && s.p.dashT > 0) { trail.push({ x: s.p.x, y: s.p.y }); if (trail.length > 5) trail.shift(); } else if (trail.length) trail.shift();
    if (hurtFlash > 0) hurtFlash--;
    if (flipSweep > 0) flipSweep--;
    if (caption && --caption.t <= 0) caption = null;
  }
  function drawParts(c) {
    for (const q of parts) {
      c.globalAlpha = Math.min(1, q.life / q.max * 1.6); c.fillStyle = q.col;
      if (q.kind === 'flake') { c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.size, -q.size * 0.6, q.size * 2, q.size * 1.2); c.restore(); }
      else if (q.kind === 'spark') { c.strokeStyle = q.col; c.lineWidth = 0.8; c.beginPath(); c.moveTo(q.x - q.size, q.y); c.lineTo(q.x + q.size, q.y); c.moveTo(q.x, q.y - q.size); c.lineTo(q.x, q.y + q.size); c.stroke(); }
      else if (q.kind === 'ink') { c.beginPath(); c.arc(q.x, q.y, q.size, 0, 7); c.fill(); }
      else c.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    c.globalAlpha = 1;
  }

  /* ================= sound ================= */
  const Music = createMusic();
  const MUSIC_OF = { margin: 'margin', hall: 'margin', tower: 'margin', gallery: 'margin', cellar: 'under', nook: 'under', inkwell: 'under', lookout: 'high', rooftops: 'high', attic: 'high',
    desk: 'desk', sticky: 'desk', cup: 'desk', stapler: 'desk', keys: 'desk', coffee: 'desk', fan: 'breeze', lamp: 'breeze', shelf: 'breeze', tray: 'breeze', cork: 'breeze',
    art: 'splatter', easel: 'splatter', cabinet: 'splatter', clay: 'splatter', sink: 'splatter', crayon: 'splatter', scissors: 'splatter', rack: 'high', loft: 'high', kiln: 'high',
    porch: 'nocturne', lawn: 'nocturne', pond: 'nocturne', shed: 'nocturne', sandbox: 'nocturne', garden: 'nocturne', doghouse: 'nocturne', treehouse: 'quiet', roof: 'breeze', moon: 'breeze',
    lid: 'windup', train: 'windup', plush: 'windup', marbles: 'windup', jack: 'windup', blocks: 'windup', dollhouse: 'quiet', toyshelf: 'high', kite: 'breeze', rocket: 'high',
    lobby: 'quiet', reading: 'quiet', stacks: 'quiet', kids: 'quiet', catalog: 'quiet', atlas: 'quiet', archive: 'under', rare: 'under', balcony: 'breeze', dome: 'breeze',
    counter: 'coldsnap', toaster: 'coldsnap', door: 'coldsnap', crisper: 'coldsnap', cereal: 'coldsnap', spice: 'coldsnap', freezer: 'under', icetray: 'under', fridgetop: 'breeze', jars: 'breeze' };
  const roomMusic = () => { if (s && world.rooms[s.room]) Music.want(MUSIC_OF[world.rooms[s.room].id]); };
  const SFX = (function () {
    let ac = null, out = null, nb = null;
    function unlock() {
      // Safari can leave the sound 'interrupted' as well as 'suspended': wake it on any key, click or tap
      if (ac) { if (ac.state !== 'running' && ac.state !== 'closed' && !document.hidden) ac.resume().catch(() => {}); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ac = new AC();
        const master = ac.createGain(); master.gain.value = MASTER_GAIN;
        const lim = ac.createDynamicsCompressor();
        lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.15;
        master.connect(lim); lim.connect(ac.destination);
        out = ac.createGain(); out.gain.value = 0.3; out.connect(master);
        nb = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        Music.setEnabled(settings.music);
        Music.attach(ac, master, nb);
      } catch (e) { ac = null; }
    }
    function sleep(on) { if (!ac) return; try { if (on) ac.suspend(); else ac.resume(); } catch (e) { /* ignore */ } }
    function tone(f0, f1, dur, type, vol, delay) {
      if (!ac || !settings.sound) return;
      const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol, f0, q, f1, delay) {
      if (!ac || !settings.sound) return;
      const t = ac.currentTime + (delay || 0), src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = nb; fl.type = 'bandpass'; fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = q || 1;
      g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(fl); fl.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.03);
    }
    const S = {
      jump() { tone(360, 700, 0.1, 'square', 0.06); },
      land() { noise(0.05, 0.1, 420, 0.8); },
      erase() { noise(0.12, 0.16, 2600, 0.8, 1300); },
      rub() { noise(0.28, 0.22, 1900, 0.6, 500); },
      draw() { noise(0.2, 0.14, 3400, 2.2, 5600); },
      dash() { noise(0.2, 0.2, 800, 1.1, 2600); tone(220, 480, 0.12, 'triangle', 0.05); },
      tear() { noise(0.3, 0.26, 2800, 0.9, 700); },
      flip() { noise(0.06, 0.18, 1500, 0.7); noise(0.08, 0.13, 2300, 0.7, 0, 0.07); },
      nope() { tone(170, 120, 0.12, 'square', 0.06); },
      hurt() { tone(330, 110, 0.25, 'sawtooth', 0.09); },
      spike() { tone(520, 140, 0.22, 'square', 0.08); },
      die() { tone(420, 70, 0.6, 'triangle', 0.13); },
      kill() { noise(0.1, 0.2, 700, 1); tone(620, 200, 0.1, 'square', 0.05); },
      scrap() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0, 0.16, 'triangle', 0.09, i * 0.07)); },
      power() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.22, 'square', 0.05, i * 0.09)); },
      book() { tone(880, 0, 0.25, 'sine', 0.1); tone(1320, 0, 0.3, 'sine', 0.07, 0.08); },
      bonk() { tone(210, 160, 0.05, 'square', 0.035); },
      stick() { noise(0.07, 0.16, 2600, 2.5, 1700); },
      walljump() { noise(0.05, 0.12, 900, 1); },
      glide() { noise(0.35, 0.08, 700, 0.8, 1600); },
      splash() { noise(0.18, 0.2, 500, 0.9, 1400); tone(520, 880, 0.12, 'triangle', 0.06); },
      drip() { tone(1400, 700, 0.08, 'sine', 0.05); tone(1800, 900, 0.06, 'sine', 0.03, 0.06); },
      boing(n) { tone(220 + n * 80, 660 + n * 220, 0.16, 'triangle', 0.08); tone(330 + n * 120, 990 + n * 300, 0.12, 'sine', 0.04, 0.03); },
      door() { noise(0.09, 0.16, 1300, 0.7); noise(0.12, 0.12, 2400, 0.7, 0, 0.08); tone(660, 990, 0.18, 'sine', 0.05, 0.05); },
      zip() { tone(300, 1100, 0.14, 'sine', 0.08); noise(0.12, 0.08, 1800, 1.4, 3600); },
      clank() { tone(1250, 900, 0.07, 'square', 0.045); tone(1880, 0, 0.12, 'triangle', 0.04, 0.01); noise(0.04, 0.12, 4200, 2); },
      win() { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0, 0.26, 'triangle', 0.09, i * 0.13)); },
    };
    return { unlock, sleep, play(n, a) { try { if (S[n]) S[n](a); } catch (e) { /* audio is optional */ } } };
  })();

  /* ================= input ================= */
  const ACTS = ['left', 'right', 'down', 'jump', 'erase', 'dash', 'flip'];
  const src = { kb: {}, touch: {}, pad: {} };
  const held = {}, pressed = {};
  let lastLR = 'right';
  ACTS.forEach(a => { held[a] = false; pressed[a] = false; });
  function setSrc(from, act, on) {
    src[from][act] = on;
    const now = !!(src.kb[act] || src.touch[act] || src.pad[act]);
    if (now && !held[act]) { pressed[act] = true; if (act === 'left' || act === 'right') lastLR = act; }
    held[act] = now;
  }
  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyZ: 'jump', ArrowUp: 'jump', KeyW: 'jump',
    KeyX: 'erase', KeyJ: 'erase', KeyV: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyL: 'dash', KeyF: 'flip',
  };
  window.addEventListener('keydown', (e) => {
    SFX.unlock();
    if (screen === 'power' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Escape')) { e.preventDefault(); if (!e.repeat) closePower(); return; }
    if (screen === 'play') {
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyM') { e.preventDefault(); openMenu(); return; }
      if (e.code === 'KeyH') { toggleBoxes(); return; }
      const act = KEYS[e.code];
      if (act) { e.preventDefault(); if (!e.repeat) setSrc('kb', act, true); }
    } else if (screen === 'menu' && (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyM')) { e.preventDefault(); closeMenu(); }
  });
  window.addEventListener('keyup', (e) => { const act = KEYS[e.code]; if (act) setSrc('kb', act, false); });
  window.addEventListener('blur', () => { touchOwners.clear(); ACTS.forEach(a => { setSrc('kb', a, false); setSrc('touch', a, false); }); document.querySelectorAll('.tb').forEach(b => b.classList.remove('on')); });

  let touchMode = false;
  // Touch controls are rebuilt from the browser's own list of fingers that are down (e.touches) on every
  // touch event, so a finger whose "lifted" event never arrived cannot leave a button stuck on.
  const touchOwners = new Map(); // touch identifier -> 'dpad' or an action name
  let syncTouches = () => {};
  function bindTouch() {
    const dp = $('dpad'), dbtn = [...dp.querySelectorAll('.tb')], actBtns = [...document.querySelectorAll('.tb[data-act]')];
    const dirBtn = (d) => dbtn.find((b) => Number(b.dataset.dir) === d);
    // which d-pad button is nearest the finger: -1 left, 1 right, 0 down
    const dpadDir = (x, y) => {
      let best = 1, bd = Infinity;
      for (const b of dbtn) { const r = b.getBoundingClientRect(), d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2); if (d < bd) { bd = d; best = Number(b.dataset.dir); } }
      return best;
    };
    const showDirs = (l, r, dn) => { dirBtn(-1).classList.toggle('on', l); dirBtn(1).classList.toggle('on', r); dirBtn(0).classList.toggle('on', dn); };
    syncTouches = (list) => {
      const live = new Map(); if (list) for (const t of list) live.set(t.identifier, t);
      for (const id of [...touchOwners.keys()]) if (!live.has(id)) touchOwners.delete(id);
      let l = false, r = false, dn = false; const acts = {};
      for (const [id, o] of touchOwners) {
        if (o !== 'dpad') { acts[o] = true; continue; }
        const t = live.get(id), d = dpadDir(t.clientX, t.clientY);
        if (d < 0) l = true; else if (d > 0) r = true; else dn = true;
      }
      setSrc('touch', 'left', l); setSrc('touch', 'right', r); setSrc('touch', 'down', dn); showDirs(l, r, dn);
      for (const b of actBtns) { const on = !!acts[b.dataset.act]; setSrc('touch', b.dataset.act, on); b.classList.toggle('on', on); }
    };
    document.addEventListener('touchstart', (e) => {
      let ours = false;
      for (const t of e.changedTouches) {
        const el = t.target && t.target.closest ? t.target.closest('#dpad, .tb[data-act]') : null;
        if (!el) continue;
        touchOwners.set(t.identifier, el.id === 'dpad' ? 'dpad' : el.dataset.act); ours = true;
      }
      if (ours) { e.preventDefault(); SFX.unlock(); if (!touchMode) { touchMode = true; layout(); } }
      syncTouches(e.touches);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => { if (touchOwners.size) { e.preventDefault(); syncTouches(e.touches); } }, { passive: false });
    document.addEventListener('touchend', (e) => syncTouches(e.touches));
    document.addEventListener('touchcancel', (e) => syncTouches(e.touches));
    // a mouse or pen still works through pointer events (touch is handled above)
    actBtns.forEach((b) => {
      const act = b.dataset.act, ids = new Set();
      const down = (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); SFX.unlock(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } ids.add(e.pointerId); setSrc('touch', act, true); b.classList.add('on'); };
      const up = (e) => { if (e.pointerType === 'touch' || !ids.has(e.pointerId)) return; ids.delete(e.pointerId); if (!ids.size) { setSrc('touch', act, false); b.classList.remove('on'); } };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const pts = new Map();
    const upd = () => {
      let l = false, r = false, dn = false; for (const d of pts.values()) { if (d < 0) l = true; else if (d > 0) r = true; else dn = true; }
      setSrc('touch', 'left', l); setSrc('touch', 'right', r); setSrc('touch', 'down', dn); showDirs(l, r, dn);
    };
    dp.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); SFX.unlock(); try { dp.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } pts.set(e.pointerId, dpadDir(e.clientX, e.clientY)); upd(); });
    dp.addEventListener('pointermove', (e) => { if (pts.has(e.pointerId)) { pts.set(e.pointerId, dpadDir(e.clientX, e.clientY)); upd(); } });
    const end = (e) => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); upd(); };
    dp.addEventListener('pointerup', end); dp.addEventListener('pointercancel', end); dp.addEventListener('lostpointercapture', end);
    dp.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function markTouch(e) { if (e && e.pointerType === 'touch' && !touchMode) { touchMode = true; layout(); } }
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !touchMode) { touchMode = true; layout(); } }, { passive: true });

  let padStart = false;
  function pollPad() {
    if (!navigator.getGamepads) return;
    let g = null; try { for (const x of navigator.getGamepads()) if (x) { g = x; break; } } catch (e) { return; }
    if (!g) return;
    const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed), ax = g.axes[0] || 0;
    setSrc('pad', 'left', b(14) || ax < -0.4); setSrc('pad', 'right', b(15) || ax > 0.4); setSrc('pad', 'down', b(13) || (g.axes[1] || 0) > 0.6);
    setSrc('pad', 'jump', b(0)); setSrc('pad', 'erase', b(2)); setSrc('pad', 'dash', b(1) || b(5) || b(7)); setSrc('pad', 'flip', b(4) || b(6));
    const st = b(9);
    if (st && !padStart) { if (screen === 'play') openMenu(); else if (screen === 'menu') closeMenu(); else if (screen === 'power') closePower(); }
    if (screen === 'power' && b(0) && !src.pad._a) closePower();
    src.pad._a = b(0);
    padStart = st;
  }

  /* ================= game flow ================= */
  let s = null, screen = 'title', saveSoon = false;
  const cv = $('screen'), ctx = cv.getContext('2d');
  let viewTiles = 20, viewK = 1, mode = 'desk';
  const cam = { x: 0, y: 0, look: 0, shake: 0 };

  function camTarget() {
    const p = s.p, r = world.rooms[s.room] || world.rooms[0], VW = viewTiles * T, VH = RH * T;
    const tx = p.x + p.w / 2 - VW / 2 + cam.look, ty = p.y + p.h / 2 - VH / 2 + 8;
    return {
      x: r.pw <= VW ? r.px + (r.pw - VW) / 2 : clamp(tx, r.px, r.px + r.pw - VW),
      y: r.ph <= VH ? r.py + (r.ph - VH) / 2 : clamp(ty, r.py, r.py + r.ph - VH),
    };
  }
  function updateCamera(snap) {
    if (!s) return;
    const p = s.p;
    if (Math.abs(p.vx) > 0.5) cam.look += (p.face * 18 - cam.look) * 0.04;
    const t = camTarget();
    if (snap || Math.hypot(t.x - cam.x, t.y - cam.y) > 260) { cam.x = t.x; cam.y = t.y; }
    else { cam.x += (t.x - cam.x) * 0.16; cam.y += (t.y - cam.y) * 0.16; }
    cam.shake *= 0.82; if (cam.shake < 0.05) cam.shake = 0;
  }

  let jumpMode = 'jump', dashMode = false, magTarget = null, lockedDoor = null, rainHinted = false;
  const jumpBtn = document.querySelector('.tb-jump'), dashBtn = document.querySelector('.tb-dash'), downBtn = document.querySelector('.tb-down');
  let dropMode = true;
  function tick() {
    const both = held.left && held.right;
    const inp = { l: held.left && !(both && lastLR === 'right'), r: held.right && !(both && lastLR === 'left'), down: held.down, jump: held.jump, jumpP: pressed.jump, erase: pressed.erase, dash: pressed.dash, flip: pressed.flip };
    ACTS.forEach(a => { pressed[a] = false; });
    const p0 = s.p, onBolt = !!(p0.hangB || p0.zipB), drawReady = !!(s.powers.pencil && p0.pencil && !p0.onGround && p0.coyote === 0 && !p0.wallDir && !onBolt && !s.dead && !s.freeze);
    const glideReady = !!(!drawReady && s.powers.plane && !p0.onGround && p0.coyote === 0 && !p0.wallDir && !onBolt && !s.dead && !s.freeze);
    const jm = drawReady ? 'draw' : glideReady ? 'glide' : 'jump';
    if (jm !== jumpMode) { jumpMode = jm; jumpBtn.classList.toggle('drawmode', jm === 'draw'); jumpBtn.classList.toggle('glidemode', jm === 'glide'); }
    const prevBook = s.book;
    step(s, inp);
    const canDrop = !s.dead && onOneWay(s);
    if (canDrop !== dropMode) { dropMode = canDrop; downBtn.classList.toggle('dim', !canDrop); }
    // which bolt Dash would zip to right now (ringed in red, and the Dash button becomes a magnet)
    const p1 = s.p;
    magTarget = s.powers.magnet && !s.dead && !s.freeze && !p1.zipB ? pickBolt(s, (held.right ? 1 : held.left ? -1 : 0) || p1.face, p1.hangB) : null;
    if (!!magTarget !== dashMode) { dashMode = !!magTarget; dashBtn.classList.toggle('magmode', dashMode); }
    // the first downpour without an umbrella: explain what just happened
    if (s.p.soaked && !rainHinted) { rainHinted = true; SFX.play('drip'); toast('Downpour! The rain shoves you down, so you cannot jump or climb through it.', 2800); }
    // a story door without the card: say so once per visit to that door
    if (world.doors.length && !s.powers.card) {
      const d = doorTouching(s);
      if (d && d !== lockedDoor) toast('This story door is locked. You need a library card.', 2200);
      lockedDoor = d;
    }
    for (const e of s.events) onEvent(e, prevBook);
    updateParts();
    updateCamera(false);
    if (winT > 0 && ++winT > 100) { winT = 0; openEnd(); }
    if (saveSoon) { saveSoon = false; saveGame(); }
  }

  function onEvent(e) {
    const p = s.p, cx = p.x + p.w / 2, fy = p.y + p.h;
    switch (e.type) {
      case 'jump':
        if (e.data > 0) { SFX.play('boing', e.data); burst(cx, fy, 6 + e.data * 5, { cols: ['#e2554b', COL.hilite, '#ffffff'], kind: 'spark', size: 1.6 + e.data * 0.5, sp: 1 + e.data * 0.5, a0: 0, spread: Math.PI, g: 0.02, life: 18 }); cam.shake = Math.max(cam.shake, e.data); }
        else { SFX.play('jump'); burst(cx, fy, 4, { cols: ['#b9b5aa'], sp: 0.7, a0: Math.PI, spread: Math.PI, g: 0.02, life: 16 }); }
        break;
      case 'land': SFX.play('land'); burst(cx, fy - 1, 5, { cols: ['#b9b5aa'], sp: 0.8, a0: Math.PI, spread: Math.PI, g: 0.01, life: 14, jx: 8 }); break;
      case 'dash': SFX.play('dash'); burst(cx, p.y + 7, 8, { cols: [COL.ink, COL.blot], kind: 'ink', size: 1.2, sp: 1.2, g: 0.08, life: 24 }); break;
      case 'draw': SFX.play('draw'); burst(cx, fy, 8, { cols: ['#55535c', '#8d8a94'], sp: 1, a0: 0, spread: Math.PI, g: 0.06, life: 20, jx: 30 }); break;
      case 'erase': SFX.play('erase'); break;
      case 'break': {
        const isS = e.data.code === TL.SCRIBBLE;
        SFX.play(isS ? 'rub' : 'tear'); cam.shake = Math.max(cam.shake, isS ? 1.5 : 2.5);
        for (const [tx, ty] of e.data.cells) burst(tx * T + 8, ty * T + 8, isS ? 9 : 10, isS
          ? { cols: [COL.eraser, '#3a3940', '#8d8a94'], sp: 1.4, size: 1.6, g: 0.12, life: 34, jx: 12, jy: 12 }
          : { cols: ['#efe2bd', '#fffdf6', '#d9c99f'], kind: 'flake', sp: 1.8, size: 2, g: 0.08, life: 44, jx: 10, jy: 12 });
        saveSoon = true; break;
      }
      case 'kill': SFX.play('kill'); burst(e.data.x + e.data.w / 2, e.data.y + e.data.h / 2, 12, { cols: [COL.blot, COL.bug, COL.eraser], kind: 'ink', size: 1.3, sp: 1.6, life: 30 }); break;
      case 'flip': SFX.play('flip'); flipSweep = 16; renderHud(); break;
      case 'flipFail': SFX.play('nope'); toast('Something is in the way. Step clear of the block first.', 1800); break;
      case 'hurt': SFX.play('hurt'); hurtFlash = 10; cam.shake = 3; burst(cx, p.y + 7, 8, { cols: [COL.red, '#ff9b8c'], sp: 1.6, life: 22 }); renderHud(); break;
      case 'spike': SFX.play('spike'); hurtFlash = 10; cam.shake = 3; renderHud(); break;
      case 'return': burst(cx, p.y + 7, 12, { cols: ['#b9b5aa', COL.hilite], kind: 'spark', size: 2, sp: 1.2, g: 0, life: 20 }); break;
      case 'die': SFX.play('die'); cam.shake = 4; renderHud(); break;
      case 'scrap': {
        SFX.play('scrap'); burst(cx, p.y + 6, 18, { cols: [COL.hilite, '#fff', '#ffb703'], kind: 'spark', size: 2.4, sp: 1.8, g: 0.02, life: 36 });
        const n = scrapCount(s);
        if (n < world.scrapN) scrapToast(e.data, n);
        saveSoon = true; renderHud(); break;
      }
      case 'win': Music.stop(); SFX.play('win'); winT = 1; burst(cx, p.y, 40, { cols: [COL.hilite, COL.red, COL.ink, '#5fb85b'], kind: 'flake', size: 2, sp: 2.6, g: 0.06, life: 70 }); saveSoon = true; renderHud(); break;
      case 'power': SFX.play('power'); burst(cx, p.y + 6, 24, { cols: [COL.hilite, '#fff'], kind: 'spark', size: 2.4, sp: 2.2, g: 0, life: 40 }); saveSoon = true; renderHud(); openPower(e.data); break;
      case 'book': SFX.play('book'); toast('Bookmarked. You come back here if you run out of hearts.', 2400); saveSoon = true; break;
      case 'heal': renderHud(); break;
      case 'room': {
        roomMusic();
        const first = !seenRooms.has(e.data); seenRooms.add(e.data);
        caption = { text: ROOM_NAME(e.data), t: first ? 150 : 80, max: first ? 150 : 80 };
        saveSoon = true; renderHud(); break;
      }
      case 'bonk': SFX.play('bonk'); break;
      case 'stick': SFX.play('stick'); burst(e.data > 0 ? p.x + p.w : p.x, p.y + 6, 4, { cols: ['#efe2aa', '#cdb36c'], sp: 0.6, g: 0.05, life: 14 }); break;
      case 'walljump': SFX.play('walljump'); burst(e.data > 0 ? p.x + p.w : p.x, p.y + 10, 6, { cols: ['#b9b5aa'], sp: 0.9, g: 0.02, life: 16 }); break;
      case 'glide': SFX.play('glide'); break;
      case 'zip': SFX.play('zip'); break;
      case 'drop': SFX.play('land'); burst(cx, fy, 4, { cols: ['#b9b5aa'], sp: 0.6, a0: 0, spread: Math.PI, g: 0.04, life: 12 }); break;
      case 'door': SFX.play('door'); flipSweep = 16; updateCamera(true); burst(p.x + p.w / 2, p.y + 7, 12, { cols: ['#fff3c4', COL.hilite, '#ffffff'], kind: 'spark', size: 2, sp: 1.3, g: 0, life: 22 }); break;
      case 'clank': { SFX.play('clank'); const b = p.hangB; if (b) burst(b.x + b.w / 2, b.y + b.h / 2, 6, { cols: ['#ffffff', '#cdd2da', '#d64538'], kind: 'spark', size: 1.6, sp: 1.1, g: 0, life: 14 }); break; }
      case 'paint': SFX.play('splash'); burst(p.x + p.w / 2, p.y + 7, 14, { cols: [PAINT[e.data][0], PAINT[e.data][1], '#ffffff'], kind: 'ink', size: 1.4, sp: 1.8, g: 0.12, life: 28 }); break;
      default: break;
    }
  }
  const seenRooms = new Set();

  /* ================= rendering ================= */
  function render() {
    const c = ctx, W = cv.width, H = cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = COL.paper; c.fillRect(0, 0, W, H);
    if (!s) return;
    const k = viewK, VW = viewTiles * T, VH = RH * T, frame = s.frame;
    const sh = REDUCED ? 0 : cam.shake, ox = sh ? (Math.random() - 0.5) * sh : 0, oy = sh ? (Math.random() - 0.5) * sh : 0;
    const camX = Math.round((cam.x + ox) * k) / k, camY = Math.round((cam.y + oy) * k) / k;
    c.setTransform(k, 0, 0, k, -camX * k, -camY * k);
    c.imageSmoothingEnabled = true;
    const view = { tx0: Math.floor(camX / T), ty0: Math.floor(camY / T), tx1: Math.floor((camX + VW) / T), ty1: Math.floor((camY + VH) / T) };
    world.rooms.forEach((r, ri) => {
      if (r.px >= camX + VW || r.px + r.pw <= camX || r.py >= camY + VH || r.py + r.ph <= camY) return;
      c.drawImage(roomCanvas(ri), r.px, r.py, r.pw, r.ph);
    });
    if (s.layer === 1) { c.fillStyle = 'rgba(212,71,61,.07)'; c.fillRect(camX, camY, VW, VH); }
    for (let ty = view.ty0; ty <= view.ty1; ty++) for (let tx = view.tx0; tx <= view.tx1; tx++) {
      const code = tileAt(s, tx, ty);
      if (code === TL.WIND) drawWind(c, tx, ty, frame);
      else if (code === TL.SCRIBBLE) drawScribble(c, tx, ty, frame);
      else if (code === TL.PERF) drawPerf(c, tx, ty, s);
      else if (code === TL.LA || code === TL.LB) drawLayerTile(c, tx, ty, code, s);
      else if (code >= TL.PO && code <= TL.PV) drawPaintTile(c, tx, ty, code, s, frame);
      else if (code === TL.RAIN) drawRain(c, tx, ty, frame);
    }
    if (theme().fireflies && !REDUCED) drawFireflies(c, camX, camY, VW, VH, frame);
    for (const e of world.ents) {
      if (e.x > camX + VW + 16 || e.x + e.w < camX - 16 || e.y > camY + VH + 16 || e.y + e.h < camY - 16) continue;
      if (e.k === 'scrap' && !s.got.has('s' + e.id)) drawScrapItem(c, e, frame);
      else if (e.k === 'power' && !s.powers[e.pw]) {
        const g = 0.5 + 0.5 * Math.sin(frame * 0.07);
        c.fillStyle = `rgba(255,225,74,${0.3 + g * 0.3})`; c.beginPath(); c.arc(e.x + 7, e.y + 7, 10 + g * 1.5, 0, 7); c.fill();
        powerIcon(c, e.pw, e.x, e.y, 14);
      } else if (e.k === 'book') drawBook(c, e, s.book === e.id, frame);
      else if (e.k === 'pot') drawPot(c, e, frame);
      else if (e.k === 'bolt') drawBolt(c, e, e === magTarget, frame);
      else if (e.k === 'door') drawDoor(c, e, !!s.powers.card, frame);
    }
    drawPlats(c, s);
    for (const e of s.enemies) drawEnemy(c, e, frame);
    drawPlayer(c, s, frame);
    drawParts(c);
    if (showBoxes) drawBoxes(c, s, view);

    // screen-space effects
    c.setTransform(k, 0, 0, k, 0, 0);
    if (flipSweep > 0 && !REDUCED) {
      const t = 1 - flipSweep / 16, x = VW * (1 - t) - 20;
      const g = c.createLinearGradient(x - 26, 0, x + 26, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,.75)'); g.addColorStop(0.62, 'rgba(46,45,53,.18)'); g.addColorStop(1, 'rgba(46,45,53,0)');
      c.fillStyle = g; c.fillRect(x - 26, 0, 52, VH);
    }
    if (hurtFlash > 0) { c.fillStyle = `rgba(212,71,61,${hurtFlash / 10 * 0.22})`; c.fillRect(0, 0, VW, VH); }
    if (s.dead > 0 && s.dead < 30) { c.fillStyle = `rgba(247,245,238,${(30 - s.dead) / 30})`; c.fillRect(0, 0, VW, VH); }
    if (caption) {
      const a = Math.min(1, caption.t / 20, (caption.max - caption.t + 1) / 10);
      c.save(); c.globalAlpha = a; c.font = '700 12px Kalam, "Comic Sans MS", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const w = c.measureText(caption.text).width + 18, x = VW / 2, y = 15;
      c.fillStyle = 'rgba(255,253,246,.92)'; c.save(); c.translate(x, y); c.rotate(-0.02); c.fillRect(-w / 2, -9, w, 18);
      c.fillStyle = 'rgba(235,215,150,.7)'; c.fillRect(-w / 2 - 4, -11, 12, 7); c.fillRect(w / 2 - 8, -11, 12, 7);
      c.fillStyle = COL.graphite; c.fillText(caption.text, 0, 0.5); c.restore(); c.restore();
    }
  }

  /* ================= HUD & screens ================= */
  const HEART = (full) => `<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 20 C4.5 14.5 1.8 10.5 3.6 6.6 C5.4 3 9.8 3.4 12 6.8 C14.2 3.4 18.6 3 20.4 6.6 C22.2 10.5 19.5 14.5 12 20 Z" fill="${full ? '#e2554b' : 'none'}" stroke="${full ? '#f7f5ee' : 'rgba(247,245,238,.6)'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  let hudKey = '';
  function renderHud() {
    if (!s) return;
    const n = scrapCount(s), p = s.p;
    const key = [p.hp, n, s.room, s.layer, s.powers.erase, s.powers.pencil, s.powers.dash, s.powers.flip, touchMode, mode].join('|');
    if (key === hudKey) return; hudKey = key;
    $('hearts').innerHTML = Array.from({ length: p.maxHp }, (_, i) => HEART(i < p.hp)).join('');
    $('hearts').setAttribute('aria-label', `${p.hp} of ${p.maxHp} hearts`);
    $('scrapTxt').textContent = `${n} / ${world.scrapN}`;
    const th = $('thumb'), tc = th.getContext('2d'); tc.setTransform(1, 0, 0, 1, 0, 0); tc.clearRect(0, 0, th.width, th.height); drawPuzzle(tc, 0, 0, th.width, th.height, gotPieces(s));
    $('where').textContent = ROOM_NAME(s.room);
    const chip = $('layerChip'); chip.hidden = !s.powers.flip; chip.innerHTML = (s.layer ? 'Back' : 'Front') + '<span class="chiplong"> of page</span>'; chip.classList.toggle('back', s.layer === 1);
    const lock = { erase: s.powers.erase, dash: s.powers.dash, flip: s.powers.flip };
    document.querySelectorAll('.tb[data-act]').forEach((b) => { const a = b.dataset.act; if (a in lock) b.classList.toggle('locked', !lock[a]); });
    renderKeys();
  }
  const toolSeen = (k) => !!(s && s.powers[k]) || TOOLS_BY_WORLD.findIndex((l) => l.includes(k)) <= wi;
  function renderKeys() {
    const P = s ? s.powers : {};
    const items = [['← →', 'move', true], ['Space', 'jump', true], ['↓', 'drop through a ledge', true], ['X', 'erase', P.erase], ['Space', 'in midair: draw', P.pencil], ['V', 'dash', P.dash], ['F', 'flip', P.flip]];
    if (toolSeen('tape')) items.push(['Space', 'on a wall: climb', P.tape]);
    if (toolSeen('plane')) items.push(['Hold Space', 'glide', P.plane]);
    if (toolSeen('magnet')) items.push(['V', 'near a bolt: zip', P.magnet]);
    if (toolSeen('card')) items.push(['← →', 'into a door: travel', P.card]);
    if (toolSeen('spring')) items.push(['Space ×3', 'bounce higher', P.spring]);
    items.push(['Esc', 'pause & map', true]);
    $('keys').innerHTML = items.map(([k, l, on]) => `<span class="${on ? '' : 'dim'}"><kbd>${k}</kbd>${on ? l : '???'}</span>`).join('');
  }
  function toggleBoxes() {
    showBoxes = !showBoxes;
    if (showBoxes && screen === 'play') toast('Hitboxes on: blue is you, red hurts, pink is your eraser.', 2600);
  }
  function toast(text, ms, canvasNode) {
    const box = $('toasts');
    caption = null;
    while (box.children.length > 1) box.firstChild.remove();
    const el = document.createElement('div'); el.className = 'toast';
    if (canvasNode) el.appendChild(canvasNode);
    const sp = document.createElement('span'); sp.textContent = text; el.appendChild(sp);
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms || 2000);
  }
  function scrapToast(id, n) {
    const c = document.createElement('canvas'); c.width = 124; c.height = 78;
    drawPuzzle(c.getContext('2d'), 0, 0, 124, 78, gotPieces(s), PIECE_OFS[wi][id]);
    toast(`Scrap ${n} of ${world.scrapN}`, 2400, c);
  }

  const POWERS = {
    erase: { name: 'The Eraser', how: 'Rub out scribbled walls and scribble bugs. The pink block that pops out in front of you is exactly what it touches.', kb: 'Press X to erase.', touch: 'Tap Erase.' },
    pencil: { name: 'The Pencil', how: 'Jump again while you are in the air. You draw a short line under your feet and stop right on it. Then jump again from the line to keep going. You get one line per jump, and it recharges when you land on solid paper. The line stays for a few seconds.', kb: 'Press Space in midair to draw, then Space again to jump off the line.', touch: 'Tap Jump in midair to draw, then tap Jump again to jump off the line. The button turns into Draw when the pencil is ready.' },
    dash: { name: 'Ink Dash', how: 'Shoot sideways in a straight line, even in midair. Dash into a dotted, perforated wall to tear right through it. One dash per jump.', kb: 'Press V or Shift to dash.', touch: 'Tap Dash.' },
    flip: { name: 'Page Flip', how: 'Flip to the back of the page. Blue ink blocks are solid on the front, red pencil blocks are solid on the back. You can flip in midair.', kb: 'Press F to flip.', touch: 'Tap Flip.' },
    tape: { name: 'Sticky Tape', how: 'Push against a wall while you are in the air and you stick to it, sliding down slowly. Keep holding toward the wall and press jump to hop up it. Push away and jump to leap off. Tape will not stick to shiny plastic.', kb: 'Hold ← or → into a wall, then press Space to climb.', touch: 'Hold the arrow toward a wall, then tap Jump to climb.' },
    brush: { name: 'The Paintbrush', how: 'Walk into a paint pot to paint yourself its color. Then you can walk straight through wet paint walls of that same color. Walls of the other colors stay solid, so think about which pot to visit next.', kb: 'Walk into a paint pot to change color.', touch: 'Walk into a paint pot to change color.' },
    umbrella: { name: 'The Umbrella', how: 'Downpours are falling all over the backyard. Without cover, the rain shoves you straight down, so you cannot jump, climb, glide or draw your way up through it. With your umbrella, the rain cannot touch you. It opens by itself whenever you step into a downpour.', kb: 'Nothing to press. Just walk into the rain.', touch: 'Nothing to press. Just walk into the rain.' },
    spring: { name: 'Spring Shoes', how: 'Bouncy shoes! Jump again the moment you land and you bounce higher. Do it a third time in a row for the biggest bounce of all. Stand still too long and the bounce resets. Toy blocks are shiny plastic, so tape will not help you climb them.', kb: 'Press Space again the moment you land. Three in a row for the big one.', touch: 'Tap Jump again the moment you land. Three in a row for the big one.' },
    card: { name: 'Library Card', how: 'Story doors are hidden all over the library, and every door has a twin with the same color and mark. With your library card, walk into a door and you step out of its twin, still moving the way you were going. Some doors lead to places you could never reach any other way.', kb: 'Walk into an open door. Step out of it and back in to go back.', touch: 'Walk into an open door. Step out of it and back in to go back.' },
    magnet: { name: 'Fridge Magnet', how: 'Metal bolts are all over the kitchen. Press Dash near one and you zip straight to it and hang there, even on ice or shiny plastic that tape cannot grip. From a bolt, press Dash again to zip to the next one, or jump to let go. A red ring shows which bolt you will zip to.', kb: 'Press V or Shift near a bolt to zip. Space lets go with a jump.', touch: 'Tap Dash near a bolt to zip. The button turns into a magnet when one is in reach. Tap Jump to let go.' },
    plane: { name: 'Paper Airplane', how: 'Hold jump while you are falling to glide. You drift down slowly and fly faster sideways. Glide into an updraft and it carries you up.', kb: 'Hold Space while you fall.', touch: 'Hold Jump while you fall. The button shows a plane when you can glide.' },
  };
  function openPower(pw) {
    const d = POWERS[pw]; if (!d) return;
    screen = 'power';
    $('pwName').textContent = d.name; $('pwHow').textContent = d.how; $('pwKeys').textContent = touchMode ? d.touch : d.kb;
    const ic = $('pwIcon'), c = ic.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, ic.width, ic.height);
    c.fillStyle = 'rgba(255,225,74,.55)'; c.beginPath(); c.arc(76, 76, 66, 0, 7); c.fill();
    powerIcon(c, pw, 22, 22, 108);
    Music.muffle(true);
    $('modalPower').hidden = false; ACTS.forEach(a => { setSrc('kb', a, false); setSrc('touch', a, false); });
    document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
    powerOpenedAt = performance.now();
    setTimeout(() => $('btnGotIt').focus(), 30);
  }
  let powerOpenedAt = 0;
  function closePower() {
    if (performance.now() - powerOpenedAt < 350) return;
    $('modalPower').hidden = true; screen = 'play'; unfocus(); Music.muffle(false); ACTS.forEach(a => { pressed[a] = false; });
  }

  function openMenu() {
    if (!s) return;
    screen = 'menu'; ACTS.forEach(a => { setSrc('kb', a, false); setSrc('touch', a, false); pressed[a] = false; });
    document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
    $('sheetMenu').hidden = false; armRestart(false); Music.muffle(true); renderNowPlaying();
    $('mapTitle').textContent = 'Map · ' + ROOM_NAME(s.room);
    const n = scrapCount(s);
    $('menuPicNote').textContent = n === world.scrapN ? 'Complete!' : `${n} of ${world.scrapN} scraps. ${world.scrapN - n} still out there.`;
    $('btnBookmark').textContent = s.book >= 0 ? 'Back to last bookmark' : 'Back to the start';
    $('btnWorldStart').hidden = s.book < 0; // a way out even if your bookmark is somewhere you are stuck
    renderHowto();
    requestAnimationFrame(() => { drawMap(); const mp = $('menuPic'); const c = mp.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); drawPuzzle(c, 0, 0, mp.width, mp.height, gotPieces(s)); });
    setTimeout(() => $('btnResume').focus(), 30);
  }
  function closeMenu() { $('sheetMenu').hidden = true; screen = 'play'; unfocus(); Music.muffle(false); }
  function renderNowPlaying() {
    const t = Music.title();
    $('nowPlaying').innerHTML = settings.music ? (t ? `Now playing: <i>${t}</i>` : '') : 'The music is off.';
    const m = $('tglMusic'); m.setAttribute('aria-pressed', String(settings.music)); m.textContent = 'Music: ' + (settings.music ? 'on' : 'off');
    const f = $('tglSound'); f.setAttribute('aria-pressed', String(settings.sound)); f.textContent = 'Sound effects: ' + (settings.sound ? 'on' : 'off');
  }
  function unfocus() { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }
  function renderHowto() {
    const P = s.powers, t = touchMode;
    const rows = [
      [true, 'Move', t ? 'arrow pad' : '← → or A D'],
      [true, 'Jump', t ? 'Jump' : 'Space, Z or ↑ (hold for higher)'],
      [true, 'Drop through a ledge', t ? 'hold the ↓ button while standing on a ruler or a drawn line' : '↓ or S while standing on a ruler or a drawn line'],
      [P.erase, 'Erase', t ? 'Erase' : 'X'],
      [P.pencil, 'Draw a ledge', 'jump again in midair'],
      [P.dash, 'Ink dash', t ? 'Dash' : 'V or Shift'],
      [P.flip, 'Flip the page', t ? 'Flip' : 'F'],
      ...(toolSeen('tape') ? [[P.tape, 'Climb a wall', t ? 'hold the arrow into a wall, tap Jump' : 'hold ← or → into a wall, press Space']] : []),
      ...(toolSeen('plane') ? [[P.plane, 'Glide', 'hold jump while you fall']] : []),
      ...(toolSeen('brush') ? [[P.brush, 'Paint', 'walk into a paint pot, then through walls of that color']] : []),
      ...(toolSeen('umbrella') ? [[P.umbrella, 'Umbrella', 'keeps the rain off, so you can jump and climb through downpours']] : []),
      ...(toolSeen('spring') ? [[P.spring, 'Super bounce', 'jump again the moment you land; the third jump in a row is the highest']] : []),
      ...(toolSeen('card') ? [[P.card, 'Story doors', 'walk into an open door to come out of the one with the same color and mark']] : []),
      ...(toolSeen('magnet') ? [[P.magnet, 'Zip to a bolt', (t ? 'tap Dash' : 'V or Shift') + ' near a metal bolt (the red ring shows which one); jump to let go']] : []),
      [true, 'Pause & map', t ? 'Pause button' : 'Esc, P, M or the Pause button'],
    ];
    $('howto').innerHTML = rows.map(([on, what, how]) => `<li class="${on ? '' : 'dim'}"><b>${on ? what : '???'}</b>: ${on ? how : 'find it first'}</li>`).join('') +
      (t ? '' : '<li>A gamepad works too.</li>');
  }
  function drawMap(now) {
    const m = $('mapCanvas'), cssW = m.clientWidth || 400, dpr = Math.min(window.devicePixelRatio || 1, 3), tw = cssW / world.W;
    m.style.aspectRatio = world.W + ' / ' + world.H;
    const mw = Math.round(cssW * dpr), mh = Math.round(world.H * tw * dpr);
    if (m.width !== mw || m.height !== mh) { m.width = mw; m.height = mh; }
    const c = m.getContext('2d'); c.setTransform(dpr * tw, 0, 0, dpr * tw, 0, 0);
    c.fillStyle = '#e4dfd0'; c.fillRect(0, 0, world.W, world.H);
    world.rooms.forEach((r, ri) => {
      if (!s.explored.has(ri)) {
        c.save(); c.setLineDash([0.6, 0.6]); c.strokeStyle = 'rgba(46,45,53,.3)'; c.lineWidth = 0.15; c.strokeRect(r.x0 + 0.3, r.y0 + 0.3, r.tw - 0.6, r.th - 0.6); c.restore();
        return;
      }
      c.fillStyle = r.paper === 'kraft' ? '#efe3c9' : theme().mapBg; c.fillRect(r.x0, r.y0, r.tw, r.th);
      for (let ty = r.y0; ty < r.y0 + r.th; ty++) for (let tx = r.x0; tx < r.x0 + r.tw; tx++) {
        const code = s.tiles[ty * world.W + tx];
        if (!code) continue;
        if (code === 1) c.fillStyle = '#5b5962';
        else if (code === 2) { c.fillStyle = '#b08a3c'; c.fillRect(tx, ty, 1, 0.35); continue; }
        else if (code === 3) { c.fillStyle = COL.spike; c.fillRect(tx, ty + 0.45, 1, 0.55); continue; }
        else if (code === 4) c.fillStyle = '#2b2a31';
        else if (code === 5) c.fillStyle = '#cdb983';
        else if (code === 6) c.fillStyle = s.layer === 0 ? COL.ink : 'rgba(53,102,207,.3)';
        else if (code === 7) c.fillStyle = s.layer === 1 ? COL.red : 'rgba(212,71,61,.3)';
        else if (code === 8) c.fillStyle = '#93a9c6';
        else if (code === 9) c.fillStyle = 'rgba(110,170,250,.32)';
        else if (code >= 10 && code <= 12) c.fillStyle = PAINT[code - 9][0];
        else if (code === 13) c.fillStyle = '#9fd3e8';
        else if (code === 14) c.fillStyle = 'rgba(90,120,210,.4)';
        c.fillRect(tx, ty, 1, 1);
      }
      c.strokeStyle = COL.graphite; c.lineWidth = 0.3; c.strokeRect(r.x0 + 0.15, r.y0 + 0.15, r.tw - 0.3, r.th - 0.3);
    });
    for (const e of world.ents) {
      if (!s.explored.has(e.room)) continue;
      const ex = (e.x + e.w / 2) / T, ey = (e.y + e.h / 2) / T;
      if (e.k === 'scrap' && !s.got.has('s' + e.id)) {
        c.fillStyle = 'rgba(255,225,74,.85)'; c.beginPath(); c.arc(ex, ey, 1.35, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.fillRect(ex - 0.6, ey - 0.6, 1.2, 1.2); c.strokeStyle = COL.graphite; c.lineWidth = 0.18; c.strokeRect(ex - 0.6, ey - 0.6, 1.2, 1.2);
      } else if (e.k === 'power' && !s.powers[e.pw]) {
        c.fillStyle = 'rgba(255,225,74,.85)'; c.beginPath(); c.arc(ex, ey, 1.5, 0, 7); c.fill();
        powerIcon(c, e.pw, ex - 0.9, ey - 0.9, 1.8);
      } else if (e.k === 'door') {
        c.fillStyle = (DOOR_LOOK[e.ch] || ['#888'])[0]; c.fillRect(ex - 0.45, ey - 0.9, 0.9, 1.8); c.strokeStyle = COL.graphite; c.lineWidth = 0.12; c.strokeRect(ex - 0.45, ey - 0.9, 0.9, 1.8);
      } else if (e.k === 'bolt') {
        c.fillStyle = '#8a909c'; c.beginPath(); c.arc(ex, ey, 0.34, 0, 7); c.fill();
      } else if (e.k === 'pot') {
        c.fillStyle = PAINT[e.color][0]; c.beginPath(); c.arc(ex, ey, 0.9, 0, 7); c.fill(); c.strokeStyle = COL.graphite; c.lineWidth = 0.15; c.stroke();
      } else if (e.k === 'book') {
        c.fillStyle = s.book === e.id ? COL.red : '#e9a299'; c.beginPath(); c.moveTo(ex - 0.35, ey - 1); c.lineTo(ex + 0.35, ey - 1); c.lineTo(ex + 0.35, ey + 0.8); c.lineTo(ex, ey + 0.5); c.lineTo(ex - 0.35, ey + 0.8); c.closePath(); c.fill();
      }
    }
    const p = s.p, px = (p.x + p.w / 2) / T, py = (p.y + p.h / 2) / T;
    const pulse = REDUCED ? 0.6 : (Math.sin((now || 0) / 230) + 1) / 2;
    c.fillStyle = 'rgba(255,225,74,.55)'; c.beginPath(); c.arc(px, py, 1.8, 0, 7); c.fill();
    c.strokeStyle = `rgba(212,71,61,${0.85 - pulse * 0.5})`; c.lineWidth = 0.32; c.beginPath(); c.arc(px, py, 1.9 + pulse * 1.6, 0, 7); c.stroke();
    c.fillStyle = COL.hilite; c.fillRect(px - 0.55, py - 0.65, 1.1, 1.3); c.strokeStyle = COL.graphite; c.lineWidth = 0.22; c.strokeRect(px - 0.55, py - 0.65, 1.1, 1.3);
  }
  let restartArmed = 0;
  function armRestart(on) {
    const b = $('btnRestart');
    restartArmed = on ? performance.now() : 0;
    b.textContent = on ? 'Tap again to erase all progress' : 'Start over';
  }

  /* ---------- saves: one record per world, tools carry over ---------- */
  // the tools each world hands out; a world starts with every tool from the worlds before it
  const TOOLS_BY_WORLD = [['erase', 'pencil', 'dash', 'flip'], ['tape', 'plane'], ['brush'], ['magnet'], ['card'], ['spring'], ['umbrella']];
  const blankGame = () => ({ v: 2, cur: 0, powers: {}, worlds: [null, null] });
  function loadGame() {
    let g = store.get(SAVE_KEY);
    if (!g || !Array.isArray(g.worlds)) {
      const v1 = store.get(SAVE_V1);
      g = blankGame();
      if (v1) { g.worlds[0] = v1; g.powers = Object.assign({}, v1.powers || {}); }
    }
    if (!g.powers || typeof g.powers !== 'object') g.powers = {};
    while (g.worlds.length < BUILT.length) g.worlds.push(null);
    delete g.open; delete g.grants; // the temporary Worlds 1-6 unlock is gone: worlds open one at a time again
    // resume the world you were last in, if you have reached it
    const cur = Number.isInteger(g.cur) ? g.cur : 0, prev = g.worlds[cur - 1], here = g.worlds[cur];
    g.cur = cur > 0 && cur < BUILT.length && ((prev && prev.done) || (here && here.explored && here.explored.length)) ? cur : 0;
    return g;
  }
  let game = loadGame();
  const unlocked = (w) => w === 0 || !!(game.worlds[w - 1] && game.worlds[w - 1].done);
  function powersFor(w) {
    const p = Object.assign({}, game.powers);
    for (let i = 0; i < w; i++) for (const k of TOOLS_BY_WORLD[i] || []) p[k] = true;
    return p;
  }
  const hasProgress = (ws) => !!(ws && ((ws.got && ws.got.length) || (ws.explored && ws.explored.length > 1)));
  function saveGame() {
    if (s && s.world === world) { game.worlds[wi] = makeSave(s); for (const k of Object.keys(s.powers)) if (s.powers[k]) game.powers[k] = true; game.cur = wi; }
    store.set(SAVE_KEY, game);
  }
  function setWorld(w) { wi = w; world = BUILT[w]; roomCache.clear(); hudKey = ''; jumpMode = ''; magTarget = null; rainHinted = false; }

  function openTitle() {
    screen = 'title';
    const any = game.worlds.some(hasProgress), cur = game.cur;
    $('btnPlay').textContent = any ? 'Continue' : 'Start';
    $('btnNew').hidden = !any;
    renderLevelSelect();
    const ws = game.worlds[cur], ghost = ws ? newState(BUILT[cur], ws, powersFor(cur)) : null;
    const tp = $('titlePic'), c = tp.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0);
    drawPuzzle(c, 0, 0, tp.width, tp.height, gotPieces(ghost, cur), undefined, cur);
    const n = ghost ? scrapCount(ghost) : 0;
    $('titlePicNote').textContent = (unlocked(1) ? WL[cur].name + ': ' : '') + (n ? `${n} of ${BUILT[cur].scrapN} scraps found` : 'your drawing, waiting for its scraps');
    $('titleHint').textContent = touchMode || matchMedia('(pointer: coarse)').matches
      ? 'Move with the arrow pad and tap Jump. New buttons show up as you find new tools. Pause shows the map.'
      : 'Arrow keys move, Space jumps. Esc pauses and shows the map. Your progress saves at every scrap and bookmark.';
    $('sheetTitle').hidden = false;
    setTimeout(() => $('btnPlay').focus(), 30);
  }
  function startGame(fresh, w) {
    SFX.unlock();
    if (fresh) { game = blankGame(); store.del(SAVE_V1); }
    enterWorld(w === undefined ? game.cur : w, false);
  }
  function enterWorld(w, intro) {
    if (!reached(w)) w = 0;
    setWorld(w);
    s = newState(world, game.worlds[w], powersFor(w));
    seenRooms.clear(); s.explored.forEach(r => { if (r !== s.room) seenRooms.add(r); });
    parts.length = 0; trail.length = 0; caption = null; winT = 0; hudKey = '';
    $('sheetTitle').hidden = true; $('sheetEnd').hidden = true; $('sheetMenu').hidden = true;
    screen = 'play'; unfocus(); Music.muffle(false);
    // replay the room event the constructor produced so the caption shows
    for (const e of s.events) onEvent(e);
    s.events.length = 0;
    updateCamera(true); renderHud(); layout();
    if (intro) toast(`World ${w + 1}: ${WL[w].name}`, 2800);
    saveGame();
  }
  function openEnd() {
    screen = 'end';
    saveGame();
    // the real ending is the last planned world; a world that is just the newest one so far teases the next page
    const final = wi === TOOLS_BY_WORLD.length - 1, last = wi === BUILT.length - 1;
    const TEASE = ['But past the edge of the page, more scraps are scattered across the desk.',
      'But down the hall the art room door is open, and more scraps are waiting inside.',
      'But a trail of scraps leads out of the art room and toward the kitchen.',
      'But a trail of scraps leads off into the library.',
      'But a trail of scraps leads straight into the toy box.',
      'But the back door is open, and the last scraps have blown out into the yard.'];
    $('endTitle').textContent = final ? 'Every drawing is whole again.' : 'The drawing is whole again.';
    $('endLede').textContent = final
      ? 'Every scrap from every world is back where it belongs. The doodle can finally take a rest.'
      : 'All twelve scraps are back where they belong. ' + (TEASE[wi] || '') + (last ? ' That page is still being drawn.' : '');
    $('btnNext').textContent = `Turn the page: World ${wi + 2}`;
    const ep = $('endPic'), c = ep.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0);
    drawPuzzle(c, 0, 0, ep.width, ep.height, gotPieces(s));
    // the real ending: every world's drawing, side by side
    const gal = $('endGallery'); gal.hidden = !final; gal.innerHTML = '';
    if (final) BUILT.forEach((bw, w) => {
      const ws = game.worlds[w], ghost = ws ? newState(bw, ws, powersFor(w)) : null;
      const cv2 = document.createElement('canvas'); cv2.width = 240; cv2.height = 150; cv2.style.setProperty('--r', ((w % 2 ? 1 : -1) * (1 + (w % 3))) + 'deg');
      cv2.setAttribute('aria-label', WL[w].name); cv2.title = WL[w].name;
      drawPuzzle(cv2.getContext('2d'), 0, 0, 240, 150, gotPieces(ghost, w), undefined, w);
      gal.appendChild(cv2);
    });
    const secs = Math.round(s.time / 60), mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
    $('stats').innerHTML = `<span>Time: <b>${mm}:${ss}</b></span><span>Crumpled: <b>${s.deaths}</b> ${s.deaths === 1 ? 'time' : 'times'}</span><span>Scraps: <b>${world.scrapN} / ${world.scrapN}</b></span>`;
    $('btnNext').hidden = last; $('btnAgain').hidden = !final;
    $('sheetEnd').hidden = false;
    Music.want('finale');
    setTimeout(() => (final ? $('btnAgain') : last ? $('btnLook') : $('btnNext')).focus(), 30);
  }

  /* ---------- buttons ---------- */
  $('btnPlay').addEventListener('click', () => startGame(false));
  $('btnNew').addEventListener('click', () => startGame(true));
  $('btnPause').addEventListener('click', () => { if (screen === 'play') openMenu(); });
  $('btnResume').addEventListener('click', closeMenu);
  $('tglMusic').addEventListener('click', () => { SFX.unlock(); settings.music = !settings.music; saveSettings(); Music.setEnabled(settings.music); renderNowPlaying(); });
  $('tglSound').addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); renderNowPlaying(); });
  // stuck somewhere, even at your bookmark? go back to where this world begins (you keep every scrap)
  $('btnWorldStart').addEventListener('click', () => { if (!s) return; s.book = -1; $('btnBookmark').click(); saveGame(); });
  $('btnBookmark').addEventListener('click', () => { if (!s) return; respawn(s); s.events.length = 0; parts.length = 0; caption = { text: ROOM_NAME(s.room), t: 80, max: 80 }; roomMusic(); updateCamera(true); hudKey = ''; renderHud(); closeMenu(); });
  $('btnRestart').addEventListener('click', () => {
    const since = performance.now() - restartArmed;
    if (restartArmed && since < 700) return; // ignore a quick double tap
    if (restartArmed && since < 5000) { armRestart(false); startGame(true); }
    else { armRestart(true); setTimeout(() => { if (restartArmed && performance.now() - restartArmed >= 4900) armRestart(false); }, 5000); }
  });
  $('btnGotIt').addEventListener('click', closePower);
  $('btnAgain').addEventListener('click', () => { $('sheetEnd').hidden = true; saveGame(); openTitle(); }); // never wipes your saves
  $('btnNext').addEventListener('click', () => { if (unlocked(wi + 1)) enterWorld(wi + 1, true); });
  // level select on the title screen: jump straight into any world (handy for testing)
  // a world counts as reached once you have finished the one before it (or already played it)
  const reached = (w) => w === 0 || unlocked(w) || hasProgress(game.worlds[w]);
  function renderLevelSelect() {
    const row = $('chapters');
    if (!row.querySelector('button')) WL.forEach((w, i) => {
      const b = document.createElement('button');
      b.className = 'btn quiet'; b.id = 'btnWorld' + (i + 1);
      b.addEventListener('click', () => { if (!reached(i)) return; SFX.unlock(); enterWorld(i, true); });
      row.appendChild(b);
    });
    WL.forEach((w, i) => {
      const b = $('btnWorld' + (i + 1)), ok = reached(i);
      b.disabled = !ok; b.classList.toggle('locked', !ok);
      b.textContent = ok ? `${i + 1} · ${w.name}` : `${i + 1} · Locked`;
      b.title = ok ? `Play ${w.name}` : `Finish World ${i} to unlock`;
    });
  }
  $('btnLook').addEventListener('click', () => { if (!s) return; s.won = false; $('sheetEnd').hidden = true; screen = 'play'; unfocus(); roomMusic(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { touchOwners.clear(); syncTouches(null); } if (document.hidden && screen === 'play') openMenu(); SFX.sleep(document.hidden); });
  window.addEventListener('pagehide', () => { if (s && screen !== 'title') saveGame(); });

  /* ================= layout ================= */
  const app = $('app'), hud = document.querySelector('.hud');
  function layout() {
    const coarse = touchMode || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const landscape = window.innerWidth > window.innerHeight * 1.1;
    mode = !coarse ? 'desk' : landscape ? 'side' : 'stack';
    app.className = 'm-' + mode;
    const cs = getComputedStyle(app);
    const innerW = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const innerH = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const hudH = hud.offsetHeight + 10, chrome = 14;
    let aw, ah;
    if (mode === 'stack') { aw = innerW; ah = innerH - hudH - 190 - chrome; }
    else if (mode === 'side') { const pw = Math.max($('padL').offsetWidth, $('padR').offsetWidth, 140); aw = innerW - pw * 2 - 32; ah = innerH - hudH - chrome - 6; }
    else { const kh = $('keys').offsetHeight + 10; aw = innerW; ah = innerH - hudH - kh - chrome - 8; }
    let vt = 20;
    if (mode === 'stack' && Math.min(aw / 320, ah / 192) < 1.45) vt = 15;
    let sc = Math.min(aw / (vt * T), ah / (RH * T));
    if (mode === 'desk') sc = Math.min(sc, 4.5);
    sc = Math.max(0.6, sc);
    viewTiles = vt;
    const cw = Math.floor(vt * T * sc), ch = Math.floor(RH * T * sc), dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.width = Math.max(1, Math.round(cw * dpr)); cv.height = Math.max(1, Math.round(ch * dpr));
    viewK = cv.width / (vt * T);
    const cs2 = Math.min(4, Math.max(1, Math.ceil(viewK * 2) / 2));
    if (cs2 !== cacheScale) { cacheScale = cs2; roomCache.clear(); }
    hudKey = ''; renderHud();
    if (s) updateCamera(true);
    render();
  }
  window.addEventListener('resize', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);

  /* ================= main loop ================= */
  let last = 0, acc = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = last ? Math.min(100, t - last) : STEP; last = t;
    pollPad();
    if (screen === 'menu' && s && !$('sheetMenu').hidden) drawMap(t);
    if (screen === 'play' || (screen === 'end' && s)) {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 5) { if (screen === 'play') tick(); else updateParts(); acc -= STEP; n++; }
      if (n >= 5) acc = 0;
    } else acc = 0;
    render();
  }

  /* ================= boot ================= */
  function boot(data) {
    bindTouch();
    renderNowPlaying();
    if (data && data.game && Array.isArray(data.game.worlds)) { store.set(SAVE_KEY, data.game); game = loadGame(); }
    // a quiet backdrop behind the title screen
    setWorld(game.cur);
    s = newState(world, game.worlds[wi], powersFor(wi)); s.events.length = 0;
    layout(); updateCamera(true);
    if (data && data.screen === 'play') startGame(false); else openTitle();
    requestAnimationFrame(loop);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fontsReady = true; roomCache.clear(); layout(); });
  }
  /*DEBUG*/
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) { try { hot.snapshot(() => { if (screen !== 'title') saveGame(); return { game, screen: screen === 'title' ? 'title' : 'play' }; }); } catch (e) { /* not in a viewer */ } }
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
