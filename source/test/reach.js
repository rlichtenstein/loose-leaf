// Reachability checker: explores the real engine with scripted inputs, stage by stage.
// Usage: WORLD=1|2 node test/reach.js [stageIndex]
const C = require('../src/core.js');
const { T } = C;

const WIDX = Number(process.env.WORLD || 1);
const world = C.buildWorld(C.WORLDS[WIDX - 1].rooms);
// checker world: same tiles, no pickups/enemies inside the engine (we detect items ourselves)
// paint pots stay live in the engine, since dipping into one changes what is solid
const cw = Object.assign({}, world, { byRoom: world.byRoom.map(list => list.filter(e => e.k === 'pot')), ents: world.ents });
const ITEMS = world.ents.filter(e => e.k === 'scrap' || e.k === 'power' || e.k === 'book');
const itemName = e => e.k === 'scrap' ? 's' + e.id : e.k === 'power' ? e.pw : 'k' + e.id;

const W1 = { erase: 1, pencil: 1, dash: 1, flip: 1 };
const STAGE_SETS = {
  1: [
    { name: 'no powers', powers: {}, expect: ['s1', 's2', 's5', 'erase'] },
    { name: 'eraser', powers: { erase: 1 }, expect: ['s4', 'pencil'] },
    { name: 'eraser+pencil', powers: { erase: 1, pencil: 1 }, expect: ['s0', 's6', 'dash'] },
    { name: '+dash', powers: { erase: 1, pencil: 1, dash: 1 }, expect: ['s3', 's7', 's8', 'flip'] },
    { name: '+flip', powers: W1, expect: ['s9', 's10', 's11'] },
  ],
  2: [
    { name: 'sketchbook tools', powers: W1, expect: ['s0', 's4', 's5', 's7', 'tape'] },
    { name: '+tape', powers: { tape: 1 }, expect: ['s1', 's2', 's3', 's6', 'plane'] },
    { name: '+airplane', powers: { plane: 1 }, expect: ['s8', 's9', 's10', 's11'] },
  ],
  3: [
    { name: 'sketchbook + desk tools', powers: Object.assign({ tape: 1, plane: 1 }, W1), expect: ['s0', 's5', 's9', 's10', 'brush'] },
    { name: '+paintbrush', powers: { brush: 1 }, expect: ['s1', 's2', 's3', 's4', 's6', 's7', 's8', 's11'] },
  ],
  4: [
    { name: 'tools from worlds 1-3', powers: Object.assign({ tape: 1, plane: 1, brush: 1 }, W1), expect: ['s0', 's1', 's6', 's8', 'magnet'] },
    { name: '+fridge magnet', powers: { magnet: 1 }, expect: ['s2', 's3', 's4', 's5', 's7', 's9', 's10', 's11'] },
  ],
  6: [
    { name: 'tools from worlds 1-5', powers: Object.assign({ tape: 1, plane: 1, brush: 1, magnet: 1, card: 1 }, W1), expect: ['s0', 's1', 's2', 's3', 'spring'] },
    { name: '+spring shoes', powers: { spring: 1 }, expect: ['s4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'] },
  ],
  7: [
    { name: 'tools from worlds 1-6', powers: Object.assign({ tape: 1, plane: 1, brush: 1, magnet: 1, card: 1, spring: 1 }, W1), expect: ['s0', 's1', 's3', 's4', 'umbrella'] },
    { name: '+umbrella', powers: { umbrella: 1 }, expect: ['s2', 's5', 's6', 's7', 's8', 's9', 's10', 's11'] },
  ],
  5: [
    { name: 'tools from worlds 1-4', powers: Object.assign({ tape: 1, plane: 1, brush: 1, magnet: 1 }, W1), expect: ['s0', 's2', 's5', 's8', 'card'] },
    { name: '+library card', powers: { card: 1 }, expect: ['s1', 's3', 's4', 's6', 's7', 's9', 's10', 's11'] },
  ],
};
const STAGES = STAGE_SETS[WIDX];

