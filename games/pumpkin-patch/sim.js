#!/usr/bin/env node
// Headless balance sim for Ansel's Pumpkin Patch (challenge mode).
//
// Loads the <rules> block straight out of game.js (weights, balance, wind, lives, stages,
// scoring), then plays thousands of rounds with simulated players and prints how far they get,
// how many lives they earn back, how much the wind matters, plus fall rates for single drops.
// Run:  node games/pumpkin-patch/sim.js [rounds]
//
// The fetch-and-carry part of each pumpkin is modelled as a 2.6-4.2 s wait; the hover, tap,
// landing and tipping use the game's rules. New batches of pumpkins stand in for the vines
// (golden ones at the game's goldenChance).
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
const block = src.slice(src.indexOf('// <rules>'), src.indexOf('// </rules>'));
const lib = new Function(block + '\nreturn { RULES, HEFT, STAGES, Rules, Wind };')();
const grab = re => (0, eval)('(' + src.match(re)[1] + ')');
const SPECS = grab(/const PUMPKIN_SPECS = (\{[\s\S]*?\n\});/);
const LAYOUT = grab(/const LAYOUT = (\[[\s\S]*?\n\]);/);
const POOL = grab(/const MORE_POOL = (\[[\s\S]*?\]);/);
const PILES = grab(/const PILES = (\[[\s\S]*?\n\]);/);
const GROW = grab(/const GROW = (\{[\s\S]*?\});/);              // vine growth (sprout, unripe, ripe)
const GROW_SPOTS = grab(/const GROW_SPOTS = (\[[\s\S]*?\n\]);/);
const HAY_X = +src.match(/const HAY_X = (\d+)/)[1];
const [WALK, HEAVY_WALK] = src.match(/const WALK_SPEED = (\d+), HEAVY_SPEED = (\d+)/).slice(1).map(Number);
const BALE_H = +src.match(/HAY_H = (\d+)/)[1];                  // the hay bale's height (heights are from the ground)
const { RULES, STAGES, Rules, Wind } = lib;
// Try tunings without editing game.js:  SIM_RULES='{"impact":0.5}' SIM_STAGES='[{"speed":160},...]' node sim.js
if (process.env.SIM_RULES) Object.assign(RULES, JSON.parse(process.env.SIM_RULES));
if (process.env.SIM_STAGES) JSON.parse(process.env.SIM_STAGES).forEach((o, i) => Object.assign(STAGES[i], o));
if (process.env.SIM_GROW) Object.assign(GROW, JSON.parse(process.env.SIM_GROW));          // e.g. '{"ripenTime":[40,60]}'
if (process.env.SIM_PATH) LAYOUT.splice(+process.env.SIM_PATH);                           // keep only the first N path pumpkins

const DT = 1 / 60;
const BASE = { x: 0, half: RULES.hayHalf };

function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const gauss = R => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
const piece = key => { const s = SPECS[key]; return Rules.piece(key, (s.w + 1) * 4, (s.h + 1) * 4, 0); };
const isHeavy = key => key === 'pumpkin_golden' || (SPECS[key].w + 1) * 4 >= 26 * 4;

// ── The patch: path pumpkins, leaf piles and vine spots, with the game's timings (seconds) ──
// pick/toss: Ansel's pick-up and toss; lane/leave: wading into and out of a vine row; water: the
// 12-frame pour at 85 ms; vinePick: tug it off the vine and lift it; more: the MORE! cheer;
// think: the player choosing what to tap next.
const T = { pick: 0.56, pickHeavy: 0.68, toss: 0.5, lane: 0.42, water: 12 * 0.085, vinePick: 0.76,
    vinePickHeavy: 0.89, leave: 0.61, leaveHeavy: 1.1, dive: 0.52, more: 2.1, think: 0.4 };
