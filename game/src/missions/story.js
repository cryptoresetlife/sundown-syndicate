// The story of Sundown Syndicate: eight chapters in which Dez Calloway comes home to Marisol Bay,
// crosses the Coral Kings, and takes the city back from the developer Sterling Vance.
import { game } from '../core/state.js';
import { BLOCK, CITY, LANDMARKS, PIER } from '../world/layout.js';
import { LaneDriver, RouteDriver, ChaseDriver, steerToward } from '../vehicles/driver.js';
import { setWantedLevel, wanted } from '../police/wanted.js';
import { alertGang } from '../combat/gangs.js';
import { mission, registerStory, goTo, getIn, eliminate, wreck, pickUp, loseCops, talk, custom, race } from './missions.js';

const L = LANDMARKS;
const street = (id) => ({ x: L[id].streetX, z: L[id].streetZ });
const spot = (id) => ({ x: L[id].x, z: L[id].z });
const node = (i, j) => ({ x: i * BLOCK, z: j * BLOCK });

// 1. A delivery run against the clock in Mama Lupe's taco van: the tutorial for driving.
const welcomeBack = {
  id: 'welcome_back', title: 'Welcome Back', giver: 'lupe', start: 'tiki', reward: 400,
  intro: [
    ['LUPE', 'Three years, mijo. Three years and not one postcard.'],
    ['DEZ', 'They do not sell postcards upstate, Lupe.'],
    ['LUPE', 'Sterling Vance bought half the bay while you were gone. The boat works is next on his list.'],
    ['LUPE', 'But first you work. Take my van and run these orders before they go cold.'],
  ],
  setup(ctx) {
    const lm = L.tiki;
    ctx.clearArea(lm.x - 7, lm.z, 6);
    ctx.vars.van = ctx.vehicle('bodega', lm.x - 7, lm.z, Math.PI / 2, 0xffc23d);
  },
  failIf: (ctx) => (ctx.vars.van.destroyed ? "Lupe's van was wrecked" : null),
  steps: [
    getIn((ctx) => ctx.vars.van, "Get in Mama Lupe's taco van"),
    custom({ enter(ctx) { ctx.setTimer(200); ctx.say([['LUPE', 'First stop: Club Flamingo on the Ocean Strip. Drive, do not daydream.']]); }, update: () => true }),
    goTo(street('club'), 'Deliver to Club Flamingo on the Ocean Strip', { vehicle: (c) => c.vars.van, stop: true, label: '1' }),
    custom({ enter(ctx) { ctx.addTime(45); ctx.say([['DEZ', 'Twelve carnitas for the bouncers. Next: the Sundown Diner, Midtown.']]); }, update: () => true }),
    goTo(street('diner'), 'Deliver to the Sundown Diner in Midtown', { vehicle: (c) => c.vars.van, stop: true, label: '2' }),
    custom({ enter(ctx) { ctx.addTime(45); ctx.say([['ROYCE', 'Calloway. Out already? Tell Lupe that Detective Royce says hello.'], ['DEZ', 'Enjoy the tacos, detective.']]); }, update: () => true }),
    goTo(spot('safehouse'), 'Park the van at Calloway Boat Works', { vehicle: (c) => c.vars.van, stop: true, label: '3' }),
    custom({ enter(ctx) { ctx.clearTimer(); game.player.giveWeapon('pistol', 48); ctx.say([['LUPE', 'Home. Your father kept a Viper 9 in the workbench. You may need it.'], ['DEZ', 'Calloway Boat Works. Still standing.']]); }, update: () => true }),
    talk(),
  ],
};