function makeStage(powers) {
  const s = C.newState(cw, null, powers); s.noEnemies = true; s.enemies = [];
  for (let i = 0; i < s.tiles.length; i++) {
    if (powers.erase && s.tiles[i] === C.TL.SCRIBBLE) s.tiles[i] = 0;
    if (powers.dash && s.tiles[i] === C.TL.PERF) s.tiles[i] = 0;
  }
  return s;
}

function segmentsFor(s, layer, color) {
  s.layer = layer; s.p.color = color || 0;
  const W = world.W, H = world.H, segs = [], map = new Int32Array(W * H).fill(-1);
  for (let ty = 0; ty < H - 1; ty++) {
    let run = null;
    for (let tx = 0; tx <= W; tx++) {
      let ok = false;
      if (tx < W) {
        const c = C.tileAt(s, tx, ty), g = C.tileAt(s, tx, ty + 1);
        ok = !C.solidCode(s, c) && c !== C.TL.SPIKE && (C.solidCode(s, g) || g === C.TL.ONEWAY);
      }
      if (ok) { if (!run) run = { ty, a: tx, b: tx, layer, color: color || 0 }; else run.b = tx; }
      else if (run) { const id = segs.length; segs.push(run); for (let x = run.a; x <= run.b; x++) map[ty * W + x] = id; run = null; }
    }
  }
  return { segs, map };
}

function starts(s, seg) {
  const y = (seg.ty + 1) * T - 14, out = [];
  const L = seg.a * T, R = (seg.b + 1) * T;
  const cand = [L - 11, L, R - 12, R - 1];
  for (let x = L + 8; x < R - 12; x += 24) cand.push(x);
  for (const x of cand) {
    if (C.rectSolid(s, x, y, 12, 14)) continue;
    if (C.overlapsCode(s, x, y, 12, 14, C.TL.SPIKE)) continue;
    out.push({ x, y });
  }
  return out;
}

