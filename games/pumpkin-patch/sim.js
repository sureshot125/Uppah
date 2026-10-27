#!/usr/bin/env node
// Headless balance sim for Ansel's Pumpkin Patch (challenge mode).
//
// Loads the <rules> block straight out of game.js (weights, balance, lives, stages, scoring),
// then plays thousands of rounds with simulated players and prints how far they get, how many
// lives they earn back, plus fall rates for single drops at fixed offsets.
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

// Widest offset (px) that still shows a white or gold ring for this drop.
function goodZone(P, pc, st, assisted) {
    let g = 0;
    for (let d = 1; d < 120; d++) {
        const ok = [d, -d].every(o => ['perfect', 'good'].includes(Rules.aim(P, BASE, pc, o, st, assisted).grade));
        if (!ok) break;
        g = d;
    }
    return g;
}

const PLAYERS = {
    // taps land uniformly anywhere inside the white/gold ring zone ("taps within the good zone");
    // with probability pPerfect inside the gold (perfect) zone instead
    zone: pPerfect => () => ({
        offset({ P, pc, st, assisted }, R) {
            const zone = R() < pPerfect ? st.perfect * (assisted ? 1.5 : 1) : goodZone(P, pc, st, assisted);
            return (R() * 2 - 1) * zone;
        },
    }),
    // a random tapper: the drop time has nothing to do with where the pumpkin is
    random: () => {
        let at = null;
        return { tap: (h, R) => { if (at === null) at = 0.25 + R() * 2 * h.period; return h.t >= at; } };
    },
    // a person who aims for the centre with a timing error of sigma seconds (anticipates the crossing)
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
// Wind runs on its own random stream and is scenery only (the hovering pumpkin sways with the
// tower top, and landings are judged against where the tower rests), so rounds come out the
// same with it on or off; main() checks that.
function playRound(makePlayer, pick, R, opts = {}) {
    const bankAt = opts.bankAt || Infinity, clock = opts.clock !== false, maxDrops = opts.maxDrops || 400;
    let P = [], lives = RULES.lives, placed = 0, score = 0, lostPts = 0, streak = 0, tallest = 0, drops = 0, dayT = 0;
    const counts = { perfect: 0, good: 0, ok: 0, roll: 0, topple: 0, lateTopple: 0, banks: 0, golden: 0 };
    const earned = { streak: 0, boom: 0, height: 0, golden: 0, capped: 0 };
    const wind = new Wind(rng(opts.windSeed || 4242)), sway = { x: 0, v: 0 }, tip = { tipT: 0 };
    const reachedH = new Set();
    let supply = LAYOUT.map(l => l.key).concat(PILES.map(p => p.hides));
    let end = null, minLives = lives, maxLivesSeen = lives;

    const earn = (k, why) => {
        const g = Math.max(0, Math.min(k, RULES.maxLives - lives));
        lives += g; earned[why] += g; earned.capped += k - g;
        maxLivesSeen = Math.max(maxLivesSeen, lives);
    };
    const lose = n => {
        lives -= n;
        minLives = Math.min(minLives, Math.max(0, lives));
        if (lives <= 0) end = 'lives';
    };
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
        const w = opts.wind === false ? 0 : wind.update(DT, Rules.windStage(Rules.stageAt(P.length), dayT / RULES.day));
        const r = Rules.analyze(P, BASE);
        Rules.swayStep(sway, DT, Rules.swayTarget(r.lean, r.height, w));
        if (P.length && Rules.tipStep(tip, r.lean, DT)) { counts.lateTopple++; loseFrom(r.at); }
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
        const assisted = placed < RULES.assisted;
        const amp = st.amp, speed = Rules.hoverSpeed(st, pc, streak);
        let u = R() < 0.5 ? 0 : 2 * amp, prev = null, t = 0, off = 0;
        if (player.offset) { // offset-model player: ~1 s of hovering, then a drop at a chosen offset
            wait(1);
            if (end) break;
            off = player.offset({ P, pc, st, assisted }, R);
        } else for (;;) {
            frame();
            if (end) break;
            t += DT;
            u += speed * DT;
            // what the player sees: the hovering pumpkin against the top (they sway together)
            const o = Rules.tri(u, amp);
            const h = { t, off: o, prev, vel: prev === null ? 0 : (o - prev) / DT, period: 4 * amp / speed };
            off = o;
            if (player.tap(h, R) || t > 30) break;
            prev = o;
        }
        if (end) break;
        drops++;
        const aim = Rules.aim(P, BASE, pc, off, st, assisted);
        const res = Rules.land(P, BASE, pc, aim.d, { roll: !assisted, topple: !assisted }, R);
        if (res.fall === 'none') {
            const sup = P[P.length - 1];
            streak = aim.kind === 'perfect' ? streak + 1 : 0;
            res.piece.pts = Rules.score(aim.kind, si, streak, Rules.ordered(sup, res.piece), golden);
            P.push(res.piece);
            placed++;
            counts[aim.kind]++;
            if (streak && streak % RULES.lifeStreak === 0) earn(1, 'streak');
            const r = Rules.analyze(P, BASE), above = BALE_H + r.height;
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
    return { placed, tallest, score, lostPts, drops, counts, earned, minLives, maxLivesSeen, livesLeft: Math.max(0, lives), end: end || 'drops' };
}

// ── Reporting ────────────────────────────────────────────────────────────────
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
function runMany(rounds, makePlayer, pick, seed, opts) {
    const R = rng(seed);
    const res = [];
    for (let i = 0; i < rounds; i++) res.push(playRound(makePlayer, pick, R, Object.assign({ windSeed: seed * 7919 + i }, opts)));
    return res;
}
function summarize(name, rounds, makePlayer, pick, seed, opts) {
    const res = runMany(rounds, makePlayer, pick, seed, opts);
    const sorted = k => res.map(r => r[k]).sort((a, b) => a - b);
    const placed = sorted('placed'), tallest = sorted('tallest'), score = sorted('score');
    const mean = a => (a.reduce((s, v) => s + v, 0) / a.length);
    const per = k => (res.reduce((s, r) => s + r.earned[k], 0) / rounds).toFixed(2);
    const dusk = res.filter(r => r.end === 'dusk').length / rounds;
    const p3 = a => [0.1, 0.5, 0.9].map(q => String(pct(a, q)).padStart(3)).join(' ');
    console.log(
        `${name.padEnd(30)} stacked ${p3(placed)}  tallest ${p3(tallest)}  score p50 ${String(pct(score, 0.5)).padStart(6)}` +
        `  sunset ${(dusk * 100).toFixed(0).padStart(3)}%  lives earned/rd: streak ${per('streak')} boom ${per('boom')} height ${per('height')}` +
        ` golden ${per('golden')} (wasted at cap ${per('capped')})  lives left at end p50 ${pct(sorted('livesLeft'), 0.5)}`);
    return res;
}

// Single drops at fixed offsets onto a fixed stack: how often does it fall?
function fallRate(stackKeys, dropKey, d, trials = 4000, seed = 7) {
    const R = rng(seed);
    const P = [];
    for (const k of stackKeys) P.push(Object.assign(piece(k), { x: 0 }));
    let falls = 0;
    for (let i = 0; i < trials; i++) {
        const res = Rules.land(P, BASE, piece(dropKey), d, { roll: true, topple: true }, R);
        if (res.fall !== 'none') falls++;
    }
    return falls / trials;
}

if (require.main === module) {
    const N = +process.argv[2] || 2000;
    console.log(`Rounds per player: ${N}. stacked = pumpkins that stayed on this round; tallest = tallest tower;`);
    console.log('columns are p10 p50 p90. score = banked points (towers still standing at the end are banked).\n');

    // Wind is scenery: the same rounds with gusts on and off must come out identical.
    const players = [
        ['random tapper', PLAYERS.random, 1], ['timing sd 150ms (casual)', PLAYERS.timer(0.15), 2],
        ['good-zone tapper (decent)', PLAYERS.zone(0), 11], ['timing sd 70ms (good)', PLAYERS.timer(0.07), 4],
        ['timing sd 45ms (expert)', PLAYERS.timer(0.045), 5],
    ];
    let windDiff = 0, windLosses = 0;
    for (const [, mk, seed] of players) {
        const a = runMany(300, mk, pickRandom, seed), b = runMany(300, mk, pickRandom, seed, { wind: false });
        a.forEach((r, i) => {
            if (r.placed !== b[i].placed || r.score !== b[i].score || r.counts.roll !== b[i].counts.roll ||
                r.counts.topple !== b[i].counts.topple) windDiff++;
            windLosses += r.counts.lateTopple;
        });
    }
    console.log(`Wind check (300 rounds x 5 players, gusts on vs off): rounds that differ ${windDiff}; topples while no pumpkin was landing ${windLosses}.\n`);

    console.log('Never pressing BOOM, 3-minute afternoon:');
    summarize('random tapper', N, PLAYERS.random, pickRandom, 1);
    summarize('timing sd 150ms (casual)', N, PLAYERS.timer(0.15), pickRandom, 2);
    summarize('timing sd 100ms', N, PLAYERS.timer(0.10), pickRandom, 3);
    summarize('good-zone tapper (decent)', N, PLAYERS.zone(0), pickRandom, 11);
    summarize('timing sd 70ms (good)', N, PLAYERS.timer(0.07), pickRandom, 4);
    summarize('timing sd 45ms (expert)', N, PLAYERS.timer(0.045), pickRandom, 5);
    summarize('90% perfect-zone (near-perf)', N, PLAYERS.zone(0.9), pickRandom, 13);

    console.log('\nPressing BOOM at a given height:');
    for (const b of [6, 8, 10, 12, 15]) summarize(`  good-zone, BOOM at ${b}`, N, PLAYERS.zone(0), pickRandom, 21, { bankAt: b });
    for (const b of [8, 10, 14]) summarize(`  casual 150ms, BOOM at ${b}`, N, PLAYERS.timer(0.15), pickRandom, 23, { bankAt: b });
    for (const b of [10, 14, 18]) summarize(`  expert 45ms, BOOM at ${b}`, N, PLAYERS.timer(0.045), pickRandom, 22, { bankAt: b });

    console.log('\nOrdering (good-zone player, never BOOM):');
    summarize('  random order', N, PLAYERS.zone(0), pickRandom, 8);
    summarize('  big first (pyramid)', N, PLAYERS.zone(0), pickBigFirst, 8);
    summarize('  small first (upside down)', N, PLAYERS.zone(0), pickSmallFirst, 8);

    const support = k => (RULES.topFlat * (SPECS[k].w + 1) * 2).toFixed(1);
    const row = (label, stack, drop) => {
        const offs = [0, 8, 16, 20, 24, 28, 32, 40, 56];
        console.log(label.padEnd(44) + offs.map(d => `${String(d).padStart(2)}px ${(fallRate(stack, drop, d) * 100).toFixed(0).padStart(3)}%`).join('  '));
    };
    console.log('\nFall rate of one drop at a given offset from the centre of the pumpkin below (wind makes no difference):');
    console.log(`(support flat half-widths: orange_m ${support('pumpkin_orange_m')} px, gold_s ${support('pumpkin_gold_s')} px, deep_xl ${support('pumpkin_deep_xl')} px)`);
    row('medium on 3 mediums', ['pumpkin_orange_m', 'pumpkin_orange_m', 'pumpkin_orange_m'], 'pumpkin_orange_m');
    row('HEAVY on light: deep_xl onto gold_s', ['pumpkin_orange_l', 'pumpkin_gold_s'], 'pumpkin_deep_xl');
    row('light on HEAVY: gold_s onto deep_xl', ['pumpkin_orange_l', 'pumpkin_deep_xl'], 'pumpkin_gold_s');
}

module.exports = { lib, playRound, fallRate, PLAYERS, rng };