// 2. Steal a guarded sports car, shake the police, deliver it undamaged.
const borrowedTime = {
  id: 'borrowed_time', title: 'Borrowed Time', giver: 'benny', start: 'benny', reward: (ctx) => Math.round(600 + 900 * Math.max(0, ctx.vars.car.health / ctx.vars.car.type.health)),
  intro: [
    ['BENNY', 'Dez Calloway! Benny Two-Tone never forgets a getaway driver.'],
    ['BENNY', "Vance's nephew parks a pink Marlin GT outside Club Flamingo. I have a buyer."],
    ['DEZ', 'Guarded?'],
    ['BENNY', 'Lightly. Bring her back without a scratch and the pay climbs.'],
  ],
  setup(ctx) {
    const lm = L.club;
    ctx.clearArea(lm.x, lm.z, 12);
    ctx.vars.car = ctx.vehicle('marlin', lm.x + 3, lm.z, Math.PI / 2, 0xff2e88);
    ctx.vars.guards = [ctx.enemy(lm.x - 5, lm.z + 3, { gang: 'vance', weapon: 'pistol', hold: true }), ctx.enemy(lm.x + 9, lm.z + 2, { gang: 'vance', weapon: 'pistol' })];
  },
  failIf: (ctx) => (ctx.vars.car.destroyed ? 'The Marlin was destroyed' : null),
  steps: [
    goTo(street('club'), 'Go to Club Flamingo on the Ocean Strip'),
    getIn((ctx) => ctx.vars.car, 'Steal the pink Marlin GT'),
    custom({ enter(ctx) { setWantedLevel(2); alertGang(L.club.x, L.club.z, 40, 'vance'); ctx.say([['BENNY', 'That alarm is wired to the precinct. Lose them before you come anywhere near me!']]); }, update: () => true }),
    loseCops('Lose the cops'),
    goTo(spot('benny'), "Deliver the Marlin to Benny's Chop Shop in the Dockyards", { vehicle: (c) => c.vars.car, stop: true }),
    talk([['BENNY', 'Beautiful. Mostly. Here is your cut.'], ['DEZ', 'Who is buying up the docks, Benny?'], ['BENNY', 'Talk to Juno Park at the arcade. She watches everything.']]),
  ],
};

// 3. Tail a courier across town without being noticed.
const tailLights = {
  id: 'tail_lights', title: 'Tail Lights', giver: 'juno', start: 'juno', reward: 900,
  intro: [
    ['JUNO', 'So you are the Calloway kid. I am Juno. I see everything with a lens on it.'],
    ['JUNO', 'A Coral Kings courier picks up cash at the Bank of Marisol every afternoon. Vance money.'],
    ['DEZ', 'And you want to know where it goes.'],
    ['JUNO', 'Follow his coral Rancho. Not too close. Not too far.'],
  ],
  failIf(ctx) {
    const c = ctx.vars.courier;
    if (c && c.destroyed) return 'The courier is dead and the trail with him';
    return null;
  },
  steps: [
    goTo({ x: 424, z: 324 }, 'Get a car and wait outside the Bank of Marisol', { anyVehicle: true, stop: true }),
    custom({
      text: 'Tail the coral Rancho to the stash',
      enter(ctx) {
        ctx.clearArea(470, 323, 9);
        const car = ctx.vehicle('rancho', 468, 323.5, Math.PI / 2, 0xff6b4a);
        const drv = new LaneDriver(car, 5, 4, 1, 0, 0);
        drv.cruise = 12.5;
        drv.plan = [[6, 4], [6, 5], [6, 6], [6, 7], [5, 7], [4, 7], [4, 8], [4, 9], [3, 9]].map(([i, j]) => ({ i, j }));
        const goal = street('stash');
        car.driver = {
          kind: 'courier', state: {},
          update(dt) {
            const d = Math.hypot(car.pos.x - goal.x, car.pos.z - goal.z);
            if (ctx.vars.arrived || d < 7) { ctx.vars.arrived = true; car.input.throttle = 0; car.input.brake = 1; return; }
            if (d < 34) steerToward(car, goal.x, goal.z, 6, dt, this.state); else drv.update(dt);
          },
        };
        ctx.vars.courier = car; ctx.vars.suspicion = 0; ctx.vars.lost = 0; ctx.vars.arrived = false;
        ctx.vars.blip = ctx.marker({ follow: car, color: 0xff6b4a, ring: false, label: '▼', kind: 'enemy' });
        ctx.say([['JUNO', 'There he goes. Keep one or two cars between you.']]);
      },
      update(ctx, dt) {
        const p = game.player, c = ctx.vars.courier;
        const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
        if (d < 14) ctx.vars.suspicion += dt * (d < 8 ? 0.5 : 0.22); else ctx.vars.suspicion = Math.max(0, ctx.vars.suspicion - dt * 0.07);
        if (wanted.stars > 0 && d < 60) ctx.vars.suspicion += dt * 0.2;
        ctx.vars.lost = d > 95 ? ctx.vars.lost + dt : 0;
        mission.meter = { label: 'SUSPICION', value: ctx.vars.suspicion, color: '#ff6b4a' };
        mission.info = d < 14 ? 'Too close — back off!' : d > 70 ? 'You are losing him…' : 'Good distance';
        if (ctx.vars.suspicion >= 1) { ctx.fail('The courier spotted the tail'); return false; }
        if (ctx.vars.lost > 8) { ctx.fail('You lost the courier'); return false; }
        return ctx.vars.arrived && d < 90;
      },
      exit(ctx) { mission.meter = null; mission.info = ''; ctx.unmark(ctx.vars.blip); },
    }),
    goTo({ x: 296, z: 711 }, 'Watch the handoff on foot from across Cannery Street', { onFoot: true, radius: 2.2 }),
    talk([['DEZ', 'He is carrying it into a stash house. Coral Kings on the door, Vance money inside.'], ['JUNO', 'Got the photos. That ledger in there is the whole arrangement, Dez.'], ['DEZ', 'Then we go and get it.']]),
  ],
};