const uni = (R, [a, b]) => a + (b - a) * R();
function makePatch(R) {
    const patch = {
        path: LAYOUT.map(l => ({ key: l.key, x: l.x })),
        piles: PILES.map(p => ({ x: p.x, hides: p.hides })),
        spots: GROW_SPOTS.map(g => ({ x: g.x, stage: 0, t: 0, key: null, golden: false })),
    };
    patch.spots.forEach((sp, i) => { for (let k = 0; k < GROW.start[i % GROW.start.length]; k++) grow(sp, R); });
    return patch;
}
function grow(sp, R) {
    if (sp.stage >= 3) return;
    sp.stage += 1;
    if (sp.stage === 3) {
        sp.golden = R() < GROW.goldenChance;
        sp.key = sp.golden ? 'pumpkin_golden' : POOL[Math.floor(R() * POOL.length)];
    }
    sp.t = sp.stage === 2 ? (GROW.ripenTime ? uni(R, GROW.ripenTime) : Infinity) : uni(R, GROW.stageTime);
}
// What the player can tap: pumpkins on the path, vine pumpkins to pick or water, leaf piles.
function options(patch) {
    const o = [];
    patch.path.forEach((p, i) => o.push({ kind: 'path', i, x: p.x }));
    patch.spots.forEach((sp, i) => { if (sp.stage >= 1) o.push({ kind: sp.stage >= 3 ? 'ripe' : 'water', i, x: sp.x }); });
    patch.piles.forEach((p, i) => { if (p.hides) o.push({ kind: 'pile', i, x: p.x }); });
    return o;
}

// ── Players ──────────────────────────────────────────────────────────────────
// tap(): called every frame while hovering with the current offset from the target;
// returns true to drop now. pick(): which pumpkin to fetch next.
// Which thing the player taps next: anything in sight at random, or whatever is nearest Ansel.
const pickRandom = (opts, ax, R) => opts[Math.floor(R() * opts.length)];
const pickNearest = (opts, ax) => opts.reduce((b, o) => (Math.abs(o.x - ax) < Math.abs(b.x - ax) ? o : b));

// Widest landing offset (px) that stays steady (lean 0.6 or less with an average wobble).
function goodZone(P, pc, st, w) {
    let g = 0;
    for (let d = 1; d < 120; d++) {
        const ok = [d, -d].every(o => ['perfect', 'good'].includes(Rules.aim(P, BASE, pc, o, st, false, w).grade));
        if (!ok) break;
        g = d;
    }
    return g;
}

const PLAYERS = {
    // lands uniformly anywhere in the steady zone ("taps within the good zone"); with probability
    // pPerfect inside the perfect zone instead. Returns the landing offset it aims for.
    zone: pPerfect => () => ({
        offset({ P, pc, st, w }, R) {
            const zone = R() < pPerfect ? st.perfect : goodZone(P, pc, st, w);
            return (R() * 2 - 1) * zone;
        },
    }),
    // a random tapper: the drop time has nothing to do with where the pumpkin is
    random: () => {
        let at = null;
        return { tap: (h, R) => { if (at === null) at = 0.25 + R() * 2 * h.period; return h.t >= at; } };
    },
    // a person who aims the landing marker at the centre, with a timing error of sigma seconds
    timer: sigma => () => {
        let err = null, crossed = null;
        return {
            tap(h, R) {
                if (err === null) err = gauss(R) * sigma;
                if (h.t < 0.35) return false;
                if (crossed !== null) return h.t >= crossed + err;
                const toward = Math.sign(h.off) !== Math.sign(h.vel) && h.vel !== 0;
                if (toward && err < 0 && Math.abs(h.off / h.vel) <= -err) return true;
                if (h.prev !== null && Math.sign(h.prev) !== Math.sign(h.off)) { crossed = h.t; return err <= 0; }
                return false;
            },
        };
    },
};

