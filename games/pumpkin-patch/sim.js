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
const GOLDEN_CHANCE = +src.match(/goldenChance: ([\d.]+)/)[1];  // share of vine pumpkins that grow golden
const BALE_H = +src.match(/HAY_H = (\d+)/)[1];                  // the hay bale's height (heights are from the ground)
const { RULES, STAGES, Rules, Wind } = lib;
// Try tunings without editing game.js:  SIM_RULES='{"impact":0.5}' SIM_STAGES='[{"speed":160},...]' node sim.js
if (process.env.SIM_RULES) Object.assign(RULES, JSON.parse(process.env.SIM_RULES));
if (process.env.SIM_STAGES) JSON.parse(process.env.SIM_STAGES).forEach((o, i) => Object.assign(STAGES[i], o));

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

// ── Players ──────────────────────────────────────────────────────────────────
// tap(): called every frame while hovering with the current offset from the target;
// returns true to drop now. pick(): which pumpkin to fetch next.
const pickRandom = (supply, P, R) => Math.floor(R() * supply.length);
const pickBigFirst = (supply, P) => { // heaviest that isn't heavier than the top, else the lightest
    const top = P[P.length - 1];
    let best = -1, bm = -1, light = 0;
    supply.forEach((k, i) => {
        const m = piece(k).m;
        if ((!top || m <= top.m * 1.05) && m > bm) { bm = m; best = i; }
        if (m < piece(supply[light]).m) light = i;
    });
    return best >= 0 ? best : light;
};
const pickSmallFirst = (supply) => { // upside-down pyramid: lightest first
    let light = 0;
    supply.forEach((k, i) => { if (piece(k).m < piece(supply[light]).m) light = i; });
    return light;
};

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
        lost: 0, windLost: 0 };
    const earned = { streak: 0, boom: 0, height: 0, golden: 0, capped: 0 };
    const wind = new Wind(rng(opts.windSeed || 4242)), sway = { x: 0, v: 0 }, tip = { tipT: 0 };
    const reachedH = new Set();
    let supply = LAYOUT.map(l => l.key).concat(PILES.map(p => p.hides));
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
        supply = supply.concat(lost.map(p => p.key));
        lostPts += lost.reduce((s, p) => s + (p.pts || 0), 0);
        streak = 0;
        tip.tipT = 0;
        lose(lost.length);
    };
    const frame = () => {
        dayT += DT;
        if (clock && dayT >= RULES.day) { end = end || 'dusk'; return; }
        w = opts.wind === false ? 0 : wind.update(DT, Rules.windStage(Rules.stageAt(P.length), dayT / RULES.day));
        const r = Rules.analyze(P, BASE, w);
        Rules.swayStep(sway, DT, Rules.swayTarget(r.lean, r.height, w));
        if (P.length && Rules.tipStep(tip, r.lean, DT)) { counts.gustTopple++; windFault = true; loseFrom(r.at); windFault = false; }
    };
    const wait = secs => { for (let t = 0; t < secs && !end; t += DT) frame(); };

    while (!end && drops < maxDrops) {
        wait(2.6 + 1.6 * R()); // fetch, carry, toss
        if (end) break;
        if (!supply.length) { // a fresh batch from the vines: now and then a golden one
            supply = Array.from({ length: 5 }, () => (R() < GOLDEN_CHANCE ? 'pumpkin_golden' : POOL[Math.floor(R() * POOL.length)]));
        }
        const key = supply.splice(pick(supply, P, R), 1)[0];
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
            if (streak && streak % RULES.lifeStreak === 0) earn(1, 'streak');
            const r = Rules.analyze(P, BASE, w), above = BALE_H + r.height;
            for (const hgt of RULES.lifeHeights) if (above >= hgt && !reachedH.has(hgt)) { reachedH.add(hgt); earn(1, 'height'); }
            Rules.swayKick(sway, aim.d >= 0 ? 1 : -1, res.kick, r.height);
        } else if (res.fall === 'roll') {
            counts.roll++;
            supply.push(pc.key);
            streak = 0;
            lose(1);
        } else {
            counts.topple++;
            P.push(res.piece);
            loseFrom(res.at);
        }
        windFault = false;
        tallest = Math.max(tallest, P.length);
        if (!end && P.length >= bankAt) { // BOOM: bank it, knock it down, gather the pumpkins again
            score += Math.round(P.reduce((s, p) => s + p.pts, 0) * Rules.boomMult(P.length));
            earn(Rules.boomLives(P.length), 'boom');
            supply = supply.concat(P.map(p => p.key));
            P = [];
            counts.banks++;
            sway.x = sway.v = 0;
            wait(2.5);
        }
    }
    score += P.reduce((s, p) => s + (p.pts || 0), 0); // a tower still standing at the end is banked (no BOOM bonus)
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
    console.log(
        `${name.padEnd(30)} stacked ${p3(sorted('placed'))}  tallest ${p3(sorted('tallest'))}  score p50 ${String(pct(sorted('score'), 0.5)).padStart(6)}` +
        `  sunset ${(dusk * 100).toFixed(0).padStart(3)}%  lives earned/rd ${lives.toFixed(1)}` +
        `  | per drop: perfect ${pc('perfect')} good ${pc('good')} wobbly ${pc('ok')} roll ${pc('roll')} topple ${pc('topple')}`);
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

    console.log('\nOrdering (good 70ms, never BOOM):');
    summarize('  random order', N, PLAYERS.timer(0.07), pickRandom, 8);
    summarize('  big first (pyramid)', N, PLAYERS.timer(0.07), pickBigFirst, 8);
    summarize('  small first (upside down)', N, PLAYERS.timer(0.07), pickSmallFirst, 8);

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

module.exports = { lib, playRound, fallRate, PLAYERS, rng };