// 4. A shootout at the stash house, then a getaway with the ledger.
const reefCleanup = {
  id: 'reef_cleanup', title: 'Reef Cleanup', giver: 'lupe', start: 'tiki', reward: 1800,
  intro: [
    ['LUPE', 'The Kings shook down my kitchen again last night. I am done feeding sharks.'],
    ['DEZ', 'Juno found their stash on Cannery Street. The ledger ties them to Vance.'],
    ['LUPE', 'Then take this Hornet from under the fryer, and bring me that book.'],
  ],
  setup() { game.player.giveWeapon('smg', 160); game.player.giveWeapon('pistol', 48); game.player.selectWeapon('smg'); game.player.armor = Math.max(game.player.armor, 50); },
  steps: [
    goTo(street('stash'), 'Go to the Coral Kings stash house on Cannery Street'),
    custom({
      enter(ctx) {
        const s = L.stash, around = [[-10, -3], [-4, 1], [4, 1], [10, -3], [0, 4], [-16, 10], [-16, 20], [15, 3]];
        ctx.vars.kings = around.map(([dx, dz], k) => ctx.enemy(s.x + dx, s.z + dz, { gang: 'kings', hostile: true, hold: k % 3 === 0, weapon: k % 4 === 0 ? 'smg' : 'pistol' }));
        ctx.say([['KINGS', 'That is Calloway! Light him up!']]);
      },
      update: () => true,
    }),
    eliminate((ctx) => ctx.vars.kings, 'Clear out the Coral Kings'),
    custom({ enter(ctx) { ctx.vars.ledger = ctx.pickup('briefcase', L.stash.x, L.stash.z + 4, 0, { tag: 'ledger' }); }, update: () => true }),
    pickUp((ctx) => ctx.vars.ledger, 'Grab the ledger'),
    custom({ enter(ctx) { setWantedLevel(2); ctx.say([['DEZ', 'Got it. And half the precinct heard that.']]); }, update: () => true }),
    loseCops('Lose the cops'),
    goTo(spot('tiki'), 'Bring the ledger to Mama Lupe at Tiki Taco'),
    talk([['LUPE', 'Every payment. Every permit. Vance owns the Kings, the council, half the police.'], ['DEZ', 'Not Royce?'], ['LUPE', 'Royce most of all.']]),
  ],
};

