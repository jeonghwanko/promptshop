// Table test for the one-writer rule (src/game/lease.js). Usage: node scripts/check-lease.mjs
import { step } from '../src/game/lease.js';
const st = (role, term) => ({ role, term });
const cases = [
  // [name, state, stored doc, my mark, { timedOut, holderAlive }, expected]
  ['first sight, nobody holds it → play at once', st('new', 0), { term: 4 }, 'A', {}, { role: 'live', term: 5, adopt: true, write: 'claim' }],
  ['first sight, a live tab holds it → take over', st('new', 0), { term: 4, by: 'B' }, 'A', { holderAlive: true }, { role: 'settle', term: 5, adopt: true, write: 'claim' }],
  ['first sight, the holder stopped saving (closed, asleep) → play at once', st('new', 0), { term: 4, by: 'B' }, 'A', { holderAlive: false }, { role: 'live', term: 5, write: 'claim' }],
  ['old doc without term or by → play at once', st('new', 0), {}, 'A', {}, { role: 'live', term: 1, write: 'claim' }],
  ['settle: my own claim comes back → keep waiting', st('settle', 5), { term: 5, by: 'A' }, 'A', {}, { role: 'settle', adopt: true, write: null }],
  ['settle: my claim not stored yet → keep waiting', st('settle', 5), { term: 4, by: 'B' }, 'A', {}, { role: 'settle', adopt: true, write: null }],
  ['settle: the old tab answered → play', st('settle', 5), { term: 5, by: 'A', ack: 5 }, 'A', {}, { role: 'live', adopt: true, write: 'flush' }],
  ['settle: no answer in time → play', st('settle', 5), { term: 4, by: 'B' }, 'A', { timedOut: true }, { role: 'live', write: 'flush' }],
  ['live: a newer tab claims → hand over', st('live', 5), { term: 6, by: 'C' }, 'A', {}, { role: 'idle', adopt: false, write: 'ack' }],
  ['same term, the other mark is lower → hand over', st('settle', 5), { term: 5, by: 'A' }, 'B', {}, { role: 'idle', write: 'ack' }],
  ['same term, my mark is lower → keep it and claim again', st('settle', 5), { term: 5, by: 'B' }, 'A', {}, { role: 'settle', write: 'claim' }],
  ['same term while live, my mark is lower → claim again', st('live', 5), { term: 5, by: 'B' }, 'A', {}, { role: 'live', adopt: false, write: 'claim' }],
  ['live: my own saves come back → never taken', st('live', 5), { term: 5, by: 'A', rev: 99 }, 'A', {}, { role: 'live', adopt: false, write: null }],
  ['live: an old page wrote over my claim → claim again', st('live', 5), { term: 0 }, 'A', {}, { role: 'live', adopt: false, write: 'claim' }],
  ['live: my release came back but I stayed (bfcache) → claim again', st('live', 5), { term: 5, by: null }, 'A', {}, { role: 'live', write: 'claim' }],
  ['idle: watch everything, write nothing', st('idle', 5), { term: 9, by: 'C' }, 'A', {}, { role: 'idle', adopt: true, write: null }],
];
let bad = 0;
for (const [name, s, r, me, ctx, want] of cases) {
  const o = step(s, r, me, ctx), got = { role: o.st.role, term: o.st.term, adopt: o.adopt, write: o.write };
  const ok = Object.entries(want).every(([k, v]) => got[k] === v); if (!ok) bad++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(got));
}

// two tabs that claimed the same term, whatever order the store shows their claims in: exactly one keeps the island
for (const order of [['A', 'B'], ['B', 'A'], ['A', 'B', 'A'], ['B', 'A', 'B']]) {
  let a = st('settle', 6), b = st('settle', 6);
  for (const by of order) { a = step(a, { term: 6, by }, 'A').st; b = step(b, { term: 6, by }, 'B').st; }
  // the store ends with the lower mark: A keeps claiming until it does
  a = step(a, { term: 6, by: 'A' }, 'A', { timedOut: true }).st; b = step(b, { term: 6, by: 'A' }, 'B', { timedOut: true }).st;
  const ok = [a.role, b.role].filter(r => r === 'live').length === 1 && b.role === 'idle'; if (!ok) bad++;
  console.log(ok ? 'PASS' : 'FAIL', 'race ' + order.join('→'), ok ? '' : a.role + ' ' + b.role);
}
process.exit(bad ? 1 : 0);
