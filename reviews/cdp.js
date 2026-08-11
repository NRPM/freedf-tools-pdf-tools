/* CDP harness: launch Edge headless, capture console + exceptions, run scripts.
   Usage: node cdp.js <url> [script.js] [--emulate-reduced-motion] [--fresh-profile]
   Prints JSON: { console: [...], errors: [...], result: <eval result> }
*/
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const url = positional[0];
const scriptFile = positional[1];
const preludeFile = positional[2];
const emulateReduced = process.argv.includes('--emulate-reduced-motion');
const freshProfile = process.argv.includes('--fresh-profile');
const userDataDir = freshProfile
  ? path.join(process.env.TEMP || '/tmp', 'edge-cdp-fresh-' + Date.now())
  : path.join(process.env.TEMP || '/tmp', 'edge-cdp-' + Date.now());

const port = 9333 + Math.floor(Math.random() * 500);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900', 'about:blank'
  ];
  const proc = spawn(EDGE, args, { stdio: 'ignore' });

  // Wait for devtools endpoint
  let tabs = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      tabs = await res.json();
      if (tabs.length) break;
    } catch (e) {}
    await sleep(250);
  }
  if (!tabs || !tabs.length) { console.error('NO_DEVTOOLS'); proc.kill(); process.exit(1); }

  // Pick a real page tab (skip extension/service-worker tabs)
  let tab = tabs.find(t => t.type === 'page');
  if (!tab) tab = tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const consoleMsgs = [];
  const exceptions = [];

  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      consoleMsgs.push({ type, text });
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      exceptions.push({
        text: d.exception ? d.exception.description || d.text : d.text,
        line: d.lineNumber, col: d.columnNumber,
        url: d.url
      });
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') {
        consoleMsgs.push({ type: 'log-' + e.level, text: e.text });
      }
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  const dlDir = path.join(process.env.TEMP || '/tmp', 'edge-dl-' + Date.now());
  fs.mkdirSync(dlDir, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true });
  global.__dlDir = dlDir;
  if (emulateReduced) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  }

  // Navigate
  await send('Page.navigate', { url });
  // Wait for load
  await new Promise(resolve => {
    const t0 = Date.now();
    const iv = setInterval(async () => {
      try {
        const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (r.result.value === 'complete' || Date.now() - t0 > 20000) { clearInterval(iv); resolve(); }
      } catch (e) { clearInterval(iv); resolve(); }
    }, 300);
  });
  await sleep(2500); // let async init settle

  let result = null;
  if (preludeFile) {
    const code = fs.readFileSync(preludeFile, 'utf8');
    await send('Runtime.evaluate', { expression: code, returnByValue: true });
  }
  if (scriptFile) {
    const code = fs.readFileSync(scriptFile, 'utf8');
    const r = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      result = { evalError: r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text };
    } else {
      result = r.result.value;
    }
  }
  console.log(JSON.stringify({ console: consoleMsgs, exceptions, result, dlDir: global.__dlDir }, null, 1));
  ws.close();
  proc.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}

main().catch(e => { console.error('HARNESS_ERROR: ' + e.message); process.exit(1); });