// ── One round ────────────────────────────────────────────────────────────────
// opts.bankAt: press BOOM once the tower is this tall (banks its points, knocks it down).
// opts.clock: false to ignore the sunset clock. opts.wind: false to switch the gusts off.
// opts.firstRound: true for a player's very first round (the first pumpkins are assisted).
// Wind runs on its own random stream, so the same round can be replayed with and without it.
function playRound(makePlayer, pick, R, opts = {}) {
    const bankAt = opts.bankAt || Infinity, clock = opts.clock !== false, maxDrops = opts.maxDrops || 400;
    let P = [], lives = RULES.lives, placed = 0, score = 0, lostPts = 0, streak = 0, tallest = 0, drops = 0, dayT = 0;
    const counts = { perfect: 0, good: 0, ok: 0, roll: 0, topple: 0, gustTopple: 0, windMiss: 0, windSave: 0, banks: 0, golden: 0,
        lost: 0, windLost: 0, more: 0, fromPath: 0, fromRipe: 0, fromWatered: 0, lateTrips: 0, lateVine: 0, tripTime: 0, trips: 0 };
    const earned = { streak: 0, boom: 0, height: 0, golden: 0, capped: 0 };
    const wind = new Wind(rng(opts.windSeed || 4242)), sway = { x: 0, v: 0 }, tip = { tipT: 0 };
    const reachedH = new Set();
    const patch = makePatch(R);
    let ax = 700; // Ansel's x
    let end = null, w = 0;

    const earn = (k, why) => {
        const g = Math.max(0, Math.min(k, RULES.maxLives - lives));
        lives += g; earned[why] += g; earned.capped += k - g;
    };
    let windFault = false; // is the fall being handled now down to the wind?
    const lose = n => { lives -= n; counts.lost += n; if (windFault) counts.windLost += n; if (lives <= 0) end = 'lives'; };
    const loseFrom = (at) => { // joint `at` and everything above it fall: their points are lost
        const lost = P.slice(at);
        P = P.slice(0, at);
        // they tumble onto the path beside the bale, to be picked up again
        for (const p of lost) patch.path.push({ key: p.key, x: HAY_X + (R() < 0.5 ? -1 : 1) * (120 + 160 * R()) });
        lostPts += lost.reduce((s, p) => s + (p.pts || 0), 0);
        streak = 0;
        tip.tipT = 0;
        lose(lost.length);
    };
    const frame = () => {
        dayT += DT;
        if (clock && dayT >= RULES.day) { end = end || 'dusk'; return; }
        w = opts.wind === false ? 0 : wind.update(DT, Rules.windStage(Rules.stageAt(P.length), dayT / RULES.day));
        for (const sp of patch.spots) { if (sp.stage < 3 && !sp.busy && (sp.t -= DT) <= 0) grow(sp, R); }
        const r = Rules.analyze(P, BASE, w);
        Rules.swayStep(sway, DT, Rules.swayTarget(r.lean, r.height, w));
        if (P.length && Rules.tipStep(tip, r.lean, DT)) { counts.gustTopple++; windFault = true; loseFrom(r.at); windFault = false; }
    };
    const wait = secs => { for (let t = 0; t < secs && !end; t += DT) frame(); };

    while (!end && drops < maxDrops) {
        // ── fetch: tap something, Ansel walks there, picks or waters, and carries it to the bale ──
        const opts2 = options(patch);
        if (!opts2.length) { // nothing to fetch: MORE! grows the patch (never past unripe) and refills the piles
            counts.more++;
            wait(T.more);
            patch.spots.forEach((sp, i) => { if (sp.stage < 2) grow(sp, R); if (sp.stage < 2 && i % 2 === 0) grow(sp, R); });
            patch.piles.forEach(p => { if (!p.hides) p.hides = POOL[Math.floor(R() * POOL.length)]; });
            continue;
        }
        const o = pick(opts2, ax, R);
        let key, source, cost = T.think + Math.abs(o.x - ax) / WALK;
        if (o.kind === 'pile') { // dive in: the hidden pumpkin pops out onto the path
            const pile = patch.piles[o.i];
            patch.path.push({ key: pile.hides, x: pile.x + 60 });
            pile.hides = null;
            wait(cost + T.dive);
            ax = pile.x;
            continue;
        }
        if (o.kind === 'path') {
            key = patch.path.splice(o.i, 1)[0].key;
            source = 'fromPath';
            cost += isHeavy(key) ? T.pickHeavy : T.pick;
        } else {
            const sp = patch.spots[o.i];
            sp.busy = true;
            cost += T.lane;
            if (sp.stage < 3) { cost += T.water; while (sp.stage < 3) grow(sp, R); source = 'fromWatered'; } else source = 'fromRipe';
            key = sp.key;
            cost += (isHeavy(key) ? T.vinePickHeavy + T.leaveHeavy : T.vinePick + T.leave);
            Object.assign(sp, { stage: 0, key: null, golden: false, busy: false, t: uni(R, GROW.sproutDelay) });
        }
        const stand = HAY_X + (o.x <= HAY_X ? -1 : 1) * 175;
        cost += Math.abs(o.x - stand) / (isHeavy(key) ? HEAVY_WALK : WALK) + T.toss;
        if (dayT > 60) { counts.lateTrips++; if (source !== 'fromPath') counts.lateVine++; }
        counts.trips++; counts.tripTime += cost;
        wait(cost);
        ax = stand;
        if (end) break;
        const pc = piece(key);
        const golden = key === 'pumpkin_golden';
        if (golden) { counts.golden++; earn(RULES.goldenLife, 'golden'); } // harvesting it

        const player = makePlayer();
        const si = Rules.stageAt(P.length), st = STAGES[si];
        const assisted = !!opts.firstRound && placed < RULES.assisted;
        const amp = st.amp, speed = Rules.hoverSpeed(st, pc);
        let u = R() < 0.5 ? 0 : 2 * amp, drift = 0, prev = null, t = 0, land = 0;
        if (player.offset) { // offset-model player: ~1 s of hovering, then aims the landing spot
            wait(1);
            if (end) break;
            land = player.offset({ P, pc, st, w }, R);
        } else for (;;) {
            frame();
            if (end) break;
            t += DT;
            u += speed * DT;
            drift += (Rules.hoverDrift(w, pc) - drift) * (1 - Math.pow(0.05, DT));
            // what the player watches: the landing marker (hover + its drift + the fall drift)
            const o = Rules.tri(u, amp) + drift + Rules.fallDrift(w, pc);
            const h = { t, off: o, prev, vel: prev === null ? 0 : (o - prev) / DT, period: 4 * amp / speed };
            land = o;
            if (player.tap(h, R) || t > 30) break;
            prev = o;
        }
        if (end) break;
        drops++;
        const r0 = R();
        const aim = Rules.aim(P, BASE, pc, land, st, assisted, w);
        const res = Rules.land(P, BASE, pc, aim.d, w, { roll: !assisted, topple: !assisted }, () => r0);
        windFault = false;
        if (w) { // would the same drop (same aim, same wobble) have gone the other way without wind?
            const a0 = Rules.aim(P, BASE, pc, land, st, assisted, 0);
            const res0 = Rules.land(P, BASE, pc, a0.d, 0, { roll: !assisted, topple: !assisted }, () => r0);
            if (res.fall !== 'none' && res0.fall === 'none') { counts.windMiss++; windFault = true; }
            if (res.fall === 'none' && res0.fall !== 'none') counts.windSave++;
        }
        if (res.fall === 'none') {
            const sup = P[P.length - 1];
            streak = aim.kind === 'perfect' ? streak + 1 : 0;
            res.piece.pts = Rules.score(aim.kind, si, streak, Rules.ordered(sup, res.piece), golden);
            P.push(res.piece);
            placed++;
            counts[aim.kind]++;
            counts[source]++;
            if (streak && streak % RULES.lifeStreak === 0) earn(1, 'streak');
            const r = Rules.analyze(P, BASE, w), above = BALE_H + r.height;
            for (const hgt of RULES.lifeHeights) if (above >= hgt && !reachedH.has(hgt)) { reachedH.add(hgt); earn(1, 'height'); }
            Rules.swayKick(sway, aim.d >= 0 ? 1 : -1, res.kick, r.height);
        } else if (res.fall === 'roll') {
            counts.roll++;
            patch.path.push({ key: pc.key, x: HAY_X + (R() < 0.5 ? -1 : 1) * (120 + 160 * R()) });
            streak = 0;
            lose(1);
        } else {
            counts.topple++;
            P.push(res.piece);
            loseFrom(res.at);
        }
        windFault = false;
        tallest = Math.max(tallest, P.length);
        if (!end && P.length >= bankAt) { // BOOM: bank it and knock it down (those pumpkins are spent)
            score += Math.round(P.reduce((s, p) => s + p.pts, 0) * Rules.boomMult(P.length));
            earn(Rules.boomLives(P.length), 'boom');
            P = [];
            counts.banks++;
            sway.x = sway.v = 0;
            wait(2.5);
        }
    }
    // every round ends in a BOOM: a tower still standing at the end is banked with the height bonus
    if (P.length) score += Math.round(P.reduce((s, p) => s + (p.pts || 0), 0) * Rules.boomMult(P.length));
    return { placed, tallest, score, lostPts, drops, counts, earned, livesLeft: Math.max(0, lives), end: end || 'drops' };
}

