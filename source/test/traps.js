// Trap finder: every place the checker can reach, from which it can never get back to the start.
// Usage: WORLD=n node test/traps.js [stage]
const C = require('../src/core.js');
const R = require('./reach.js');
const { T } = C;
const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const stages = nums.length ? nums : R.STAGES.map((_, i) => i);
let total = 0;
for (const si of stages) {
  const edges = new Map();
  const r = R.explore(si, { edges });
  // the start, in any page layer or paint color, counts as home
  const home = new Set();
  for (const k of r.seen) { if (k[0] === 'b') continue; const [l, c, id] = k.split(':').map(Number); const seg = r.SM[l][c].segs[id], sk = r.startKey.split(':').map(Number), s0 = r.SM[0][0].segs[sk[2]]; if (seg.ty === s0.ty && seg.a <= s0.b && seg.b >= s0.a) home.add(k); }
  const rev = new Map();
  for (const [a, set] of edges) for (const b of set) { if (!rev.has(b)) rev.set(b, []); rev.get(b).push(a); }
  const back = new Set(home), q = [...home];
  while (q.length) { const k = q.pop(); for (const a of rev.get(k) || []) if (!back.has(a)) { back.add(a); q.push(a); } }
  const traps = [...r.seen].filter(k => !back.has(k));
  console.log(`World ${R.WIDX} stage ${si} (${R.STAGES[si].name}): ${r.seen.size} places, ${traps.length} with no way back`);
  for (const k of traps) {
    if (k[0] === 'b') { const b = R.world.bolts[+k.split(':')[3]]; const rm = R.world.rooms[b.room]; console.log(`   bolt in ${rm.id} col ${Math.floor(b.x / T) - rm.x0} row ${Math.floor(b.y / T) - rm.y0}`); continue; }
    const [l, c, id] = k.split(':').map(Number), seg = r.SM[l][c].segs[id];
    const rm = R.world.rooms[R.world.cellRoom[Math.floor(seg.ty / C.RH) * R.world.GW + Math.floor(seg.a / C.RW)]];
    console.log(`   ${rm ? rm.id : '?'} row ${seg.ty - rm.y0} cols ${seg.a - rm.x0}-${seg.b - rm.x0}${l ? ' (back of page)' : ''}${c ? ' (paint ' + c + ')' : ''}`);
  }
  total += traps.length;
}
console.log(total ? 'TRAPS FOUND' : 'NO TRAPS');
