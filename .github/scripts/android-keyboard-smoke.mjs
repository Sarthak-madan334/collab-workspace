import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('Installing APK on Android 16 emulator');
adb('install', '-r', 'frontend/android/app/build/outputs/apk/debug/app-debug.apk');
adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
console.log('Opening Synkro');
adb('shell', 'am', 'start', '-n', 'com.synkro.app/.MainActivity');

let pid;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try { pid = adb('shell', 'pidof', 'com.synkro.app'); } catch { /* App is still starting. */ }
  if (pid) break;
  await pause(1000);
}
if (!pid) throw new Error('Synkro did not start');
console.log(`WebView process ${pid} started`);
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
console.log('WebView debugger connected');

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

mkdirSync('keyboard-smoke', { recursive: true });
let registerLink;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    registerLink = await evaluate(`(() => { const el = document.querySelector('.landing-hero-actions a[href="/register"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  } catch { /* The app is still loading. */ }
  if (registerLink) break;
  await pause(1000);
}
if (!registerLink) throw new Error(`Landing page did not load: ${JSON.stringify(await evaluate('({ url: location.href, text: document.body?.innerText?.slice(0, 200) })'))}`);
console.log('Opening registration form from landing page');
writeFileSync('keyboard-smoke/landing.png', execFileSync('adb', ['exec-out', 'screencap', '-p']));
await evaluate('document.querySelector(\'.landing-hero-actions a[href="/register"]\').click(); location.pathname');
let input;
let lastEvaluationError;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    input = await evaluate(`(() => { const el = document.querySelector('input[type="email"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  } catch (error) { lastEvaluationError = error; }
  if (input) break;
  await pause(1000);
}
if (!input) {
  writeFileSync('keyboard-smoke/navigation-failed.png', execFileSync('adb', ['exec-out', 'screencap', '-p']));
  console.log('Navigation result:', await evaluate('({ url: location.href, text: document.body?.innerText?.slice(0, 500) })').catch((error) => String(error)));
  throw new Error(`Registration email field did not load. ${lastEvaluationError || ''}`);
}
console.log('Registration email field loaded');

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