function scripts(P) {
  const out = [];
  const DP = [[0, 0], [-1, 0], [-1, 8], [-1, 16], [1, 0], [1, 8], [1, 16]];
  for (const [dir, pre] of DP) for (const jh of [4, 10, 99]) for (const adir of [-1, 0, 1]) for (const aAt of [0, 14, 26]) {
    if (adir === dir && aAt > 0) continue;
    out.push({ dir, pre, jump: 1, jh, adir, aAt });
  }
  for (const dir of [-1, 1]) for (const adir of [-1, 0, 1]) for (const aAt of [0, 8, 20]) { if (adir === dir && aAt > 0) continue; out.push({ dir, jump: 0, adir, aAt }); }
  // hold down to drop through a one-way ledge, then steer
  for (const adir of [-1, 0, 1]) for (const aAt of [0, 10, 24]) { if (adir === 0 && aAt > 0) continue; out.push({ dir: 0, jump: 0, drop: 1, adir, aAt, hold: P.plane && aAt === 24 ? 1 : 0 }); }
  const DP2 = [[0, 0], [-1, 0], [-1, 10], [1, 0], [1, 10]];
  if (P.pencil) {
    // jump, then jump again in midair (pencil double jump)
    for (const [dir, pre] of DP2) for (const adir of [-1, 0, 1]) for (const pen of [6, 12, 18, 24, 30]) for (const j2 of [1, 10]) for (const dir2 of [-1, 0, 1]) for (const jh2 of [6, 99])
      out.push({ dir, pre, jump: 1, jh: 99, adir, aAt: 0, pen, j2, dir2, jh2 });
    // walk off a ledge, draw, then jump off the line
    for (const dir of [-1, 1]) for (const pen of [8, 14, 20]) for (const j2 of [1, 10]) for (const dir2 of [-1, 0, 1]) out.push({ dir, jump: 0, adir: dir, aAt: 0, pen, j2, dir2, jh2: 99 });
  }
  if (P.dash) {
    for (const [dir, pre] of DP2) for (const adir of [-1, 0, 1]) for (const dash of [2, 8, 14, 20, 28])
      out.push({ dir, pre, jump: 1, jh: 99, adir, aAt: 0, dash });
    for (const dir of [-1, 1]) for (const pre of [0, 8]) for (const adir of [-1, 0, 1]) out.push({ dir, pre, jump: 0, gd: 1, adir, aAt: 0 });
    for (const dir of [-1, 1]) for (const dash of [0, 6, 14]) for (const adir of [-1, 0, 1]) out.push({ dir, jump: 0, adir, aAt: 0, dash });
  }
  if (P.pencil && P.dash) {
    for (const dir of [-1, 1]) for (const pre of [0, 10]) for (const d1 of [4, 12, -1]) {
      const pens = d1 >= 0 ? [d1 + 6, d1 + 13, d1 + 19] : [12, 20];
      for (const pen of pens) for (const dir2 of [dir, 0]) for (const dash2 of [-1, 4, 10, 16])
        out.push({ dir, pre, jump: 1, jh: 99, adir: dir, aAt: 0, dash: d1, pen, j2: 1, dir2, jh2: 99, dash2 });
    }
  }
  if (P.flip) {
    out.push({ flipStand: 1 });
    for (const dir of [-1, 1]) for (const pre of [0, 10]) for (const flip of [1, 4, 8, 12, 16, 22, 30]) out.push({ dir, pre, jump: 1, jh: 99, adir: dir, aAt: 0, flip });
    for (const dir of [-1, 1]) for (const flip of [0, 3, 6, 10, 16]) out.push({ dir, jump: 0, adir: dir, aAt: 0, flip });
  }
  if (P.tape) {
    // climb a wall by hopping up it; optionally leap away at hop N, then double jump / dash
    const AFTER = [{ dj: -1, dash: -1 }, { dj: 10, dash: -1 }, { dj: -1, dash: 6 }, { dj: 10, dash: 22 }];
    for (const dir of [-1, 1]) for (const pre of [0, 8]) for (const wait of [0, 6]) {
      out.push({ dir, pre, jump: 1, jh: 99, adir: dir, aAt: 0, tape: { mode: 'climb', wait, leapAt: -1 } });
      out.push({ dir, pre, jump: 1, jh: 99, adir: dir, aAt: 0, tape: { mode: 'zig', wait } });
      for (const leapAt of [1, 2, 3, 4, 6]) for (const a of AFTER)
        out.push({ dir, pre, jump: 1, jh: 99, adir: dir, aAt: 0, tape: { mode: 'climb', wait, leapAt, dj: a.dj, dash: a.dash } });
    }
    for (const dir of [-1, 1]) out.push({ dir, jump: 0, adir: dir, aAt: 0, tape: { mode: 'climb', wait: 0, leapAt: -1 } });
  }
  if (P.plane) {
    // hold jump the whole way (glides once falling, rides updrafts), steer later on
    for (const dir of [-1, 0, 1]) for (const adir of [-1, 0, 1]) for (const aAt of [40, 80, 120, 160, 220]) {
      if (adir === dir) continue;
      out.push({ dir, pre: 0, jump: 1, jh: 99, adir, aAt });
    }
    // walk off a ledge holding jump
    for (const dir of [-1, 1]) for (const adir of [-1, 0, 1]) for (const aAt of [0, 40, 100]) {
      if (adir === dir && aAt > 0) continue;
      out.push({ dir, jump: 0, hold: 1, adir, aAt });
    }
  }
  if (P.magnet) {
    // from the ground: (jump), then Dash to zip to a bolt
    for (const dir of [-1, 0, 1]) for (const pre of [-1, 0, 8]) for (const z0 of [0, 8, 16, 26]) {
      if (pre < 0 && z0 > 0) continue;
      out.push({ dir, pre: Math.max(pre, 0), jump: pre >= 0 ? 1 : 0, jh: 99, adir: dir, aAt: 0, mag: { z0 } });
    }
    for (const dir of [-1, 1]) out.push({ dir, jump: 0, adir: dir, aAt: 0, mag: { z0: 6, walk: 1 } });
  }
  if (P.spring) {
    // bounce nb times in a row (jumping the moment you land), then steer, maybe draw and jump off the line
    for (const nb of [1, 2]) for (const dir of [0, -1, 1]) for (const fdir of [-1, 0, 1]) for (const aAt of [0, 14, 24]) for (const pen of [-1, 18, 28]) {
      if (dir !== 0 && fdir === -dir) continue;
      out.push({ dir, spring: { nb, fdir, aAt, pen } });
    }
  }
  return out;
}
// scripts that start hanging from a bolt
function hangScripts(P) {
  const out = [];
  for (const d of [-1, 1, 0]) out.push({ hang: 1, zipNow: d });                       // zip straight to the next bolt
  for (const jd of [-1, 0, 1]) for (const w of [0, 10]) {
    out.push({ hang: 1, w, jd, jh: 99 });                                              // jump off and fall/land
    out.push({ hang: 1, w, jd, jh: 6 });
    for (const zd of [6, 14, 24]) out.push({ hang: 1, w, jd, jh: 99, zd });             // jump, then zip on
    if (P.pencil) for (const pen of [10, 20]) out.push({ hang: 1, w, jd, jh: 99, pen, j2: 1, dir2: jd, jh2: 99 }); // jump, draw, jump
    if (P.dash) for (const dd of [8, 18]) out.push({ hang: 1, w, jd, jh: 99, dash: dd, noZip: 1 });
    if (P.plane) out.push({ hang: 1, w, jd, jh: 999, glideTurn: 60 });
  }
  return out;
}