// 5. A car chase: run down Vance's bagman before the clock runs out.
const bagman = {
  id: 'bagman', title: 'The Bagman', giver: 'benny', start: 'benny', reward: 2500,
  intro: [
    ['BENNY', 'Word travels. Vance is moving his cash off the island tonight, in one car.'],
    ['BENNY', 'A black Vanta S leaving the bank. Fastest thing in the bay.'],
    ['DEZ', 'Then I will need something that can keep up.'],
    ['BENNY', 'Steal something with a spoiler. Wreck him, take the case.'],
  ],
  steps: [
    goTo({ x: 424, z: 324 }, 'Get a fast car and go to the Bank of Marisol', { anyVehicle: true }),
    custom({
      enter(ctx) {
        ctx.clearArea(500, 323.5, 10);
        const car = ctx.vehicle('vanta', 500, 323.5, Math.PI / 2, 0x101014);
        const loop = [[7, 4], [9, 4], [9, 1], [6, 1], [6, 0], [2, 0], [2, 3], [0, 3], [0, 9], [4, 9], [4, 7], [8, 7], [8, 10], [10, 10], [10, 4], [7, 4]].map(([i, j]) => node(i, j));
        const drv = new RouteDriver(car, loop, car.type.topSpeed * 0.58, true);
        car.driver = drv;
        ctx.vars.bag = car;
        ctx.setTimer(170, () => ctx.fail('The bagman got away'));
        ctx.say([['BENNY', 'That is him! Do not let him out of your sight!']]);
      },
      update: () => true,
    }),
    wreck((ctx) => ctx.vars.bag, "Wreck the bagman's Vanta S"),
    custom({ enter(ctx) { ctx.clearTimer(); const b = ctx.vars.bag; ctx.vars.case = ctx.pickup('briefcase', b.pos.x + 3, b.pos.z + 2, 0, { tag: 'case' }); }, update: () => true }),
    pickUp((ctx) => ctx.vars.case, 'Grab the briefcase'),
    goTo(spot('benny'), "Take the briefcase to Benny's Chop Shop"),
    talk([['BENNY', 'Two hundred grand and a key card for the Bank of Marisol vault. Oh, Dez.'], ['DEZ', 'Vance keeps his deeds in that vault. The boat works, Lupe\'s place, all of it.'], ['BENNY', 'Then you are going to rob a bank.']]),
  ],
};

// 6. A street race for the Kings' respect, in a borrowed car.
const neonRun = {
  id: 'neon_run', title: 'Neon Run', giver: 'juno', start: 'juno', reward: 3000,
  intro: [
    ['JUNO', 'Ricky Riptide runs the Kings now, and he will not move against Vance for free.'],
    ['JUNO', 'But he races for pink slips on Neon Row. Beat him and the Kings stand down.'],
    ['DEZ', 'I do not have a car that fast.'],
    ['JUNO', 'Take my Marlin. Scratch it and I will leak your browser history.'],
  ],
  setup(ctx) {
    ctx.clearArea(716.5, 150, 12);
    ctx.vars.car = ctx.vehicle('marlin', 716.5, 150, 0, 0x9b5de5);
  },
  failIf: (ctx) => (ctx.vars.car.destroyed ? "Juno's Marlin was destroyed" : null),
  steps: [
    getIn((ctx) => ctx.vars.car, "Take Juno's purple Marlin GT, parked on Neon Row"),
    goTo({ x: 716.5, z: 196 }, 'Pull up to the start line', { vehicle: (c) => c.vars.car, stop: true, radius: 4 }),
    custom({ enter(ctx) { ctx.say([['RIPTIDE', 'Calloway! You race like your old man fixed boats — slow!']]); }, update: () => true }),
    race({
      text: 'Win the race against Ricky Riptide',
      nodes: [[9, 3], [9, 6], [7, 6], [7, 9], [10, 9], [10, 4], [8, 4], [8, 2], [9, 2]],
      rivals: [{ type: 'caliente', paint: 0xff6b4a, pace: 0.8 }, { type: 'marlin', paint: 0xf5f5f5, pace: 0.76 }, { type: 'vanta', paint: 0xffd23f, pace: 0.66 }],
    }),
    talk([['RIPTIDE', 'Okay. Okay! The Kings sit this one out. Vance is all yours.'], ['DEZ', 'Tell your boys to stay off Calle Luna for a week.']]),
  ],
};

