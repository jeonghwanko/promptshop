// The first-session funnel from the dev store's logs (log/<board>~<user>, written by track() in src/game/persist.js).
// Usage: node scripts/funnel.mjs [dev-data/db.json] [board]
import fs from 'node:fs';
const db = JSON.parse(fs.readFileSync(process.argv[2] ?? 'dev-data/db.json', 'utf8')), only = process.argv[3];
const players = Object.entries(db.log ?? {}).filter(([id]) => !only || id.startsWith(only + '~')).map(([id, l]) => {
  const ev = Object.entries(l).map(([k, v]) => ({ e: k.slice(k.indexOf('_') + 1), t: +k.split('_')[0], ...v })).sort((a, b) => a.t - b.t);
  const first = (e, f = () => true) => ev.find(x => x.e === e && f(x));
  return { id, invited: !!first('arrive', x => x.from), arrive: first('arrive'), pick: first('pick'), built: first('tut', x => x.step >= (x.v >= 3 ? 3 : x.v === 2 ? 4 : 6)), done: first('tut', x => x.step >= (x.v === 4 ? 5 : x.v === 3 ? 6 : x.v === 2 ? 7 : 9)),   // v 2: seven steps with the bar, v 3: six, no buttons, v 4: five (the invite comes later)
    invite: first('invite_copy'), joined: first('friend_joined'), half: first('bridge_half'), next: first('pick', x => x.nextToInviter) };
});
const row = (name, list, steps) => {
  console.log(`\n${name}: ${list.length}`);
  for (const [label, key] of steps) { const n = list.filter(p => p[key]).length, secs = list.filter(p => p[key] && p.arrive).map(p => (p[key].t - p.arrive.t) / 1000).sort((a, b) => a - b);
    console.log(`  ${label.padEnd(22)} ${String(n).padStart(3)}  ${list.length ? Math.round(n / list.length * 100) : 0}%${secs.length ? `  median ${secs[secs.length >> 1].toFixed(0)} s` : ''}`); }
};
row('came without a link', players.filter(p => !p.invited), [['chose an island', 'pick'], ['first shop built', 'built'], ['guide finished', 'done'], ['shared the link', 'invite'], ['a friend moved in', 'joined']]);
row('came by an invite link', players.filter(p => p.invited), [['chose an island', 'pick'], ['next to the inviter', 'next'], ['first shop built', 'built'], ['built a half bridge', 'half']]);