function setup(s, st) {
  const p = s.p;
  Object.assign(p, { x: st.x, y: st.y, vx: 0, vy: 0, face: 1, onGround: true, gk: 'tile', coyote: 6, jumpBuf: 0, jumpHeld: false,
    dashT: 0, dashCD: 0, airDash: true, pencil: true, eraseT: 0, eraseCD: 0, hp: 4, inv: 0, kb: 0, safeX: st.x, safeY: st.y, landT: 0,
    wallDir: 0, clingT: 0, wallCoyote: 0, lastWall: 0, kickT: 0, glide: false, color: st.color || 0,
    zipB: null, hangB: st.bolt || null, zipT: 0, boltCD: 0, lastBolt: null, doorLock: null, bounce: 0, groundT: 99, bounceOK: false });
  if (st.bolt) { p.onGround = false; p.coyote = 0; }
  s.layer = st.layer; s.plats.length = 0; s.dead = 0; s.freeze = 0; s.won = false; s.events.length = 0; s.enemies = [];
  s.room = world.cellRoom[Math.floor((st.y + 7) / (C.RH * T)) * world.GW + Math.floor((st.x + 6) / (C.RW * T))];
}

const hitR = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function run(s, st, sc, found) {
  setup(s, st);
  const p = s.p;
  let t0 = -1, t1 = -1, tDraw = -1, airborne = false, still = 0;
  // sticky-tape controller state
  const tp = sc.tape; let side = sc.dir || 0, clingF = 0, hops = 0, leapF = -1;
  let hangT = 0, lastG = true, bounces = 0, finalT = -1;
  for (let f = 0; f < 420; f++) {
    const inp = { l: 0, r: 0, jump: 0, jumpP: 0, dash: 0, flip: 0, erase: 0 };
    let d = sc.dir || 0;
    const landed = p.onGround && !lastG; lastG = p.onGround;
    if (sc.spring) {
      const sp = sc.spring;
      inp.jump = 1;
      if (f === 0) inp.jumpP = 1;
      if (finalT < 0) {
        if (landed && f > 0) { inp.jumpP = 1; if (++bounces >= sp.nb) finalT = f; }
      } else {
        const rel = f - finalT;
        if (rel >= sp.aAt) d = sp.fdir;
        if (rel === sp.pen || (sp.pen >= 0 && rel === sp.pen + 2)) inp.jumpP = 1;
      }
    } else if (sc.hang) {
      // start: hanging on a bolt
      if (sc.zipNow !== undefined) { d = sc.zipNow; if (f === 0) inp.dash = 1; }
      else {
        d = 0;
        if (f === sc.w) { inp.jumpP = 1; t0 = f; }
        if (t0 >= 0) {
          const rel = f - t0;
          d = sc.jd; inp.jump = rel < sc.jh ? 1 : 0;
          if (sc.glideTurn && rel >= sc.glideTurn) d = -sc.jd;
          if (rel === sc.zd || rel === sc.dash) inp.dash = 1;
          if (rel === sc.pen) { inp.jumpP = 1; tDraw = f; }
          if (tDraw >= 0) { d = sc.dir2; if (f - tDraw === sc.j2) { inp.jumpP = 1; t1 = f; } }
          if (t1 >= 0) inp.jump = 1;
        }
      }
    } else if (sc.flipStand) {
      if (f === 0) inp.flip = 1;
    } else if (tp) {
      if (sc.jump && f === sc.pre) { inp.jumpP = 1; t0 = f; }
      inp.jump = 1;
      if (p.wallDir) {
        clingF++;
        d = p.wallDir;
        if (clingF > tp.wait) {
          const leap = tp.mode === 'zig' || hops + 1 === tp.leapAt;
          inp.jumpP = 1; hops++; clingF = 0;
          if (leap) { d = -p.wallDir; side = d; if (tp.mode !== 'zig') leapF = f; } else d = p.wallDir;
        }
      } else {
        clingF = 0; d = side;
        if (leapF >= 0) {
          if (f - leapF === tp.dj || f - leapF === tp.dj + 2) inp.jumpP = 1;
          if (f - leapF === tp.dash) inp.dash = 1;
        }
      }
    } else {
      if (sc.jump) { if (f === sc.pre) { inp.jumpP = 1; t0 = f; } }
      else if (t0 < 0 && !p.onGround) t0 = f;
      if (sc.hold) inp.jump = 1;
      if (sc.drop && f < 3) inp.down = 1;
      if (sc.gd && f === (sc.pre || 0)) inp.dash = 1;
      if (sc.mag && f === (sc.mag.walk ? sc.mag.z0 + 0 : -1)) inp.dash = 1;
      if (sc.mag && !sc.mag.walk && sc.jump === 0 && f === 0) inp.dash = 1;
      if (t0 >= 0) {
        const rel = f - t0;
        if (sc.jump) inp.jump = rel < sc.jh ? 1 : 0;
        if (rel >= sc.aAt) d = sc.adir;
        if (rel === sc.dash) inp.dash = 1;
        if (sc.mag && sc.jump && rel === sc.mag.z0) inp.dash = 1;
        if (rel === sc.flip) inp.flip = 1;
        if (rel === sc.pen) { inp.jumpP = 1; tDraw = f; }
        if (tDraw >= 0) { d = sc.dir2; if (f - tDraw === sc.j2) { inp.jumpP = 1; t1 = f; } }
        if (t1 >= 0) {
          const r2 = f - t1;
          d = sc.dir2; inp.jump = r2 < sc.jh2 ? 1 : 0;
          if (r2 === sc.dash2) inp.dash = 1;
        }
      }
    }
    inp.l = d < 0 ? 1 : 0; inp.r = d > 0 ? 1 : 0;
    C.step(s, inp);
    if (s.freeze > 0 || s.dead > 0) return null;
    const pr = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const it of ITEMS) if (it.room === s.room && hitR(pr, it)) found.add(it);
    if (!p.onGround) airborne = true;
    if (p.hangB && p.hangB !== st.bolt) { if (++hangT > 1) return { x: p.x, y: p.y, layer: s.layer, color: p.color, bolt: p.hangB }; }
    else hangT = 0;
    if (sc.hang && sc.zipNow !== undefined && !p.zipB && !p.hangB && f > 0 && p.onGround) return { x: p.x, y: p.y, layer: s.layer, color: p.color };
    if (sc.hang && sc.zipNow !== undefined && f > 2 && !p.zipB && p.hangB === st.bolt) return null;
    if (sc.flipStand) { if (f >= 2 && p.onGround && p.gk === 'tile') return { x: p.x, y: p.y, layer: s.layer, color: p.color }; continue; }
    if (sc.spring && (finalT < 0 || f - finalT < 3)) continue;
    if (airborne && p.onGround && p.gk === 'tile' && p.dashT === 0) return { x: p.x, y: p.y, layer: s.layer, color: p.color };
    if (!airborne && p.onGround && Math.abs(p.vx) < 0.01 && f > 20 && !inp.dash && p.dashT === 0) { if (++still > 4) return { x: p.x, y: p.y, layer: s.layer, color: p.color, ground: 1 }; }
  }
  return null;
}

