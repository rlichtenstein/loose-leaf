// Strand finder: places you might reach with a clever trick that you then cannot get back out of,
// using only the tools you would have at that stage. Flags bookmarks inside them (respawning there keeps you stuck).
// Usage: WORLD=n node test/strand.js [stage]
const C = require('../src/core.js');
const R = require('./reach.js');
const { T } = C;
const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const stages = nums.length ? nums : [0];
for (const si of stages) {
  const normal = R.explore(si, {});
  const edges = new Map();
  const r = R.explore(si, { edges, seedAll: true });
  const sk = r.startKey.split(':').map(Number), s0 = r.SM[0][0].segs[sk[2]];
  const home = new Set();
  for (const k of r.seen) { if (k[0] === 'b') continue; const [l, c, id] = k.split(':').map(Number), seg = r.SM[l][c].segs[id]; if (seg.ty === s0.ty && seg.a <= s0.b && seg.b >= s0.a) home.add(k); }
  const rev = new Map();
  for (const [a, set] of edges) for (const b of set) { if (!rev.has(b)) rev.set(b, []); rev.get(b).push(a); }
  const back = new Set(home), q = [...home];
  while (q.length) { const k = q.pop(); for (const a of rev.get(k) || []) if (!back.has(a)) { back.add(a); q.push(a); } }
  const books = R.world.ents.filter(e => e.k === 'book');
  const stuck = [...r.seen].filter(k => k[0] !== 'b' && !back.has(k));
  console.log(`World ${R.WIDX} stage ${si} (${R.STAGES[si].name}): ${stuck.length} stranding places`);
  for (const k of stuck) {
    const [l, c, id] = k.split(':').map(Number), seg = r.SM[l][c].segs[id];
    if (l || c) continue; // report each spot once (front of page, unpainted)
    const rm = R.world.rooms[R.world.cellRoom[Math.floor(seg.ty / C.RH) * R.world.GW + Math.floor(seg.a / C.RW)]];
    const bk = books.filter(b => Math.floor((b.sy + 14) / T) - 1 === seg.ty && Math.floor((b.sx + 6) / T) >= seg.a && Math.floor((b.sx + 6) / T) <= seg.b);
    const legal = normal.seen.has(k) ? ' (reachable normally!)' : '';
    console.log(`   ${rm.id} row ${seg.ty - rm.y0} cols ${seg.a - rm.x0}-${seg.b - rm.x0}${bk.length ? '  <-- BOOKMARK k' + bk.map(b => b.id).join(',') : ''}${legal}`);
  }
}