// ── Reporting ────────────────────────────────────────────────────────────────
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
function runMany(rounds, makePlayer, pick, seed, opts) {
    const R = rng(seed);
    const res = [];
    for (let i = 0; i < rounds; i++) res.push(playRound(makePlayer, pick, R, Object.assign({ windSeed: seed * 7919 + i }, opts)));
    return res;
}
const p3 = a => [0.1, 0.5, 0.9].map(q => String(pct(a, q)).padStart(3)).join(' ');
function summarize(name, rounds, makePlayer, pick, seed, opts) {
    const res = runMany(rounds, makePlayer, pick, seed, opts);
    const sorted = k => res.map(r => r[k]).sort((a, b) => a - b);
    const sum = k => res.reduce((s, r) => s + r.counts[k], 0);
    const drops = res.reduce((s, r) => s + r.drops, 0);
    const lives = res.reduce((s, r) => s + r.earned.streak + r.earned.boom + r.earned.height + r.earned.golden, 0) / rounds;
    const dusk = res.filter(r => r.end === 'dusk').length / rounds;
    const pc = k => (sum(k) / drops * 100).toFixed(0).padStart(2) + '%';
    const stacked = sum('fromPath') + sum('fromRipe') + sum('fromWatered');
    console.log(
        `${name.padEnd(30)} stacked ${p3(sorted('placed'))}  tallest ${p3(sorted('tallest'))}  score p50 ${String(pct(sorted('score'), 0.5)).padStart(6)}` +
        `  sunset ${(dusk * 100).toFixed(0).padStart(3)}%  lives earned/rd ${lives.toFixed(1)}` +
        `  | watered ${(sum('fromWatered') / stacked * 100).toFixed(0).padStart(2)}% of stacked (ripe vine ${(sum('fromRipe') / stacked * 100).toFixed(0)}%,` +
        ` path ${(sum('fromPath') / stacked * 100).toFixed(0)}%)  vine trips after 1 min ${(sum('lateVine') / Math.max(1, sum('lateTrips')) * 100).toFixed(0)}%` +
        `  trip ${(sum('tripTime') / Math.max(1, sum('trips'))).toFixed(1)}s  MORE!/rd ${(sum('more') / rounds).toFixed(2)}` +
        `  | per drop: perfect ${pc('perfect')} roll ${pc('roll')} topple ${pc('topple')}`);
    return res;
}