function explore(stageIdx, opts) {
  const P = {}; for (let i = 0; i <= stageIdx; i++) Object.assign(P, STAGES[i].powers);
  const s = makeStage(P);
  const layers = P.flip ? [0, 1] : [0];
  const colors = P.brush ? [0, 1, 2, 3] : [0];
  const SM = layers.map(l => colors.map(c => segmentsFor(s, l, c)));
  const scs = scripts(P), hscs = P.magnet ? hangScripts(P) : [];
  const E = opts && opts.edges;
  const BOLTS = world.bolts;
  const seen = new Set(), queue = [], found = new Set(), firstBy = new Map();
  const nodeOf = (x, y, layer, color) => {
    const ty = Math.round((y + 14) / T) - 1, m = SM[layer][color || 0];
    for (const tx of [Math.floor((x + 6) / T), Math.floor(x / T), Math.floor((x + 11.99) / T)]) {
      const id = m.map[ty * world.W + tx]; if (id >= 0) return layer + ':' + (color || 0) + ':' + id;
    }
    return null;
  };
  const push = (key) => { if (key && !seen.has(key)) { seen.add(key); queue.push(key); } };
  push(nodeOf(world.start.x, world.start.y, 0, 0));
  // strand analysis: start from every place you could stand, not just the start
  if (opts && opts.seedAll) for (let l = 0; l < layers.length; l++) for (let c = 0; c < colors.length; c++) SM[l][c].segs.forEach((_, id) => push(layers[l] + ':' + colors[c] + ':' + id));
  const bookSeeded = new Set();
  let sims = 0;
  const t0 = Date.now();
  while (queue.length) {
    const key = queue.shift();
    if (key[0] === 'b') {
      const [, layer, color, bi] = key.split(':').map(Number), b = BOLTS[bi];
      const st = { x: b.x + b.w / 2 - 6, y: b.y + b.h / 2 + 3, layer, color, bolt: b };
      for (const sc of hscs) {
        sims++;
        const before = found.size;
        const res = run(s, st, sc, found);
        if (opts && opts.trace && found.size > before) for (const it of found) if (!firstBy.has(it)) firstBy.set(it, { seg: { ty: Math.floor(b.y / T), a: Math.floor(b.x / T), b: Math.floor(b.x / T) }, pos: st, sc, color, from: 'bolt' + bi });
        const k2 = res ? (res.bolt ? 'b:' + res.layer + ':' + res.color + ':' + BOLTS.indexOf(res.bolt) : nodeOf(res.x, res.y, res.layer, res.color)) : null;
        if (k2 && E) { if (!E.has(key)) E.set(key, new Set()); E.get(key).add(k2); }
        push(k2);
      }
      continue;
    }
    const [layer, color, id] = key.split(':').map(Number);
    const seg = SM[layer][color].segs[id];
    s.layer = layer; s.p.color = color;
    for (const pos of starts(s, seg)) {
      for (const sc of scs) {
        sims++;
        const before = found.size;
        const res = run(s, { x: pos.x, y: pos.y, layer, color }, sc, found);
        if (opts && opts.trace && found.size > before) for (const it of found) if (!firstBy.has(it)) firstBy.set(it, { seg, pos, sc, color });
        const k2 = res ? (res.bolt ? 'b:' + res.layer + ':' + res.color + ':' + BOLTS.indexOf(res.bolt) : nodeOf(res.x, res.y, res.layer, res.color)) : null;
        if (k2 && E) { if (!E.has(key)) E.set(key, new Set()); E.get(key).add(k2); }
        push(k2);
      }
    }
    for (const it of found) if (it.k === 'book' && !bookSeeded.has(it.id)) {
      bookSeeded.add(it.id);
      for (const l of layers) push(nodeOf(it.sx, it.sy, l, 0));
    }
  }
  const names = new Set([...found].map(itemName));
  if (opts && opts.bolts) console.log('  bolts reached:', [...seen].filter(k => k[0] === 'b').map(k => k.split(':')[3]).sort((a, b) => a - b).join(' '));
  return { names, nodes: seen.size, sims, ms: Date.now() - t0, firstBy, SM, seen, nodeOf, startKey: nodeOf(world.start.x, world.start.y, 0, 0) };
}