// 7. The bank job: hold the lobby while the vault is cracked, then escape a four-star response.
const paperTigers = {
  id: 'paper_tigers', title: 'Paper Tigers', giver: 'lupe', start: 'safehouse', reward: 9000,
  intro: [
    ['LUPE', 'Juno has the key card. Benny has a buyer for whatever is not ours.'],
    ['JUNO', 'I need forty seconds on the vault door. Vance security will not give them to you.'],
    ['DEZ', 'Then I will take them.'],
    ['LUPE', 'Armour is on the bench. Come home, mijo.'],
  ],
  setup() { const p = game.player; p.armor = 100; p.giveWeapon('rifle', 180); p.giveWeapon('pistol', 48); p.selectWeapon('rifle'); },
  steps: [
    goTo(spot('bank'), 'Go to the Bank of Marisol, on foot through the front', { onFoot: true }),
    custom({
      text: 'Hold the lobby while Juno cracks the vault',
      enter(ctx) {
        const b = L.bank;
        ctx.vars.progress = 0; ctx.vars.wave = 0; ctx.vars.waveClock = 2; ctx.vars.guards = [];
        for (const [dx, dz] of [[-9, 2], [9, 2], [-4, 5], [5, 6]]) ctx.vars.guards.push(ctx.enemy(b.x + dx, b.z + dz, { gang: 'vance', hostile: true, weapon: 'pistol' }));
        ctx.say([['JUNO', 'Card is in. Forty seconds. Keep them off the door!']]);
      },
      update(ctx, dt) {
        const b = L.bank, p = game.player;
        const near = Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 14 && !p.vehicle;
        if (near) ctx.vars.progress += dt / 42;
        mission.meter = { label: 'VAULT', value: ctx.vars.progress, color: '#4dff9a' };
        mission.info = near ? 'Cracking…' : 'Get back to the bank doors!';
        if (ctx.vars.progress > 0.25 && wanted.stars < 3) setWantedLevel(3);
        ctx.vars.waveClock -= dt;
        if (ctx.vars.waveClock <= 0 && ctx.vars.wave < 4) {
          ctx.vars.waveClock = 9; ctx.vars.wave++;
          for (const side of [-1, 1]) ctx.vars.guards.push(ctx.enemy(b.x + side * 26, b.streetZ + 2, { gang: 'vance', hostile: true, weapon: ctx.vars.wave > 2 ? 'smg' : 'pistol' }));
        }
        return ctx.vars.progress >= 1;
      },
      exit() { mission.meter = null; mission.info = ''; },
    }),
    custom({ enter(ctx) { ctx.vars.cash = ctx.pickup('briefcase', L.bank.x, L.bank.z - 3, 0, { tag: 'deeds' }); ctx.say([['JUNO', 'Open! Deeds, bonds, everything. Grab the case!']]); }, update: () => true }),
    pickUp((ctx) => ctx.vars.cash, 'Grab the deeds and the cash'),
    custom({ enter(ctx) { setWantedLevel(4); ctx.say([['DISPATCH', 'All units, armed robbery in progress at the Bank of Marisol. Air support is rolling.'], ['JUNO', 'A respray at Fresh Coat will throw them off, if you can get there.']]); }, update: () => true }),
    loseCops('Escape the police — a Fresh Coat respray will throw them off'),
    goTo(spot('safehouse'), 'Get back to Calloway Boat Works'),
    talk([['LUPE', 'The deed to the boat works. In your father\'s name. In yours.'], ['DEZ', 'Vance will come for it.'], ['LUPE', 'No, mijo. He is running. To his yacht, at the pier.']]),
  ],
};

