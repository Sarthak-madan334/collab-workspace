import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

adb('install', '-r', 'frontend/android/app/build/outputs/apk/debug/app-debug.apk');
adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
adb('shell', 'am', 'start', '-n', 'com.synkro.app/.MainActivity');

let pid;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try { pid = adb('shell', 'pidof', 'com.synkro.app'); } catch { /* App is still starting. */ }
  if (pid) break;
  await pause(1000);
}
if (!pid) throw new Error('Synkro did not start');
adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);

let target;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const pages = await fetch('http://127.0.0.1:9222/json').then((response) => response.json());
    target = pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl);
    if (target) break;
  } catch { /* WebView is still starting. */ }
  await pause(1000);
}
if (!target) throw new Error('WebView debugger did not become available');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', ({ data }) => {
  const response = JSON.parse(data);
  const resolve = pending.get(response.id);
  if (resolve) { pending.delete(response.id); resolve(response); }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.error || result.result?.exceptionDetails) throw new Error(`CDP evaluation failed: ${JSON.stringify(result)}`);
  return result.result.result.value;
};

await send('Page.navigate', { url: 'https://localhost/register' });
let input;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    input = await evaluate(`(() => { const el = document.querySelector('input[type="email"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  } catch { /* Navigation is still replacing the execution context. */ }
  if (input) break;
  await pause(1000);
}
if (!input) throw new Error('Registration email field did not load');

mkdirSync('keyboard-smoke', { recursive: true });
const before = await evaluate('({ innerHeight, visualHeight: visualViewport?.height })');
writeFileSync('keyboard-smoke/before.png', execFileSync('adb', ['exec-out', 'screencap', '-p']));
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: input.x, y: input.y }] });
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await pause(2500);
const metrics = await evaluate(`({ focused: document.activeElement?.type, innerHeight, visualHeight: visualViewport?.height, viewportTop: visualViewport?.offsetTop })`);
writeFileSync('keyboard-smoke/after.png', execFileSync('adb', ['exec-out', 'screencap', '-p']));
console.log('Keyboard metrics:', { before, after: metrics });
console.log('IME state:', adb('shell', 'dumpsys', 'input_method').split('\n').filter((line) => /mInputShown|mShowRequested|mInputViewStarted/.test(line)).join('\n'));
ws.close();
if (metrics.focused !== 'email' || !metrics.visualHeight || metrics.visualHeight >= before.visualHeight * 0.9) {
  throw new Error('Keyboard did not focus the email input and reduce the visible viewport');
}
