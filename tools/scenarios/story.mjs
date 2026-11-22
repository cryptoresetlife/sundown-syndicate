// Walks all eight story chapters from start to "JOB DONE" by shortcutting the travel (warping to
// each objective) while letting the mission scripts themselves decide when a step is complete.
//   node tools/play.mjs tools/scenarios/story.mjs [only=3]
export default async function (b, t) {
  await t.newGame();
  await t.js('s.god(true); g.debug.fastForward = 3');
  const only = t.args.only ? Number(t.args.only) : 0;
  for (let chapter = 1; chapter <= 8; chapter++) {
    if (only && chapter !== only) continue;
    await t.js(`s.wanted(0); if (p.vehicle) { p.vehicle.vx = 0; p.vehicle.vz = 0; }`);
    const started = await t.js(`return s.chapter(${chapter}, true)`);
    console.log(`\n== chapter ${chapter} started=${started}`, (await t.facts()).mission);
    let lastStep = -1, stuck = 0;
    for (let tick = 0; tick < 400; tick++) {
      const st = await t.js(`const m = s.mission; if (!m.active) return { done: true, banner: m.banner && (m.banner.title + ' | ' + m.banner.sub) };
        const step = m.active.steps[m.stepIndex];
        if (!step) return { step: -1, objective: '(intro cutscene)', did: 'skip' };
        const ctx = m.ctx, v = ctx.vars;
        let did = '';
        // 1. a marker to reach: go and stand (or park) in it
        if (step.marker && !step.marker.follow && !step.race) {
          const need = v.van || v.car;
          if (need && !need.destroyed && p.vehicle !== need && /van|Marlin|Deliver|Park|start line/i.test(m.objective)) { const d = need.doorPosition(); if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; p.body.root.visible = true; } s.warp(d.x, d.z, 0); window.__f = 1; did = 'to door'; }
          else { if (/on foot|Watch/i.test(m.objective) && p.vehicle) { p.vehicle.driver = null; p.vehicle = null; p.body.root.visible = true; }
            if (/Get a|Drive to|fast car/i.test(m.objective) && !p.vehicle) s.drive('caliente');
            s.warp(step.marker.x, step.marker.z, p.heading); did = 'warp to marker'; }
        } else if (step.marker && step.marker.follow && !step.targets && /Get in|Steal|Take/i.test(m.objective)) { const d = step.marker.follow.doorPosition(); if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; p.body.root.visible = true; } s.warp(d.x, d.z, 0); window.__f = 1; did = 'to target car'; }
        else if (step.targets) { for (const n of step.targets) if (!n.dead) { n.takeDamage(9999, p); break; } did = 'kill one'; }
        else if (/Wreck|Destroy/i.test(m.objective)) { const car = v.bag || v.boss; if (!car.destroyed && car.burnTimer <= 0) car.damage(99999, 'player'); did = 'wreck'; }
        else if (/Lose|Escape/i.test(m.objective)) { s.wanted(0); did = 'clear wanted'; }
        else if (step.pickup) { s.warp(step.pickup.x, step.pickup.z, 0); did = 'grab'; }
        else if (/Tail/i.test(m.objective)) { const c = v.courier; const back = c.localToWorld(0, -30, { x: 0, z: 0 }); if (!p.vehicle) s.drive('brisa'); s.warp(back.x, back.z, c.heading); did = 'tail'; }
        else if (/Hold the lobby/i.test(m.objective)) { for (const n of v.guards) if (!n.dead) n.takeDamage(9999, p); did = 'hold ' + v.progress.toFixed(2); }
        else if (step.race) { const r = step.race; if (r.countdown <= 0) { const cp = r.cps[r.index]; s.warp(cp.x, cp.z, p.heading); } did = 'race cp ' + r.index; }
        return { step: m.stepIndex, objective: m.objective, did, info: m.info, timer: m.timer ? Math.round(m.timer.left) : null };`);
      if (st.done) { console.log('   finished:', st.banner, '| story', (await t.facts()).story, 'money', (await t.facts()).money); break; }
      if (await b.eval('window.__f === 1')) { await b.eval('window.__f = 0'); await t.sleep(60); await b.press('KeyF', 50); }
      if (st.step !== lastStep) { console.log(`   step ${st.step}: ${st.objective}  [${st.did}] ${st.info || ''} ${st.timer ?? ''}`); lastStep = st.step; stuck = 0; }
      else if (++stuck % 60 === 0) console.log(`     ...still on step ${st.step} [${st.did}] ${st.info || ''}`);
      await b.press('Enter', 20);
      await t.sleep(140);
    }
    const f = await t.facts();
    if (f.mission) { console.log('   STUCK in', f.mission); await t.shot('story-stuck-' + chapter); await t.js('s.mission.active && s.game && (0)'); break; }
  }
  await t.shot('story-end');
  console.log('final', await t.facts());
}
