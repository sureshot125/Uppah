#!/usr/bin/env node
// Headless balance sim for Ansel's Pumpkin Patch (challenge mode).
//
// Loads the <rules> block straight out of game.js (weights, balance, wind, stages, scoring),
// then plays thousands of rounds with simulated players and prints how far they get, what breaks
// their towers, how much the wind matters, which BOOM strategy banks the most pounds, plus fall
// rates for single drops. Every round runs the whole afternoon.
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
const GROW = grab(/const GROW = (\{[\s\S]*?\});/);              // vine growth (bare, sprout, small .. XL)
const GROW_SIZES = grab(/const GROW_SIZES = (\[[\s\S]*?\]);/);  // the varieties at each stage
const GROW_SPOTS = grab(/const GROW_SPOTS = (\[[\s\S]*?\n\]);/);
const HAY_X = +src.match(/const HAY_X = (\d+)/)[1];
const [WALK, HEAVY_WALK] = src.match(/const WALK_SPEED = (\d+), HEAVY_SPEED = (\d+)/).slice(1).map(Number);
const BALE_H = +src.match(/HAY_H = (\d+)/)[1];                  // the hay bale's height (heights are from the ground)
const MILESTONES = grab(/const MILESTONES = (\[[\s\S]*?\n\]);/); // the height landmarks (px above the ground)
const MOON = MILESTONES[MILESTONES.length - 1].h;
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
        spots: GROW_SPOTS.map(g => ({ x: g.x, stage: 0, t: uni(R, GROW.sproutDelay), key: null, golden: false, watered: false })),
        moreAt: 0,
    };
    patch.spots.forEach((sp, i) => { for (let k = 0; k < GROW.start[i % GROW.start.length]; k++) grow(sp, R); });
    return patch;
}
// The game's growth: bare -> sprout -> small -> medium -> large (now and then golden) -> XL.
function growTime(sp, R) {
    const range = sp.stage === 0 ? GROW.sproutDelay : GROW.grow[sp.stage - 1];
    if (!range || sp.golden) return Infinity;
    return uni(R, range) / (sp.watered ? GROW.watered : 1);
}
function grow(sp, R) {
    if (sp.stage >= GROW_SIZES.length - 1 || sp.golden) return;
    sp.stage += 1;
    if (sp.stage >= 2) {
        if (sp.stage === 4 && R() < GROW.goldenChance) sp.golden = true;
        const pool = GROW_SIZES[sp.stage];
        sp.key = sp.golden ? 'pumpkin_golden' : pool[Math.floor(R() * pool.length)];
    }
    sp.t = growTime(sp, R);
}
// What the player can tap: pumpkins on the path, vine pumpkins (any size) to pick, bare spots
// and sprouts to water, leaf piles to dive into.
function options(patch) {
    const o = [];
    patch.path.forEach((p, i) => o.push({ kind: 'path', i, x: p.x, key: p.key, m: piece(p.key).m }));
    patch.spots.forEach((sp, i) => {
        if (sp.busy) return;
        if (sp.stage >= 2) o.push({ kind: 'vine', i, x: sp.x, key: sp.key, m: piece(sp.key).m, stage: sp.stage });
        else o.push({ kind: 'water', i, x: sp.x, stage: sp.stage });
    });
    patch.piles.forEach((p, i) => { if (p.hides) o.push({ kind: 'pile', i, x: p.x }); });
    return o;
}
const near = (list, ax) => list.reduce((b, o) => (Math.abs(o.x - ax) < Math.abs(b.x - ax) ? o : b));

