// Table test for the one-writer rule (src/game/lease.js). Usage: node scripts/check-lease.mjs
import { step } from '../src/game/lease.js';
const st = (role, term, claimSeen = false) => ({ role, term, claimSeen });
const cases = [
  ['first sight, nobody holds it → play at once', st('new', 0), { term: 4 }, 'A', false, { role: 'live', term: 5, adopt: true, write: 'claim' }],
  ['first sight, another tab holds it → take over', st('new', 0), { term: 4, by: 'B' }, 'A', false, { role: 'settle', term: 5, adopt: true, write: 'claim' }],
  ['old doc without term or by → play at once', st('new', 0), {}, 'A', false, { role: 'live', term: 1, write: 'claim' }],
  ['settle: my own claim comes back → keep waiting', st('settle', 5), { term: 5, by: 'A' }, 'A', false, { role: 'settle', adopt: true, write: null }],
  ['settle: the old tab answered → play', st('settle', 5), { term: 5, by: 'A', ack: 5 }, 'A', false, { role: 'live', adopt: true, write: 'flush' }],
  ['settle: no answer in time → play', st('settle', 5), { term: 4, by: 'B' }, 'A', true, { role: 'live', write: 'flush' }],
  ['live: a newer tab claims → hand over', st('live', 5), { term: 6, by: 'C' }, 'A', false, { role: 'idle', adopt: false, write: 'ack' }],
  ['two tabs claimed the same term, the store kept the other → hand over', st('settle', 5), { term: 5, by: 'B' }, 'A', false, { role: 'idle', write: 'ack' }],
  ['the same, seen by the one the store kept → stays', st('settle', 5), { term: 5, by: 'B' }, 'B', false, { role: 'settle', write: null }],
  ['live: my own saves come back → never taken', st('live', 5), { term: 5, by: 'A', rev: 99 }, 'A', false, { role: 'live', adopt: false, write: null, claimSeen: true }],
  ['live: an old page wrote over my claim → claim again', st('live', 5, true), { term: 0 }, 'A', false, { role: 'live', adopt: false, write: 'claim' }],
  ['live: before my claim is seen, the old term is no reason to claim again', st('live', 5), { term: 4, by: 'B' }, 'A', false, { role: 'live', write: null }],
  ['idle: watch everything, write nothing', st('idle', 5), { term: 9, by: 'C' }, 'A', false, { role: 'idle', adopt: true, write: null }],
];
let bad = 0;
for (const [name, s, r, me, timedOut, want] of cases) {
  const o = step(s, r, me, timedOut), got = { role: o.st.role, term: o.st.term, adopt: o.adopt, write: o.write, claimSeen: o.st.claimSeen };
  const ok = Object.entries(want).every(([k, v]) => got[k] === v); if (!ok) bad++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(got));
}
process.exit(bad ? 1 : 0);