module.exports = { world, WIDX, STAGES, makeStage, segmentsFor, starts, scripts, run, explore, ITEMS, itemName };
if (require.main === module) {
  const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
  const only = nums.length ? nums : STAGES.map((_, i) => i);
  const trace = process.argv.includes('--trace');
  let ok = true;
  console.log(`World ${WIDX}: ${C.WORLDS[WIDX - 1].name}`);
  for (const i of only) {
    const r = explore(i, { trace, bolts: process.argv.includes('--bolts') });
    const allExpected = new Set(); for (let j = 0; j <= i; j++) STAGES[j].expect.forEach(n => allExpected.add(n));
    const missing = [...allExpected].filter(n => !r.names.has(n));
    const later = new Set(); for (let j = i + 1; j < STAGES.length; j++) STAGES[j].expect.forEach(n => later.add(n));
    const early = [...r.names].filter(n => later.has(n));
    console.log(`stage ${i} (${STAGES[i].name}): nodes ${r.nodes}, sims ${r.sims}, ${r.ms} ms`);
    console.log('  reached:', [...r.names].sort().join(' '));
    if (missing.length) { ok = false; console.log('  MISSING:', missing.join(' ')); }
    if (early.length) {
      ok = false; console.log('  SEQUENCE BREAK (reachable too early):', early.join(' '));
      if (trace) for (const [it, how] of r.firstBy) if (early.includes(itemName(it))) {
        const rm = world.rooms[world.cellRoom[Math.floor(how.seg.ty / C.RH) * world.GW + Math.floor(how.seg.a / C.RW)]];
        console.log(`    ${itemName(it)} from ${rm ? rm.id : '?'} row ${how.seg.ty % C.RH} cols ${how.seg.a % C.RW}-${how.seg.b % C.RW} x=${(how.pos.x / 16).toFixed(1)} color ${how.color}: ${JSON.stringify(how.sc)}`);
      }
    }
  }
  console.log(ok ? 'ALL GOOD' : 'PROBLEMS FOUND');
  process.exit(ok ? 0 : 1);
}