// ── Players ──────────────────────────────────────────────────────────────────
// tap(): called every frame while hovering with the current offset from the target;
// returns true to drop now. pick(): which pumpkin to fetch next.
// Which thing the player taps next. A grabber takes the nearest pumpkin there is (or dives into
// a leaf pile); with none anywhere they shout MORE! when it's ready, or water something. A planner
// waters bare spots and sprouts early and picks large pumpkins (large, golden or XL); with none
// grown yet and nothing to water, they take the biggest pumpkin around. Returns an option, or
// 'more'.
const pickGrab = (opts, ax, R, ctx) => {
    const pick = opts.filter(o => o.kind === 'path' || o.kind === 'vine' || o.kind === 'pile');
    if (pick.length) return near(pick, ax);
    if (ctx.moreReady) return 'more';
    const water = opts.filter(o => o.kind === 'water');
    return water.length ? near(water, ax) : null;
};
const pickPlan = (opts, ax, R, ctx) => {
    const big = opts.filter(o => o.kind === 'vine' && o.stage >= 4);
    if (big.length) return near(big, ax);
    const water = opts.filter(o => o.kind === 'water');
    if (water.length) return near(water, ax);
    const pick = opts.filter(o => o.kind === 'path' || o.kind === 'vine');
    if (pick.length) return pick.reduce((b, o) => (o.m > b.m ? o : b));
    const piles = opts.filter(o => o.kind === 'pile');
    if (piles.length) return near(piles, ax);
    return ctx.moreReady ? 'more' : null;
};
// An orderly builder: a grabber who never puts a bigger size on a smaller one. On an empty bale
// (or one just BOOMed) it takes the biggest pumpkin around; after that the biggest one that is no
// bigger than the top of the tower. With nothing that fits it dives into a pile, shouts MORE!,
// waters, or else takes the smallest one there is.
const pickOrder = (opts, ax, R, ctx) => {
    const pick = opts.filter(o => o.kind === 'path' || o.kind === 'vine');
    const cap = ctx.top ? Rules.sizeRank(ctx.top) : 9;
    const fit = pick.filter(o => Rules.sizeRank(o.key) <= cap);
    if (fit.length) {
        const best = Math.max(...fit.map(o => Rules.sizeRank(o.key)));
        return near(fit.filter(o => Rules.sizeRank(o.key) === best), ax);
    }
    const piles = opts.filter(o => o.kind === 'pile');
    if (piles.length) return near(piles, ax);
    if (ctx.moreReady) return 'more';
    const water = opts.filter(o => o.kind === 'water');
    if (water.length) return near(water, ax);
    return pick.length ? pick.reduce((b, o) => (Rules.sizeRank(o.key) < Rules.sizeRank(b.key) ? o : b)) : null;
};
// A big builder: a planner who also never puts a bigger size on a smaller one. It waters bare
// spots and sprouts early and picks the biggest grown pumpkin that fits on the tower; with none
// grown that fits, it waters, or takes the biggest one around that fits.
const pickBigOrder = (opts, ax, R, ctx) => {
    const cap = ctx.top ? Rules.sizeRank(ctx.top) : 9, rank = o => Rules.sizeRank(o.key);
    const biggest = list => { const b = Math.max(...list.map(rank)); return near(list.filter(o => rank(o) === b), ax); };
    const big = opts.filter(o => o.kind === 'vine' && o.stage >= 4 && rank(o) <= cap);
    if (big.length) return biggest(big);
    const water = opts.filter(o => o.kind === 'water');
    if (water.length) return near(water, ax);
    const fit = opts.filter(o => (o.kind === 'path' || o.kind === 'vine') && rank(o) <= cap);
    if (fit.length) return biggest(fit);
    const piles = opts.filter(o => o.kind === 'pile');
    if (piles.length) return near(piles, ax);
    return ctx.moreReady ? 'more' : null;
};
// (kept for comparison) any option at random
const pickRandom = (opts, ax, R, ctx) => {
    const pick = opts.filter(o => o.kind !== 'water');
    if (!pick.length && ctx.moreReady) return 'more';
    return opts.length ? opts[Math.floor(R() * opts.length)] : null;
};