// 8. The finale: stop Vance's convoy before it reaches the pier, then finish him.
const sundown = {
  id: 'sundown', title: 'Sundown', giver: 'lupe', start: 'safehouse', reward: 25000,
  intro: [
    ['LUPE', 'His convoy leaves Vance Tower at sundown. Armoured car, two chasers.'],
    ['BENNY', 'If he reaches the boat at the end of the pier, he is gone, and the lawyers come back instead.'],
    ['DEZ', 'He does not reach the boat.'],
  ],
  setup() { const p = game.player; p.armor = 100; p.heal(100); p.giveWeapon('rifle', 240); p.giveWeapon('launcher', 4); },
  steps: [
    goTo({ x: 440, z: 324 }, 'Drive to Vance Tower downtown', { anyVehicle: true }),
    custom({
      enter(ctx) {
        ctx.clearArea(483.5, 350, 30);
        const boss = ctx.vehicle('rancho', 476.5, 340, 0, 0x0c0c10);
        boss.health = boss.type.health * 3.2;
        const path = [node(6, 5), node(6, 7), node(10, 7), node(10, 5), { x: CITY + 30, z: 400 }, { x: PIER.x1 - 60, z: 400 }];
        const drv = new RouteDriver(boss, path, boss.type.topSpeed * 0.52);
        boss.driver = drv;
        ctx.vars.boss = boss; ctx.vars.bossDriver = drv;
        ctx.vars.escorts = [[476.5, 352], [476.5, 328]].map(([x, z]) => {
          const e = ctx.vehicle('rancho', x, z, 0, 0x0c0c10);
          e.driver = new ChaseDriver(e, () => { const p = game.player; return { x: p.pos.x, z: p.pos.z, vx: p.vx, vz: p.vz }; }, { topSpeed: 34 });
          return e;
        });
        ctx.say([['VANCE', 'Calloway. I offered your father a fair price too. Run him off the road.']]);
      },
      update: () => true,
    }),
    custom({
      text: "Destroy Vance's armoured Rancho before it reaches the pier",
      enter(ctx) { ctx.vars.blip = ctx.marker({ follow: ctx.vars.boss, color: 0xff3a3a, ring: false, label: '▼', kind: 'enemy' }); },
      update(ctx) {
        const v = ctx.vars.boss;
        mission.meter = { label: 'VANCE', value: v.health / (v.type.health * 3.2), color: '#ff4a4a' };
        if (ctx.vars.bossDriver.done && !v.destroyed) { ctx.fail('Vance reached his yacht'); return false; }
        return v.destroyed;
      },
      exit(ctx) { mission.meter = null; ctx.unmark(ctx.vars.blip); },
    }),
    custom({
      enter(ctx) {
        const v = ctx.vars.boss;
        const vance = ctx.enemy(v.pos.x + 3, v.pos.z + 3, { gang: 'vance', hostile: true, weapon: 'rifle', health: 320, accuracy: 0.06 });
        vance.name = 'Sterling Vance';
        ctx.vars.last = [vance, ctx.enemy(v.pos.x - 3, v.pos.z + 2, { gang: 'vance', hostile: true, weapon: 'smg' }), ctx.enemy(v.pos.x + 1, v.pos.z - 4, { gang: 'vance', hostile: true, weapon: 'smg' })];
        ctx.say([['VANCE', 'You people never know when you have been bought!']]);
      },
      update: () => true,
    }),
    eliminate((ctx) => ctx.vars.last, 'Finish Sterling Vance and his guards'),
    custom({ enter(ctx) { game.flags.storyDone = true; ctx.say([['DEZ', 'It is done, Lupe. The bay is ours again.'], ['LUPE', 'Then come eat. And Dez — send a postcard next time.'], ['RADIO', 'THE END. Marisol Bay is yours: every street, race, fare and flamingo.']]); }, update: () => true }),
    talk(),
  ],
};

export const STORY = [welcomeBack, borrowedTime, tailLights, reefCleanup, bagman, neonRun, paperTigers, sundown];
registerStory(STORY);
