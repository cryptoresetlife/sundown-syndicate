// Checks the test rig itself, step by step: script on a blank page, a bare WebGL context, a static
// file, then the game. Each line is printed as soon as it is known, so a stall shows where it is.
//   node tools/play.mjs tools/scenarios/hang.mjs "query=?autostart&debug" [gl=swiftshader]
export default async function (b, t) {
  const query = t.args.query || '?autostart&debug';
  const base = process.env.GAME_URL || 'http://localhost:8123/';
  const ask = (code) => b.eval(code).then((v) => JSON.stringify(v), (e) => 'FAILED: ' + e.message);
  console.log('blank page 1+1 =', await ask('1 + 1'));
  console.log('bare WebGL:', await ask(`(() => { const t0 = performance.now(); const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); if (!gl) return 'no context';
    const e = gl.getExtension('WEBGL_debug_renderer_info'); gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.finish();
    return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?', ms: Math.round(performance.now() - t0) }; })()`));
  await b.send('Page.navigate', { url: base + 'style.css' });
  await t.sleep(500);
  console.log('static file page:', await ask('document.body.innerText.length'));
  await b.send('Page.navigate', { url: base + query });
  for (let i = 0; i < 5; i++) {
    await t.sleep(1500);
    console.log('game page', i, await ask('(() => { const s = window.sundown; return s ? { mode: s.game.mode, frame: s.game.frame } : document.readyState; })()'));
  }
}