// How much does the wind matter? Same players, same seeds, gusts on vs off.
function windReport(name, rounds, makePlayer, seed) {
    const on = runMany(rounds, makePlayer, pickRandom, seed), off = runMany(rounds, makePlayer, pickRandom, seed, { wind: false });
    const sum = (res, k) => res.reduce((s, r) => s + r.counts[k], 0);
    const drops = on.reduce((s, r) => s + r.drops, 0);
    const med = (res, k) => pct(res.map(r => r[k]).sort((a, b) => a - b), 0.5);
    console.log(
        `${name.padEnd(30)} lost pumpkins due to wind ${(sum(on, 'windLost') / Math.max(1, sum(on, 'lost')) * 100).toFixed(0).padStart(3)}%` +
        `  drops it tipped into a fall ${(sum(on, 'windMiss') / drops * 100).toFixed(1).padStart(4)}% (and saved ${(sum(on, 'windSave') / drops * 100).toFixed(1)}%)` +
        `  gust topples/round ${(sum(on, 'gustTopple') / rounds).toFixed(2)}  stacked p50 ${med(on, 'placed')} with wind, ${med(off, 'placed')} without`);
}

// Single drops at fixed offsets onto a fixed stack, in a given wind: how often does it fall?
function fallRate(stackKeys, dropKey, d, wind = 0, trials = 4000, seed = 7) {
    const R = rng(seed);
    const P = [];
    for (const k of stackKeys) P.push(Object.assign(piece(k), { x: 0 }));
    let falls = 0;
    for (let i = 0; i < trials; i++) {
        const w = wind ? (R() < 0.5 ? -wind : wind) : 0;
        const res = Rules.land(P, BASE, piece(dropKey), d, w, { roll: true, topple: true }, R);
        if (res.fall !== 'none') falls++;
    }
    return falls / trials;
}

