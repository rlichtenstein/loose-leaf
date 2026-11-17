'use strict';
/* ===== Loose Leaf: soundtrack. Everything is synthesized with Web Audio; no samples. ===== */
const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const acc = (s) => (s === '#' ? 1 : s === 'b' ? -1 : 0);
function noteMidi(tok) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
  if (!m) throw new Error('bad note "' + tok + '"');
  return 12 * (Number(m[3]) + 1) + NOTE_PC[m[1]] + acc(m[2]);
}
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORD_Q = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10] };
function chordInfo(name) {
  const m = /^([A-G])([#b]?)(m|7)?$/.exec(name);
  if (!m) throw new Error('bad chord "' + name + '"');
  return { name, pc: (NOTE_PC[m[1]] + acc(m[2]) + 12) % 12, iv: CHORD_Q[m[3] || ''] };
}
const atOrAbove = (pc, lo) => lo + (((pc - lo) % 12) + 12) % 12;

/* Notation
   chords: one chord per bar; "Dm|G" splits a bar in half.
   lead:   one token per step: a note (C5, G#4, Bb3), "-" holds the previous note, "." is a rest, "|" is ignored.
   bass / comp / arp: a one-bar pattern applied to each bar's chord.
     R root  T third  F fifth  S seventh (or fifth)  O root an octave up  X whole chord  (or a literal note)
   drums: one character per step. k kick, t pencil tap, h hi-hat, r paper rustle, . rest */
const TRACKS = {
  margin: {
    title: 'Margin Notes', bpm: 112, div: 2, barLen: 8, swing: 0.07,
    chords: 'C Am F G C Am Dm|G C F G Em Am F G Dm G7',
    lead: { inst: 'pluck', vol: 0.36, notes: `
      C5 . E5 G5 C6 . G5 . | A5 . G5 E5 C5 . E5 . | F5 . A5 . G5 F5 E5 D5 | D5 . G4 . B4 . D5 . |
      E5 . G5 C6 . B5 C6 . | A5 . C6 . E5 . A5 G5 | F5 . A5 . G5 . B4 D5 | C5 - - - . . . . |
      A5 . A5 C6 . A5 F5 . | G5 . B5 . D6 . B5 . | E5 G5 B5 . G5 E5 B4 . | C5 E5 A5 - - . G5 . |
      F5 . A5 . C6 . A5 . | B5 . G5 . D5 . G5 . | F5 E5 D5 . A4 . D5 . | G5 . F5 . D5 . B4 . ` },
    bass: { inst: 'bass', vol: 0.24, bar: 'R . F . R . F .', override: { 15: 'G2 . B2 . D3 . F3 .' } },
    comp: { inst: 'chk', vol: 0.085, bar: '. X . X . X . X' },
    drums: { div: 4, vol: 1, seq: 'A A A A A A A F B B B B B B B F', pats: {
      A: 'k.h.t.h.k.hkt.hh', B: 'k.h.t.h.k.hkr.hh', F: 'k.h.t.h.k.t.trrr' } },
  },
  under: {
    title: 'Below the Fold', bpm: 92, div: 2, barLen: 8, swing: 0,
    chords: 'Am Am F E Am Dm E7 E F G C Am Dm E Am E',
    lead: { inst: 'whistle', vol: 0.24, notes: `
      A4 - - . C5 . E5 . | D5 - C5 - B4 - A4 . | C5 - - . A4 . F4 . | G#4 - - - B4 - - . |
      E5 - - . D5 . C5 . | D5 - F5 - A5 - - . | G#5 - - . E5 . D5 . | B4 - - - - - . . |
      A5 . . . G5 . F5 . | G5 - - . D5 - - . | E5 . . . G5 . E5 . | A4 - - - - - . . |
      F5 . E5 . D5 . C5 . | B4 - G#4 - E4 - - . | A4 . C5 . E5 . A5 . | G#5 - - - E5 - - . ` },
    bass: { inst: 'bass', vol: 0.22, bar: 'R - - . R . F .' },
    arp: { inst: 'box', vol: 0.09, bar: 'R T F O F T F T' },
    drums: { div: 4, vol: 0.8, seq: 'A A A A A A A F A A A A A A A F', pats: {
      A: 'k.....h.t.....h.', F: 'k.....h.t...r.rr' } },
  },
  high: {
    title: 'Paper Planes Waltz', bpm: 138, div: 2, barLen: 6, swing: 0,
    chords: 'F F Bb C Dm Bb C7 C F Am Bb F Gm C7 F C7',
    lead: { inst: 'box', vol: 0.3, notes: `
      C5 - F5 - A5 - | G5 - F5 - C5 - | D5 - F5 - Bb5 - | G5 - - - E5 - |
      F5 - A5 - D6 - | C6 - Bb5 - F5 - | E5 - G5 - Bb5 - | G5 - - - - - |
      A5 - - - C6 - | E5 - - - A5 - | D5 - F5 - Bb5 - | A5 - - - F5 - |
      G5 - Bb5 - D6 - | C6 - Bb5 - G5 - | A5 - F5 - C5 - | E5 - G5 - Bb4 - ` },
    bass: { inst: 'bass', vol: 0.23, bar: 'R - . . . .' },
    comp: { inst: 'chk', vol: 0.08, bar: '. . X . X .' },
    drums: { div: 2, vol: 0.7, seq: 'A A A A A A A F A A A A A A A F', pats: { A: 'k.h.h.', F: 'k.h.rr' } },
  },
  desk: {
    title: 'Desk Jockey', bpm: 126, div: 2, barLen: 8, swing: 0.11,
    chords: 'G Em Am D7 G Em A7 D7 C C G E7 Am D7 G D7',
    lead: { inst: 'pluck', vol: 0.34, notes: `
      D5 . G5 . B5 - A5 G5 | E5 - - . G5 . B4 . | C5 . E5 . A5 - G5 E5 | F#5 - - . D5 . C5 . |
      B4 . D5 . G5 . B5 . | G5 . E5 . B4 . E5 . | C#5 . E5 . G5 - E5 . | F#5 - - - D5 . . . |
      E5 . G5 . C6 - B5 . | A5 . G5 . E5 . C5 . | D5 . G5 . B5 - - . | G#5 . . . E5 . D5 . |
      C5 . E5 . A5 . E5 . | F#5 . A5 . C6 - A5 . | G5 - - . D5 . B4 . | A4 . C5 . D5 . F#5 . ` },
    bass: { inst: 'bass', vol: 0.24, bar: 'R - T - F - O -' },
    comp: { inst: 'chk', vol: 0.08, bar: '. X . X . X . X' },
    drums: { div: 4, vol: 0.9, seq: 'A A A A A A A F A A A A A A A F', pats: {
      A: 'k.h.t.hhk.h.t.hh', F: 'k.h.t.hhk.t.rrrr' } },
  },
  breeze: {
    title: 'Updraft', bpm: 96, div: 2, barLen: 8, swing: 0,
    chords: 'D A Bm G D A G A Bm G D A Em G A A7',
    lead: { inst: 'whistle', vol: 0.23, notes: `
      F#5 - - - A5 - - . | E5 - - - C#5 - - . | D5 - F#5 - B5 - - . | A5 - G5 - D5 - - . |
      F#5 - A5 - D6 - - . | C#6 - - - A5 - - . | B5 - G5 - D5 - B4 - | C#5 - - - - - . . |
      D5 - F#5 - B5 - - . | B5 - - - G5 - - . | A5 - F#5 - D5 - - . | E5 - - - C#5 - - . |
      G5 - - - E5 - B4 - | D5 - - - G5 - - . | A5 - - - C#6 - - . | E5 - - - G5 - - . ` },
    bass: { inst: 'bass', vol: 0.22, bar: 'R - - - F - - -' },
    arp: { inst: 'box', vol: 0.085, bar: 'R T F O F T F T' },
    drums: { div: 4, vol: 0.7, seq: 'A A A A A A A F A A A A A A A F', pats: {
      A: 'k...h...h...h...', F: 'k...h...h...r.r.' } },
  },
  nocturne: {
    title: 'Firefly Lullaby', bpm: 84, div: 2, barLen: 6, swing: 0,
    chords: 'Dm Bb F C Dm Bb Gm A Bb C Am Dm Gm C F A',
    lead: { inst: 'whistle', vol: 0.22, notes: `
      A4 - D5 - F5 - | F5 - - - D5 - | C5 - F5 - A5 - | G5 - - - E5 - |
      F5 - A5 - D6 - | D6 - C6 - Bb5 - | Bb5 - G5 - D5 - | C#5 - - - - - |
      D5 - F5 - Bb5 - | C6 - Bb5 - G5 - | A5 - E5 - C5 - | D5 - - - F5 - |
      G5 - Bb5 - D6 - | C6 - G5 - E5 - | F5 - - - A5 - | A5 - G5 - E5 - ` },
    bass: { inst: 'bass', vol: 0.2, bar: 'R - - F - -' },
    arp: { inst: 'box', vol: 0.07, bar: 'R F O F T F' },
    drums: { div: 2, vol: 0.35, seq: 'A A A A A A A F A A A A A A A F', pats: { A: 'k.....', F: 'k...r.' } },
  },
  windup: {
    title: 'Wind-Up', bpm: 124, div: 2, barLen: 8, swing: 0.05,
    chords: 'F C Dm Bb F C Bb C F A7 Dm Bb Gm C F C',
    lead: { inst: 'pluck', vol: 0.32, notes: `
      A5 . C6 . F6 . C6 . | G5 . E5 . C5 . E5 . | F5 . A5 . D6 - C6 . | D6 . Bb5 . F5 . D5 . |
      C5 . F5 . A5 . C6 . | E6 - D6 . C6 . G5 . | F5 . G5 . A5 . Bb5 . | G5 - - . E5 . C5 . |
      F5 . A5 . C6 . F6 . | E6 - C#6 . A5 . E5 . | F5 . A5 . D6 . F6 . | D6 - Bb5 . F5 . D5 . |
      G5 . Bb5 . D6 . G6 . | E6 . C6 . G5 . E5 . | F5 . A5 . C6 - - . | G5 . E5 . C5 . . . ` },
    bass: { inst: 'bass', vol: 0.23, bar: 'R . F . R . F .' },
    arp: { inst: 'box', vol: 0.07, bar: 'O F T F O F T F' },
    drums: { div: 4, vol: 0.7, seq: 'A A A A A A A F A A A A A A A F', pats: {
      A: 'k.h.t.h.k.h.t.hh', F: 'k.h.t.h.k.t.rrrr' } },
  },
  quiet: {
    title: 'Quiet, Please', bpm: 100, div: 2, barLen: 6, swing: 0,
    chords: 'A F#m D E A F#m Bm E D E C#m F#m Bm E A A',
    lead: { inst: 'whistle', vol: 0.21, notes: `
      E5 - - - C#5 - | A5 - - - F#5 - | F#5 - E5 - D5 - | E5 - - - B4 - |
      C#5 - E5 - A5 - | C#6 - - - A5 - | B5 - A5 - F#5 - | G#5 - - - - - |
      F#5 - A5 - D6 - | B5 - - - G#5 - | E5 - G#5 - C#6 - | A5 - - - F#5 - |
      D5 - F#5 - B5 - | G#5 - - - E5 - | A5 - - - - - | E5 - C#5 - A4 - ` },
    bass: { inst: 'bass', vol: 0.2, bar: 'R - - F - -' },
    arp: { inst: 'box', vol: 0.075, bar: 'R T F O F T' },
    drums: { div: 2, vol: 0.45, seq: 'A A A A A A A F A A A A A A A F', pats: { A: 'k.h.h.', F: 'k.h.rr' } },
  },
  coldsnap: {
    title: 'Cold Snap', bpm: 132, div: 2, barLen: 8, swing: 0,
    chords: 'Em Am D G C Am B7 Em Em Am D G C D B7 B7',
    lead: { inst: 'box', vol: 0.28, notes: `
      B4 . E5 . G5 - F#5 E5 | C5 - - . E5 . A5 . | F#5 - E5 D5 A4 - - . | B4 . D5 . G5 - - . |
      E5 . G5 . C6 - B5 A5 | C6 - - . A5 . E5 . | D#5 - F#5 - A5 - B5 . | G5 - - - E5 . . . |
      E5 . G5 . B5 - A5 G5 | A5 - - . C6 . E5 . | F#5 . A5 . D6 - C6 . | B5 - - . G5 . D5 . |
      E5 . G5 . C6 - G5 . | F#5 . A5 . D6 - A5 . | B5 - - . A5 . F#5 . | D#5 - - . F#5 . A5 . ` },
    bass: { inst: 'bass', vol: 0.24, bar: 'R - - F R - - F' },
    comp: { inst: 'chk', vol: 0.075, bar: 'X . . X . . X .' },
    drums: { div: 4, vol: 0.75, seq: 'A A A B A A A F A A A B A A A F', pats: {
      A: 'k.ht..htk.h.t.h.', B: 'k.ht..htk.htt.hh', F: 'k.ht..htk.t.rrrr' } },
  },
  splatter: {
    title: 'Splatter', bpm: 116, div: 2, barLen: 8, swing: 0.06,
    chords: 'F Dm Bb C F Dm Gm C7 Bb C Am Dm Gm C F C7',
    lead: { inst: 'pluck', vol: 0.34, notes: `
      A5 . C6 . A5 . F5 . | D5 . F5 . A5 - - . | Bb4 . D5 . F5 . D5 . | E5 . G5 . C6 - - . |
      F5 . A5 . C6 . A5 . | F5 . E5 . D5 - - . | G5 . Bb5 . D6 . Bb5 . | E5 - - . G5 . Bb5 . |
      D6 - - . Bb5 . F5 . | E5 - - . G5 . C6 . | A5 . E5 . C5 . E5 . | F5 - - . D5 . A4 . |
      G4 . Bb4 . D5 . G5 . | E5 . G5 . C6 . G5 . | A5 - - . F5 . C5 . | E5 . G5 . Bb5 . G5 . ` },
    bass: { inst: 'bass', vol: 0.24, bar: 'R . F . R . O .' },
    comp: { inst: 'chk', vol: 0.08, bar: '. X . X . X . X' },
    drums: { div: 4, vol: 0.9, seq: 'A A A A A A A F B B B B B B B F', pats: {
      A: 'k.h.t.hhk.h.t.h.', B: 'k.hht.h.k.hht.hh', F: 'k.h.t.h.k.t.rrrr' } },
  },
};
TRACKS.finale = Object.assign({}, TRACKS.high, { title: 'Paper Planes Waltz (reprise)', bpm: 120, drums: null });

function tokens(str) { return str.trim().split(/\s+/).filter((t) => t !== '|'); }
function resolveTok(tk, ch, role) {
  if (tk === '.' || tk === '-') return tk;
  if (/^[A-G][#b]?\d$/.test(tk)) return [noteMidi(tk)];
  const base = role === 'bass' ? atOrAbove(ch.pc, 38) : atOrAbove(ch.pc, 67);
  if (tk === 'X') return ch.iv.map((i) => atOrAbove((ch.pc + i) % 12, 55)).sort((a, b) => a - b);
  const off = { R: 0, T: ch.iv[1], F: ch.iv[2], S: ch.iv[3] === undefined ? ch.iv[2] : ch.iv[3], O: 12 }[tk];
  if (off === undefined) throw new Error('bad pattern token "' + tk + '"');
  return [base + off];
}
function toEvents(toks) {
  const ev = []; let last = null;
  toks.forEach((tk, i) => {
    if (tk === '-') { if (last) last.len++; return; }
    if (tk === '.') { last = null; return; }
    last = { at: i, len: 1, notes: tk }; ev.push(last);
  });
  return ev;
}
const compiled = new Map();
function compileTrack(name) {
  if (compiled.has(name)) return compiled.get(name);
  const def = TRACKS[name], bars = def.chords.trim().split(/\s+/), nb = bars.length, BL = def.barLen;
  const total = nb * BL, chans = [];
  const chordAt = (b, k) => { const p = bars[b].split('|'); return chordInfo(p.length > 1 && k >= BL / 2 ? p[1] : p[0]); };
  if (def.lead) {
    const t = tokens(def.lead.notes).map((x) => (x === '.' || x === '-' ? x : x.split('+').map(noteMidi)));
    if (t.length !== total) throw new Error(`${name} lead: ${t.length} steps, expected ${total}`);
    chans.push({ role: 'lead', inst: def.lead.inst, vol: def.lead.vol, div: def.div, events: toEvents(t) });
  }
  for (const role of ['bass', 'comp', 'arp']) {
    const p = def[role]; if (!p) continue;
    const t = [];
    for (let b = 0; b < nb; b++) {
      const bt = tokens((p.override && p.override[b]) || p.bar);
      if (bt.length !== BL) throw new Error(`${name} ${role} bar ${b}: ${bt.length} steps, expected ${BL}`);
      bt.forEach((tk, k) => t.push(resolveTok(tk, chordAt(b, k), role)));
    }
    chans.push({ role, inst: p.inst, vol: p.vol, div: def.div, events: toEvents(t) });
  }
  if (def.drums) {
    const d = def.drums, seq = d.seq.trim().split(/\s+/), per = BL * d.div / def.div, ev = [];
    if (seq.length !== nb) throw new Error(`${name} drums: ${seq.length} bars, expected ${nb}`);
    seq.forEach((key, b) => {
      const pat = d.pats[key].replace(/[\s|]/g, '');
      if (pat.length !== per) throw new Error(`${name} drum pattern ${key}: ${pat.length} steps, expected ${per}`);
      [...pat].forEach((c, k) => { if (c !== '.') ev.push({ at: b * per + k, len: 1, drum: c }); });
    });
    chans.push({ role: 'drums', inst: 'drum', vol: d.vol, div: d.div, events: ev });
  }
  const beat = 60 / def.bpm;
  const out = { name, title: def.title, def, chans, beat, loopDur: (total / def.div) * beat,
    timeOf(at, div) { const pos = at / div, b = Math.floor(pos), f = pos - b; return (b + f + def.swing * Math.sin(Math.PI * f)) * beat; },
    chordAtTime(at, div) { const step = at / div * def.div, b = Math.floor(step / BL); return chordAt(b, step - b * BL); } };
  compiled.set(name, out);
  return out;
}

/* ---------- instruments ---------- */
function env(p, t, dur, peak, a, sus, dTau, rTau) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * sus, t + a, dTau);
  p.setTargetAtTime(0, t + Math.max(a + 0.001, dur), rTau);
}
function osc(c, type, f, t, end) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(end); return o; }
function noiseSrc(A, t, end) { const s = A.c.createBufferSource(); s.buffer = A.nb; s.start(t, Math.random() * 0.35); s.stop(end); return s; }
const INST = {
  pluck(A, out, t, m, dur, v) {
    const c = A.c, f = midiHz(m), end = t + dur + 0.5, g = c.createGain(), g2 = c.createGain();
    osc(c, 'triangle', f, t, end).connect(g);
    const o2 = osc(c, 'sine', f * 2, t, end); g2.gain.value = 0.22; o2.connect(g2); g2.connect(g);
    env(g.gain, t, dur, v, 0.004, 0.28, 0.11, 0.06); g.connect(out);
  },
  bass(A, out, t, m, dur, v) {
    const c = A.c, end = t + dur + 0.4, g = c.createGain();
    osc(c, 'triangle', midiHz(m), t, end).connect(g);
    env(g.gain, t, dur, v, 0.006, 0.62, 0.18, 0.045); g.connect(out);
  },
  chk(A, out, t, m, dur, v) {
    const c = A.c, end = t + 0.3, g = c.createGain();
    osc(c, 'triangle', midiHz(m), t, end).connect(g);
    env(g.gain, t, 0.07, v, 0.003, 0, 0.05, 0.03); g.connect(out);
  },
  box(A, out, t, m, dur, v) {
    const c = A.c, f = midiHz(m), end = t + dur + 1.6, g = c.createGain(), gp = c.createGain();
    osc(c, 'sine', f, t, end).connect(g);
    osc(c, 'sine', f * 4.01, t, end).connect(gp);
    env(g.gain, t, Math.max(dur, 0.6), v, 0.002, 0, 0.42, 0.22);
    env(gp.gain, t, 0.1, v * 0.16, 0.001, 0, 0.05, 0.04);
    g.connect(out); gp.connect(out);
  },
  whistle(A, out, t, m, dur, v) {
    const c = A.c, f = midiHz(m), end = t + dur + 0.5, g = c.createGain(), vib = c.createGain(), g2 = c.createGain();
    const o = osc(c, 'sine', f, t, end), lfo = osc(c, 'sine', 5.2, t, end);
    vib.gain.setValueAtTime(0, t); vib.gain.linearRampToValueAtTime(f * 0.007, t + 0.3);
    lfo.connect(vib); vib.connect(o.frequency); o.connect(g);
    const o2 = osc(c, 'sine', f * 2, t, end); g2.gain.value = 0.09; o2.connect(g2); g2.connect(g);
    env(g.gain, t, dur, v, 0.045, 0.8, 0.2, 0.07); g.connect(out);
  },
  drum(A, out, t, kind, v) {
    const c = A.c;
    if (kind === 'k') {
      const o = osc(c, 'sine', 150, t, t + 0.3), g = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
      g.gain.setValueAtTime(0.46 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(out);
      return;
    }
    const spec = { t: ['bandpass', 3300, 3, 0.2, 0.035], h: ['highpass', 7200, 0.7, 0.075, 0.028], r: ['bandpass', 1700, 0.7, 0.15, 0.1] }[kind];
    if (!spec) return;
    const s = noiseSrc(A, t, t + spec[4] * 5), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = spec[0]; fl.frequency.value = spec[1]; fl.Q.value = spec[2];
    g.gain.setValueAtTime(spec[3] * v, t); g.gain.setTargetAtTime(0, t + 0.002, spec[4] / 3);
    s.connect(fl); fl.connect(g); g.connect(out);
    if (kind === 't') { const o = osc(c, 'triangle', 1900, t, t + 0.05), go = c.createGain(); go.gain.setValueAtTime(0.05 * v, t); go.gain.exponentialRampToValueAtTime(0.001, t + 0.03); o.connect(go); go.connect(out); }
  },
};

/* ---------- player ---------- */
function makePlayer(A, inst) {
  return {
    A, track: inst, out: null, t0: 0, stopAt: Infinity,
    st: inst.chans.map(() => ({ i: 0, loop: 0 })),
    schedule(now, horizon) {
      const T = this.track;
      T.chans.forEach((ch, ci) => {
        const st = this.st[ci], evs = ch.events; if (!evs.length) return;
        for (let guard = 0; guard < 500; guard++) {
          const e = evs[st.i], t = this.t0 + st.loop * T.loopDur + T.timeOf(e.at, ch.div);
          if (t > horizon || t > this.stopAt) break;
          if (t >= now - 0.03) {
            const dur = e.len / ch.div * T.beat * 0.94;
            try {
              if (ch.inst === 'drum') INST.drum(A, this.out, t, e.drum, ch.vol);
              else for (const m of e.notes) INST[ch.inst](A, this.out, t, m, dur, ch.vol);
            } catch (err) { /* a dropped note is fine */ }
          }
          if (++st.i >= evs.length) { st.i = 0; st.loop++; }
        }
      });
    },
  };
}

function createMusic() {
  let A = null, bus = null, filt = null, duck = null, timer = 0;
  let cur = null, want = null, enabled = true, muffled = false;
  const fading = [];
  const BUS = 0.035, LOOK = 0.3;
  function start(name) {
    const T = compileTrack(name), now = A.c.currentTime;
    const p = makePlayer(A, T);
    p.out = A.c.createGain(); p.out.connect(bus);
    p.t0 = now + 0.06;
    p.out.gain.setValueAtTime(0, now); p.out.gain.linearRampToValueAtTime(1, now + 0.7);
    p.name = name;
    return p;
  }
  function fadeOut(p, secs) {
    const now = A.c.currentTime, g = p.out.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + secs);
    p.stopAt = now + secs; fading.push(p);
  }
  function pump() {
    if (!A || A.c.state !== 'running') return;
    const now = A.c.currentTime;
    if (cur) cur.schedule(now, now + LOOK);
    for (let i = fading.length - 1; i >= 0; i--) {
      const p = fading[i];
      p.schedule(now, now + LOOK);
      if (now > p.stopAt + 2) { try { p.out.disconnect(); } catch (e) { /* gone */ } fading.splice(i, 1); }
    }
  }
  function apply() {
    if (!A) return;
    const target = enabled ? want : null;
    if (cur && cur.name === target) return;
    if (cur) { fadeOut(cur, target ? 1.1 : 0.5); cur = null; }
    if (target) { cur = start(target); pump(); }
  }
  return {
    attach(c, dest, nb) {
      A = { c, nb };
      bus = c.createGain(); bus.gain.value = BUS;
      filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 18000; filt.Q.value = 0.5;
      duck = c.createGain(); duck.gain.value = 1;
      bus.connect(filt); filt.connect(duck); duck.connect(dest);
      this.muffle(muffled);
      timer = setInterval(pump, 40);
      apply();
    },
    want(name) { if (name && !TRACKS[name]) return; want = name || null; apply(); },
    stop() { want = null; apply(); },
    setEnabled(on) { enabled = !!on; apply(); },
    muffle(on) {
      muffled = !!on; if (!A) return;
      const now = A.c.currentTime;
      filt.frequency.cancelScheduledValues(now); duck.gain.cancelScheduledValues(now);
      filt.frequency.setTargetAtTime(on ? 620 : 18000, now, 0.12);
      duck.gain.setTargetAtTime(on ? 0.6 : 1, now, 0.12);
    },
    title() { const n = enabled ? want : null; return n ? TRACKS[n].title : ''; },
  };
}

if (typeof module !== 'undefined') module.exports = { TRACKS, compileTrack, noteMidi, chordInfo, midiHz, INST, makePlayer };
