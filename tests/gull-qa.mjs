// node tests/gull-qa.mjs [out.json] [base url]
// Runs the 끼룩이 QA gates (tests/gull-qa.html?mode=gates: G1 low-pitch zero-gap, G2 pixel-snap crawl, G3 deform
// round trip, G4 ground/loop/occlusion) in headless Chrome over CDP, prints the result and exits 1 if a gate fails.
// --password-store=basic: headless Chrome can hang on the desktop keyring for http pages otherwise.
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [out, base = 'http://127.0.0.1:5300'] = process.argv.slice(2);
const port = 9500 + Math.floor(Math.random() * 300), dir = fs.mkdtempSync('/tmp/gullqa-');
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--password-store=basic', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const bye = (c) => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(c); };
setTimeout(() => { console.log('timeout'); bye(2); }, 600000);
await new Promise(r => setTimeout(r, 1500));
const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const wt = new Map(), errors = [];
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && wt.has(x.id)) { wt.get(x.id)(x.result); wt.delete(x.id); }
  if (x.method === 'Runtime.exceptionThrown') errors.push(x.params.exceptionDetails.exception?.description ?? x.params.exceptionDetails.text);
  if (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error') errors.push(x.params.args.map(a => a.value ?? a.description).join(' ')); };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; wt.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.navigate', { url: base + '/tests/gull-qa.html?mode=gates' });
let R = null;
for (let k = 0; k < 1100 && !R; k++) { await new Promise(r => setTimeout(r, 500)); R = (await send('Runtime.evaluate', { expression: 'window.__result && JSON.stringify(window.__result)', returnByValue: true }))?.result?.value; }
if (!R) { console.log('no result', errors); bye(1); }
const res = { ...JSON.parse(R), consoleErrors: errors };
console.log(JSON.stringify(res, null, 1)); if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
bye(['G1', 'G2', 'G3', 'G4'].every(g => res[g]?.pass) && !errors.length ? 0 : 1);