const PLAYERS = {
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
// opts.bankShaky: press BOOM (once the tower is RULES.boomMin tall) as soon as a shaky joint has
// at least this many pumpkins riding on it, itself included: cash in when your own building
// puts the tower at risk.
// opts.clock: false to ignore the sunset clock. opts.wind: false to switch the gusts off.
// opts.firstRound: true for a player's very first round (the first pumpkins are assisted).
// Wind runs on its own random stream, so the same round can be replayed with and without it.
function playRound(makePlayer, pick, R, opts = {}) {
    const bankAt = opts.bankAt || Infinity, clock = opts.clock !== false, maxDrops = opts.maxDrops || 400;
    let P = [], placed = 0, score = 0, lostPts = 0, streak = 0, tallest = 0, drops = 0, dayT = 0;
    let atMoon = false;
    const counts = { perfect: 0, solid: 0, shaky: 0, roll: 0, topple: 0, gustTopple: 0, windMiss: 0, windSave: 0, banks: 0, golden: 0,
        lost: 0, windLost: 0, more: 0, fromPath: 0, fromVine: 0, waterings: 0, pickTime: 0, picks: 0, waterTime: 0,
        idle: 0, massSum: 0, big: 0, roll12: 0, moonBooms: 0 };
    // what broke towers 12 or more high: a gust between landings, a landing that the wind tipped,
    // a heavy pumpkin landed on a lighter one, or the rest (lean built up, then a landing's wobble)
    const broke = { gust: 0, windLanding: 0, heavy: 0, lean: 0 }, brokeLost = [];
    // every collapse (one or more pumpkins below the top), by why its failing joint was shaky;
    // 'solid' counts collapses at a solid joint, which the rules say can't happen
    const why = { placement: 0, size: 0, width: 0, solid: 0 };
    // where the banked pounds came from: the pumpkins' own weight, PERFECT doubling, the tall bonus
    const parts = { weight: 0, perfect: 0, tall: 0 };
    let maxAbove = 0, moon = null;
    const wind = new Wind(rng(opts.windSeed || 4242)), sway = { x: 0, v: 0 }, tip = { tipT: 0 };
    const patch = makePatch(R);
    let ax = 700; // Ansel's x
    let end = null, w = 0;

    let windFault = false; // is the fall being handled now down to the wind?
    // BOOM: the tower's pounds plus the tall-tower bonus
    const bank = () => {
        const lbs = P.reduce((s, p) => s + (p.pts || 0), 0), pts = Rules.bank(lbs, P.length);
        score += pts;
        for (const p of P) { const w = Rules.pounds(p.key, false); parts.weight += w; parts.perfect += p.pts - w; }
        parts.tall += pts - lbs;
    };
    const lose = n => { counts.lost += n; if (windFault) counts.windLost += n; };
    const loseFrom = (at, cause) => { // joint `at` and everything above it fall: their points are lost
        if (P.length >= 12 && cause) { broke[cause]++; brokeLost.push(P.length - at); }
        if (P.length - at > 1) why[P[at].weak || 'solid']++;
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
        for (const sp of patch.spots) { if (!sp.busy && (sp.t -= DT) <= 0) grow(sp, R); }
        const r = Rules.analyze(P, BASE, w);
        Rules.swayStep(sway, DT, Rules.swayTarget(r.lean, r.height, w, r.shaky));
        if (P.length && Rules.tipStep(tip, r.lean, DT)) { counts.gustTopple++; windFault = true; loseFrom(r.at, 'gust'); windFault = false; }
    };
    const wait = secs => { for (let t = 0; t < secs && !end; t += DT) frame(); };

    while (!end && drops < maxDrops) {
        // ── fetch: tap a pumpkin and Ansel picks it and carries it to the bale; tap a bare spot
        // or a sprout and he waters it and stays at the field's edge ──
        const o = pick(options(patch), ax, R, { moreReady: dayT >= patch.moreAt, top: P.length ? P[P.length - 1].key : null });
        if (o === null) { counts.idle++; wait(1); continue; } // nothing worth doing yet: wait a moment
        if (o === 'more') { // MORE!: every plant grows a stage, the piles refill; then a cooldown
            counts.more++;
            patch.moreAt = dayT + T.more + GROW.moreCooldown;
            wait(T.more);
            patch.spots.forEach(sp => { if (!sp.busy) grow(sp, R); });
            patch.piles.forEach(p => { if (!p.hides) p.hides = POOL[Math.floor(R() * POOL.length)]; });
            continue;
        }
        let key, cost = T.think + Math.abs(o.x - ax) / WALK;
        if (o.kind === 'pile') { // dive in: the hidden pumpkin pops out onto the path
            const pile = patch.piles[o.i];
            patch.path.push({ key: pile.hides, x: pile.x + 60 });
            pile.hides = null;
            wait(cost + T.dive);
            ax = pile.x;
            continue;
        }
        if (o.kind === 'water') { // the pour: it jumps a stage and grows twice as fast from now on
            const sp = patch.spots[o.i];
            sp.busy = true;
            cost += T.lane + T.water + T.leave;
            counts.waterings++; counts.waterTime += cost;
            wait(cost);
            sp.busy = false;
            sp.watered = true;
            grow(sp, R);
            ax = sp.x;
            continue;
        }
        if (o.kind === 'path') {
            key = patch.path.splice(o.i, 1)[0].key;
            cost += isHeavy(key) ? T.pickHeavy : T.pick;
            counts.fromPath++;
        } else {
            const sp = patch.spots[o.i];
            key = sp.key;
            cost += T.lane + (isHeavy(key) ? T.vinePickHeavy + T.leaveHeavy : T.vinePick + T.leave);
            Object.assign(sp, { stage: 0, key: null, golden: false, watered: false, t: uni(R, GROW.sproutDelay) });
            counts.fromVine++;
        }
        const stand = HAY_X + (o.x <= HAY_X ? -1 : 1) * 175;
        cost += Math.abs(o.x - stand) / (isHeavy(key) ? HEAVY_WALK : WALK) + T.toss;
        counts.picks++; counts.pickTime += cost;
        wait(cost);
        ax = stand;
        if (end) break;
        const pc = piece(key);
        const golden = key === 'pumpkin_golden';
        if (golden) counts.golden++;

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
        const aim = Rules.aim(P, BASE, pc, land, assisted, w);
        const res = Rules.land(P, BASE, pc, aim.d, w, { roll: !assisted, topple: !assisted }, () => r0);
        windFault = false;
        if (w) { // would the same drop (same aim, same wobble) have gone the other way without wind?
            const a0 = Rules.aim(P, BASE, pc, land, assisted, 0);
            const res0 = Rules.land(P, BASE, pc, a0.d, 0, { roll: !assisted, topple: !assisted }, () => r0);
            if (res.fall !== 'none' && res0.fall === 'none') { counts.windMiss++; windFault = true; }
            if (res.fall === 'none' && res0.fall !== 'none') counts.windSave++;
        }
        if (res.fall === 'none') {
            streak = aim.perfect ? streak + 1 : 0;
            res.piece.pts = Rules.pounds(pc.key, aim.perfect);
            P.push(res.piece);
            placed++;
            if (aim.perfect) counts.perfect++;
            counts[res.piece.solid ? 'solid' : 'shaky']++;
            counts.massSum += res.piece.m;
            if (res.piece.m >= 2) counts.big++;
            const r = Rules.analyze(P, BASE, w), above = BALE_H + r.height;
            maxAbove = Math.max(maxAbove, above);
            if (!moon && above >= MOON) moon = { n: P.length, t: dayT };
            if (above >= MOON) atMoon = true; // the top of the sky: a MOON BOOM banks it
            Rules.swayKick(sway, aim.d >= 0 ? 1 : -1, res.kick, r.height);
        } else if (res.fall === 'roll') {
            counts.roll++;
            if (P.length >= 12) counts.roll12++;
            patch.path.push({ key: pc.key, x: HAY_X + (R() < 0.5 ? -1 : 1) * (120 + 160 * R()) });
            streak = 0;
            lose(1);
        } else {
            counts.topple++;
            const sup = P[P.length - 1];
            const cause = windFault ? 'windLanding' : sup && pc.m > 1.5 * sup.m ? 'heavy' : 'lean';
            P.push(res.piece);
            loseFrom(res.at, cause);
        }
        windFault = false;
        tallest = Math.max(tallest, P.length);
        let risky = atMoon;
        if (atMoon) counts.moonBooms++;
        atMoon = false;
        if (opts.bankShaky && P.length >= RULES.boomMin) {
            const r = Rules.analyze(P, BASE, 0);
            risky = risky || r.per.some((j, i) => !j.solid && P.length - i >= opts.bankShaky);
        }
        if (!end && (P.length >= bankAt || risky)) { // BOOM: bank it and knock it down (those pumpkins are spent)
            bank();
            P = [];
            streak = 0;
            counts.banks++;
            sway.x = sway.v = 0;
            wait(2.5);
        }
    }
    // every round ends in a BOOM: a tower still standing at the end is banked
    if (P.length) bank();
    return { placed, tallest, score, lostPts, drops, counts, end: end || 'drops', maxAbove, moon, broke, brokeLost, why, parts };
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
    const pc = k => (sum(k) / drops * 100).toFixed(0).padStart(2) + '%';
    const placed = res.reduce((s, r) => s + r.placed, 0);
    const per = k => (sum(k) / rounds).toFixed(1);
    console.log(
        `${name.padEnd(32)} stacked ${p3(sorted('placed'))}  score p50 ${String(pct(sorted('score'), 0.5)).padStart(6)} mean ${String(Math.round(res.reduce((s, r) => s + r.score, 0) / rounds)).padStart(6)}` +
        `  banks/rd ${per('banks')}` +
        `  | waterings/rd ${per('waterings').padStart(4)}  picks/rd ${per('picks').padStart(4)} (vine ${(sum('fromVine') / Math.max(1, sum('picks')) * 100).toFixed(0)}%)` +
        `  pick trip ${(sum('pickTime') / Math.max(1, sum('picks'))).toFixed(1)}s  water trip ${(sum('waterTime') / Math.max(1, sum('waterings'))).toFixed(1)}s` +
        `  avg weight ${(sum('massSum') / Math.max(1, placed)).toFixed(2)} (large+ ${(sum('big') / Math.max(1, placed) * 100).toFixed(0)}%)` +
        `  MORE!/rd ${per('more')}  idle waits/rd ${per('idle')}  | perfect ${pc('perfect')} shaky ${pc('shaky')} roll ${pc('roll')} topple ${pc('topple')}`);
    return res;
}

// How much does the wind matter? Same players, same seeds, gusts on vs off.
function windReport(name, rounds, makePlayer, seed, pick = pickGrab) {
    const on = runMany(rounds, makePlayer, pick, seed), off = runMany(rounds, makePlayer, pick, seed, { wind: false });
    const sum = (res, k) => res.reduce((s, r) => s + r.counts[k], 0);
    const drops = on.reduce((s, r) => s + r.drops, 0);
    const med = (res, k) => pct(res.map(r => r[k]).sort((a, b) => a - b), 0.5);
    console.log(
        `${name.padEnd(30)} lost pumpkins due to wind ${(sum(on, 'windLost') / Math.max(1, sum(on, 'lost')) * 100).toFixed(0).padStart(3)}%` +
        `  drops it tipped into a fall ${(sum(on, 'windMiss') / drops * 100).toFixed(1).padStart(4)}% (and saved ${(sum(on, 'windSave') / drops * 100).toFixed(1)}%)` +
        `  gust topples/round ${(sum(on, 'gustTopple') / rounds).toFixed(2)}  tallest p50 ${med(on, 'tallest')} with wind, ${med(off, 'tallest')} without` +
        `  score p50 ${med(on, 'score')} with wind, ${med(off, 'score')} without`);
}

// How high do towers get? Share of rounds (no BOOM) reaching each landmark, what the moon takes,
// and what broke towers once they were 12 or more high.
function landmarks(name, rounds, makePlayer, pick, seed, opts) {
    const res = runMany(rounds, makePlayer, pick, seed, opts);
    const reach = MILESTONES.filter(m => m.h >= 400).map(m =>
        `${m.text.replace(/[!]/g, '').replace('AS TALL AS ', '').replace('TALLER THAN THE ', '').replace('TOUCHING THE ', '').replace('UP IN THE ', '').replace('TO THE ', '').toLowerCase()} ${String(Math.round(res.filter(r => r.maxAbove >= m.h).length / rounds * 100)).padStart(3)}%`);
    const moons = res.filter(r => r.moon);
    const moonN = moons.length ? (moons.reduce((s, r) => s + r.moon.n, 0) / moons.length).toFixed(1) : '-';
    const moonT = moons.length ? Math.round(moons.reduce((s, r) => s + r.moon.t, 0) / moons.length) : '-';
    const b = { gust: 0, windLanding: 0, heavy: 0, lean: 0 };
    res.forEach(r => { for (const k in b) b[k] += r.broke[k]; });
    const roll12 = res.reduce((s, r) => s + r.counts.roll12, 0);
    const total = Object.values(b).reduce((s, v) => s + v, 0);
    const sh = k => `${Math.round(b[k] / Math.max(1, total) * 100)}%`;
    const lostN = res.flatMap(r => r.brokeLost).sort((x, y) => x - y);
    console.log(`${name.padEnd(28)} ${reach.join('  ')}  | moon takes ${moonN} pumpkins, at ${moonT}s` +
        `  | 12+ towers broken by: lean ${sh('lean')}, gust ${sh('gust')}, wind at landing ${sh('windLanding')}, heavy-on-light ${sh('heavy')}` +
        ` (${(total / rounds).toFixed(2)}/rd; top roll-offs at 12+ ${(roll12 / rounds).toFixed(2)}/rd)` +
        `  | a 12+ break drops ${lostN.length ? pct(lostN, 0.5) : '-'} pumpkins (median)` +
        `  | stacked median ${pct(res.map(r => r.placed).sort((x, y) => x - y), 0.5)}`);
    return res;
}

// Push your luck: mean pounds banked for each BOOM strategy (a fixed height, never, or as soon as
// a shaky joint carries some pumpkins), the best one, and where the best's pounds came from.
// Returns the best mean.
const STRATEGIES = [['never', {}], ['at 3', { bankAt: 3 }], ['at 8', { bankAt: 8 }], ['at 11', { bankAt: 11 }],
    ['at 14', { bankAt: 14 }], ['at 20', { bankAt: 20 }], ['shaky 1', { bankShaky: 1 }], ['shaky 3', { bankShaky: 3 }]];
function boomTable(name, rounds, makePlayer, pick, seed) {
    const rows = STRATEGIES.map(([label, o]) => {
        const res = runMany(rounds, makePlayer, pick, seed, o);
        const parts = { weight: 0, perfect: 0, tall: 0 };
        res.forEach(r => { for (const k in parts) parts[k] += r.parts[k]; });
        return { label, mean: Math.round(res.reduce((s, r) => s + r.score, 0) / rounds), parts };
    });
    const best = rows.reduce((a, r) => (r.mean > a.mean ? r : a));
    const P = best.parts, tot = P.weight + P.perfect + P.tall || 1, sh = k => Math.round(P[k] / tot * 100) + '%';
    console.log(`${('  ' + name).padEnd(26)} ` + rows.map(r => `${r.label}:${r.mean}`).join('  ') +
        `  | best ${best.label}; never ${Math.round(rows[0].mean / best.mean * 100)}% of it` +
        ` | the best's pounds: weight ${sh('weight')}, PERFECT doubling ${sh('perfect')}, tall bonus ${sh('tall')}`);
    return best.mean;
}

// Stability: every collapse (more than the top pumpkin falling), by why its failing joint was
// shaky. A joint that landed well, on a pumpkin at least as big, is solid and never gives way.
function stability(name, rounds, makePlayer, pick, seed) {
    const res = runMany(rounds, makePlayer, pick, seed);
    const why = { placement: 0, size: 0, width: 0, solid: 0 };
    res.forEach(r => { for (const k in why) why[k] += r.why[k]; });
    const j = res.reduce((s, r) => s + r.counts.shaky, 0), all = j + res.reduce((s, r) => s + r.counts.solid, 0);
    console.log(`${name.padEnd(28)} shaky joints ${Math.round(j / Math.max(1, all) * 100).toString().padStart(2)}% of landings` +
        `  | collapses/round: off-centre ${(why.placement / rounds).toFixed(2)}, bigger on smaller ${(why.size / rounds).toFixed(2)},` +
        ` too wide ${(why.width / rounds).toFixed(2)}, at a SOLID joint ${(why.solid / rounds).toFixed(2)}`);
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
    console.log('on this round; tallest = tallest tower; columns are p10 p50 p90; score = pounds banked.\n');

    // grabbers take the nearest pumpkin; builders put big ones at the bottom and never a bigger one on
    // a smaller one; planners water early and pick big
    const players = [['casual 150ms', 0.15, 2], ['good 70ms', 0.07, 4], ['expert 45ms', 0.045, 5]];
    const styles = [['grabber', pickGrab], ['builder', pickOrder], ['planner', pickPlan]];
    console.log(`Never pressing BOOM, a ${RULES.day / 60}-minute afternoon (a tower that reaches the moon is banked with a MOON BOOM):`);
    summarize('random tapper, grabber', N, PLAYERS.random, pickGrab, 1);
    for (const [name, sig, seed] of players) for (const [style, pick] of styles) summarize(`${name}, ${style}`, N, PLAYERS.timer(sig), pick, seed);
    summarize('near-perfect 25ms, builder', N, PLAYERS.timer(0.025), pickOrder, 6);
    summarize('first round, casual (assisted)', N, PLAYERS.timer(0.15), pickGrab, 2, { firstRound: true });

    console.log('\nHow high towers get (never pressing BOOM), and what breaks them:');
    landmarks('random tapper, grabber', N, PLAYERS.random, pickGrab, 1);
    for (const [name, sig, seed] of players) for (const [style, pick] of styles) landmarks(`${name}, ${style}`, N, PLAYERS.timer(sig), pick, seed);
    landmarks('near-perfect 25ms, builder', N, PLAYERS.timer(0.025), pickOrder, 6);

    console.log('\nStability (never pressing BOOM):');
    for (const [name, sig, seed] of players) for (const [style, pick] of styles) stability(`${name}, ${style}`, N, PLAYERS.timer(sig), pick, seed);

    console.log(`\nPush your luck: mean pounds banked for each BOOM strategy (${Math.round(N / 4)} rounds each). "at 8": BOOM whenever the tower`);
    console.log('is 8 tall; "shaky 1": BOOM as soon as any joint is shaky; "shaky 3": once a shaky joint carries 3 pumpkins.');
    for (const [name, sig] of [['casual 150ms', 0.15], ['good 70ms', 0.07], ['expert 45ms', 0.045]]) {
        const best = {};
        const seed = { 'casual 150ms': 31, 'good 70ms': 32, 'expert 45ms': 33 }[name];
        for (const [style, pick] of styles) best[style] = boomTable(`${name}, ${style}`, Math.round(N / 4), PLAYERS.timer(sig), pick, seed);
        console.log(`  ${name}: builder's best against grabber's best ${Math.round((best.builder / best.grabber - 1) * 100)}%,` +
            ` planner's ${Math.round((best.planner / best.grabber - 1) * 100)}%`);
    }

    console.log('\nWind (same rounds with gusts on and off, builders):');
    windReport('casual 150ms', N, PLAYERS.timer(0.15), 2, pickOrder);
    windReport('good 70ms', N, PLAYERS.timer(0.07), 4, pickOrder);
    windReport('expert 45ms', N, PLAYERS.timer(0.045), 5, pickOrder);

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

module.exports = { lib, playRound, fallRate, PLAYERS, rng, GROW, LAYOUT, RULES, MILESTONES, pickRandom, pickGrab, pickPlan, pickOrder, pickBigOrder, landmarks, runMany, windReport, boomTable, stability };
