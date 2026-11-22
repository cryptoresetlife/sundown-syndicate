// A tiny Chrome DevTools Protocol driver (Node 22+, standard library only) used to play-test the
// game headlessly and to take its screenshots: it launches Chrome, sends real key and mouse input,
// evaluates expressions in the page, collects console errors and captures the rendered frame.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const KEY_CODES = { Space: 32, Enter: 13, Escape: 27, ShiftLeft: 16, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Browser {
  static async launch({ width = 1280, height = 720, port = 9333, gl = 'angle' } = {}) {
    const exe = CHROME_PATHS.find((p) => existsSync(p));
    if (!exe) throw new Error('Chrome not found; set CHROME_PATH');
    const profile = mkdtempSync(join(tmpdir(), 'sundown-chrome-'));
    const args = [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
      '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      ...(gl === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']),
      'about:blank',
    ];
    const child = spawn(exe, args, { stdio: 'ignore' });
    const b = new Browser(child, port, width, height);
    await b.connect();
    return b;
  }

  constructor(child, port, width, height) {
    this.child = child; this.port = port; this.width = width; this.height = height;
    this.nextId = 1; this.pending = new Map(); this.errors = []; this.logs = [];
  }

  async connect() {
    let target = null;
    for (let i = 0; i < 80 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
        target = list.find((t) => t.type === 'page');
      } catch { /* Chrome is still starting */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('could not reach Chrome');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push((d.exception && d.exception.description) || d.text);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (msg.params.type === 'error') this.errors.push(text); else this.logs.push(text);
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.errors.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
      }
    };
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Page.enable');
    await this.send('Network.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.width, height: this.height, deviceScaleFactor: 1, mobile: false });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async open(url) {
    await this.send('Page.navigate', { url });
    await sleep(600);
  }

  /** Evaluates an expression in the page and returns its JSON value. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  }

  async waitFor(expression, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.eval(expression).catch(() => false)) return true;
      await sleep(120);
    }
    throw new Error('timed out waiting for: ' + expression);
  }

  keyParams(code) {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code;
    const vk = KEY_CODES[code] ?? (code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : 0);
    return { code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  }

  keyDown(code) { return this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...this.keyParams(code) }); }
  keyUp(code) { return this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...this.keyParams(code) }); }

  async press(code, holdMs = 80) {
    await this.keyDown(code);
    await sleep(holdMs);
    await this.keyUp(code);
  }

  /** Holds several keys together for a while: real driving and walking input. */
  async hold(codes, ms) {
    for (const c of codes) await this.keyDown(c);
    await sleep(ms);
    for (const c of codes) await this.keyUp(c);
  }

  mouse(type, x, y, button = 'none', buttons = 0) {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  }

  async click(x, y, button = 'left', holdMs = 60) {
    const mask = button === 'right' ? 2 : 1;
    await this.mouse('mouseMoved', x, y);
    await this.mouse('mousePressed', x, y, button, mask);
    await sleep(holdMs);
    await this.mouse('mouseReleased', x, y, button, 0);
  }

  /** Captures the page as it is drawn right now. */
  async screenshot(file, { format = 'jpeg', quality = 90 } = {}) {
    const r = await this.send('Page.captureScreenshot', format === 'png' ? { format } : { format, quality });
    const bytes = Buffer.from(r.data, 'base64');
    writeFileSync(file, bytes);
    return bytes.length;
  }

  async close() {
    try { await this.send('Browser.close'); } catch { /* already gone */ }
    await sleep(200);
    try { this.child.kill(); } catch { /* already gone */ }
  }
}