if (require.main === module) {
    const N = +process.argv[2] || 2000;
    console.log(`Rounds per player: ${N} (a returning player: no assisted pumpkins). stacked = pumpkins that stayed`);
    console.log('on this round; tallest = tallest tower; columns are p10 p50 p90; score = banked points.\n');

    console.log('Never pressing BOOM, 3-minute afternoon:');
    summarize('random tapper', N, PLAYERS.random, pickRandom, 1);
    summarize('timing sd 150ms (casual)', N, PLAYERS.timer(0.15), pickRandom, 2);
    summarize('timing sd 100ms', N, PLAYERS.timer(0.10), pickRandom, 3);
    summarize('timing sd 70ms (good)', N, PLAYERS.timer(0.07), pickRandom, 4);
    summarize('timing sd 45ms (expert)', N, PLAYERS.timer(0.045), pickRandom, 5);
    summarize('timing sd 25ms (near-perfect)', N, PLAYERS.timer(0.025), pickRandom, 6);
    summarize('steady-zone tapper', N, PLAYERS.zone(0), pickRandom, 11);
    summarize('first round, casual (assisted)', N, PLAYERS.timer(0.15), pickRandom, 2, { firstRound: true });

    console.log('\nWind (same rounds with gusts on and off):');
    windReport('random tapper', N, PLAYERS.random, 1);
    windReport('timing sd 150ms (casual)', N, PLAYERS.timer(0.15), 2);
    windReport('timing sd 70ms (good)', N, PLAYERS.timer(0.07), 4);
    windReport('timing sd 45ms (expert)', N, PLAYERS.timer(0.045), 5);

    console.log('\nPressing BOOM at a given height:');
    for (const b of [6, 8, 10, 14]) summarize(`  good 70ms, BOOM at ${b}`, N, PLAYERS.timer(0.07), pickRandom, 21, { bankAt: b });
    for (const b of [10, 14, 18]) summarize(`  expert 45ms, BOOM at ${b}`, N, PLAYERS.timer(0.045), pickRandom, 22, { bankAt: b });

    console.log('\nPlayers who always fetch whatever is nearest Ansel:');
    summarize('  casual 150ms, nearest', N, PLAYERS.timer(0.15), pickNearest, 2);
    summarize('  good 70ms, nearest', N, PLAYERS.timer(0.07), pickNearest, 4);
    summarize('  good 70ms, nearest, BOOM at 8', N, PLAYERS.timer(0.07), pickNearest, 21, { bankAt: 8 });

    const support = k => (RULES.topFlat * (SPECS[k].w + 1) * 2).toFixed(1);
    const row = (label, stack, drop, wind) => {
        const offs = [0, 8, 16, 20, 24, 28, 32, 40, 56];
        console.log(label.padEnd(44) + offs.map(d => `${String(d).padStart(2)}px ${(fallRate(stack, drop, d, wind) * 100).toFixed(0).padStart(3)}%`).join('  '));
    };
    console.log('\nFall rate of one drop landing a given distance from the centre of the pumpkin below:');
    console.log(`(support flat half-widths: orange_m ${support('pumpkin_orange_m')} px, gold_s ${support('pumpkin_gold_s')} px, deep_xl ${support('pumpkin_deep_xl')} px)`);
    const M3 = ['pumpkin_orange_m', 'pumpkin_orange_m', 'pumpkin_orange_m'];
    row('medium on 3 mediums, calm', M3, 'pumpkin_orange_m', 0);
    row('medium on 3 mediums, gust 0.5', M3, 'pumpkin_orange_m', 0.5);
    row('HEAVY on light: deep_xl onto gold_s', ['pumpkin_orange_l', 'pumpkin_gold_s'], 'pumpkin_deep_xl', 0);
    row('light on HEAVY: gold_s onto deep_xl', ['pumpkin_orange_l', 'pumpkin_deep_xl'], 'pumpkin_gold_s', 0);
}

module.exports = { lib, playRound, fallRate, PLAYERS, rng, GROW, LAYOUT, pickRandom, pickNearest };
