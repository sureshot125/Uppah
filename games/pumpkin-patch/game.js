// ═════════════════════════════════════════════════════════════════════════════
// Ansel's Pumpkin Patch — an Uppah minigame
//
// Ansel toddles around a fall pumpkin patch, picks up pumpkins (DOWN!),
// carries them on his head, and tosses them onto a hay-bale tower (UPPAH!).
// Tap again to drop the swaying pumpkin onto the stack; he counts each one.
// Every tap gets a reaction (pumpkins hop, Ansel jumps, trees drop leaves,
// Hoppah the bunny boings), and a little hand shows what to tap — no reading.
// Stacking is honest: where you drop is where it lands, and a pumpkin (or the whole
// stack) goes over if its weight leans past the joint below. Heavy-on-light rocks hard,
// and points ride on the tower until BOOM banks them. Autumn gusts push the hovering and
// falling pumpkin (aim upwind) and lean on a crooked tower. Each pumpkin that falls
// costs a pumpkin life (3 to start, up to 5); perfect streaks, tall BOOMs, big heights and
// golden pumpkins win lives back. Out of lives, or sunset, ends the round. Pumpkins that
// fall can be picked up again.
// Leaf piles hide surprise pumpkins. When the patch runs out, tap and Ansel
// shouts MORE! and a fresh batch tumbles in.
//
// Controls
//   Touch / mouse : tap a pumpkin (he fetches and lifts it), tap again to drop,
//                   tap the hay bale (its BOOM sign) to bank and knock down the tower,
//                   tap leaf piles, Ansel, trees, the bunny and the scenery for surprises,
//                   tap anywhere for MORE! when the patch is empty
//   Keyboard      : ←/→ walk · ↓ pick up / dive / BOOM beside the tower · ↑ or Space uppah / drop /
//                   more / play again · B BOOM · M mute
//
// Built on Phaser 3 (MIT) with Matter.js physics.
// ═════════════════════════════════════════════════════════════════════════════

(() => {
'use strict';

const SHARED = window.UPPAH_SHARED || '../../assets/';
const ART = 'art/';

// ── World layout (game pixels; art is drawn at 4 game px per art pixel) ──────
// The game's short side is always 720 logical px; the long side follows the
// screen's shape (landscape phone, tablet, or a tall portrait phone).
const BASE = 720;
const WORLD_W = 1920, WORLD_H = 2160;
// The camera may look below the painted world into a strip of dirt, so on a tall phone the play
// path sits well above the bottom edge (and the home indicator) instead of hugging it.
const WORLD_FLOOR = 2600;
const GROUND = 2080;               // top of the dirt path
const PLAY_L = 150, PLAY_R = 1770; // walls
const HAY_X = 960;
const HAY_W = 160, HAY_H = 88;
const HAY_TOP = GROUND - HAY_H;
// Scenery anchors (game px): the silo's pumpkin sits on its top, the giraffe walks behind the fence
const SILO_X = 736, SILO_TOP_Y = 1592;
const GIRAFFE_Y = 1852, GIRAFFE_SPEED = 34;
const GIRAFFE_LOOK = 4; // giraffe.png: 4 walk frames, then looking out at us, then its blink

// ── Ansel: frames cut from the owner's sheets by make_ansel_frames.py ─────────
// art/ansel/<outfit>/<frame>.png, all on one canvas with his feet at the same spot
// (art/ansel/frames.json), 3 game px per art pixel. Everyday clothes (cap) until his first
// trip into the vine rows, then the farmer outfit (straw hat, gloves, boots) for good.
const ANSEL_ART = ART + 'ansel/';
const ANSEL_FRAMES = {
    everyday: ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6', 'pick_1', 'pick_2', 'pick_3',
        'tug_1', 'tug_2', 'heave', 'toss', 'carry_1', 'carry_2', 'carry_3', 'carry_4', 'carry_6',
        'heavy_1', 'heavy_2', 'dizzy'],
    farmer: ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6', 'pick_1', 'pick_2', 'pick_3',
        'tug_1', 'tug_2', 'heave', 'toss', 'carry_1', 'carry_2', 'carry_3', 'carry_6', 'heavy_1', 'heavy_2',
        'dizzy', ...Array.from({ length: 12 }, (_, i) => 'water_' + (i + 1))],
};
// Walk cycles. The sheets are short a few carry frames (everyday carry has 5 of 6, farmer
// 4 of 6, heavy carry 2 per outfit): those cycles run what's there with each frame held
// longer, so a full stride takes the same time as the 6-frame walk.
const ANSEL_CYCLES = {
    walk:  { everyday: ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6'] },
    carry: { everyday: ['carry_1', 'carry_2', 'carry_3', 'carry_4', 'carry_6'],
             farmer: ['carry_1', 'carry_2', 'carry_3', 'carry_6'] },
    heavy: { everyday: ['heavy_1', 'heavy_2'] },
};
// Single-frame poses. Where there's no art for a pose yet, the closest frame stands in
// (noted); swap in new frames here.
const ANSEL_POSES = {
    stand: 'pick_1',     // idle
    bend: 'pick_2', grab: 'pick_3', tug1: 'tug_1', tug2: 'tug_2', heave: 'heave', toss: 'toss',
    cheer: 'pick_1',     // milestones (YAY!), tapping Ansel, MORE!: standing, empty-handed, with a hop
                         // (the toss frame looked like holding an invisible pumpkin; no cheer art yet)
    boom: 'toss',        // the tower blows: his happiest face, arms up (no celebration art yet)
    shove: 'pick_2',     // the BOOM shove: leaning in, arms out (no bale-shove art yet)
    dive: 'pick_3',      // into a leaf pile (no dive art yet)
    scoop: 'pick_3',     // scooping up Hoppah (no bunny-grab art yet)
    hug: 'heavy_1',      // cuddling Hoppah at his chest (no bunny-hug art yet)
    dizzy: 'dizzy',      // the standing frame plus pixel stars (no dizzy art yet)
    hero: 'pick_1',      // title and end card: standing, empty-handed (never the arms-up holding
                         // pose); swap in the cheering/celebration frame when that art arrives
};
const HEAD_TOP = 255;    // feet → top of his cap, walk frames (the straw hat is a few px taller)
const WALK_SPEED = 480, HEAVY_SPEED = 340;

// Perfect-drop streak lengths that get a fanfare.
const TIMING = { combos: [3, 5, 10] };

// ── Things to stack (w/h are the pumpkin body in art pixels) ─────────────────
const PUMPKIN_SPECS = {
    pumpkin_orange_m: { w: 20, h: 15 },
    pumpkin_orange_l: { w: 26, h: 18 },
    pumpkin_deep_xl:  { w: 32, h: 21 },
    pumpkin_white_m:  { w: 19, h: 14 },
    pumpkin_green_m:  { w: 18, h: 15 },
    pumpkin_warty_s:  { w: 15, h: 12 },
    pumpkin_gold_s:   { w: 14, h: 11 },
    pumpkin_orange_s: { w: 15, h: 11 },
    pumpkin_golden:   { w: 22, h: 16 },
};
// Pumpkins lying on the path when a round starts. Once they're used up, pumpkins come from the
// vines (and from anything that falls off the tower: BOOMed pumpkins are spent).
const LAYOUT = [
    { key: 'pumpkin_orange_m', x: 420 },
    { key: 'pumpkin_deep_xl',  x: 800 },
    { key: 'pumpkin_white_m',  x: 1110 },
    { key: 'pumpkin_orange_l', x: 1345 },
    { key: 'pumpkin_gold_s',   x: 1570 },
];
// What a MORE! batch is drawn from (repeats = more likely)
const MORE_POOL = [
    'pumpkin_orange_m', 'pumpkin_orange_m', 'pumpkin_orange_l', 'pumpkin_orange_s',
    'pumpkin_white_m', 'pumpkin_green_m', 'pumpkin_warty_s', 'pumpkin_gold_s', 'pumpkin_deep_xl',
];
const MORE_BATCH = 5;

// ── Growing patch: pumpkins grow in two lanes of the vine rows behind the path ──
// A bare spot sprouts, and a sprout grows into a small pumpkin, then medium, large and (left
// long enough) XL, each bigger stage taking longer. Tap a pumpkin of any size and Ansel (in his
// straw hat) wades in, picks it and carries it to the bale. Tap a bare spot or a sprout and he
// waters it: it jumps a stage at once and grows half again as fast until it's picked. Water
// early, pick big.
// Gigi's visit: she stands between the two vine rows (the front row hides her feet), at
// roughly Ansel's height, and jogs rather than sprints.
const GIGI = { y: 1962, depth: 5, scale: 0.55, speed: 250 };
const LANES = [
    { y: 1930, scale: 0.8, depth: 4 },   // back row
    { y: 1994, scale: 0.9, depth: 6 },   // front row
];
const GROW_SPOTS = [
    { lane: 0, x: 300 }, { lane: 0, x: 560 }, { lane: 0, x: 790 }, { lane: 0, x: 1190 },
    { lane: 0, x: 1430 }, { lane: 0, x: 1660 },
    { lane: 1, x: 450 }, { lane: 1, x: 700 }, { lane: 1, x: 1290 }, { lane: 1, x: 1545 },
];
// sproutDelay: seconds before a bare spot sprouts; grow[i]: seconds from sprout (0), small (1),
// medium (2) and large (3) to the next size, left alone; watered: a watered plant grows this many
// times faster until it's picked; goldenChance: a plant growing large is now and then golden
// instead (it stays that size); start: each spot's stage when a round begins (0 bare, 1 sprout,
// 2 small, 3 medium, 4 large, 5 XL); moreCooldown: seconds before MORE! works again.
const GROW = { sproutDelay: [6, 10], grow: [[10, 14], [22, 30], [40, 55], [55, 70]], watered: 1.5,
    goldenChance: 0.08, start: [2, 1, 3, 0, 1, 2, 3, 1, 2, 0], moreCooldown: 20 };
// The varieties a vine pumpkin can be at each stage (from PUMPKIN_SPECS, so the size, weight and
// stacking rules all apply).
const GROW_SIZES = [null, null, ['pumpkin_gold_s', 'pumpkin_orange_s', 'pumpkin_warty_s'],
    ['pumpkin_orange_m', 'pumpkin_white_m', 'pumpkin_green_m'], ['pumpkin_orange_l'], ['pumpkin_deep_xl']];
const GROW_TOP = GROW_SIZES.length - 1;
const PILES = [
    { key: 'leafpile_b', x: 262,  hides: 'pumpkin_orange_s' },
    { key: 'leafpile_a', x: 1695, hides: 'pumpkin_orange_m' },
];

// Height milestones, measured from the ground to the top of the tower.
const MILESTONES = [
    { h: 235,  text: 'AS TALL AS ANSEL!' },
    { h: 300,  text: 'OVER THE FENCE!' },
    { h: 400,  text: 'AS TALL AS GIGI!', gigi: true },
    { h: 480,  text: 'TALLER THAN THE TREES!' },
    { h: 620,  text: 'TALLER THAN THE SILO!' },
    { h: 900,  text: 'UP IN THE CLOUDS!' },
    { h: 1300, text: 'TOUCHING THE SKY!' },
    { h: 1750, text: 'TO THE MOON!', gigi: true },
];

// ═════════════════════════════════════════════════════════════════════════════
// CHALLENGE RULES: pumpkin weights, tower balance, wind, lives, stages and scoring.
// Pure logic with no Phaser in it: `sim.js` loads this exact block to tune the
// game headless (node games/pumpkin-patch/sim.js). Keep it self-contained.
// <rules>
const RULES = {
    lives: 3,             // pumpkin lives at the start: each pumpkin that falls off costs one
    maxLives: 5,          // ...and you can earn up to this many:
    lifeStreak: 3,        //   +1 for every this many perfect drops in a row
    boomLives: [[14, 2], [8, 1]], // +2 / +1 for banking a tower at least this tall with BOOM
    lifeHeights: [400, 620, 900, 1300, 1750], // +1 the first time a round's tower tops each height (px above ground)
    goldenLife: 1,        //   +1 for harvesting a golden pumpkin
    assisted: 2,          // a player's very first round only: the first pumpkins are pulled in and can't fall
    assistKeep: 0.4,      // ...keeping this share of their miss
    perfectKeep: 0.25,    // a perfect drop snaps most of the way in but keeps this share of its miss
    topFlat: 0.9,         // share of a pumpkin's half-width it can land on (its centre past that rolls off)
    botFlat: 0.8,         // share of its own half-width a pumpkin stands on
    hayHalf: 76,          // flat top of the hay bale (half-width, px)
    hayMass: 20,          // the bale never rocks
    impact: 0.5,          // landing wobble: grows with (weight / weight below) and how far off-centre
    kickSpread: 0.6,      // ...and varies +-this share from drop to drop (moderate misses only sometimes fall)
    kickPow: 0.75,        // ...weight ratio to this power
    kickBase: 0.25,       // ...plus this much even when centred
    heavyKick: 0.5,       // ...and a big pumpkin lands harder: x (weight / a medium's) ^ this, above medium
    tipDelay: 0.6,        // seconds a stack teeters past its tipping point before it goes (short gusts pass)
    windK: 0.03,          // wind leverage: balance shift per unit of wind per px of height
    leverCap: 220,        // px: wind leverage stops growing above this height
    sail: 0.3,            // a crooked stack catches more wind: push x (1 + sail x its lean)
    hoverDrift: 32,       // px a full gust pushes a medium hovering pumpkin (light ones further)
    fallDrift: 24,        // px a full gust pushes a medium pumpkin while it falls (aim upwind!)
    warn: 1.4,            // seconds of leaves and whoosh before a gust hits
    windSway: h => 7 + Math.min(h, 1000) * 0.012, // extra px the top visibly sways in a full gust
    hoverLean: 7,         // degrees the hovering pumpkin leans in a full gust
    hoverHeft: 0.06,      // hover glide speed x (weight / a medium's) ^ this: a big one swings a bit faster
    swayHz: 0.6,          // the tower's springy sway
    swayDamp: 0.2,
    swayPx: h => 12 + Math.min(h, 1400) * 0.03, // top sway (px) at full lean
    points: { perfect: 100, good: 50, ok: 25 },
    sizePow: 0.6,         // bigger pumpkins score more: points x (weight / a medium's) ^ this, 0.6x to 2.2x
    orderBonus: 25,       // landing on a pumpkin at least as heavy (big at the bottom, small on top)
    combos: [[10, 4], [5, 3], [3, 2]], // perfect streak -> score multiplier
    goldenMult: 3,        // golden pumpkins (it.golden) score this many times more
    boomMin: 3,           // the BOOM sign shows up once the tower is this tall
    boomPer: 0.2,         // BOOM banks the tower's points x (1 + this x pumpkins in it)
    day: 180,             // seconds from afternoon to sunset (the round's clock)
    duskWind: 0.3,        // gusts get this much stronger by sunset, even on short towers
};
// How heavy each variety is for its size (a medium orange pumpkin = 1). Weight = heft x size.
const HEFT = {
    pumpkin_deep_xl: 1.5, pumpkin_orange_l: 1.25, pumpkin_green_m: 1.1, pumpkin_white_m: 1.05,
    pumpkin_orange_m: 1, pumpkin_warty_s: 0.85, pumpkin_orange_s: 0.8, pumpkin_gold_s: 0.7,
    pumpkin_golden: 1.35, // the rare golden one: worth x3, but heavy
};
// Difficulty stages, by how many pumpkins are on the tower now (BOOM starts you over at CALM).
// amp/speed: hover sway half-width (px) and glide speed (px/s); perfect: snap zone (px);
// wind: gust strength (plus RULES.duskWind toward sunset); gap: calm seconds between gusts.
const STAGES = [
    { at: 0,  name: 'CALM',   amp: 34,  speed: 145, perfect: 22, wind: 0.2,  gap: [7, 10] },
    { at: 4,  name: 'BREEZY', amp: 42,  speed: 170, perfect: 12, wind: 0.35, gap: [7, 10] },
    { at: 8,  name: 'WINDY',  amp: 56,  speed: 195, perfect: 10, wind: 0.5,  gap: [5, 8] },
    { at: 13, name: 'GUSTY',  amp: 72,  speed: 220, perfect: 9,  wind: 0.65, gap: [4, 7] },
    { at: 20, name: 'STORMY', amp: 90,  speed: 245, perfect: 8,  wind: 0.8,  gap: [3.5, 6] },
    { at: 30, name: 'WILD WIND', amp: 104, speed: 270, perfect: 7, wind: 1,  gap: [3, 5] },
];

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const Rules = {
    stageAt(placed) {
        let i = 0;
        while (i + 1 < STAGES.length && placed >= STAGES[i + 1].at) i++;
        return i;
    },

    // A stack piece: body size in px, weight m and wind sail a (same units). heft overrides
    // the variety's HEFT (1 = a medium orange pumpkin).
    piece(key, w, h, x, heft) {
        heft = heft || HEFT[key] || 1;
        const a = w * h / 4000;
        return { key, x: x || 0, w, h, a, m: a * heft, heft };
    },

    // Gusts for a tower at stage si, `dusk` (0..1) of the way to sunset.
    windStage(si, dusk) {
        const st = STAGES[si];
        return { wind: st.wind + RULES.duskWind * clampN(dusk || 0, 0, 1), gap: st.gap };
    },

    supportHalf(sup, base) { return sup ? RULES.topFlat * sup.w / 2 : base.half; },

    // Balance of every joint, bottom first. Joint i is piece i resting on the piece below (or
    // the hay): the weight of everything from i up has to sit over the patch where the two flat
    // faces touch. Wind pushes sideways with leverage that grows with the height and sail of
    // what's above, and weight resists it; a crooked stack catches more of it (RULES.sail).
    // per[i].L: 0 = centred, +-1 = on the edge, beyond = tips.
    analyze(P, base, wind) {
        const n = P.length, per = new Array(n), yb = new Array(n);
        let y = 0;
        for (let i = 0; i < n; i++) { yb[i] = y; y += P[i].h; }
        let M = 0, MX = 0, A = 0, AY = 0, lean = 0, at = -1;
        for (let i = n - 1; i >= 0; i--) {
            const p = P[i];
            M += p.m; MX += p.m * p.x; A += p.a; AY += p.a * (yb[i] + p.h / 2);
            const sx = i ? P[i - 1].x : base.x, sh = this.supportHalf(i ? P[i - 1] : null, base);
            const bh = RULES.botFlat * p.w / 2;
            const lo = Math.max(p.x - bh, sx - sh), hi = Math.min(p.x + bh, sx + sh);
            const push = (wind || 0) * RULES.windK * Math.min(AY / A - yb[i], RULES.leverCap) * A / M;
            let L;
            if (hi - lo < 1) L = p.x >= sx ? 9 : -9;
            else {
                const half = (hi - lo) / 2, still = (MX / M - (lo + hi) / 2) / half;
                L = still + push / half * (1 + RULES.sail * Math.min(1.5, Math.abs(still)));
            }
            per[i] = { L, lo, hi, y: yb[i] };
            if (Math.abs(L) > Math.abs(lean)) { lean = L; at = i; }
        }
        return { lean, at, per, height: y };
    },

    // How hard a landing rocks the stack: heavier than what it lands on, and further off-centre,
    // rock harder. Even a centred drop jolts a light pumpkin when a heavy one lands on it.
    kick(sup, pc, d, base) {
        const ratio = clampN(pc.m / (sup ? sup.m : RULES.hayMass), 0.25, 4);
        const heavy = Math.pow(Math.max(1, pc.m / 1.34), RULES.heavyKick);
        return RULES.impact * Math.pow(ratio, RULES.kickPow) * heavy *
            (RULES.kickBase + Math.min(1.5, Math.abs(d) / this.supportHalf(sup, base)));
    },

    // Land pc at offset d from the centre of the top of stack P (does not change P).
    // opts: { roll, topple } say which falls are allowed; rand() in 0..1 varies the wobble.
    // fall: 'none' | 'roll' (only the new one goes) | 'topple' (joint `at` and everything above).
    land(P, base, pc, d, wind, opts, rand) {
        const sup = P[P.length - 1] || null;
        const q = Object.assign({}, pc, { x: (sup ? sup.x : base.x) + d });
        const Q = P.concat([q]), r = this.analyze(Q, base, wind);
        const kick = opts.topple ? this.kick(sup, q, d, base) * (1 - RULES.kickSpread + 2 * RULES.kickSpread * rand()) : 0;
        // it rocks toward the side it landed on (a centred one sags the way the stack already leans)
        const dir = d > 0 ? 1 : d < 0 ? -1 : r.lean >= 0 ? 1 : -1;
        let peak = 0, at = -1, M = 0;
        for (let i = Q.length - 1; i >= 0; i--) {
            M += Q[i].m;
            const still = r.per[i].L, rock = still + dir * kick * q.m / M; // lower joints rock by its share of the weight
            const L = Math.abs(rock) > Math.abs(still) ? rock : still;
            if (Math.abs(L) > Math.abs(peak)) { peak = L; at = i; }
        }
        const top = Q.length - 1;
        let fall = 'none';
        if (Math.abs(r.per[top].L) > 1 && (opts.roll || opts.topple)) { fall = 'roll'; at = top; peak = r.per[top].L; }
        else if (opts.topple && Math.abs(peak) > 1) fall = at === top ? 'roll' : 'topple';
        return { fall, at, peak, kick, x: q.x, piece: q, analysis: r };
    },

    // A drop for a tap `off` px from the target (wind drift included): where it lands and how
    // it scores if it stays. A perfect drop snaps most of the way to centre.
    aim(P, base, pc, off, stage, assisted, wind) {
        const perfect = Math.abs(off) <= stage.perfect * (assisted ? 1.5 : 1);
        let d = perfect ? off * RULES.perfectKeep : off;
        if (assisted && !perfect) {
            const sh = this.supportHalf(P[P.length - 1], base);
            d = clampN(off * RULES.assistKeep, -0.5 * sh, 0.5 * sh);
        }
        const res = this.land(P, base, pc, d, wind, { roll: !assisted, topple: !assisted }, () => 0.5);
        const L = Math.abs(res.peak);
        const kind = perfect ? 'perfect' : L > 0.6 || res.fall !== 'none' ? 'ok' : 'good';
        return { grade: res.fall !== 'none' ? 'miss' : kind, kind, d, peak: res.peak, fall: res.fall };
    },

    ordered(sup, pc) { return !sup || pc.m <= sup.m * 1.05; },
    boomMult(n) { return 1 + RULES.boomPer * n; },
    boomLives(n) { for (const [h, k] of RULES.boomLives) if (n >= h) return k; return 0; },
    combo(streak) { for (const [n, x] of RULES.combos) if (streak >= n) return x; return 1; },
    // A big pumpkin scores more (but it's heavy: a slower carry and a risky top).
    sizeMult(m) { return clampN(Math.pow((m || 1.34) / 1.34, RULES.sizePow), 0.6, 2.2); },
    score(grade, stageIdx, streak, ordered, golden, m) {
        const mult = (grade === 'perfect' ? this.combo(streak) : 1) * (golden ? RULES.goldenMult : 1) * this.sizeMult(m);
        return Math.round((RULES.points[grade] + (ordered ? RULES.orderBonus : 0)) * (1 + 0.25 * stageIdx) * mult);
    },

    // Hovering: how a pumpkin's weight changes its glide (RULES.hoverHeft); light ones also get
    // blown further than heavy ones.
    hoverSpeed(stage, pc) {
        return stage.speed * clampN(Math.pow(pc.m / 1.34, RULES.hoverHeft), 0.85, 1.2);
    },
    hoverDrift(wind, pc) { return wind * RULES.hoverDrift * clampN(Math.sqrt(1.34 / pc.m), 0.55, 1.7); },
    fallDrift(wind, pc) { return wind * RULES.fallDrift * clampN(Math.sqrt(1.34 / pc.m), 0.55, 1.7); },
    tri(u, amp) { const P = 4 * amp, v = ((u % P) + P) % P; return v < 2 * amp ? -amp + v : 3 * amp - v; },

    // The tower's sway is a damped spring whose rest point follows its lean (wind included),
    // plus a little extra give in a gust so the wind is easy to see.
    swayStep(s, dt, target) {
        const w = 2 * Math.PI * RULES.swayHz;
        s.v += (-w * w * (s.x - target) - 2 * RULES.swayDamp * w * s.v) * dt;
        s.x += s.v * dt;
    },
    swayTarget(lean, height, wind) {
        return clampN(lean, -1.4, 1.4) * RULES.swayPx(height) + (wind || 0) * RULES.windSway(height);
    },
    swayKick(s, dir, kick, height) { s.v += dir * kick * RULES.swayPx(height) * 2 * Math.PI * RULES.swayHz; },

    // Past the tipping point for tipDelay seconds (a short gust can pass) and it goes.
    tipStep(st, lean, dt) {
        st.tipT = Math.abs(lean) > 1 ? st.tipT + dt : Math.max(0, st.tipT - 2 * dt);
        return st.tipT >= RULES.tipDelay;
    },
};

// Autumn gusts: calm, then ~1.4 s of warning (leaves, whoosh), then a gust that ramps up,
// flutters and dies away. Gusts tend to alternate sides, so the tower rocks back and forth.
class Wind {
    constructor(rand) { this.rand = rand || Math.random; this.reset(); }
    reset() { this.phase = 'calm'; this.t = 0; this.wait = 2.5; this.dir = 1; this.v = 0; this.peak = 0; this.len = 0; }
    update(dt, stage) {
        const R = this.rand;
        this.t += dt;
        if (this.phase === 'calm') {
            this.v *= Math.pow(0.15, dt);
            if (stage.wind > 0 && this.t >= this.wait) {
                this.phase = 'warn'; this.t = 0;
                this.dir = R() < 0.65 ? -this.dir : this.dir;
                this.peak = stage.wind * (0.75 + 0.25 * R());
                this.len = 1.8 + 1.7 * R();
            }
        } else if (this.phase === 'warn') {
            this.v = this.dir * this.peak * 0.15 * Math.min(1, this.t / RULES.warn);
            if (this.t >= RULES.warn) { this.phase = 'gust'; this.t = 0; }
        } else {
            const env = this.t < 0.5 ? this.t / 0.5 : Math.max(0, Math.min(1, (this.len - this.t) / 0.8));
            this.v = this.dir * this.peak * Math.max(0.15, env) * (1 + 0.12 * Math.sin(this.t * 7.3));
            if (this.t >= this.len) {
                this.phase = 'calm'; this.t = 0;
                this.wait = stage.gap[0] + (stage.gap[1] - stage.gap[0]) * R();
            }
        }
        return this.v;
    }
}
// </rules>

// The few lines Ansel says out loud without being asked to (see PatchScene.say).
const SAY_LINES = new Set(['UPPAH!', 'BOOM!', 'GOLDEN!', 'UH OH!', 'OH NO!', 'YAY!', 'NIGHT NIGHT!',
    'HOPPAH!', 'GIRAFFE!', 'BIG PUMPKIN!', 'WHOA!']);

const FONT = '"Press Start 2P", monospace';
const INK = '#2b1810';

// ─────────────────────────────────────────────────────────────────────────────
// Sound: chiptune voice + effects synthesized with WebAudio (same voice as the
// Uppah runner), plus the level's own music.
// ─────────────────────────────────────────────────────────────────────────────
// The level's theme, "Pumpkin Patch Shuffle" (120 BPM, F major): the intro plays once, then
// 26.006 s to 122.008 s (48 bars, cut where the music matches) loops; the song's ending is never
// heard. The last 60 ms before the loop end are crossfaded into the music just before the loop
// start, so the join has no click. The earlier "Pumpkin Patch Afternoon" (G major, bars 19-38)
// is kept for comparison: add ?music=afternoon to the URL.
const MUSIC_TRACKS = {
    shuffle: { url: 'audio/pumpkin_patch_shuffle.mp3', volume: 0.2, loopStart: 26.006, loopEnd: 122.008, xfade: 0.06 },
    afternoon: { url: 'audio/pumpkin_patch_afternoon.mp3', volume: 0.2, loopStart: 36.01, loopEnd: 76.01, xfade: 0 },
};
const MUSIC = MUSIC_TRACKS[(() => {
    try { return new URLSearchParams(window.location.search).get('music'); } catch (e) { return null; }
})()] || MUSIC_TRACKS.shuffle;

// Desktop (a mouse and a hover-capable pointer) gets click-and-key wording; touch screens get taps.
const DESKTOP = (() => {
    try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return false; }
})();
const MUTE_KEY = 'uppah.pumpkinpatch.muted';
const BOOM_HOLD = 0.5; // seconds B must be held: a stray key press never sets off a BOOM
const LIFE_SCALE = 0.72; // the pumpkin-life icons in the HUD

// Calm: the patch should feel peaceful. Every burst of sparkles, leaves or dust is a fraction of
// what the effect asks for, nothing shakes or flashes the screen, and text fades in instead of
// bouncing.
const FX_SCALE = 0.3;
function calmFx(em) {
    const explode = em.explode.bind(em);
    em.explode = (n, x, y) => explode(Math.max(1, Math.round((n || 1) * FX_SCALE)), x, y);
    return em;
}

// A broad touch (a resting palm, the side of a hand) is not a tap.
function isPalm(p) {
    const ev = p && p.event;
    if (!ev) return false;
    if (ev.pointerType === 'touch') return ev.width > 56 || ev.height > 56;
    const list = ev.changedTouches;
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t.identifier === p.identifier) return t.radiusX > 28 || t.radiusY > 28;
    }
    return false;
}

const Sfx = {
    ctx: null, master: null, music: null,
    muted: (() => { try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } })(),

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 0.9;
            this.master.connect(this.ctx.destination);
            this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
            const d = this.noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { this.ctx = null; }
        this.startMusic();
    },

    // Decoded and looped in WebAudio so the loop is seamless, routed through the master
    // volume so mute covers it. Falls back to a plain looping <audio> if that fails.
    startMusic() {
        const fallback = () => {
            try {
                this.music = new Audio(MUSIC.url);
                this.music.loop = true;
                this.music.volume = MUSIC.volume;
                this.music.muted = this.muted;
                this.music.play().catch(() => {});
            } catch (e) {}
        };
        if (!this.ctx || !window.fetch) { fallback(); return; }
        fetch(MUSIC.url).then(r => r.arrayBuffer()).then(data => {
            this.ctx.decodeAudioData(data, buf => {
                const src = this.ctx.createBufferSource();
                const g = this.ctx.createGain();
                const sr = buf.sampleRate;
                const ls = Math.round(MUSIC.loopStart * sr), le = Math.round(Math.min(MUSIC.loopEnd, buf.duration) * sr);
                const n = Math.min(Math.round((MUSIC.xfade || 0) * sr), ls);
                for (let c = 0; c < buf.numberOfChannels && n > 0; c++) {
                    const d = buf.getChannelData(c);
                    for (let i = 0; i < n; i++) {
                        const k = (i + 1) / n;
                        d[le - n + i] = d[le - n + i] * (1 - k) + d[ls - n + i] * k;
                    }
                }
                src.buffer = buf;
                src.loop = true;
                src.loopStart = ls / sr;
                src.loopEnd = le / sr;
                g.gain.value = MUSIC.volume;
                src.connect(g);
                g.connect(this.master);
                src.start();
                this.musicSrc = src;
            }, fallback);
        }).catch(fallback);
    },

    setMuted(m) {
        this.muted = m;
        if (this.master) this.master.gain.value = m ? 0 : 0.9;
        if (this.music) this.music.muted = m;
        try { window.localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
    },

    // Pause stops everything, music included; resume picks up where it left off.
    suspend() {
        if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
        if (this.music) this.music.pause();
    },
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        if (this.music) this.music.play().catch(() => {});
    },

    _noise(dur, type, freq, q, vol, t0) {
        const c = this.ctx, now = t0 ?? c.currentTime;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain();
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(now, Math.random() * 0.5); src.stop(now + dur + 0.02);
    },

    _tone(type, f0, f1, dur, vol, t0) {
        const c = this.ctx, now = t0 ?? c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        o.connect(g); g.connect(this.master);
        o.start(now); o.stop(now + dur + 0.02);
    },

    uppah() {
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime, sh = Math.pow(2, 1 / 12);
        const crusher = c.createWaveShaper();
        const len = 512, curve = new Float32Array(len);
        for (let i = 0; i < len; i++) { const x = (i / len) * 2 - 1; curve[i] = Math.round(x * 128) / 128; }
        crusher.curve = curve;
        const m = c.createGain();
        m.gain.setValueAtTime(0.6, now);
        m.gain.setValueAtTime(0.6, now + 0.08);
        m.gain.linearRampToValueAtTime(0.01, now + 0.10);
        m.gain.setValueAtTime(0.01, now + 0.13);
        m.gain.linearRampToValueAtTime(0.6, now + 0.15);
        m.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        crusher.connect(m); m.connect(this.master);
        const v = c.createOscillator(), vf = c.createBiquadFilter(), vg = c.createGain();
        v.type = 'sawtooth';
        v.frequency.setValueAtTime(280 * sh, now);
        v.frequency.exponentialRampToValueAtTime(480 * sh, now + 0.09);
        v.frequency.exponentialRampToValueAtTime(340 * sh, now + 0.20);
        vf.type = 'bandpass'; vf.frequency.setValueAtTime(900, now);
        vf.frequency.linearRampToValueAtTime(1250, now + 0.09); vf.Q.value = 5;
        vg.gain.value = 0.65;
        v.connect(vf); vf.connect(vg); vg.connect(crusher);
        v.start(now); v.stop(now + 0.23);
        [523.25, 659.25, 783.99].forEach((f, i) => {
            const t = now + 0.15 + i * 0.06;
            const o = c.createOscillator(), g = c.createGain();
            o.type = 'square'; o.frequency.value = f;
            g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
            o.connect(g); g.connect(crusher); o.start(t); o.stop(t + 0.06);
        });
    },

    down() {
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(260, now);
        o.frequency.exponentialRampToValueAtTime(170, now + 0.18);
        o.frequency.exponentialRampToValueAtTime(130, now + 0.30);
        f.type = 'bandpass'; f.frequency.setValueAtTime(700, now);
        f.frequency.linearRampToValueAtTime(450, now + 0.22); f.Q.value = 3;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.55, now + 0.02);
        g.gain.setValueAtTime(0.45, now + 0.10);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(now); o.stop(now + 0.31);
    },

    more() {
        // "MO-ORE!": nasal "m" opening into a rising "o", settling on "re",
        // then a little two-note chirp like the end of UPPAH
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(230, now);
        o.frequency.exponentialRampToValueAtTime(370, now + 0.14);
        o.frequency.exponentialRampToValueAtTime(300, now + 0.34);
        f.type = 'bandpass';
        f.frequency.setValueAtTime(330, now);
        f.frequency.linearRampToValueAtTime(820, now + 0.10);
        f.frequency.linearRampToValueAtTime(560, now + 0.36);
        f.Q.value = 4;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.25, now + 0.03);
        g.gain.linearRampToValueAtTime(0.65, now + 0.10);
        g.gain.setValueAtTime(0.6, now + 0.26);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(now); o.stop(now + 0.44);
        [783.99, 1046.5].forEach((fr, i) => this._tone('square', fr, fr, 0.06, 0.1, now + 0.30 + i * 0.07));
    },

    step(right) {
        if (!this.ctx) return;
        this._tone('triangle', right ? 230 : 175, right ? 130 : 100, 0.045, 0.14);
    },

    pickup() {
        if (!this.ctx) return;
        this._tone('triangle', 600, 1100, 0.09, 0.22);
    },

    // counting chime: climbs a major scale, one note per pumpkin in the tower
    count(n) {
        if (!this.ctx) return;
        const deg = [0, 2, 4, 5, 7, 9, 11];
        const semis = Math.min(deg[(n - 1) % 7] + 12 * Math.floor((n - 1) / 7), 30);
        const f = 392 * Math.pow(2, semis / 12);
        const now = this.ctx.currentTime;
        this._tone('triangle', f, f, 0.22, 0.22, now);
        this._tone('square', f * 2, f * 2, 0.08, 0.05, now);
    },

    // perfect drop: a sparkly run that starts higher with every perfect in a row
    perfect(streak) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const base = 659.25 * Math.pow(2, Math.min(streak - 1, 8) / 12);
        [1, 1.25, 1.5, 2].forEach((m, i) => this._tone('square', base * m, base * m, 0.07, 0.07, now + 0.05 + i * 0.05));
    },

    good() {
        if (!this.ctx) return;
        this._tone('square', 1046.5, 1046.5, 0.06, 0.06);
    },

    uhoh() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this._tone('triangle', 520, 500, 0.14, 0.2, now);
        this._tone('triangle', 400, 300, 0.25, 0.2, now + 0.16);
    },

    tug() {
        // creaky vine being pulled
        if (!this.ctx) return;
        this._tone('sawtooth', 95, 70, 0.22, 0.08);
    },

    water() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 9; i++) {
            this._noise(0.08, 'bandpass', 2600 + Math.random() * 1800, 3, 0.07, now + i * 0.09);
        }
    },

    hum() {
        // a gentle giraffe "mmm"
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this._tone('sine', 150, 120, 0.4, 0.28, now);
        this._tone('triangle', 300, 240, 0.4, 0.08, now);
    },

    boing() {
        if (!this.ctx) return;
        this._tone('sine', 180, 620, 0.18, 0.3);
        this._tone('sine', 620, 300, 0.2, 0.18, this.ctx.currentTime + 0.17);
    },

    rustle() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 5; i++) {
            this._noise(0.09, 'highpass', 3000 + Math.random() * 2000, 0.7, 0.12, now + i * 0.05);
        }
    },

    giggle() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [880, 988, 880, 1047].forEach((f, i) => this._tone('square', f, f * 0.9, 0.05, 0.06, now + i * 0.07));
    },

    boop(size) {
        if (!this.ctx) return;
        const f = 900 - size * 3;
        this._tone('sine', f, f * 1.4, 0.08, 0.2);
    },

    thunk(size, strength) {
        if (!this.ctx) return;
        const v = Math.min(0.4, 0.08 + strength * 0.04);
        const base = 260 - size * 1.1;
        this._tone('sine', base, base * 0.45, 0.16, v);
        this._noise(0.06, 'lowpass', 900, 0.7, v * 0.6);
    },

    crunch() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 7; i++) {
            this._noise(0.05 + Math.random() * 0.05, 'bandpass', 1800 + Math.random() * 2600, 1.5,
                0.35, now + i * 0.035 + Math.random() * 0.02);
        }
    },

    pop() {
        if (!this.ctx) return;
        this._tone('square', 330, 990, 0.12, 0.16);
    },

    boom() {
        if (!this.ctx) return;
        this._noise(0.7, 'lowpass', 420, 0.8, 0.9);
        this._tone('sine', 90, 35, 0.6, 0.8);
    },

    fanfare() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            this._tone('square', f, f, i === 3 ? 0.45 : 0.12, 0.13, now + i * 0.11);
            this._tone('triangle', f / 2, f / 2, i === 3 ? 0.45 : 0.12, 0.18, now + i * 0.11);
        });
    },

    // ── Challenge mode sounds ──
    // a gust: band-passed noise that swells and dies away (strength 0..1, seconds)
    wind(strength, dur) {
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf; src.loop = true;
        const f = c.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 0.8;
        f.frequency.setValueAtTime(320, now);
        f.frequency.linearRampToValueAtTime(650 + 550 * strength, now + dur * 0.4);
        f.frequency.linearRampToValueAtTime(380, now + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.04 + 0.22 * strength, now + dur * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, now + dur);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(now, Math.random() * 0.5); src.stop(now + dur + 0.05);
    },

    // wooden creak of a wobbly stack: lower for heavier pumpkins
    creak(weight) {
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const base = Math.max(70, 150 - weight * 14);
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(base, now);
        o.frequency.linearRampToValueAtTime(base * 1.25, now + 0.12);
        o.frequency.linearRampToValueAtTime(base * 0.9, now + 0.32);
        f.type = 'bandpass'; f.frequency.value = base * 4; f.Q.value = 6;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.2, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(now); o.stop(now + 0.38);
    },

    crash() {
        this.boom();
        this.crunch();
    },

    // round over: a little falling tune
    lose() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [523.25, 440, 349.23, 261.63].forEach((f, i) =>
            this._tone('triangle', f, f * 0.97, i === 3 ? 0.5 : 0.16, 0.2, now + i * 0.17));
    },

    // a lost pumpkin won back
    bonus() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [659.25, 987.77, 1318.5].forEach((f, i) => this._tone('square', f, f, 0.07, 0.08, now + i * 0.06));
    },
};

// ─────────────────────────────────────────────────────────────────────────────
const MB = () => Phaser.Physics.Matter.Matter.Body;
const MSleep = () => Phaser.Physics.Matter.Matter.Sleeping;

function loadBest() {
    const none = { count: 0, height: 0, score: 0 };
    try { return Object.assign(none, JSON.parse(localStorage.getItem('uppah.pumpkinpatch.best')) || {}); }
    catch (e) { return none; }
}
function saveBest(b) {
    try { localStorage.setItem('uppah.pumpkinpatch.best', JSON.stringify(b)); } catch (e) {}
}
// One-time help, remembered per device: the pointing hand for the very first pumpkin, and the
// assisted pumpkins of a player's very first round.
function loadFlag(name) {
    try { return localStorage.getItem('uppah.pumpkinpatch.' + name) === '1'; } catch (e) { return false; }
}
function saveFlag(name) {
    try { localStorage.setItem('uppah.pumpkinpatch.' + name, '1'); } catch (e) {}
}

// The windsock's pole stands just behind the fence, right of the bale (WINDSOCK_POLE: the
// pole's x within its sprite frame, as a share of the frame width).
const WINDSOCK_X = HAY_X + 230, WINDSOCK_Y = 1886, WINDSOCK_POLE = 2 / 34;

// One tower on one hay bale. All per-tower state lives here, so more bales is a small change:
// make more Stacks and point PatchScene.activeStack at the one Ansel is building.
class Stack {
    constructor(x, half, topY) {
        this.x = x;                  // bale centre
        this.base = { x, half };     // the bale's flat top, for Rules.analyze / Rules.land
        this.topY = topY;            // y of the bale's top surface
        this.items = [];             // pumpkins in the tower, bottom first
        this.sway = { x: 0, v: 0 };  // springy sway of the top (px)
        this.tip = { tipT: 0 };      // seconds spent past its tipping point
        this.balance = null;         // last Rules.analyze() of it
        this.danger = 0;             // 0..1: how close it is to going over
        this.creakT = 0;
        this.wobblySaid = false;
    }
    get stageIdx() { return Rules.stageAt(this.items.length); }
    // points riding on the tower: lost if it falls, banked x Rules.boomMult by BOOM
    get unbanked() { let s = 0; for (const it of this.items) s += it.pts || 0; return s; }
    pieces() { return this.items.map(pieceOf); }
    // top surface y, x where it is now (swaying), rx where it rests
    top() {
        const t = this.items[this.items.length - 1];
        if (!t || !t.body) return { y: this.topY, x: this.x, rx: this.x, half: HAY_W / 2, it: null };
        return { y: t.topY, x: t.body.position.x, rx: t.rx, half: t.bw / 2, it: t };
    }
}

// A pumpkin as the rules see it (size, weight, resting x). it.heft overrides the variety's weight.
function pieceOf(it) {
    if (!it.pc) it.pc = Rules.piece(it.key, it.bw, it.bh, 0, it.heft);
    it.pc.x = it.rx !== undefined ? it.rx : 0;
    return it.pc;
}

// ═════════════════════════════════════════════════════════════════════════════
class PatchScene extends Phaser.Scene {
    constructor() { super('patch'); }

    preload() {
        for (const outfit in ANSEL_FRAMES) {
            ANSEL_FRAMES[outfit].forEach(f => this.load.image(`ansel:${outfit}/${f}`, `${ANSEL_ART}${outfit}/${f}.png`));
        }
        this.load.json('ansel_frames', ANSEL_ART + 'frames.json');
        for (let i = 1; i <= 8; i++) this.load.image('gigi_' + i, `${SHARED}Gigi Running frames/frame_0${i}.png`);
        this.load.image('hoppah_stand', SHARED + 'hoppah_standing.png');
        this.load.image('hoppah_jump', SHARED + 'hoppah_jumping.png');
        this.eggsPreload(); // surprises
        const art = ['background', 'haybale', 'leafpile_a', 'leafpile_b',
            'bubble', 'bubble_tail', 'panel', 'icon_pumpkin', 'sound_on', 'sound_off',
            'hand', 'sparkle', 'dust', 'shadow', 'target',
            'foreground', 'silo_pumpkin', 'silo_pumpkin_wink',
            'sprout', 'pumpkin_unripe',
            ...Object.keys(PUMPKIN_SPECS)];
        art.forEach(k => this.load.image(k, ART + k + '.png'));
        this.load.spritesheet('leaves', ART + 'leaves.png', { frameWidth: 28, frameHeight: 28 });
        this.load.spritesheet('giraffe', ART + 'giraffe.png', { frameWidth: 224, frameHeight: 352 });
        // windsock art (make_art.py)
        this.load.spritesheet('windsock', ART + 'windsock.png', { frameWidth: 136, frameHeight: 288 });
        this.htpPreload(); // how to play
    }

    create() {
        this.started = false;
        this.best = loadBest();
        this.items = [];
        this.tower = [];
        this.hovering = null;
        this.hoverT = 0;
        this.reached = new Set();
        this.streak = 0;          // perfect drops in a row
        this.textScale = 1;       // keeps bubbles readable when zoomed out / on phones
        this.wobbleAmp = 0;       // tower sway (visual only)
        this.wobbleT = 0;
        this.idleT = 0;           // seconds since the last tap (for the hand hint)
        this.pending = null;      // a tap made while Ansel was busy, done when he's free
        this.lastTapAt = 0;

        // Matter world: gentle gravity, extra solver passes for steadier stacks.
        this.matter.world.setGravity(0, 1.5);
        this.matter.world.engine.positionIterations = 12;
        this.matter.world.engine.velocityIterations = 10;

        this.add.image(0, 0, 'background').setOrigin(0, 0).setDepth(0);
        // ── Scenery: jack-o'-lantern silo, a giraffe strolling behind the fence ──
        this.silo = this.add.image(SILO_X, SILO_TOP_Y + 8, 'silo_pumpkin').setOrigin(0.5, 1).setDepth(1);
        this.silo.nextWink = 12;
        this.raffe = {
            img: this.add.sprite(420, GIRAFFE_Y, 'giraffe', 0).setOrigin(0.5, 1).setDepth(2),
            x: 420, dir: 1, frame: 0, frameT: 0, mode: 'walk', t: Phaser.Math.FloatBetween(6, 12),
        };
        this.add.image(0, 0, 'foreground').setOrigin(0, 0).setDepth(3);
        this.createPatch();

        const solid = { isStatic: true, friction: 1, frictionStatic: 2, restitution: 0, label: 'solid' };
        this.matter.add.rectangle(WORLD_W / 2, GROUND + 60, WORLD_W * 2, 120, solid);
        this.matter.add.rectangle(PLAY_L - 40, GROUND - 1500, 80, 4000, solid);
        this.matter.add.rectangle(PLAY_R + 40, GROUND - 1500, 80, 4000, solid);
        this.hayBody = this.matter.add.rectangle(HAY_X, GROUND - HAY_H / 2, HAY_W, HAY_H,
            { ...solid, label: 'hay' });
        this.hayImg = this.add.image(HAY_X, GROUND + 4, 'haybale').setOrigin(0.5, 1).setDepth(8);
        // BOOM lives at the bale: when there's a tower to bank, a little wooden plank is propped
        // against the bale's foot, down on the path, so the whole bale stays in view. It hangs from
        // its top edge, so when the camera pulls back it grows down into the dirt, never over the bale.
        this.baleSign = this.add.container(HAY_X, GROUND - 2).setDepth(21.5).setVisible(false);
        this.baleSignInner = this.add.container(0, 0);
        const SIGN_W = 150, SIGN_H = 60;
        const signBoard = this.add.nineslice(0, SIGN_H / 2, 'panel', null, SIGN_W, SIGN_H, 20, 20, 20, 20);
        this.baleSignTitle = this.add.text(0, SIGN_H / 2 - 12, 'BOOM!', {
            fontFamily: FONT, fontSize: '22px', color: '#ff9a3a', stroke: INK, strokeThickness: 7,
        }).setOrigin(0.5);
        this.baleSignValue = this.add.text(0, SIGN_H / 2 + 13, '', {
            fontFamily: FONT, fontSize: '18px', color: '#ffd35a', stroke: INK, strokeThickness: 6,
        }).setOrigin(0.5);
        // fills while B is held
        this.boomFillBg = this.add.rectangle(-SIGN_W / 2 + 16, SIGN_H - 7, SIGN_W - 32, 6, 0x2b1810).setOrigin(0, 0.5).setVisible(false);
        this.boomFill = this.add.rectangle(-SIGN_W / 2 + 16, SIGN_H - 7, SIGN_W - 32, 6, 0xff9a3a).setOrigin(0, 0.5).setVisible(false);
        this.baleSignInner.add([signBoard, this.baleSignTitle, this.baleSignValue, this.boomFillBg, this.boomFill]);
        this.baleSign.add(this.baleSignInner);
        this.signSize = { w: SIGN_W, h: SIGN_H };
        this.boomHold = 0; this.boomLatch = false;
        this.baleSignOn = false;
        this.add.image(HAY_X, GROUND + 4, 'shadow').setScale(1.35, 1).setDepth(7);

        // Leaf piles (each hides one pumpkin the first time Ansel dives in)
        this.piles = PILES.map(p => {
            const img = this.add.image(p.x, GROUND + 8, p.key).setOrigin(0.5, 1).setDepth(12);
            const pile = { ...p, img, cool: 0, hidden: null };
            pile.hidden = this.makeItem(p.hides, p.x, GROUND - 40);
            pile.hidden.state = 'hidden';
            pile.hidden.img.setVisible(false);
            return pile;
        });

        LAYOUT.forEach(s => {
            const it = this.makeItem(s.key, s.x, GROUND - 60);
            this.addBody(it, s.x, GROUND - it.bh / 2 - 2, 0);
            it.state = 'ground';
        });

        // Ansel
        // Ansel (every frame shares one canvas, so one origin: his feet)
        const AF = this.anselData = this.cache.json.get('ansel_frames');
        this.ansel = {
            x: 700, dir: 1, frame: 0, frameT: 0, moving: false, carrying: null,
            goal: null, busy: false, pose: 'run', bob: 0, jumpY: 0,
            laneY: 0, depthScale: 1, baseScale: 1, farming: false, walkingLane: false,
            img: this.add.image(700, GROUND, 'ansel:everyday/pick_1').setDepth(20)
                .setOrigin(AF.footX / AF.w, AF.footY / AF.h),
            shadow: this.add.image(700, GROUND + 4, 'shadow').setDepth(9),
        };
        this.setPose('run');

        // Hoppah the bunny (from the Uppah runner) hops through now and then
        this.hop = {
            img: this.add.image(-300, GROUND, 'hoppah_stand').setOrigin(0.5, 305 / 327).setScale(0.3)
                .setDepth(21).setVisible(false),
            shadow: this.add.image(-300, GROUND + 4, 'shadow').setScale(0.6, 0.8).setDepth(9).setVisible(false),
            active: false, next: 14, phase: 'sit', t: 0, x: -300, y: GROUND, dir: 1, scared: false,
        };

        // Where the hovering pumpkin will land
        this.ghost = this.add.image(0, 0, 'target').setDepth(11).setVisible(false);

        // Pointing hand that shows what to tap (instead of words)
        this.hand = this.add.image(0, 0, 'hand').setOrigin(0.4, 0).setDepth(70).setVisible(false);

        // Speech bubble
        this.bubbleRoot = this.add.container(0, 0).setDepth(60);
        this.bubble = this.add.container(0, 0).setVisible(false);
        this.bubbleRoot.add(this.bubble);
        this.bubbleBg = this.add.nineslice(0, 0, 'bubble', null, 160, 64, 16, 16, 16, 16).setOrigin(0.5, 1);
        this.bubbleTail = this.add.image(0, -2, 'bubble_tail').setOrigin(0.5, 0);
        this.bubbleText = this.add.text(0, -34, '', { fontFamily: FONT, fontSize: '20px', color: INK })
            .setOrigin(0.5, 0.5);
        this.bubble.add([this.bubbleBg, this.bubbleTail, this.bubbleText]);
        this.bubbleTimer = 0;

        // Leaves: ambient drift + bursts
        this.ambient = this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7],
            x: { min: 0, max: WORLD_W + 400 }, y: 0,
            lifespan: 11000, speedY: { min: 35, max: 80 }, speedX: { min: -45, max: 15 },
            rotate: { start: 0, end: 540 }, scale: { min: 0.7, max: 1.1 },
            frequency: 260, quantity: 1,
        }).setDepth(30);
        this.burst = calmFx(this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7],
            lifespan: { min: 1400, max: 2400 },
            speedX: { min: -150, max: 150 }, speedY: { min: -360, max: -160 },
            gravityY: 360, rotate: { start: 0, end: 360 }, scale: { min: 0.9, max: 1.2 },
            emitting: false,
        })).setDepth(31);
        // Leaves shaken loose from the tree line flutter down
        this.treeLeaves = calmFx(this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7],
            lifespan: { min: 2200, max: 3400 }, speedX: { min: -70, max: 70 }, speedY: { min: 30, max: 110 },
            gravityY: 40, rotate: { start: 0, end: 360 }, scale: { min: 0.9, max: 1.3 }, emitting: false,
        })).setDepth(30);
        // Dust kicked up by landings and footsteps
        this.dust = calmFx(this.add.particles(0, 0, 'dust', {
            lifespan: { min: 350, max: 600 }, speedX: { min: -90, max: 90 }, speedY: { min: -60, max: -10 },
            gravityY: 120, scale: { start: 1.1, end: 0.2 }, alpha: { start: 0.8, end: 0 }, emitting: false,
        })).setDepth(32);
        // A soft little puff where a finger lands
        this.poof = calmFx(this.add.particles(0, 0, 'dust', {
            lifespan: 320, speed: { min: 25, max: 70 }, angle: { min: 0, max: 360 },
            scale: { start: 0.8, end: 0 }, alpha: { start: 0.5, end: 0 }, emitting: false,
        })).setDepth(65);
        // Sparkles for perfect drops and the bunny
        this.sparkles = calmFx(this.add.particles(0, 0, 'sparkle', {
            lifespan: { min: 500, max: 900 }, speed: { min: 40, max: 140 }, angle: { min: 0, max: 360 },
            scale: { start: 1.1, end: 0 }, rotate: { start: 0, end: 90 }, emitting: false,
        })).setDepth(63);

        // Gigi cameo actor
        // Gigi visits from the back of the patch, between the vine rows: small enough to be part of the
        // scene, never a giant running across the front of the screen.
        this.gigi = this.add.image(-400, GIGI.y, 'gigi_1').setOrigin(0.5, 1 - 37 / 496).setDepth(GIGI.depth).setVisible(false);
        this.gigiState = null;

        // Physics events → sounds
        this.matter.world.on('collisionstart', ev => this.onCollide(ev));

        // Camera
        const cam = this.cameras.main;
        cam.setBounds(0, 0, WORLD_W, WORLD_FLOOR);
        // dirt below the painted path: the path's own bottom rows, repeated
        {
            const src = this.textures.get('background').getSourceImage();
            const band = this.textures.createCanvas('soilband', WORLD_W, 40);
            band.context.drawImage(src, 0, WORLD_H - 40, WORLD_W, 40, 0, 0, WORLD_W, 40);
            band.refresh();
            this.add.tileSprite(0, WORLD_H, WORLD_W, WORLD_FLOOR - WORLD_H, 'soilband').setOrigin(0).setDepth(3);
        }
        this.camZoom = this.baseZoom();
        this.camX = 700;
        this.camY = WORLD_H - this.scale.height / (2 * this.camZoom);
        cam.setZoom(this.camZoom);
        cam.centerOn(this.camX, this.camY);
        this.scale.on('resize', size => this.cameras.main.setSize(size.width, size.height));

        // Input
        this.input.on('pointerdown', p => this.onTap(p));
        this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,B');
        this.input.keyboard.on('keydown', e => this.onKey(e));

        this.eggsCreate(); // surprises: click points and easter eggs
        this.scene.launch('ui');
        this.ui = this.scene.get('ui');
        this.events.once('shutdown', () => this.matter.world.off('collisionstart'));
        this.initChallenge();
    }

    // ── Items ───────────────────────────────────────────────────────────────
    makeItem(key, x, y) {
        const spec = PUMPKIN_SPECS[key];
        const img = this.add.image(x, y, key).setDepth(10);
        const it = { key, img, body: null, state: 'ground', settleT: 0, airT: 0 };
        // body = pumpkin without stem; image has stem/padding above
        it.bw = (spec.w + 1) * 4; it.bh = (spec.h + 1) * 4;
        const imgH = (spec.h + 8) * 4;
        img.setOrigin(0.5, (24 + 2 * spec.h) / imgH);
        it.heavy = it.bw >= 26 * 4;
        it.size = it.bw;
        it.shadow = this.add.image(x, GROUND + 3, 'shadow').setDepth(9).setVisible(false);
        this.items.push(it);
        return it;
    }

    addBody(it, x, y, angle) {
        const opts = {
            friction: 1, frictionStatic: 2.2, frictionAir: 0.015, restitution: 0.02,
            density: 0.0016 * (HEFT[it.key] || 1), slop: 0.04, sleepThreshold: 45, label: 'item',
        };
        // Squat pumpkin outline with a flat bottom and a flattish top (real pumpkins sit
        // on a flat base with a dimpled top), so a slightly crooked drop still stays put.
        const a = it.bw / 2, b = it.bh / 2, n = 24, verts = [];
        for (let i = 0; i < n; i++) {
            const t = (i / n) * Math.PI * 2;
            const c = Math.cos(t), s = Math.sin(t);
            const ey = s > 0 ? 4.5 : 3.4; // +y is down: bottom flatter than top
            verts.push({ x: a * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.6),
                         y: b * Math.sign(s) * Math.pow(Math.abs(s), 2 / ey) });
        }
        const body = this.matter.add.fromVertices(x, y, verts, opts);
        MB().setAngle(body, angle || 0);
        body.gameItem = it;
        it.body = body;
        it.settleT = 0;
        it.airT = 0;
    }

    removeBody(it) {
        if (it.body) { this.matter.world.remove(it.body); it.body = null; }
    }

    // The towers (one per hay bale) and the one Ansel is building; this.tower is its pumpkins.
    get stacks() { return this._stacks || (this._stacks = [new Stack(HAY_X, RULES.hayHalf, HAY_TOP)]); }
    get stack() { return this.stacks[this.activeStack || 0]; }
    get tower() { return this.stack.items; }
    set tower(v) { this.stack.items = v; }

    // Top of the stack: y of its top surface, x where it is now (swaying), rx its resting x.
    towerTop(stack) { return (stack || this.stack).top(); }

    // ── Ansel ───────────────────────────────────────────────────────────────
    // 'run' is the walk cycle (update() picks walking, carrying or heavy carrying, or standing
    // still); any other pose is one frame (ANSEL_POSES, or a frame name such as 'water_7').
    setPose(pose) {
        const a = this.ansel;
        a.pose = pose;
        if (pose === 'run') {
            const cyc = this.anselCycle();
            a.frameName = a.moving || a.carrying ? cyc[a.frame % cyc.length] : ANSEL_POSES.stand;
        } else {
            a.frameName = ANSEL_POSES[pose] || pose;
        }
        a.img.setTexture(this.anselKey(a.frameName));
        a.img.setScale(a.baseScale * a.depthScale);
        a.img.setFlipX(a.dir < 0);
    }

    // Texture for one of Ansel's frames in the outfit he has on (else the other outfit's).
    anselKey(name, outfit) {
        outfit = outfit || (this.ansel && this.ansel.farming ? 'farmer' : 'everyday');
        const key = `ansel:${outfit}/${name}`;
        return this.textures.exists(key) ? key : `ansel:${outfit === 'farmer' ? 'everyday' : 'farmer'}/${name}`;
    }

    // The walk cycle for now: walking, a pumpkin on his head, or a heavy one hugged to his chest.
    anselCycle() {
        const a = this.ansel, it = a.carrying;
        const c = ANSEL_CYCLES[it ? (this.heavyHold(it) ? 'heavy' : 'carry') : 'walk'];
        return c[a.farming ? 'farmer' : 'everyday'] || c.everyday;
    }

    // The big varieties and the golden one are hugged at his chest instead of carried on his head.
    heavyHold(it) {
        return it.heavy || it.golden || (it.heft || HEFT[it.key] || 1) >= 1.25;
    }

    // Where a pumpkin he holds goes in a frame (frames.json records where the sheet's own pumpkin
    // was): its centre, sat on the same bottom (ground, his head) or centred at his chest.
    holdPos(it, frame) {
        const a = this.ansel, ds = a.depthScale, feetY = GROUND - a.laneY;
        const info = this.anselData.frames[this.anselKey(frame).slice(6)];
        const h = info && info.hold;
        if (!h) return { x: a.x, y: feetY - HEAD_TOP * ds };
        const up = h.y + (h.anchor === 'bottom' ? (it.bh - 4) / 2 : 0);
        return { x: a.x + a.dir * h.x * ds, y: feetY - up * ds };
    }

    // Show a held pose and move the pumpkin into his hands for it.
    holdPose(it, pose, ms = 70) {
        this.setPose(pose);
        const p = this.holdPos(it, ANSEL_POSES[pose] || pose);
        this.tweens.add({ targets: it.img, x: p.x, y: p.y, angle: 0, duration: ms, ease: 'Quad.Out' });
    }

    // Ansel only speaks up for big moments: UPPAH! on the toss, MORE! when the patch refills or
    // after BOOM (callers pass important), BOOM, golden pumpkins, milestones, falls and the
    // surprises (important). Everything else he'd say is skipped here, in one place.
    say(text, ms = 1100, important = false) {
        if (!important && !SAY_LINES.has(text)) return;
        this.bubbleText.setText(text);
        const w = Math.max(96, this.bubbleText.width + 40);
        this.bubbleBg.setSize(w, 64);
        this.bubble.setVisible(true).setScale(0.4);
        this.tweens.add({ targets: this.bubble, scale: 1, duration: 160, ease: 'Back.Out' });
        this.bubbleTimer = ms;
    }

    walkTo(x, then) {
        const a = this.ansel;
        a.goal = { x: Phaser.Math.Clamp(x, PLAY_L + 30, PLAY_R - 30), then };
    }

    standSpot(targetX, gap) {
        const a = this.ansel;
        const side = a.x <= targetX ? -1 : 1;
        let x = targetX + side * gap;
        if (x < PLAY_L + 40 || x > PLAY_R - 40) x = targetX - side * gap;
        return x;
    }

    face(x) {
        const a = this.ansel;
        if (Math.abs(x - a.x) > 4) a.dir = x > a.x ? 1 : -1;
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    pickUp(it) {
        const a = this.ansel;
        if (a.carrying || a.busy) return;
        this.walkTo(this.standSpot(it.body ? it.body.position.x : it.img.x, 40 + it.bw * 0.35), () => {
            if (!it.body || it.state === 'tower' || a.carrying) return;
            this.face(it.body.position.x);
            a.busy = true;
            this.setPose('bend');
            Sfx.down();
            this.say('DOWN');
            // bend, grab, tug, tug (heave a heavy one), and it's up: about half a second
            const heavy = this.heavyHold(it), carryFrame = heavy ? 'heavy_1' : 'carry_1';
            this.time.delayedCall(80, () => {
                this.removeBody(it);
                it.state = 'carried';
                a.carrying = it;
                it.img.setDepth(a.img.depth + 0.1);   // in front of him, his hands tucked behind it
                this.holdPose(it, 'grab', 80);
            });
            this.time.delayedCall(160, () => this.holdPose(it, 'tug1'));
            this.time.delayedCall(240, () => this.holdPose(it, 'tug2'));
            if (heavy) this.time.delayedCall(320, () => this.holdPose(it, 'heave', 100));
            this.time.delayedCall(heavy ? 440 : 320, () => {
                Sfx.pickup();
                this.setPose(carryFrame);
                const p = this.holdPos(it, carryFrame);
                this.tweens.add({
                    targets: it.img, x: p.x, y: p.y, angle: 0,
                    duration: 140, ease: 'Back.Out',
                    onComplete: () => {
                        a.busy = false;
                        a.frame = 0;
                        this.setPose('run');
                        if (it.heavy) this.say('BIG ONE!');
                        else if (it.bw < 17 * 4) this.say('LITTLE ONE!');
                        else if (this.tower.length > 0 && Math.random() < 0.4) { Sfx.more(); this.say('MORE!'); }
                        else this.say(Phaser.Utils.Array.GetRandom(['PUNKIN!', 'PUMPKIN!', 'MINE!']));
                        // straight to the stack: tap-to-fetch, tap-to-drop (two taps per pumpkin)
                        this.time.delayedCall(100, () => this.placeOnTower());
                    },
                });
            });
        });
    }

    placeOnTower() {
        const a = this.ansel;
        if (!a.carrying || a.busy || this.roundOver) return;
        this.walkTo(this.standSpot(HAY_X, 175), () => {
            const it = a.carrying;
            if (!it) return;
            this.face(HAY_X);
            a.busy = true;
            this.setPose('toss');
            Sfx.uppah();
            this.say('UPPAH!');
            const top = this.towerTop();
            // the sway starts at the far edge on Ansel's side, so you wait for it to come over
            const side = a.x < top.x ? -1 : 1;
            this.hoverAmp = this.hoverStart(it);
            const hx = top.x + side * this.hoverAmp, hy = top.y - it.bh / 2 - 120;
            it.state = 'hover';
            a.carrying = null;
            this.tweens.add({ targets: it.img, x: hx, duration: 380, ease: 'Sine.InOut' });
            this.tweens.add({
                targets: it.img, y: { value: hy, ease: 'Back.Out' }, duration: 380,
                onComplete: () => {
                    it.img.setDepth(10);
                    this.hovering = it;
                    this.hoverT = 0;
                    this.hoverU = side < 0 ? 0 : 2 * this.hoverAmp;
                    this.hoverBaseX = top.x;
                    this.time.delayedCall(120, () => { a.busy = false; this.setPose('run'); });
                },
            });
        });
    }

    drop() {
        const it = this.hovering;
        if (!it || this.dropping) return;
        this.hovering = null;
        this.ghost.setVisible(false);
        // Where it lands is decided now, from where it is over the (swaying) top: a perfect
        // drop snaps to centre; otherwise it keeps its miss (pulled in only for the first
        // pumpkins). updateDrop() then drops it there and landDrop()
        // decides whether it stays, wobbles or goes over.
        const top = this.towerTop();
        const plan = this.planDrop(it, this.hoverOff !== undefined ? this.hoverOff : it.img.x - top.x);
        it.grade = plan.kind;
        it.state = 'dropping';
        this.dropping = { it, plan, stack: this.stack, x0: it.img.x, y0: it.img.y, a0: it.img.angle, vy: 0 };
        Sfx.down();
        this.say('DOWN!', 800);
    }

    dive(pile) {
        const a = this.ansel;
        if (a.busy || a.carrying) return;
        this.walkTo(this.standSpot(pile.x, 60), () => {
            this.face(pile.x);
            a.busy = true;
            this.setPose('dive');
            Sfx.crunch();
            this.burst.explode(34, pile.x, GROUND - 30);
            this.say('LEAVES!');
            this.tweens.add({ targets: pile.img, scaleY: 0.45, scaleX: 1.12, duration: 160, ease: 'Quad.Out' });
            this.tweens.add({ targets: pile.img, scaleY: 1, scaleX: 1, duration: 2600, delay: 2500, ease: 'Sine.InOut' });
            const h = pile.hidden;
            if (h && h.state === 'hidden') {
                pile.hidden = null;
                this.time.delayedCall(180, () => {
                    h.img.setVisible(true);
                    this.addBody(h, pile.x, GROUND - h.bh / 2 - 30, 0);
                    MB().setVelocity(h.body, { x: (a.x < pile.x ? 2.5 : -2.5), y: -14 });
                    h.state = 'falling';
                    Sfx.pop();
                    this.time.delayedCall(350, () => this.say('A PUMPKIN!'));
                });
            }
            this.time.delayedCall(520, () => { a.busy = false; this.setPose('run'); });
        });
    }

    // Ansel walks over and shoves the bale (tap the bale or its BOOM sign, or Down beside it):
    // BOOM banks the tower's points, then knocks it down.
    knockDown() {
        const a = this.ansel, stack = this.stack;
        if (a.busy || a.carrying || this.hovering || this.dropping || !this.canBoom(stack)) return;
        this.walkTo(this.standSpot(stack.x, 150), () => {
            this.face(stack.x);
            a.busy = true;
            this.setPose('shove');
            this.say('BOOM!', 900);
            this.time.delayedCall(200, () => {
                if (!this.boom(stack)) { a.busy = false; this.setPose('run'); return; }
                this.anselBoomFace();
                this.time.delayedCall(1500, () => { Sfx.more(); this.say('MORE!', 1100, true); });
                this.time.delayedCall(1700, () => { a.busy = false; this.setPose('run'); });
            });
        });
    }

    // The tower blows: his happiest face (ANSEL_POSES.boom), arms up, and a happy hop.
    anselBoomFace() {
        const a = this.ansel;
        this.setPose('boom');
        this.tweens.add({ targets: a, jumpY: 36, duration: 160, ease: 'Quad.Out', yoyo: true, repeat: 1,
            onComplete: () => { a.jumpY = 0; } });
    }

    // Is there a pumpkin to pick anywhere: on the path, or of any size in the vines (not counting
    // pumpkins still hidden in leaves)? Bare spots and sprouts can always be watered, so they
    // don't count here.
    anyLoose() {
        return this.items.some(it => it.body && it.state !== 'tower' && it.state !== 'hidden' && it.state !== 'spent') ||
            (this.spots || []).some(sp => sp.stage >= 2 && !sp.busy);
    }

    // MORE!: with no pumpkin to pick anywhere, a tap on empty ground (or on Ansel) makes him shout
    // for more, and every plant in the patch grows a stage. It needs GROW.moreCooldown seconds
    // to come back; until then the patch has to grow (or be watered) the slow way.
    more() {
        const a = this.ansel;
        if (a.busy || a.carrying || this.hovering || this.anyLoose()) return;
        if (this.time.now < (this.moreReadyAt || 0)) { this.anselJump(); return; }
        this.moreReadyAt = this.time.now + GROW.moreCooldown * 1000;
        a.busy = true;
        this.setPose('cheer');
        Sfx.more();
        this.say('MORE!', 1300, true);
        // every plant grows a stage, rippling out from Ansel
        const order = [...this.spots].sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
        order.forEach((sp, i) => {
            this.time.delayedCall(250 + i * 110, () => { if (!sp.busy) this.growSpot(sp); });
        });
        // and tuck a new surprise into any leaf pile that's empty
        for (const pile of this.piles) {
            if (!pile.hidden) {
                pile.hidden = this.makeItem(Phaser.Utils.Array.GetRandom(MORE_POOL), pile.x, GROUND - 40);
                pile.hidden.state = 'hidden';
                pile.hidden.img.setVisible(false);
            }
        }
        this.time.delayedCall(700, () => { a.busy = false; this.setPose('run'); });
    }

    // ── Input ───────────────────────────────────────────────────────────────
    begin() {
        if (this.started) return;
        this.started = true;
        this.startRound();
        this.tapGuard = this.time.now + 300; // the "tap to play" tap is not a game tap
        Sfx.init();
        this.time.delayedCall(300, () => this.say('PUMPKINS!', 1500));
    }

    onTap(p) {
        if (!this.started || this.roundOver || this.time.now < (this.tapGuard || 0)) return;
        if (this.ui.hitButton(p) || this.ui.hitPause(p) || this.ui.paused || isPalm(p)) return;
        // ignore a second tap that lands almost instantly (accidental double taps)
        if (this.time.now - this.lastTapAt < 120) return;
        if (this.ui.eggUiHit(p)) return; // surprises: sticker badge and tray
        this.lastTapAt = this.time.now;
        this.idleT = 0;
        this.poof.explode(6, p.worldX, p.worldY);
        this.handleTap(p.worldX, p.worldY);
    }

    pumpkinAt(wx, wy) {
        let best = null, bd = 1e9;
        for (const it of this.items) {
            if (!it.body || it.state === 'tower' || it.state === 'hidden' || it.state === 'spent') continue;
            const d = Phaser.Math.Distance.Between(wx, wy, it.body.position.x, it.body.position.y);
            const r = Math.max(it.bw, it.bh) / 2 + 40;
            if (d < r && d < bd) { best = it; bd = d; }
        }
        return best;
    }

    handleTap(wx, wy) {
        const a = this.ansel;
        if (this.hovering) { this.drop(); return; }

        // the bunny can be tapped any time
        const h = this.hop;
        if (h.active && Math.abs(wx - h.x) < 75 && wy > h.y - 120 && wy < h.y + 20) { this.tapHoppah(); return; }
        if (this.eggTap(wx, wy)) return; // surprises
        if (this.tapScenery(wx, wy)) return;
        // a tap on the BOOM sign means BOOM, even with a loose pumpkin lying in front of it
        if (!a.carrying && !a.busy && this.hitSign(wx, wy)) { this.knockDown(); return; }

        let it = this.pumpkinAt(wx, wy);
        // a pumpkin growing in the vines may be closer to the finger than one on the path
        const sp = this.spotAt(wx, wy);
        const itD = it ? Phaser.Math.Distance.Between(wx, wy, it.body.position.x, it.body.position.y) : 1e9;
        if (sp && sp.d < itD) {
            it = null;
            this.tweens.add({ targets: sp.spot.img, angle: { from: -6, to: 6 }, duration: 70, yoyo: true,
                onComplete: () => { if (sp.spot.img) sp.spot.img.angle = 0; } });
            Sfx.boop(40);
            if (a.busy || this.hovering) { this.pending = { wx, wy }; return; }
            if (a.carrying) { this.placeOnTower(); return; }
            this.harvest(sp.spot);
            return;
        }
        // instant reaction even before Ansel gets there
        if (it && it.body && !it.body.isStatic) {
            MSleep().set(it.body, false);
            MB().setVelocity(it.body, { x: it.body.velocity.x, y: -5 });
            Sfx.boop(it.bw / 4);
        }
        if (a.busy || this.hovering) { this.pending = { wx, wy }; return; }
        if (a.carrying) { this.placeOnTower(); return; }
        if (it) { this.pickUp(it); return; }

        for (const pile of this.piles) {
            if (Math.abs(wx - pile.x) < pile.img.displayWidth / 2 + 20 && wy > GROUND - 110 && wy < GROUND + 60) {
                this.dive(pile); return;
            }
        }
        // the hay bale or its BOOM sign: Ansel runs over and shoves the tower down
        if (this.hitBale(wx, wy)) { this.knockDown(); return; }
        // tapping Ansel: "MORE!" when the patch is empty, otherwise a happy jump
        if (Math.abs(wx - a.x) < 70 && wy > GROUND - HEAD_TOP - 20 && wy < GROUND + 10) {
            if (!this.anyLoose()) this.more(); else this.anselJump();
            return;
        }
        if (!this.anyLoose()) { this.more(); return; }
        // the tree line shakes leaves loose
        if (wy > 1560 && wy < 1800) { this.shakeTree(wx); return; }
        this.walkTo(wx, null);
    }

    anselJump() {
        const a = this.ansel;
        if (a.busy || a.carrying) return;
        a.busy = true;
        this.setPose('cheer');
        Sfx.uppah();
        this.time.delayedCall(250, () => Sfx.giggle());
        this.say('UPPAH!', 900);
        this.tweens.add({
            targets: a, jumpY: 90, duration: 230, ease: 'Quad.Out', yoyo: true,
            onComplete: () => {
                a.jumpY = 0;
                this.dust.explode(8, a.x, GROUND);
                a.busy = false;
                this.setPose('run');
            },
        });
    }

    shakeTree(wx) {
        Sfx.rustle();
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(i * 90, () => this.treeLeaves.explode(7, wx + Phaser.Math.Between(-70, 70), 1610 + i * 20));
        }
    }

    tapHoppah() {
        const h = this.hop;
        if (!h.active) return;
        if (this.eggHoppah()) return; // surprises: sometimes Ansel scoops the bunny up
        Sfx.boing();
        this.sparkles.explode(10, h.x, h.y - 60);
        if (!this.ansel.busy) this.say('HOPPAH!', 1000);
        h.scared = true;
        h.phase = 'hop'; h.t = 0; h.fromX = h.x; h.toX = h.x + h.dir * 230; h.dur = 0.55; h.height = 150;
    }

    // ── Growing patch ───────────────────────────────────────────────────────
    createPatch() {
        this.spots = GROW_SPOTS.map(g => ({ ...g, stage: 0, t: 0, img: null, key: null, golden: false, busy: false }));
        this.resetPatch();
    }

    // Each round starts with a mix in the vines: bare spots, sprouts, small and medium pumpkins.
    resetPatch() {
        this.moreReadyAt = 0;
        this.spots.forEach((sp, i) => {
            if (sp.img) { this.tweens.killTweensOf(sp.img); sp.img.destroy(); }
            Object.assign(sp, { stage: 0, t: Phaser.Math.FloatBetween(...GROW.sproutDelay), img: null, key: null,
                golden: false, busy: false, watered: false });
            const start = GROW.start[i % GROW.start.length];
            for (let k = 0; k < start; k++) this.growSpot(sp, false);
        });
    }

    // Seconds until a plant at its current stage grows again (faster if it has been watered).
    growTime(sp) {
        const range = sp.stage === 0 ? GROW.sproutDelay : GROW.grow[sp.stage - 1];
        if (!range || sp.golden) return Infinity; // full size
        return Phaser.Math.FloatBetween(...range) / (sp.watered ? GROW.watered : 1);
    }

    // Grow one stage: bare -> sprout -> small -> medium -> large (now and then golden) -> XL.
    // It reads calmly: the new size just eases in, no bursts.
    growSpot(sp, fx = true) {
        if (sp.stage >= GROW_TOP || sp.golden) return;
        sp.stage += 1;
        const lane = LANES[sp.lane];
        let key, scale = lane.scale;
        if (sp.stage === 1) { key = 'sprout'; scale *= 1.4; }
        else {
            if (sp.stage === 4 && Math.random() < GROW.goldenChance) sp.golden = true;
            sp.key = sp.golden ? 'pumpkin_golden' : Phaser.Utils.Array.GetRandom(GROW_SIZES[sp.stage]);
            key = sp.key;
        }
        if (!sp.img) sp.img = this.add.image(sp.x, lane.y + 6, key).setOrigin(0.5, 1).setDepth(lane.depth);
        sp.img.setTexture(key).setScale(scale).setAngle(0);
        sp.t = this.growTime(sp);
        if (fx) {
            this.tweens.killTweensOf(sp.img);
            sp.img.setScale(scale * (sp.stage === 1 ? 0.5 : 0.85));
            this.tweens.add({ targets: sp.img, scale, duration: 450, ease: 'Sine.Out' });
        }
    }

    updatePatch(dt) {
        if (!this.started) return;
        for (const sp of this.spots) {
            if (sp.busy) continue;
            sp.t -= dt;
            if (sp.t <= 0) this.growSpot(sp);
        }
        // a golden pumpkin glints now and then so it gets noticed
        for (const sp of this.spots) {
            if (sp.golden && sp.img && Math.random() < dt * 1.5) {
                this.sparkles.explode(1, sp.x + Phaser.Math.Between(-35, 35), sp.img.y - sp.img.displayHeight * 0.6);
            }
        }
    }

    spotAt(wx, wy) {
        let best = null, bd = 1e9;
        for (const sp of this.spots) {
            if (!sp.img || sp.stage < 1 || sp.busy) continue;
            const cy = sp.img.y - sp.img.displayHeight / 2;
            const d = Phaser.Math.Distance.Between(wx, wy, sp.x, cy);
            const r = Math.max(70, sp.img.displayWidth / 2 + 35); // generous for little fingers
            if (d < r && d < bd) { best = sp; bd = d; }
        }
        return best ? { spot: best, d: bd } : null;
    }

    // The one entry point for a tap on a vine spot: a pumpkin of any size gets picked and carried
    // to the bale; a bare spot or a sprout gets watered (and Ansel stays at the field's edge).
    harvest(sp) {
        const a = this.ansel;
        if (a.busy || a.carrying || sp.busy) return;
        const lane = LANES[sp.lane];
        const side = a.x <= sp.x ? -1 : 1;
        let standX = sp.x + side * 78 * lane.scale;
        if (standX < PLAY_L + 40 || standX > PLAY_R - 40) standX = sp.x - side * 78 * lane.scale;
        this.walkTo(standX, () => {
            // claim the spot only on arrival, so a change of mind on the way leaves it free
            if (sp.busy || a.busy || a.carrying) return;
            const pick = sp.stage >= 2 && sp.img;
            sp.busy = true;
            a.busy = true;
            this.face(sp.x);
            if (!a.farming) { a.farming = true; this.sparkles.explode(6, a.x, GROUND - HEAD_TOP - 10); }
            this.enterLane(lane, () => (pick ? this.pickFromVine(sp, lane) : this.waterSpot(sp, lane)));
        });
    }

    enterLane(lane, then) {
        const a = this.ansel;
        a.walkingLane = true;
        a.img.setDepth(lane.depth + 0.5);
        a.shadow.setDepth(lane.depth + 0.4);
        this.tweens.add({ targets: a, laneY: GROUND - lane.y, depthScale: lane.scale, duration: 420, ease: 'Sine.InOut',
            onComplete: () => { a.walkingLane = false; then(); } });
    }

    leaveLane(heavy, then) {
        const a = this.ansel;
        a.walkingLane = true;
        this.tweens.add({ targets: a, laneY: 0, depthScale: 1, duration: heavy ? 950 : 460, ease: 'Sine.InOut',
            onComplete: () => {
                a.walkingLane = false;
                a.img.setDepth(20);
                a.shadow.setDepth(9);
                if (a.carrying) a.carrying.img.setDepth(a.img.depth + 0.1);
                if (then) then();
            } });
    }

    pickFromVine(sp, lane) {
        const a = this.ansel;
        const ds = lane.scale;
        const img = sp.img;
        this.setPose('bend');
        Sfx.down();
        this.say('DOWN!', 700);
        // grab it and tug, tug, tug: the pumpkin wiggles on its vine (about 0.8 s to his head)
        this.time.delayedCall(80, () => this.setPose('grab'));
        [160, 280, 400, 520].forEach((ms, i) => this.time.delayedCall(ms, () => this.setPose(i % 2 ? 'tug2' : 'tug1')));
        this.time.delayedCall(150, () => {
            Sfx.tug();
            this.tweens.add({ targets: img, angle: { from: -9, to: 9 }, duration: 75, yoyo: true, repeat: 2,
                onRepeat: () => Sfx.tug(), onComplete: () => { img.angle = 0; } });
        });
        this.time.delayedCall(600, () => {
            // pop! off the vine
            Sfx.pop();
            this.treeLeaves.explode(6, sp.x, lane.y - 16);
            const key = sp.key, golden = sp.golden;
            const it = this.makeItem(key, img.x, img.y - img.displayHeight / 2);
            it.golden = golden;
            if (golden) it.heavy = true;
            it.state = 'lifting';
            it.img.setScale(ds).setDepth(a.img.depth + 0.1);
            this.tweens.killTweensOf(img);
            img.destroy();
            sp.img = null; sp.stage = 0; sp.key = null; sp.golden = false; sp.busy = false; sp.watered = false;
            sp.t = Phaser.Math.FloatBetween(...GROW.sproutDelay);
            const carryFrame = this.heavyHold(it) ? 'heavy_1' : 'carry_1';
            const done = () => {
                it.state = 'carried';
                a.carrying = it;
                a.frame = 0;
                this.setPose('run');
                if (golden) { this.say('GOLDEN!', 1100); Sfx.perfect(3); this.earnLife(RULES.goldenLife, it.img.x, it.img.y, 300); }
                else if (it.heavy) this.say('HEAVY!', 1000);
                else { Sfx.more(); this.say('MORE!', 900); }
                this.leaveLane(it.heavy, () => {
                    a.busy = false;
                    this.time.delayedCall(150, () => this.placeOnTower());
                });
            };
            const lift = () => {
                this.setPose(carryFrame);
                const p = this.holdPos(it, carryFrame);
                this.tweens.add({ targets: it.img, x: p.x, y: p.y, angle: 0, duration: 160, ease: 'Back.Out', onComplete: done });
            };
            if (it.heavy) {
                // it's heavy: heave it up first, then hug it
                this.say('NNNGH!', 900);
                this.holdPose(it, 'heave', 110);
                this.time.delayedCall(130, lift);
                this.cameras.main.shake(90, 0.001);
            } else {
                lift();
            }
        });
    }

    // The 12-frame watering animation (the can and the drops are in the frames). On the pour the
    // plant jumps a stage (a bare spot sprouts, a sprout becomes a small pumpkin) and from then on
    // grows twice as fast. He doesn't pick anything: he steps back out to the field's edge,
    // ready for the next tap.
    waterSpot(sp, lane) {
        const a = this.ansel;
        const step = 85;
        for (let i = 0; i < 12; i++) this.time.delayedCall(i * step, () => this.setPose('water_' + (i + 1)));
        this.time.delayedCall(3 * step, () => Sfx.water());
        this.time.delayedCall(6 * step, () => {
            sp.watered = true;
            this.growSpot(sp);
        });
        this.time.delayedCall(12 * step, () => {
            sp.busy = false;
            this.setPose('run');
            this.leaveLane(false, () => { a.busy = false; });
        });
    }

    // ── Scenery: giraffe and silo ───────────────────────────────────────────
    tapScenery(wx, wy) {
        const r = this.raffe;
        if (Math.abs(wx - r.x) < 95 && wy > GIRAFFE_Y - 340 && wy < GIRAFFE_Y - 20) {
            r.mode = 'look'; r.t = 2.4; r.frame = 0;
            r.img.setFrame(GIRAFFE_LOOK);
            this.tweens.add({ targets: r.img, y: GIRAFFE_Y - 22, duration: 180, yoyo: true, ease: 'Quad.Out' });
            this.sparkles.explode(8, r.x + r.dir * 70, GIRAFFE_Y - 300);
            Sfx.hum();
            if (!this.ansel.busy) this.say('GIRAFFE!', 1100);
            return true;
        }
        if (Math.abs(wx - SILO_X) < 95 && wy > SILO_TOP_Y - 150 && wy < SILO_TOP_Y + 20) {
            this.siloWink(true);
            if (!this.ansel.busy) this.say('BIG PUMPKIN!', 1100);
            return true;
        }
        return false;
    }

    siloWink(tapped) {
        const p = this.silo;
        p.setTexture('silo_pumpkin_wink');
        this.time.delayedCall(tapped ? 900 : 450, () => p.setTexture('silo_pumpkin'));
        if (tapped) {
            Sfx.giggle();
            this.tweens.killTweensOf(p);
            p.angle = 0;
            this.tweens.add({ targets: p, angle: { from: -7, to: 7 }, duration: 110, yoyo: true, repeat: 2,
                onComplete: () => { p.angle = 0; } });
        }
    }

    updateScenery(dt) {
        // the silo pumpkin winks now and then on its own
        this.silo.nextWink -= dt;
        if (this.silo.nextWink <= 0) {
            this.silo.nextWink = Phaser.Math.FloatBetween(10, 20);
            this.siloWink(false);
        }
        // the giraffe ambles back and forth behind the fence, stopping to look around
        const r = this.raffe;
        r.t -= dt;
        if (r.mode === 'walk') {
            r.x += r.dir * GIRAFFE_SPEED * dt;
            r.frameT += dt;
            if (r.frameT > 0.24) { r.frameT = 0; r.frame = (r.frame + 1) % 4; r.img.setFrame(r.frame); }
            if (r.x < 140 || r.x > WORLD_W - 140) { r.dir = r.x < 140 ? 1 : -1; }
            if (r.t <= 0) { r.mode = 'look'; r.t = Phaser.Math.FloatBetween(2.5, 4.5); r.img.setFrame(GIRAFFE_LOOK); }
        } else if (r.t <= 0) {
            r.mode = 'walk';
            r.t = Phaser.Math.FloatBetween(7, 14);
            r.img.setFrame(r.frame);
            if (Math.random() < 0.35) r.dir = -r.dir;
        } else {
            // looking out at us, with a slow blink
            r.img.setFrame(r.t > 0.8 && r.t < 1.05 ? GIRAFFE_LOOK + 1 : GIRAFFE_LOOK);
        }
        r.img.x = r.x;
        r.img.setFlipX(r.dir < 0);
    }

    updateHoppah(dt) {
        const h = this.hop;
        if (!this.started) return;
        const v = this.cameras.main.worldView;
        if (!h.active) {
            h.next -= dt;
            if (h.next > 0 || this.gigiState) return;
            h.active = true; h.scared = false;
            h.dir = this.ansel.x > v.centerX ? 1 : -1;      // come in on the side Ansel isn't
            h.x = h.dir > 0 ? v.x - 60 : v.right + 60;
            h.y = GROUND; h.phase = 'sit'; h.t = 0.2;
            h.img.setVisible(true).setFlipX(h.dir < 0);
            h.shadow.setVisible(true);
        }
        if (h.phase === 'sit') {
            h.t -= dt;
            h.img.setTexture('hoppah_stand');
            if (h.t <= 0) {
                h.phase = 'hop'; h.t = 0; h.fromX = h.x;
                h.toX = h.x + h.dir * (h.scared ? 200 : 110);
                h.dur = h.scared ? 0.4 : 0.45; h.height = h.scared ? 70 : 55;
            }
        } else {
            h.t += dt / h.dur;
            const k = Math.min(1, h.t);
            h.x = Phaser.Math.Linear(h.fromX, h.toX, k);
            h.y = GROUND - Math.sin(Math.PI * k) * h.height;
            h.img.setTexture('hoppah_jump');
            if (k >= 1) {
                h.y = GROUND; h.phase = 'sit';
                h.t = h.scared ? 0.08 : (Math.random() < 0.2 ? 1.6 : Phaser.Math.FloatBetween(0.25, 0.7));
                this.dust.explode(3, h.x, GROUND);
            }
        }
        h.img.setPosition(h.x, h.y);
        h.shadow.setPosition(h.x, GROUND + 4).setAlpha(1 - (GROUND - h.y) / 250);
        if (h.x < v.x - 200 || h.x > v.right + 200 || h.x < -100 || h.x > WORLD_W + 100) {
            h.active = false;
            h.img.setVisible(false);
            h.shadow.setVisible(false);
            h.next = Phaser.Math.FloatBetween(18, 32);
        }
    }

    onKey(e) {
        const code = e.code;
        if (code === 'KeyM' || code === 'KeyP' || code === 'Escape') return; // the UI scene handles these
        if (this.resumedAt && e.timeStamp <= this.resumedAt) return;
        if (!this.started) {
            if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(code)) this.ui.startGame();
            return;
        }
        if (this.roundOver) {
            if (['Space', 'Enter', 'ArrowUp', 'KeyW'].includes(code)) this.ui.retry();
            return;
        }
        const a = this.ansel;
        if (code === 'KeyB') return; // BOOM is a hold: see updateBoomHold()
        const isUp = code === 'ArrowUp' || code === 'KeyW' || code === 'Space';
        const isDown = code === 'ArrowDown' || code === 'KeyS';
        if (!isUp && !isDown) return;
        if (this.hovering) { this.drop(); return; }
        if (a.busy) return;
        if (isUp) {
            if (a.carrying) this.placeOnTower();
            else if (!this.anyLoose()) this.more();
            return;
        }
        // DOWN: pick up a pumpkin close by on the path, else harvest (or water) the nearest one
        // growing in the vines, else dive a leaf pile. BOOM is only ever B or the bale itself.
        if (a.carrying) return;
        let best = null, bd = 150;
        for (const it of this.items) {
            if (!it.body || it.state === 'tower' || it.state === 'hidden') continue;
            const d = Math.abs(it.body.position.x - a.x);
            if (d < bd && it.body.position.y > HAY_TOP - 40) { best = it; bd = d; }
        }
        if (best) { this.pickUp(best); return; }
        let spot = null, sd = 230;
        for (const sp of this.spots) {
            if (!sp.img || sp.stage < 1 || sp.busy) continue;
            const d = Math.abs(sp.x - a.x) - (sp.stage >= 3 ? 40 : 0); // a ripe one wins a near tie
            if (d < sd) { spot = sp; sd = d; }
        }
        if (spot) { this.harvest(spot); return; }
        for (const pile of this.piles) {
            if (Math.abs(pile.x - a.x) < 150) { this.dive(pile); return; }
        }
        if (!this.anyLoose()) this.more();
    }

    onCollide(ev) {
        for (const pair of ev.pairs) {
            const A = pair.bodyA.parent || pair.bodyA, B = pair.bodyB.parent || pair.bodyB;
            const it = A.gameItem || B.gameItem;
            if (!it) continue;
            const other = A.gameItem ? B : A;
            const rv = Math.hypot(A.velocity.x - B.velocity.x, A.velocity.y - B.velocity.y);
            if (rv < 1.2) continue;
            const now = this.time.now;
            if (it.lastSound && now - it.lastSound < 90) continue;
            it.lastSound = now;
            Sfx.thunk(it.size / 4, rv);
            if (rv > 3 && it.body) {
                // dust puff where it hit, and a quick squash
                const c = pair.collision && pair.collision.supports && pair.collision.supports[0];
                this.dust.explode(Math.min(10, 3 + Math.round(rv)), c ? c.x : it.body.position.x,
                    c ? c.y : it.body.bounds.max.y);
                this.tweens.add({ targets: it.img, scaleX: 1.12, scaleY: 0.88, duration: 70, yoyo: true });
                if (it.heavy && rv > 6 && !it.blown) this.cameras.main.shake(90, 0.0012); // a BOOM never shakes
            }
        }
    }

    // ── Frame update ────────────────────────────────────────────────────────
    update(time, delta) {
        const dt = Math.min(delta, 50) / 1000;
        const a = this.ansel;

        // Manual walking (keyboard)
        let manual = 0;
        if (this.started && !a.busy && !this.hovering) {
            if (this.keys.LEFT.isDown || this.keys.A.isDown) manual = -1;
            if (this.keys.RIGHT.isDown || this.keys.D.isDown) manual = 1;
        }
        const speed = a.carrying && a.carrying.heavy ? HEAVY_SPEED : WALK_SPEED;
        a.moving = false;
        if (manual) {
            a.goal = null;
            a.dir = manual;
            a.x = Phaser.Math.Clamp(a.x + manual * speed * dt, PLAY_L + 30, PLAY_R - 30);
            a.moving = true;
        } else if (a.goal && !a.busy) {
            const dx = a.goal.x - a.x;
            if (Math.abs(dx) <= speed * dt + 1) {
                a.x = a.goal.x;
                const then = a.goal.then;
                a.goal = null;
                if (then) then();
            } else {
                a.dir = Math.sign(dx);
                a.x += a.dir * speed * dt;
                a.moving = true;
            }
        }

        if (a.walkingLane) a.moving = true;

        // Walk cycle: walking, carrying on his head, or a heavy one hugged at his chest. Short
        // cycles hold each frame longer so a stride always takes six walk-frame ticks.
        if (a.pose === 'run') {
            const cyc = this.anselCycle();
            if (a.moving) {
                a.frameT += dt;
                if (a.frameT > 0.085 * 270 / speed * 6 / cyc.length) {
                    a.frameT = 0;
                    a.frame = (a.frame + 1) % cyc.length;
                    const half = Math.floor(cyc.length / 2);
                    if (a.frame === 0 || a.frame === half) Sfx.step(a.frame === half);
                }
            } else {
                a.frame = 0;
            }
            a.frame %= cyc.length;
            a.frameName = a.moving || a.carrying ? cyc[a.frame] : ANSEL_POSES.stand;
            const key = this.anselKey(a.frameName);
            if (a.img.texture.key !== key) a.img.setTexture(key);
        }
        a.img.setFlipX(a.dir < 0);
        a.img.x = a.x;
        const idleBob = a.moving ? 0 : Math.sin(time / 380) * 1.5;
        const ds = a.depthScale;
        const feetY = GROUND - a.laneY;
        a.img.y = feetY + idleBob - a.jumpY;
        a.img.setScale(a.baseScale * ds);
        const ak = 1 - a.jumpY / 200;
        a.shadow.setPosition(a.x, feetY + 4).setScale(0.95 * ak * ds, ak * ds).setAlpha(ak);

        // Carried pumpkin: in his hands where this frame's own pumpkin was (on his head, or at
        // his chest for a heavy one), in front of him with his hands tucked behind it
        if (a.carrying && a.carrying.state === 'carried' && (!a.busy || a.walkingLane)) {
            const p = this.holdPos(a.carrying, a.frameName);
            a.carrying.img.setScale(ds).setDepth(a.img.depth + 0.1);
            a.carrying.img.x = p.x;
            a.carrying.img.y = p.y + idleBob - a.jumpY;
            a.carrying.img.angle = a.moving ? Math.sin(time / 120) * 2 : 0;
            if (a.carrying.golden && Math.random() < 0.04) {
                this.sparkles.explode(1, a.carrying.img.x + Phaser.Math.Between(-30, 30), a.carrying.img.y);
            }
        }

        // Hovering item sways above the stack
        if (this.hovering) {
            this.hoverT += dt;
            const it = this.hovering;
            const top = this.towerTop();
            // steady glide back and forth (a triangle wave), readable like Stack's sliding block.
            // Gusts push it downwind (little ones further); it rides along with the top of the
            // tower as it sways, and leans and bobs in a gust.
            this.hoverU += this.hoverSpeed(it) * dt;
            const off = Rules.tri(this.hoverU, this.hoverAmp);
            const gust = this.windV;
            this.hoverDrift = Phaser.Math.Linear(this.hoverDrift || 0, Rules.hoverDrift(gust, pieceOf(it)), 1 - Math.pow(0.05, dt));
            const targetY = top.y - it.bh / 2 - 110 + Math.abs(gust) * Math.sin(this.hoverT * 11) * 4;
            this.hoverOff = this.hoverBaseX + off + this.hoverDrift - top.rx; // over the resting tower
            it.img.x = top.x + this.hoverOff;                                 // ...drawn on the swaying top
            it.img.y = Phaser.Math.Linear(it.img.y, targetY + Math.sin(this.hoverT * 5) * 5, 0.15);
            it.img.angle = Math.sin(this.hoverT * 3) * 4 + gust * RULES.hoverLean;
            this.hoverBaseX = Phaser.Math.Linear(this.hoverBaseX, top.rx, 0.05);
            // a plain marker on top of the stack shows where it would land (wind included)
            const plan = this.planDrop(it, this.hoverOff);
            this.hoverGrade = plan.grade;
            this.showRing(it, top, plan, time);
        }

        // Wind, the tower's balance and sway, tipping, and the pumpkin being dropped
        this.updateChallenge(dt, time);

        // Sync physics items -> sprites (tower pieces' static bodies already carry their sway)
        for (const it of this.items) {
            if (!it.body) { it.shadow.setVisible(false); continue; }
            it.img.x = it.body.position.x;
            it.img.y = it.body.position.y;
            it.img.rotation = it.body.angle;
            if (it.state === 'tower' || it.body.isStatic) continue;
            // contact shadow, shrinking as the pumpkin rises off the ground
            const k = Phaser.Math.Clamp(1 - (GROUND - it.body.bounds.max.y) / 450, 0.25, 1);
            it.shadow.setVisible(true).setPosition(it.body.position.x, GROUND + 3)
                .setScale((it.bw / 136) * k, k).setAlpha(k);
            it.airT += dt;
            const v = Math.hypot(it.body.velocity.x, it.body.velocity.y);
            const resting = it.body.isSleeping || (v < 0.3 && Math.abs(it.body.angularVelocity) < 0.02);
            it.settleT = resting ? it.settleT + dt : 0;
            if (it.settleT > 0.35) {
                // things that fell (off the stack, out of a leaf pile, out of the sky) are loose again
                if (it.state === 'falling') it.state = 'ground';
                it.fromDrop = false;
                it.blown = false;
            }
            // a BOOMed pumpkin has been banked: once it lands (or after a while), it fades away
            if (it.state === 'spent' && (it.settleT > 0.35 || it.airT > 3)) { this.fadeSpent(it); continue; }
            if (it.settleT > 0.45 && it.state === 'ground' && it.body.bounds.max.y < HAY_TOP + 20 &&
                Math.abs(it.body.position.x - HAY_X) < HAY_W / 2 + 10) {
                const side = it.body.position.x < HAY_X ? -1 : 1;
                MSleep().set(it.body, false);
                MB().setVelocity(it.body, { x: side * 7, y: -4 });
                MB().setAngularVelocity(it.body, side * 0.12);
                it.settleT = 0;
            }
        }

        // Speech bubble follows his head
        if (this.bubble.visible) {
            this.bubbleTimer -= delta;
            // above his cap or hat, or above the pumpkin on his head
            const feet = GROUND - a.laneY, held = a.carrying && a.carrying.state === 'carried' ? a.carrying : null;
            const over = Math.max(HEAD_TOP + 14 + (a.farming ? 6 : 0),
                held ? (feet - held.img.y) / a.depthScale + (held.bh - 4) / 2 + 8 : 0);
            const headY = feet - over * a.depthScale;
            const ts = this.textScale;
            const r = this.bubbleRoot;
            r.setScale(ts);
            // The bubble hangs off his head on the side away from the stack and never enters the
            // column where pumpkins sway and land, so it can't hide the drop.
            const bw = this.bubbleBg.width * ts;
            const sx = this.stack.x;
            const keep = (this.hovering ? this.hoverAmp + this.hovering.bw / 2 : 150) + 24;
            const side = a.x < sx ? -1 : 1;
            let cx = a.x + side * (bw / 2 - 28 * ts);
            cx = side < 0 ? Math.min(cx, sx - keep - bw / 2) : Math.max(cx, sx + keep + bw / 2);
            r.x = Phaser.Math.Clamp(cx, PLAY_L + bw / 2, PLAY_R - bw / 2);
            r.y = headY;
            this.bubbleTail.x = Phaser.Math.Clamp((a.x - r.x) / ts, -this.bubbleBg.width / 2 + 16, this.bubbleBg.width / 2 - 16);
            if (this.bubbleTimer <= 0) this.bubble.setVisible(false);
        }

        // A tap made while Ansel was busy runs as soon as he's free
        if (this.pending && !a.busy && !a.goal && !this.hovering) {
            const p = this.pending;
            this.pending = null;
            this.handleTap(p.wx, p.wy);
        }

        if (this.started) this.idleT += dt;
        this.updateHint(time);
        this.eggsUpdate(dt, time); // surprises
        this.updateHoppah(dt);
        this.updateScenery(dt);
        this.updatePatch(dt);
        this.updateGigi(dt);
        this.updateCamera(dt);
    }

    // A dropped pumpkin landed and stayed on (it is already in the stack): count it, score it.
    lockIntoTower(it, stack) {
        stack = stack || this.stack;
        const n = stack.items.length;
        const top = stack.top();
        const height = Math.round(GROUND - top.y);
        const sup = stack.items[n - 2] || null;
        this.placed += 1;
        if (n > this.tallest) this.tallestTower = this.snapTower(stack);
        this.tallest = Math.max(this.tallest, n);
        this.ui.setCount(n);

        // perfect drops sparkle, and a run of them climbs in pitch (like Stack)
        const grade = it.grade || 'ok';
        if (grade === 'perfect') {
            this.streak += 1;
            this.sparkles.explode(10 + Math.min(10, this.streak * 2), it.rx, it.topY);
            this.time.delayedCall(140, () => Sfx.perfect(this.streak));
            if (TIMING.combos.includes(this.streak)) {
                this.time.delayedCall(420, () => {
                    Sfx.fanfare();
                    this.ui.banner(this.streak + ' IN A ROW! x' + Rules.combo(this.streak));
                    this.sparkles.explode(30, it.body ? it.body.position.x : stack.x, top.y);
                });
            }
        } else {
            this.streak = 0;
            if (grade === 'good') {
                this.sparkles.explode(4, it.rx, it.topY);
                this.time.delayedCall(120, () => Sfx.good());
            }
        }
        if (it.golden) this.sparkles.explode(16, it.rx, it.ry);
        // points ride on the tower until BOOM banks them: by grade, more higher up, x2/x3/x4 for
        // perfect streaks, x3 for golden, plus a bonus for landing on something at least as heavy
        // (big at the bottom, small on top)
        const pts = Rules.score(grade, Rules.stageAt(n - 1), this.streak,
            Rules.ordered(sup ? pieceOf(sup) : null, pieceOf(it)), it.golden, pieceOf(it).m);
        // one popup over the pumpkin: its points
        const num = this.add.text(it.rx, it.topY - 20, '+' + pts, {
            fontFamily: FONT, fontSize: '40px', color: '#ffd35a',
            stroke: INK, strokeThickness: 12,
        }).setOrigin(0.5, 1).setDepth(62).setScale(0.4 * this.textScale);
        this.tweens.add({ targets: num, scale: this.textScale, duration: 220, ease: 'Back.Out' });
        this.tweens.add({ targets: num, y: num.y - 90, alpha: 0, delay: 500, duration: 700, onComplete: () => num.destroy() });
        this.ui.setStreak(this.streak);
        it.perfect = false;
        it.grade = null;

        it.pts = pts;
        // a short run of perfect drops wins a pumpkin life
        if (grade === 'perfect' && this.streak % RULES.lifeStreak === 0) this.earnLife(1, it.rx, it.topY, 500);
        // so does topping each big height for the first time this round
        for (const h of RULES.lifeHeights) {
            if (height >= h && !this.lifeHeights.has(h)) { this.lifeHeights.add(h); this.earnLife(1, it.rx, it.topY, 900); }
        }
        if (stack.stageIdx > Rules.stageAt(n - 1)) this.onStage(stack.stageIdx);

        if (stack.items.length > this.best.count || height > this.best.height) {
            this.best.count = Math.max(this.best.count, stack.items.length);
            this.best.height = Math.max(this.best.height, height);
            saveBest(this.best);
            this.ui.setBest(this.best.count);
        }
        for (const m of MILESTONES) {
            if (height >= m.h && !this.reached.has(m.h)) {
                this.reached.add(m.h);
                this.celebrate(m);
                break;
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // CHALLENGE ROUND: honest landings, tower balance and sway, wind, tipping,
    // BOOM banking, lives, the sunset clock, round over and retry.
    // The numbers live in the <rules> block; per-tower state lives in Stack.
    // ═════════════════════════════════════════════════════════════════════════
    initChallenge() {
        this.wind = new Wind();
        this.windV = 0;
        this.windDir = 1;
        this.tipGroups = [];
        this.dropping = null;
        this.roundOver = false;
        this.hoverDrift = 0;
        this.firstRound = false;
        this.handDone = loadFlag('hinted');
        this.placed = 0; this.score = 0; this.lives = RULES.lives; this.tallest = 0; this.dayT = 0;
        this.lifeHeights = new Set();
        // leaves streaming across the view with the wind: they start ~1.4 s before a gust hits
        const view = () => this.cameras.main.worldView;
        this.windLeaves = this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7],
            x: { onEmit: () => { const v = view(); return this.windDir > 0 ? v.x - 30 : v.right + 30; } },
            y: { onEmit: () => { const v = view(); return v.y + Math.random() * v.height * 0.9; } },
            speedX: { onEmit: () => this.windDir * (420 + Math.random() * 380) * (0.6 + Math.abs(this.windV)) / this.camZoom },
            speedY: { min: -50, max: 70 },
            lifespan: 3800,
            rotate: { start: 0, end: 720 },
            scale: { min: 0.9, max: 1.4 },
            frequency: 90,
            emitting: false,
        }).setDepth(33);

        // ── Windsock: on a wooden pole planted behind the fence beside the bale, where you
        // can see it while aiming. It streams, droops and flaps with the real wind. ──
        this.windsock = this.add.sprite(WINDSOCK_X, WINDSOCK_Y, 'windsock', 0)
            .setOrigin(WINDSOCK_POLE, 1).setDepth(2);
    }

    updateWindsock() {
        const ph = this.wind.phase, s = Math.abs(this.windV);
        const lvl = ph === 'warn' ? Math.max(1, s < 0.3 ? 1 : 2) : s < 0.06 ? 0 : s < 0.3 ? 1 : s < 0.6 ? 2 : 3;
        const flap = lvl > 0 && Math.floor(this.time.now / (lvl === 3 ? 90 : 150)) % 2 === 1;
        const left = (ph === 'warn' ? this.wind.dir : this.windV) < 0;
        this.windsock.setFrame(lvl * 2 + (flap ? 1 : 0)).setFlipX(left)
            .setOrigin(left ? 1 - WINDSOCK_POLE : WINDSOCK_POLE, 1);
    }

    startRound() {
        this.roundOver = false;
        // the assisted pumpkins only ever come in a player's very first round
        this.firstRound = !loadFlag('played');
        saveFlag('played');
        this.placed = 0; this.score = 0; this.lives = RULES.lives; this.tallest = 0; this.dayT = 0;
        this.tallestTower = null;
        this.streak = 0; this.gusts = 0; this.duskSaid = false;
        this.reached.clear();
        this.lifeHeights = new Set();
        this.wind.reset();
        this.windV = 0;
        for (const st of this.stacks) {
            st.sway.x = 0; st.sway.v = 0; st.tip.tipT = 0; st.danger = 0;
        }
        if (this.ui && this.ui.ready) this.ui.newRound();
        if (this.ui && this.ui.htpRoundStarted) this.ui.htpRoundStarted(); // how to play
    }

    // Tap-to-retry from the end card: a fresh patch and empty bales.
    resetRound() {
        const a = this.ansel;
        if (a.busy) { this.time.delayedCall(150, () => this.resetRound()); return; }
        this.hovering = null;
        this.dropping = null;
        this.tipGroups = [];
        this.ghost.setVisible(false);
        for (const it of this.items) {
            this.tweens.killTweensOf(it.img);
            this.removeBody(it);
            it.img.destroy();
            it.shadow.destroy();
        }
        this.items = [];
        for (const st of this.stacks) st.items = [];
        a.carrying = null;
        a.goal = null;
        this.pending = null;
        this.setPose('run');
        for (const pile of this.piles) {
            pile.hidden = this.makeItem(pile.hides, pile.x, GROUND - 40);
            pile.hidden.state = 'hidden';
            pile.hidden.img.setVisible(false);
        }
        LAYOUT.forEach(s => {
            const it = this.makeItem(s.key, s.x, GROUND - 60);
            this.addBody(it, s.x, GROUND - it.bh / 2 - 2, 0);
            it.state = 'ground';
        });
        this.resetPatch();
        this.tweens.killTweensOf(a);
        a.laneY = 0; a.depthScale = 1; a.walkingLane = false; a.jumpY = 0;
        a.img.setDepth(20); a.shadow.setDepth(9);
        this.startRound();
        this.tapGuard = this.time.now + 300;
        this.time.delayedCall(300, () => this.say('PUMPKINS!', 1500));
    }

    // The round ends when three pumpkins have fallen ('lives', or 'topple' if a stack came down),
    // or at sunset ('dusk'). Towers still standing are banked (without the BOOM bonus).
    endRound(reason) {
        if (this.roundOver) return;
        this.roundOver = true;
        const a = this.ansel;
        this.pending = null;
        a.goal = null;
        this.hand.setVisible(false);
        if (this.hovering) {
            const it = this.hovering;
            this.hovering = null;
            this.ghost.setVisible(false);
            this.looseDrop(it);
        }
        // Every round ends in a BOOM: whatever is still standing is banked with the full height
        // bonus, so there's never a reason to cash in just before sunset. (Pumpkins that already
        // fell took their points with them.)
        const booms = this.stacks.filter(st => st.items.length > 0)
            .map(st => ({ st, pts: Math.round(st.unbanked * Rules.boomMult(st.items.length)) }));
        const finalBoom = booms.reduce((sum, b) => sum + b.pts, 0);
        this.score += finalBoom;
        const newBest = this.score > (this.best.score || 0);
        if (newBest) { this.best.score = this.score; saveBest(this.best); }
        if (reason === 'dusk') this.ui.banner('SUNSET!');
        const wait = booms.length ? 700 : 0;
        if (booms.length) {
            this.time.delayedCall(wait, () => {
                this.ui.setScore(this.score);
                this.ui.banner('BOOM! +' + finalBoom);
                this.say('BOOM!', 900, true);
                if (!a.carrying) {
                    a.busy = true;
                    this.anselBoomFace();
                    this.time.delayedCall(1000, () => { a.busy = false; });
                }
                for (const b of booms) {
                    const top = b.st.top();
                    this.popText(b.st.x, top.y - 30, '+' + b.pts, '#ffd35a', 44);
                    this.sparkles.explode(40, b.st.x, top.y);
                    this.blowUp(b.st);
                }
                this.time.delayedCall(250, () => Sfx.fanfare());
            });
        } else this.ui.setScore(this.score);
        this.time.delayedCall(wait + 1100, () => {
            if (!a.busy && !a.carrying) this.setPose(reason === 'dusk' ? 'cheer' : 'dizzy');
            this.say(reason === 'dusk' ? 'NIGHT NIGHT!' : 'UH OH!', 1600);
            if (reason !== 'dusk') Sfx.lose();
            else if (!booms.length) Sfx.fanfare();
        });
        this.time.delayedCall(wait + 2300, () => this.ui.showEnd({
            reason, tallest: this.tallest, score: this.score, best: this.best.score, newBest,
            finalBoom, tower: this.tallestTower,
        }));
    }

    // A picture of a tower for the end card: each pumpkin's sprite and where it sat on the bale.
    snapTower(stack) {
        return stack.items.map(it => ({
            key: it.img.texture.key, oy: it.img.originY, angle: it.img.angle,
            dx: it.img.x - stack.x, dy: it.img.y - HAY_TOP,
        }));
    }

    loseLives(n) {
        if (this.roundOver) return;
        this.lives = Math.max(0, this.lives - n);
        this.ui.setLives(this.lives, true);
        if (this.lives <= 0) this.endRound(n > 1 ? 'topple' : 'lives');
    }

    // Earn pumpkin lives (up to RULES.maxLives): a little pumpkin flies from (wx, wy) in the world
    // into the life row, with a chime. Earned for a short perfect streak, a tall BOOM, a big
    // height the first time in a round, and harvesting a golden pumpkin.
    earnLife(n, wx, wy, delay = 0) {
        if (this.roundOver || !this.started) return;
        const k = Math.max(0, Math.min(n, RULES.maxLives - this.lives));
        if (!k) return;
        this.lives += k;
        const cam = this.cameras.main, v = cam.worldView;
        const sx = (wx - v.x) * cam.zoom, sy = (wy - v.y) * cam.zoom;
        for (let i = 0; i < k; i++) this.time.delayedCall(delay + i * 260, () => this.ui.flyLife(sx, sy));
    }

    canBoom(stack) {
        stack = stack || this.stack;
        return this.started && !this.roundOver && stack.items.length >= RULES.boomMin;
    }

    // BOOM: bank the tower's points x the height bonus, then knock it all down.
    boom(stack) {
        stack = stack || this.stack;
        if (!this.canBoom(stack)) return false;
        const n = stack.items.length;
        const pts = Math.round(stack.unbanked * Rules.boomMult(n));
        this.score += pts;
        this.ui.setScore(this.score);
        this.ui.banner('BOOM! +' + pts);
        this.popText(stack.x, stack.top().y - 30, '+' + pts, '#ffd35a', 44);
        this.sparkles.explode(40, stack.x, stack.top().y);
        // banking a tall tower wins pumpkin lives
        this.earnLife(Rules.boomLives(n), stack.x, stack.top().y, 600);
        this.time.delayedCall(250, () => Sfx.fanfare());
        this.blowUp(stack);
        return true;
    }

    // The BOOM sign on the hay bale: pops up when a tower can be banked, shows what it would bank,
    // and the bale gives a little shimmy now and then (faster when the tower is in danger).
    updateBaleSign(dt, avail, danger, value) {
        const sign = this.baleSign;
        const v = value ? '+' + value : '';
        if (v !== this.baleSignValue.text) this.baleSignValue.setText(v);
        const H = this.signSize.h;
        this.baleSignTitle.setY(v ? H / 2 - 12 : H / 2);
        // keep the words readable when the camera pulls back for a tall tower
        this.baleSignInner.setScale(Phaser.Math.Clamp(0.9 / (this.camZoom || 1), 1, 1.3));
        if (avail !== this.baleSignOn) {
            this.baleSignOn = avail;
            this.tweens.killTweensOf(sign);
            if (avail) {
                sign.setVisible(true).setScale(1).setAngle(0).setAlpha(0);
                this.tweens.add({ targets: sign, alpha: 1, duration: 400, ease: 'Sine.Out' });
                this.baleSwayT = 2;
            } else {
                sign.setVisible(false);
            }
        }
        if (!avail) return;
        this.baleSwayT = (this.baleSwayT ?? 2) - dt * (1 + (danger || 0));
        if (this.baleSwayT <= 0) {
            this.baleSwayT = 6;
            this.tweens.add({ targets: sign, angle: { from: -1.5, to: 1.5 }, duration: 700, yoyo: true, ease: 'Sine.InOut',
                onComplete: () => sign.setAngle(0) });
        }
    }

    // Tapping the bale or its sign: Ansel runs over and shoves it (BOOM).
    hitBale(wx, wy) {
        return this.baleSignOn && Math.abs(wx - HAY_X) < HAY_W / 2 + 30 && wy > HAY_TOP - 20 && wy < GROUND + 20;
    }

    // The sign itself (it can be larger than the bale when the camera has pulled back).
    hitSign(wx, wy) {
        if (!this.baleSignOn) return false;
        const k = this.baleSignInner.scaleX, s = this.signSize;
        return Math.abs(wx - this.baleSign.x) < (s.w * k) / 2 + 12 &&
            wy > this.baleSign.y - 12 && wy < this.baleSign.y + s.h * k + 12;
    }

    // Hold B to BOOM. A single press, a stray key or key auto-repeat never sets it off: B has
    // to be held for BOOM_HOLD seconds while the sign fills, and released before it can go again.
    updateBoomHold(dt) {
        const down = this.keys.B && this.keys.B.isDown;
        if (!down) { this.boomLatch = false; this.boomHold = 0; }
        else if (!this.boomLatch && this.canBoom(this.stack)) {
            this.boomHold += dt;
            if (this.boomHold >= BOOM_HOLD) {
                this.boomLatch = true;
                this.boomHold = 0;
                this.boomPress();
            }
        } else this.boomHold = 0;
        const on = this.boomHold > 0;
        this.boomFillBg.setVisible(on);
        this.boomFill.setVisible(on).setScale(Math.min(1, this.boomHold / BOOM_HOLD), 1);
    }

    // Keyboard B: Ansel cheers BOOM from wherever he is.
    boomPress() {
        if (!this.boom()) return;
        const a = this.ansel;
        this.say('BOOM!', 900);
        if (!a.busy && !a.carrying) {
            a.busy = true;
            this.anselBoomFace();
            this.time.delayedCall(650, () => { a.busy = false; this.setPose('run'); });
        }
    }

    // The tower goes flying (no lives lost: it was on purpose) and the pumpkins land in the patch.
    blowUp(stack) {
        Sfx.boom();
        this.burst.explode(40, stack.x, stack.topY);
        const dirAway = this.ansel.x < stack.x ? 1 : -1;
        for (const it of stack.items) {
            MB().setStatic(it.body, false);
            MSleep().set(it.body, false);
            const k = (GROUND - it.body.position.y) / 200;
            MB().setVelocity(it.body, { x: dirAway * (6 + Math.random() * 7) + (Math.random() - 0.5) * 8,
                                        y: -6 - Math.random() * 7 - k });
            MB().setAngularVelocity(it.body, (Math.random() - 0.5) * 0.3);
            it.state = 'spent'; // banked: it fades away once it lands, it doesn't go back on the path
            it.blown = true;
            it.airT = 0;
            it.pts = 0;
            it.rock = null;
        }
        stack.items = [];
        stack.tip.tipT = 0;
        stack.sway.v += dirAway * 30;
        this.reached.clear();
        this.streak = 0;
        this.ui.setStreak(0);
        this.ui.setCount(0);
    }

    onStage(si) {
        this.ui.banner(STAGES[si].name + '!');
        Sfx.wind(0.35, 1.4);
        // the first gust of a new stage comes soon, so you feel it
        if (this.wind.phase === 'calm') this.wind.t = Math.max(this.wind.t, this.wind.wait - 2.5);
    }

    // Sway width when a pumpkin is tossed up (called from placeOnTower).
    hoverStart(it) {
        this.hoverOff = undefined;
        this.hoverDrift = 0;
        return STAGES[this.stack.stageIdx].amp;
    }

    hoverSpeed(it) {
        return Rules.hoverSpeed(STAGES[this.stack.stageIdx], pieceOf(it));
    }

    // Help with the first pumpkins only in a player's very first round.
    assisted() { return this.firstRound && this.placed < RULES.assisted; }

    // What a drop now would do, for a pumpkin `off` px from the top's centre: { grade, kind, d }.
    // It also drifts downwind as it falls, so you aim upwind.
    planDrop(it, off) {
        const stack = this.stack, pc = pieceOf(it);
        return Rules.aim(stack.pieces(), stack.base, pc, off + Rules.fallDrift(this.windV, pc),
            STAGES[stack.stageIdx], this.assisted(), this.windV);
    }

    // Landing marker: a plain ring where the pumpkin would land, wind drift included. It doesn't
    // say whether it will stay: judging weight, order and lean is the player's job.
    showRing(it, top, plan, time) {
        this.ghost.setVisible(true)
            .setPosition(top.x + plan.d, top.y + 6)
            .setScale(it.bw / 128, 1)
            .setTint(0xffffff)
            .setAlpha(0.75);
    }

    updateChallenge(dt, time) {
        this.updateClock(dt);
        this.updateWind(dt);
        this.updateDrop(dt);
        for (const st of this.stacks) this.updateTower(st, dt);
        this.updateTipping(dt);
        this.updateWindsock();
        if (this.ui && this.ui.ready) {
            const st = this.stack;
            this.updateBaleSign(dt, this.canBoom(st), st.danger, Math.round(st.unbanked * Rules.boomMult(st.items.length)));
            this.updateBoomHold(dt);
            this.ui.setDusk(Math.min(1, this.dayT / RULES.day));
        }
    }

    // Afternoon to sunset: the round's clock. Gusts (scenery) get stronger toward dusk.
    updateClock(dt) {
        if (!this.started || this.roundOver) return;
        this.dayT += dt;
        const left = RULES.day - this.dayT;
        if (left <= 30 && !this.duskSaid) {
            this.duskSaid = true;
            this.ui.banner('SUNSET SOON!');
        }
        if (left <= 0) this.endRound('dusk');
    }

    updateWind(dt) {
        const live = this.started && !this.roundOver;
        const before = this.wind.phase;
        if (live) {
            let si = 0;
            for (const st of this.stacks) si = Math.max(si, st.stageIdx);
            this.windV = this.wind.update(dt, Rules.windStage(si, this.dayT / RULES.day));
        } else {
            this.windV *= Math.pow(0.1, dt);
        }
        const ph = this.wind.phase;
        if (live && ph !== before) {
            if (ph === 'warn') {
                // telegraph: a rising whoosh and leaves, ~1.4 s before it hits
                Sfx.wind(0.3 * this.wind.peak, RULES.warn + 0.5);
                if (!this.bubble.visible && (this.gusts === 0 || Math.random() < 0.3)) this.say('WINDY!', 900);
                this.gusts += 1;
            } else if (ph === 'gust') {
                Sfx.wind(this.wind.peak, this.wind.len + 0.4);
            }
        }
        const s = Math.abs(this.windV);
        if (live && (s > 0.03 || ph === 'warn')) {
            this.windDir = ph === 'calm' ? Math.sign(this.windV) || 1 : this.wind.dir;
            this.windLeaves.setFrequency(ph === 'warn' ? 70 : Math.max(16, 110 - 150 * s));
            if (!this.windLeaves.emitting) this.windLeaves.start();
        } else if (this.windLeaves.emitting) {
            this.windLeaves.stop();
        }
    }

    // The dropped pumpkin falls onto the top of the stack, sliding to where it lands.
    updateDrop(dt) {
        const D = this.dropping;
        if (!D) return;
        const it = D.it, top = D.stack.top();
        const landY = top.y - it.bh / 2;
        D.vy += 2600 * dt;
        it.img.y = Math.min(landY, it.img.y + D.vy * dt);
        const k = Phaser.Math.Clamp((it.img.y - D.y0) / Math.max(1, landY - D.y0), 0, 1);
        it.img.x = Phaser.Math.Linear(D.x0, top.x + D.plan.d, 1 - (1 - k) * (1 - k));
        it.img.angle = D.a0 * (1 - k);
        if (it.img.y >= landY) {
            this.dropping = null;
            this.landDrop(it, D.plan, D.stack);
        }
    }

    // It touched down: the rules decide whether it stays, and whether it (or the stack) goes over.
    landDrop(it, plan, stack) {
        const top = stack.top(), sup = top.it;
        if (this.roundOver) { this.looseDrop(it); return; }
        const safe = this.assisted();
        const opts = safe ? { roll: false, topple: false } : { roll: true, topple: true };
        const res = Rules.land(stack.pieces(), stack.base, pieceOf(it), plan.d, this.windV, opts, Math.random);
        this.placeStatic(stack, it, res.x, top.y);
        this.landFx(stack, it, sup, res);
        if (res.fall === 'none') { this.lockIntoTower(it, stack); return; }
        this.startTip(stack, res.at, res.peak >= 0 ? 1 : -1, res.analysis.per[res.at]);
    }

    // Put a pumpkin on a stack as a static body whose bottom sits on bottomY.
    placeStatic(stack, it, x, bottomY) {
        this.removeBody(it);
        this.addBody(it, x, bottomY - it.bh / 2, 0);
        const b = it.body;
        MB().setStatic(b, true);
        MB().setPosition(b, { x, y: b.position.y + (bottomY - b.bounds.max.y) });
        it.rx = x;
        it.ry = b.position.y;
        it.topY = b.bounds.min.y;
        it.state = 'tower';
        it.fromDrop = false;
        it.rock = null;
        it.pts = 0;
        it.shadow.setVisible(false);
        it.img.setPosition(x, it.ry).setAngle(0);
        stack.items.push(it);
    }

    // Thud by weight, squash the one below (more if this one is heavier), rock and sway.
    landFx(stack, it, sup, res) {
        const m = pieceOf(it).m;
        const ratio = sup ? m / pieceOf(sup).m : 0.3;
        Sfx.thunk(it.bw / 4, 2 + m * 1.6);
        this.dust.explode(Math.min(12, 3 + Math.round(m * 2)), it.rx, it.ry + it.bh / 2);
        this.tweens.add({ targets: it.img, scaleX: 1.16, scaleY: 0.86, duration: 100, yoyo: true, ease: 'Quad.Out' });
        if (sup) {
            const sq = Math.min(0.24, 0.05 * ratio);
            this.tweens.add({ targets: sup.img, scaleX: 1 + sq * 0.8, scaleY: 1 - sq, duration: 90 + 20 * Math.min(ratio, 4), yoyo: true, ease: 'Quad.Out' });
            if (ratio > 1.5) this.cameras.main.shake(100, Math.min(0.0025, 0.0008 * ratio));
        }
        const dir = res.x >= (sup ? sup.rx : stack.x) ? 1 : -1;
        const height = stack.balance ? stack.balance.height : 0;
        it.rock = { amp: dir * Math.min(0.3, 0.04 + res.kick * 0.3), t: 0 };
        Rules.swayKick(stack.sway, dir, Math.max(0.04, res.kick), height);
        if (res.kick > 0.3 || Math.abs(res.peak) > 0.7) this.time.delayedCall(90, () => Sfx.creak(m));
    }

    // Each frame: balance (with the wind), the springy sway (with a little extra give in a gust),
    // trembling when it's close, and tipping once it has been past its tipping point.
    updateTower(stack, dt) {
        const P = stack.pieces();
        const r = stack.balance = Rules.analyze(P, stack.base, this.windV);
        Rules.swayStep(stack.sway, dt, Rules.swayTarget(r.lean, r.height, P.length ? this.windV : 0));
        const danger = !P.length || this.roundOver ? 0 : Phaser.Math.Clamp((Math.abs(r.lean) - 0.7) / 0.3, 0, 1);
        stack.danger = danger;
        const H = Math.max(1, r.height);
        for (const it of stack.items) {
            const h = stack.topY - it.ry;
            const f = Math.pow(Phaser.Math.Clamp(h / H, 0, 1), 1.3);
            let dx = stack.sway.x * f;
            if (danger) dx += (Math.random() - 0.5) * 5 * danger * f;
            let ang = 1.3 * stack.sway.x * f / Math.max(60, h);
            if (it.rock) {
                it.rock.t += dt;
                const k = Math.exp(-it.rock.t * 3.2);
                ang += it.rock.amp * k * Math.sin(it.rock.t * 15);
                if (k < 0.02) it.rock = null;
            }
            MB().setPosition(it.body, { x: it.rx + dx, y: it.ry });
            MB().setAngle(it.body, ang);
        }
        if (danger > 0) {
            stack.creakT -= dt;
            if (stack.creakT <= 0) {
                Sfx.creak(P[P.length - 1].m);
                stack.creakT = 1.1 - 0.5 * danger;
            }
            if (!stack.wobblySaid && danger > 0.4) {
                stack.wobblySaid = true;
                if (!this.ansel.busy) this.say('WOBBLY!', 900);
            }
        } else {
            stack.creakT = 0;
            stack.wobblySaid = false;
        }
        if (!this.roundOver && P.length && Rules.tipStep(stack.tip, r.lean, dt)) {
            this.startTip(stack, r.at, r.lean >= 0 ? 1 : -1, r.per[r.at]);
        }
    }

    // Joint `at` gave way: everything from there up teeters over the edge for a moment, then
    // goes fully physical and tumbles into the patch (where it can be picked up again).
    // Its unbanked points are lost, and each pumpkin that falls costs a life.
    startTip(stack, at, dir, joint) {
        const pieces = stack.items.splice(at);
        if (!pieces.length) return;
        stack.tip.tipT = 0;
        const sway0 = pieces[0].body.position.x - pieces[0].rx;
        const G = { pieces, dir, t: 0, dur: 0.3, px: (dir > 0 ? joint.hi : joint.lo) + sway0, py: stack.topY - joint.y };
        let lost = 0;
        for (const p of pieces) {
            lost += p.pts || 0;
            p.pts = 0;
            p.state = 'tipping';
            p.rock = null;
            p.tip0 = { x: p.body.position.x, y: p.body.position.y, a: p.body.angle };
        }
        this.tipGroups.push(G);
        this.streak = 0;
        this.ui.setStreak(0);
        if (stack === this.stack) this.ui.setCount(stack.items.length);
        if (lost) this.popText(G.px, G.py - 40, '-' + lost, '#ff6a50', 34);
        if (pieces.length === 1) {
            Sfx.uhoh();
            this.say('UH OH!', 900);
        } else {
            Sfx.creak(pieceOf(pieces[0]).m);
            this.time.delayedCall(220, () => { Sfx.crash(); this.cameras.main.shake(160, 0.003); });
            this.burst.explode(16, G.px, G.py);
            this.say('OH NO!', 1100);
        }
        this.loseLives(pieces.length);
    }

    updateTipping(dt) {
        for (let g = this.tipGroups.length - 1; g >= 0; g--) {
            const G = this.tipGroups[g];
            G.t += dt;
            const k = Math.min(1, G.t / G.dur);
            const th = G.dir * 0.32 * k * k;
            const c = Math.cos(th), s = Math.sin(th);
            for (const p of G.pieces) {
                if (!p.body) continue;
                const rx = p.tip0.x - G.px, ry = p.tip0.y - G.py;
                MB().setPosition(p.body, { x: G.px + rx * c - ry * s, y: G.py + rx * s + ry * c });
                MB().setAngle(p.body, p.tip0.a + th);
            }
            if (k >= 1) {
                this.tipGroups.splice(g, 1);
                this.releaseTip(G);
            }
        }
    }

    releaseTip(G) {
        const w = G.dir * 2 * 0.32 / G.dur; // rad/s at the end of the teeter
        for (const p of G.pieces) {
            if (!p.body) continue;
            MB().setStatic(p.body, false);
            MSleep().set(p.body, false);
            const rx = p.body.position.x - G.px, ry = p.body.position.y - G.py;
            // carry on rotating about the pivot (Matter velocities are per 60 Hz step)
            MB().setVelocity(p.body, { x: (-w * ry) / 60 + G.dir * 0.8, y: (w * rx) / 60 });
            MB().setAngularVelocity(p.body, w / 60);
            p.state = 'falling';
            p.fromDrop = false;
            p.airT = 0;
            p.settleT = 0;
        }
    }

    // A banked pumpkin leaves quietly: no more body, a slow fade, then it's gone.
    fadeSpent(it) {
        this.removeBody(it);
        it.shadow.setVisible(false);
        it.state = 'gone';
        this.tweens.add({ targets: it.img, alpha: 0, duration: 900, ease: 'Sine.In', onComplete: () => {
            it.img.destroy();
            it.shadow.destroy();
            const i = this.items.indexOf(it);
            if (i >= 0) this.items.splice(i, 1);
        } });
    }

    // Let a pumpkin that was in the air fall as an ordinary physics body.
    looseDrop(it) {
        this.addBody(it, it.img.x, it.img.y, Phaser.Math.DegToRad(it.img.angle));
        it.state = 'falling';
        it.fromDrop = false;
    }

    popText(x, y, text, color, size) {
        const t = this.add.text(x, y, text, {
            fontFamily: FONT, fontSize: size + 'px', color, stroke: INK, strokeThickness: 8,
        }).setOrigin(0.5, 1).setDepth(62).setScale(0.9 * this.textScale).setAlpha(0);
        this.tweens.add({ targets: t, scale: this.textScale, alpha: 1, duration: 260, ease: 'Sine.Out' });
        this.tweens.add({ targets: t, y: y - 80 * this.textScale, alpha: 0, delay: 650, duration: 650, onComplete: () => t.destroy() });
    }
    // ── end CHALLENGE ROUND ──────────────────────────────────────────────────

    celebrate(m) {
        Sfx.fanfare();
        this.ui.banner(m.text);
        const top = this.towerTop();
        this.burst.explode(30, top.x, top.y);
        this.time.delayedCall(900, () => {
            const a = this.ansel;
            if (!a.busy && !a.carrying) {
                this.setPose('cheer');
                this.tweens.add({ targets: a, jumpY: 30, duration: 150, ease: 'Quad.Out', yoyo: true, repeat: 1,
                    onComplete: () => { a.jumpY = 0; } });
                this.time.delayedCall(700, () => { if (!a.busy) this.setPose('run'); });
            }
            this.say('YAY!', 900);
        });
        if (m.gigi) this.callGigi();
    }

    callGigi() {
        if (this.gigiState) return;
        // Gigi runs in from whichever side of the screen Ansel isn't on, and stops on screen.
        const v = this.cameras.main.worldView;
        const fromLeft = this.ansel.x > v.centerX;
        const stopX = fromLeft ? v.x + v.width * 0.16 : v.right - v.width * 0.16;
        this.gigiState = { phase: 'in', t: 0, frame: 0, dir: fromLeft ? 1 : -1,
            stopX: Phaser.Math.Clamp(stopX, PLAY_L + 100, PLAY_R - 100) };
        this.gigi.setVisible(true).setScale(GIGI.scale).setFlipX(!fromLeft).setAlpha(0).setY(GIGI.y);
        this.gigi.x = fromLeft ? v.x - 80 : v.right + 80;
        this.tweens.add({ targets: this.gigi, alpha: 1, duration: 500 });
    }

    updateGigi(dt) {
        const g = this.gigiState;
        if (!g) return;
        g.t += dt;
        const run = () => {
            g.frameT = (g.frameT || 0) + dt;
            if (g.frameT > 0.11) { g.frameT = 0; g.frame = (g.frame + 1) % 8; }
            this.gigi.setTexture('gigi_' + (g.frame + 1));
        };
        if (g.phase === 'in') {
            run();
            this.gigi.x += g.dir * GIGI.speed * dt;
            if ((g.dir > 0 && this.gigi.x >= g.stopX) || (g.dir < 0 && this.gigi.x <= g.stopX)) {
                g.phase = 'cheer'; g.t = 0; g.frame = 0;
                this.gigi.setTexture('gigi_1');
                const headY = GIGI.y - this.gigi.displayHeight * (1 - 37 / 496);
                this.gigiSay = this.add.text(this.gigi.x, headY - 30, 'WOW, ANSEL!', {
                    fontFamily: FONT, fontSize: '22px', color: '#fff6e0', stroke: INK, strokeThickness: 7,
                }).setOrigin(0.5).setDepth(61).setScale(this.textScale);
                this.tweens.add({ targets: this.gigiSay, y: headY - 46, duration: 400, yoyo: true, repeat: 3 });
            }
        } else if (g.phase === 'cheer') {
            this.gigi.y = GIGI.y - Math.abs(Math.sin(g.t * 7)) * 12;
            if (g.t > 2.8) {
                g.phase = 'out'; g.t = 0;
                this.gigi.y = GIGI.y;
                this.gigi.setFlipX(g.dir > 0);
                g.dir = -g.dir;
                if (this.gigiSay) { this.gigiSay.destroy(); this.gigiSay = null; }
            }
        } else if (g.phase === 'out') {
            run();
            this.gigi.x += g.dir * GIGI.speed * dt;
            const v = this.cameras.main.worldView;
            if (this.gigi.x < v.x - 150 || this.gigi.x > v.right + 150) {
                this.gigi.setVisible(false);
                this.gigiState = null;
            }
        }
    }

    // Picture hint, no words: a little hand taps the nearest pumpkin, once ever, for a player's
    // very first pumpkin (remembered per device). Never during a hover or a drop.
    updateHint(time) {
        const a = this.ansel;
        let target = null;
        if (!this.handDone && this.started && (a.carrying || this.hovering || this.dropping || this.tower.length)) {
            this.handDone = true;
            saveFlag('hinted');
        }
        const midDrop = this.hovering || this.dropping || a.carrying;
        if (this.started && !this.roundOver && !this.handDone && !midDrop && !a.busy) {
            let best = null, bd = 1e9;
            for (const it of this.items) {
                if (!it.body || it.state === 'tower' || it.state === 'hidden' || it.state === 'spent') continue;
                const d = Math.abs(it.body.position.x - a.x);
                if (d > 70 && d < bd) { bd = d; best = it; }
            }
            if (best) target = { x: best.body.position.x, y: best.body.position.y };
            else {
                const ripe = this.spots.filter(sp => sp.stage >= 2 && !sp.busy && sp.img)
                    .sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
                if (ripe) target = { x: ripe.x, y: ripe.img.y - ripe.img.displayHeight * 0.4 };
            }
        }
        if (!midDrop && !this.roundOver) target = this.eggHint(target); // surprises: now and then the hand shows one
        if (target) {
            // press-and-lift tapping motion, fingertip on the target
            const ph = (time % 1100) / 1100;
            const press = ph < 0.18 ? 1 : 0;
            const hs = Math.max(1, this.textScale * 0.9);
            this.hand.setVisible(true)
                .setPosition(target.x + 6, target.y + 4 + (press ? 0 : (22 + Math.sin(ph * Math.PI * 2) * 6) * hs))
                .setScale((press ? 0.92 : 1) * hs);
            if (press && !this.hand.pressed) this.poof.explode(3, target.x, target.y);
            this.hand.pressed = press;
        } else {
            this.hand.setVisible(false);
        }
    }

    // Normal zoom is 1 in both orientations: on a phone held upright the view is a tall
    // slice of the patch with big, tappable characters and lots of sky for the tower.
    baseZoom() {
        const w = this.scale.width, h = this.scale.height;
        const minZoom = Math.max(w / WORLD_W, h / WORLD_FLOOR);
        return Math.max(minZoom, 1);
    }

    // The camera frames the ground (Ansel, the pumpkins, the bale and its BOOM sign) and shows as
    // much of the tower as fits. Only while a pumpkin is swaying or falling does it climb to the
    // top of a tower too tall to fit, then it comes back down, so nothing playable is ever stranded
    // off-screen. The ground sits a little above the bottom edge (more on a tall phone).
    updateCamera(dt) {
        const cam = this.cameras.main;
        const a = this.ansel;
        const w = this.scale.width, h = this.scale.height;
        const portrait = h > w;
        const minZoom = Math.max(w / WORLD_W, h / WORLD_FLOOR); // never show past the world's edges
        const groundAt = portrait ? 0.83 : 0.9;                 // where the path sits, as a share of the screen height
        const top = this.towerTop();
        const aiming = !!(this.hovering || this.dropping);
        let focusTop = top.y;
        if (this.hovering) focusTop = Math.min(focusTop, this.hovering.img.y - this.hovering.bh);
        focusTop -= portrait ? 330 : 240; // headroom so the top of the stack sits below the HUD and banner
        // zoom that fits everything from the tower top down to the ground (at groundAt)
        const fitZoom = groundAt * h / Math.max(1, GROUND - focusTop);
        const zoomT = Phaser.Math.Clamp(fitZoom, minZoom, this.baseZoom());
        this.camZoom = Phaser.Math.Linear(this.camZoom, zoomT, 1 - Math.pow(0.02, dt));
        this.textScale = (portrait ? 1.35 : 1) / this.camZoom;
        const visH = h / this.camZoom, visW = w / this.camZoom;
        // ground framing: the path at groundAt of the screen
        let cy = GROUND + (1 - groundAt) * visH - visH / 2;
        // still too tall to fit: only while aiming, follow the top instead
        if (aiming && GROUND - focusTop > groundAt * visH) cy = focusTop + visH / 2;
        let cx;
        if (this.hovering || (a.carrying && Math.abs(a.x - HAY_X) < 400)) {
            cx = (a.x + HAY_X) / 2;
        } else {
            // follow Ansel, leaning toward the bale so the tower doesn't jump in and out of view,
            // but never so far that Ansel leaves the screen
            cx = Phaser.Math.Linear(a.x, HAY_X, 0.35);
            const slack = Math.max(0, visW / 2 - 110);
            cx = Phaser.Math.Clamp(cx, a.x - slack, a.x + slack);
        }
        this.camX = Phaser.Math.Linear(this.camX, cx, 1 - Math.pow(0.05, dt));
        this.camY = Phaser.Math.Linear(this.camY, cy, 1 - Math.pow(aiming ? 0.03 : 0.05, dt));
        cam.setZoom(this.camZoom);
        cam.centerOn(this.camX, this.camY);
        const v = cam.worldView;
        this.ambient.setPosition(-200, v.y - 40);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// UI overlay scene (own camera, so it never zooms with the world)
// ═════════════════════════════════════════════════════════════════════════════
class UIScene extends Phaser.Scene {
    constructor() { super('ui'); }

    create() {
        this.patch = this.scene.get('patch');
        this.eggUiCreate(); // surprises: sticker badge and tray

        // Count panel (with a row of stars for the perfect-drop streak)
        this.panel = this.add.nineslice(20, 20, 'panel', null, 230, 132, 20, 20, 20, 20).setOrigin(0, 0);
        this.add.image(48, 48, 'icon_pumpkin').setOrigin(0, 0);
        this.countText = this.add.text(112, 40, '0', {
            fontFamily: FONT, fontSize: '30px', color: '#fff6e0', stroke: INK, strokeThickness: 6,
        });
        this.bestText = this.add.text(112, 92, 'BEST ' + this.patch.best.count, {
            fontFamily: FONT, fontSize: '12px', color: '#ffe3a6', stroke: INK, strokeThickness: 4,
        }).setOrigin(0, 0.5);
        this.stars = [];
        for (let i = 0; i < 5; i++) {
            this.stars.push(this.add.image(52 + i * 30, 124, 'sparkle').setScale(0.85).setAlpha(0.25).setTint(0x9a8b7a));
        }
        this.streakText = this.add.text(204, 124, '', {
            fontFamily: FONT, fontSize: '12px', color: '#ffd35a', stroke: INK, strokeThickness: 4,
        }).setOrigin(0, 0.5);

        // Sound button
        this.soundBtn = this.add.nineslice(0, 20, 'panel', null, 92, 84, 20, 20, 20, 20).setOrigin(1, 0);
        this.soundIcon = this.add.image(0, 62, Sfx.muted ? 'sound_off' : 'sound_on').setOrigin(0.5);
        this.createPause();

        // Milestone banner
        this.bannerText = this.add.text(0, 0, '', {
            fontFamily: FONT, fontSize: '40px', color: '#ffd35a', stroke: INK, strokeThickness: 10,
            align: 'center',
        }).setOrigin(0.5).setAlpha(0);

        // Title card
        this.title = this.add.container(0, 0);
        const T = this.t = {};
        T.shade = this.add.rectangle(0, 0, 10, 10, 0x1b130d, 0.78).setOrigin(0);
        T.t1 = this.add.text(0, 0, "ANSEL'S", {
            fontFamily: FONT, fontSize: '34px', color: '#fff6e0', stroke: INK, strokeThickness: 10,
        }).setOrigin(0.5);
        T.t2 = this.add.text(0, 0, 'PUMPKIN PATCH', {
            fontFamily: FONT, fontSize: '54px', color: '#ff9a3a', stroke: INK, strokeThickness: 12, align: 'center',
        }).setOrigin(0.5);
        T.hero = this.add.image(0, 0, 'ansel:everyday/' + ANSEL_POSES.hero).setOrigin(0.5, 1);
        T.p1 = this.add.image(0, 0, 'pumpkin_deep_xl').setOrigin(0.5, 1);
        T.p2 = this.add.image(0, 0, 'pumpkin_orange_l').setOrigin(0.5, 1);
        T.p3 = this.add.image(0, 0, 'pumpkin_white_m').setOrigin(0.5, 1);
        T.how = this.add.text(0, 0, this.howLine(), {
            fontFamily: FONT, fontSize: '20px', color: '#ffe3a6', stroke: INK, strokeThickness: 6, align: 'center',
            lineSpacing: 12,
        }).setOrigin(0.5);
        T.go = this.add.text(0, 0, DESKTOP ? 'CLICK OR PRESS SPACE' : 'TAP TO PLAY', {
            fontFamily: FONT, fontSize: '30px', color: '#fff6e0', stroke: INK, strokeThickness: 8,
        }).setOrigin(0.5);
        this.tweens.add({ targets: T.go, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
        this.tweens.add({ targets: [T.p1, T.p2, T.p3], angle: { from: -2, to: 2 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.title.add([T.shade, T.t1, T.t2, T.hero, T.p1, T.p2, T.p3, T.how, T.go]);
        this.title.setDepth(100);

        this.createChallengeUI();
        this.htpCreate(); // how to play: the card, the title's extras, pause menu buttons

        this.layout(this.scale.width, this.scale.height);
        this.scale.on('resize', size => {
            this.cameras.main.setSize(size.width, size.height);
            this.layout(size.width, size.height);
        });

        this.input.on('pointerdown', p => {
            if (this.htpTap(p)) return; // how to play
            if (this.hitButton(p)) { this.toggleSound(); return; }
            if (this.hitPause(p)) { this.setPaused(!this.paused); return; }
            if (this.paused) { this.setPaused(false); return; }
            if (!this.patch.started) { this.startGame(); return; }
            if (this.endShown) this.retry();
        });
        // M, P and Esc live here so they still work while the patch is paused
        this.input.keyboard.on('keydown', e => {
            if (this.htpKey(e)) return; // how to play
            if (e.code === 'KeyM') this.toggleSound();
            else if (e.code === 'KeyP' || e.code === 'Escape') this.setPaused(!this.paused);
            else if (this.paused && (e.code === 'Space' || e.code === 'Enter')) this.setPaused(false);
        });
        this.game.events.on(Phaser.Core.Events.HIDDEN, () => this.setPaused(true));
        this.ready = true;
    }

    // Place the HUD and title for the current screen shape (landscape or portrait).
    layout(w, h) {
        const portrait = h > w;
        this.soundBtn.setPosition(w - 20, 20);
        this.soundIcon.setPosition(w - 66, 62);
        this.pauseBtn.setPosition(w - 124, 20);
        this.pauseIcon.setPosition(w - 170, 62);
        const P = this.pauseUi;
        P.shade.setSize(w, h);
        P.title.setPosition(w / 2, h / 2 - 40);
        P.go.setPosition(w / 2, h / 2 + 50).setWordWrapWidth(w - 60);
        this.bannerText.setPosition(w / 2, portrait ? 250 : 200)
            .setFontSize(portrait ? 30 : 40)
            .setWordWrapWidth(w - 60);
        const T = this.t;
        T.shade.setSize(w, h);
        const titleY = portrait ? h * 0.16 : 120;
        T.t1.setPosition(w / 2, titleY);
        T.t2.setPosition(w / 2, titleY + (portrait ? 90 : 70))
            .setFontSize(portrait ? 46 : Math.min(54, Math.floor((w - 60) / 13))) // one line, even when narrow
            .setWordWrapWidth(w - 40);
        if (portrait) T.t2.setText('PUMPKIN\nPATCH').setLineSpacing(14);
        else T.t2.setText('PUMPKIN PATCH');
        // stacked from the bottom so nothing collides on any screen shape: the prompt, then the hint
        // (however many lines it wraps to), then Ansel and the title pumpkins standing above it
        T.go.setPosition(w / 2, portrait ? h - 80 : h - 44);
        T.how.setWordWrapWidth(w - 60);
        T.how.setPosition(w / 2, T.go.y - 30 - T.how.height / 2);
        const groundY = Math.min(portrait ? h * 0.74 : 560, T.how.y - T.how.height / 2 - 14);
        // Ansel and the title pumpkins shrink to fit between the BEST line and the hint
        if (T.heroBase === undefined) T.heroBase = T.hero.scaleX;
        const roomTop = T.t2.getBounds().bottom + 52;
        const k = Phaser.Math.Clamp((groundY - roomTop) / 290, 0.45, 1), kx = Math.max(k, 0.8);
        T.hero.setScale(T.heroBase * k).setPosition(w / 2 - (portrait ? 140 : 150) * kx, groundY);
        const px = w / 2 + (portrait ? 130 : 120) * kx;
        T.p1.setScale(k).setPosition(px, groundY);
        T.p2.setScale(k).setPosition(px + 2 * k, groundY - 90 * k);
        T.p3.setScale(k).setPosition(px, groundY - 168 * k);
        this.tweens.killTweensOf(T.hero);
        this.tweens.add({ targets: T.hero, y: groundY - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        if (portrait) this.bannerText.setWordWrapWidth(w - 320); // clear of the BOOM button
        this.layoutChallenge(w, h, portrait);
    }

    setStreak(n) {
        this.stars.forEach((s, i) => {
            const on = i < Math.min(n, 5);
            s.setAlpha(on ? 1 : 0.25).setTint(on ? 0xffffff : 0x9a8b7a);
            if (on && i === Math.min(n, 5) - 1) {
                this.tweens.add({ targets: s, scale: 1.4, duration: 120, yoyo: true });
            }
        });
        this.streakText.setText(n > 5 ? 'x' + n : '');
    }

    startGame() {
        if (this.patch.started) return;
        if (this.htpGate()) return; // how to play
        this.pauseBtn.setVisible(true);
        this.pauseIcon.setVisible(true);
        this.tweens.add({ targets: this.title, alpha: 0, duration: 300, onComplete: () => this.title.setVisible(false) });
        this.patch.begin();
    }

    hitButton(p) {
        return p.x > this.scale.width - 120 && p.y < 115;
    }

    hitPause(p) {
        const w = this.scale.width;
        return this.pauseBtn.visible && p.x > w - 224 && p.x <= w - 120 && p.y < 115;
    }

    // Chunky pixel icons drawn from tiny grids: o = ink outline, # = cream, 4 screen px per art pixel.
    pixelIcon(key, rows) {
        if (this.textures.exists(key)) return;
        const S = 4, W = rows[0].length, H = rows.length;
        const tex = this.textures.createCanvas(key, W * S, H * S), c = tex.context;
        rows.forEach((row, y) => [...row].forEach((ch, x) => {
            if (ch === '.') return;
            c.fillStyle = ch === 'o' ? INK : '#fff6e0';
            c.fillRect(x * S, y * S, S, S);
        }));
        tex.refresh();
    }

    createPause() {
        this.pixelIcon('icon_pause', [
            'ooooo.ooooo', 'o###o.o###o', 'o###o.o###o', 'o###o.o###o', 'o###o.o###o',
            'o###o.o###o', 'o###o.o###o', 'o###o.o###o', 'ooooo.ooooo',
        ]);
        this.pixelIcon('icon_play', [
            'oo.......', 'o#oo.....', 'o###oo...', 'o#####oo.', 'o#######o',
            'o#####oo.', 'o###oo...', 'o#oo.....', 'oo.......',
        ]);
        this.pauseBtn = this.add.nineslice(0, 20, 'panel', null, 92, 84, 20, 20, 20, 20).setOrigin(1, 0).setVisible(false);
        this.pauseIcon = this.add.image(0, 62, 'icon_pause').setOrigin(0.5).setVisible(false);
        const P = this.pauseUi = {};
        P.root = this.add.container(0, 0).setDepth(115).setVisible(false);
        P.shade = this.add.rectangle(0, 0, 10, 10, 0x1b130d, 0.72).setOrigin(0);
        P.title = this.add.text(0, 0, 'PAUSED', {
            fontFamily: FONT, fontSize: '48px', color: '#ff9a3a', stroke: INK, strokeThickness: 12,
        }).setOrigin(0.5);
        P.go = this.add.text(0, 0, DESKTOP ? 'CLICK OR PRESS P TO PLAY' : 'TAP TO PLAY', {
            fontFamily: FONT, fontSize: '24px', color: '#fff6e0', stroke: INK, strokeThickness: 8, align: 'center',
        }).setOrigin(0.5);
        P.root.add([P.shade, P.title, P.go]);
        this.paused = false;
    }

    // Only a round in progress can pause. The patch scene (physics, tweens, the sunset clock)
    // freezes and the audio is suspended.
    setPaused(on) {
        const patch = this.patch;
        if (on === this.paused) return;
        if (on && (!patch.started || patch.roundOver || this.endShown)) return;
        this.paused = on;
        if (on) { this.scene.pause('patch'); Sfx.suspend(); }
        else {
            this.scene.resume('patch');
            Sfx.resume();
            patch.resumedAt = window.performance.now(); // the key or tap that resumed is not a game input
            patch.tapGuard = patch.time.now + 200;
        }
        this.pauseUi.root.setVisible(on);
        this.pauseIcon.setTexture(on ? 'icon_play' : 'icon_pause');
    }

    toggleSound() {
        Sfx.setMuted(!Sfx.muted);
        this.soundIcon.setTexture(Sfx.muted ? 'sound_off' : 'sound_on');
    }

    setCount(n) {
        this.countText.setText(String(n));
        this.tweens.add({ targets: this.countText, scale: 1.35, duration: 110, yoyo: true });
    }

    setBest(n) {
        this.bestCount = n;
        this.bestText.setText('BEST ' + (this.patch.best.score || 0));
    }

    // Banners queue up so a stage name, a milestone and a combo don't overwrite each other.
    banner(text) {
        const now = this.time.now, at = Math.max(now, this.bannerFree || 0);
        this.bannerFree = at + 1400;
        if (at > now) this.time.delayedCall(at - now, () => this.showBanner(text));
        else this.showBanner(text);
    }

    showBanner(text) {
        this.bannerText.setText(text).setAlpha(0).setScale(0.94);
        this.tweens.killTweensOf(this.bannerText);
        this.tweens.add({ targets: this.bannerText, alpha: 1, scale: 1, duration: 420, ease: 'Sine.Out' });
        this.tweens.add({ targets: this.bannerText, alpha: 0, duration: 500, delay: 2200 });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // CHALLENGE HUD: score and what's riding on the tower, lives, sunset clock,
    // and the end card.
    // ═════════════════════════════════════════════════════════════════════════
    createChallengeUI() {
        const txt = (size, color, stroke) => ({ fontFamily: FONT, fontSize: size + 'px', color, stroke: INK, strokeThickness: stroke });
        this.bestCount = this.patch.best.count;

        // dusk: the whole view warms then dims toward sunset (multiplied over the world, under the HUD)
        this.sky = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setDepth(-10)
            .setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);

        // count panel extras: banked score and the pumpkin lives (3 to start, up to RULES.maxLives)
        this.scoreText = this.add.text(112, 96, '', txt(22, '#ffd35a', 7)).setOrigin(0, 0.5);
        this.lifeIcons = Array.from({ length: RULES.maxLives }, (_, i) => this.add.image(58 + i * 46, 148, 'icon_pumpkin').setScale(LIFE_SCALE));
        this.lifeShown = RULES.lives;


        // end card
        const E = this.end = {};
        E.root = this.add.container(0, 0).setDepth(120).setVisible(false);
        E.shade = this.add.rectangle(0, 0, 10, 10, 0x1b130d, 0.72).setOrigin(0);
        E.panel = this.add.nineslice(0, 0, 'panel', null, 560, 480, 20, 20, 20, 20);
        // big panels tile the sign's planks instead of stretching its grain
        const ptex = this.textures.get('panel');
        if (!ptex.has('planks')) ptex.add('planks', 0, 12, 8, 48, 48);
        E.wood = this.add.tileSprite(0, 0, 500, 420, 'panel', 'planks');
        E.title = this.add.text(0, 0, '', txt(40, '#ff9a3a', 10)).setOrigin(0.5);
        E.hero = this.add.image(0, 0, 'ansel:everyday/dizzy').setOrigin(0.5, 1);
        E.rows = this.add.text(0, 0, '', Object.assign(txt(24, '#fff6e0', 7), { lineSpacing: 18 })).setOrigin(0, 0.5);
        E.best = this.add.text(0, 0, 'NEW BEST!', txt(22, '#ffd35a', 8)).setOrigin(0.5);
        E.go = this.add.text(0, 0, DESKTOP ? 'SPACE TO PLAY AGAIN' : 'TAP TO PLAY AGAIN', txt(24, '#fff6e0', 8)).setOrigin(0.5);
        E.tower = this.add.container(0, 0); // the round's tallest tower, on a little hay bale
        E.root.add([E.shade, E.panel, E.wood, E.title, E.tower, E.hero, E.rows, E.best, E.go]);
        this.tweens.add({ targets: E.go, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
        this.tweens.add({ targets: E.best, scale: 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.endSparkles = calmFx(this.add.particles(0, 0, 'sparkle', {
            lifespan: { min: 600, max: 1000 }, speed: { min: 50, max: 160 }, angle: { min: 0, max: 360 },
            scale: { start: 1.3, end: 0 }, rotate: { start: 0, end: 90 }, emitting: false,
        })).setDepth(125);
        this.endShown = false;
        this.endReady = false;

        this.applyHud();
    }

    layoutChallenge(w, h, portrait) {
        this.sky.setSize(w, h);
        // end card
        const E = this.end, cxm = w / 2, cym = h / 2;
        E.shade.setSize(w, h);
        if (portrait) {
            const pw = Math.min(w - 40, 640), ph = 800;
            E.panel.setSize(pw, ph).setPosition(cxm, cym);
            E.wood.setSize(pw - 24, ph - 24).setPosition(cxm, cym);
            E.title.setPosition(cxm, cym - ph / 2 + 70).setFontSize(44);
            // Ansel stands beside his tallest tower
            E.hero.setPosition(cxm - 130, cym - 20).setScale(0.77);
            E.towerSpot = { x: cxm + 140, y: cym - 20, maxH: 300, maxW: 220 };
            E.rows.setPosition(cxm - 220, cym + 120);
            E.best.setPosition(cxm, cym + 255);
            E.go.setPosition(cxm, cym + ph / 2 - 55);
        } else {
            const pw = Math.min(w - 80, 820), ph = Math.min(h - 60, 520);
            E.panel.setSize(pw, ph).setPosition(cxm, cym);
            E.wood.setSize(pw - 24, ph - 24).setPosition(cxm, cym);
            E.title.setPosition(cxm, cym - ph / 2 + 60).setFontSize(40);
            E.hero.setPosition(cxm - pw / 2 + 120, cym + 130).setScale(0.65);
            E.towerSpot = { x: cxm + pw / 2 - 120, y: cym + 130, maxH: ph - 190, maxW: 190 };
            E.rows.setPosition(cxm - 175, cym - 20);
            E.best.setPosition(cxm, cym + 120);
            E.go.setPosition(cxm, cym + ph / 2 - 50);
        }
        if (this.endShown && this.endTower) this.drawEndTower(this.endTower);
    }

    // The HUD: count, score and three pumpkin lives; streaks show as sparkles and pitch.
    applyHud() {
        this.scoreText.setVisible(true);
        this.bestText.setVisible(false);
        this.stars.forEach(st => st.setVisible(false));
        this.streakText.setVisible(false);
        this.sky.setVisible(true);
        this.fitPanel();
        this.countText.setY(40);
        this.setBest(this.bestCount);
        this.t.how.setText(this.howLine());
    }

    howLine() {
        return DESKTOP
            ? 'CLICK A PUMPKIN · CLICK AGAIN TO DROP IT\nARROWS WALK · SPACE DROP · HOLD B TO BOOM · P PAUSE'
            : "TAP A PUMPKIN · TAP AGAIN TO DROP IT · DON'T LET IT FALL · TAP THE BALE TO BOOM";
    }

    newRound() {
        this.hideEnd();
        this.countText.setText('0');
        this.setScore(0);
        this.lifeFlying = 0;
        this.setLives(RULES.lives, false);
        this.setStreak(0);
    }

    setScore(n) { this.scoreText.setText('SCORE ' + n); this.fitPanel(); }

    // The count panel grows with the score so the number never spills off the sign.
    fitPanel() {
        const w = Math.max(270, 112 + this.scoreText.width + 4);
        if (w !== this.panel.width) this.panel.setSize(w, 176);
        else if (this.panel.height !== 176) this.panel.setSize(w, 176);
    }

    // Shows max(3, lives) slots: filled for each life, dim for lost ones.
    setLives(n, lost) {
        this.lifeShown = n;
        this.lifeIcons.forEach((ic, i) => {
            const on = i < n;
            ic.setVisible(i < Math.max(RULES.lives, n));
            ic.setAlpha(on ? 1 : 0.3).setTint(on ? 0xffffff : 0x5a4a3a);
            if (lost && i === n) {
                this.tweens.add({ targets: ic, scale: LIFE_SCALE * 1.25, duration: 160, yoyo: true, ease: 'Sine.InOut' });
                const tint = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xb03018, 0.14).setOrigin(0).setDepth(80);
                this.tweens.add({ targets: tint, alpha: 0, duration: 380, ease: 'Sine.Out', onComplete: () => tint.destroy() });
            } else if (!lost && on && i === n - 1) {
                this.tweens.add({ targets: ic, scale: LIFE_SCALE * 1.35, duration: 140, yoyo: true });
            }
        });
    }

    // An earned life: a pumpkin flies from (sx, sy) on screen into the next life slot and pops in.
    flyLife(sx, sy) {
        this.lifeFlying = (this.lifeFlying || 0) + 1;
        const slot = this.lifeIcons[Math.min(this.lifeShown + this.lifeFlying - 1, this.lifeIcons.length - 1)];
        const ic = this.add.image(sx, sy, 'icon_pumpkin').setScale(1.1).setDepth(95);
        const tx = slot.x, ty = slot.y, cx = (sx + tx) / 2, cy = Math.min(sy, ty) - 140;
        Sfx.pickup();
        this.tweens.addCounter({
            from: 0, to: 1, duration: 750, ease: 'Sine.InOut',
            onUpdate: tw => {
                const t = tw.getValue(), u = 1 - t;
                ic.setPosition(u * u * sx + 2 * u * t * cx + t * t * tx, u * u * sy + 2 * u * t * cy + t * t * ty)
                    .setScale(1.1 - (1.1 - LIFE_SCALE) * t).setAngle(360 * t);
            },
            onComplete: () => {
                ic.destroy();
                this.lifeFlying = Math.max(0, this.lifeFlying - 1);
                this.setLives(Math.min(this.patch.lives, this.lifeShown + 1), false);
                this.endSparkles.explode(10, tx, ty);
                Sfx.bonus();
            },
        });
    }

    // Afternoon -> golden hour -> dusk: the round's clock is the light. sky stops: [at, colour]
    setDusk(d) {
        if (Math.abs(d - (this.duskShown ?? -1)) < 0.002) return;
        this.duskShown = d;
        const stops = [[0, 0xffffff], [0.5, 0xfff2dc], [0.8, 0xffc898], [1, 0x9c88c4]];
        let i = 0;
        while (i < stops.length - 2 && d > stops[i + 1][0]) i++;
        const [a0, c0] = stops[i], [a1, c1] = stops[i + 1];
        const t = Phaser.Math.Clamp((d - a0) / (a1 - a0), 0, 1);
        const ch = (c, sh) => (c >> sh) & 255;
        const mix = sh => Math.round(ch(c0, sh) + (ch(c1, sh) - ch(c0, sh)) * t);
        this.sky.setFillStyle((mix(16) << 16) | (mix(8) << 8) | mix(0));
    }

    showEnd(info) {
        const E = this.end;
        E.title.setText(info.reason === 'dusk' ? 'SUNSET!' : info.reason === 'topple' ? 'TOWER DOWN!' : 'UH OH!');
        E.hero.setTexture(this.patch.anselKey(info.reason === 'dusk' ? ANSEL_POSES.hero : ANSEL_POSES.dizzy));
        const rows = [];
        if (info.finalBoom) rows.push('LAST BOOM +' + info.finalBoom);
        rows.push('SCORE     ' + info.score, 'TALLEST   ' + info.tallest, 'BEST      ' + info.best);
        E.rows.setText(rows.join('\n'));
        this.endTower = info.tower || null;
        this.drawEndTower(this.endTower);
        E.best.setVisible(info.newBest);
        E.go.setVisible(false);
        this.pauseBtn.setVisible(false);
        this.pauseIcon.setVisible(false);
        E.root.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: E.root, alpha: 1, duration: 300 });
        this.endShown = true;
        this.endReady = false;
        this.setBest(this.bestCount);
        if (info.newBest) {
            this.time.delayedCall(350, () => {
                Sfx.fanfare();
                this.endSparkles.explode(40, E.best.x, E.best.y);
            });
        }
        // a short pause so a tap meant for the game doesn't skip the card
        this.time.delayedCall(900, () => {
            this.endReady = true;
            E.go.setVisible(true);
        });
    }

    // The round's tallest tower, rebuilt from its sprites on a small hay bale and scaled to fit.
    drawEndTower(tower) {
        const E = this.end, C = E.tower, spot = E.towerSpot;
        C.removeAll(true);
        if (!tower || !tower.length || !spot) return;
        const baleH = 96, src = k => this.textures.get(k).getSourceImage();
        let top = 0, half = 84;
        for (const p of tower) {
            const im = src(p.key);
            top = Math.min(top, p.dy - p.oy * im.height);
            half = Math.max(half, Math.abs(p.dx) + im.width / 2);
        }
        const k = Math.min(1, spot.maxH / (baleH - top), spot.maxW / (2 * half));
        C.setPosition(spot.x, spot.y).setScale(k);
        C.add(this.add.image(0, 0, 'haybale').setOrigin(0.5, 1));
        for (const p of tower) {
            C.add(this.add.image(p.dx, p.dy - baleH + 4, p.key).setOrigin(0.5, p.oy).setAngle(p.angle));
        }
    }

    hideEnd() {
        this.end.root.setVisible(false);
        this.endShown = false;
        this.endReady = false;
    }

    retry() {
        if (!this.endShown || !this.endReady) return;
        this.hideEnd();
        this.pauseBtn.setVisible(true);
        this.pauseIcon.setVisible(true);
        this.patch.resetRound();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Logical game size that matches the screen's shape: 720 on the short side.
function viewSize() {
    const el = document.getElementById('game');
    const r = el ? el.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const w = Math.max(1, r.width || window.innerWidth), h = Math.max(1, r.height || window.innerHeight);
    const a = Phaser.Math.Clamp(w / h, 0.42, 2.4);
    return a >= 1 ? { w: Math.round(BASE * a), h: BASE } : { w: BASE, h: Math.round(BASE / a) };
}

function boot() {
    const size = viewSize();
    const game = window.UPPAH_GAME = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game',
        width: size.w,
        height: size.h,
        backgroundColor: '#1b130d',
        // pixel art: nearest-neighbour textures and a crisp canvas when it is stretched to the screen,
        // so zooming the camera or fitting a phone never smears the art
        pixelArt: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        physics: { default: 'matter', matter: { enableSleeping: true, debug: false } },
        input: { activePointers: 3 }, // a resting palm can't block a finger; broad contacts are ignored in onTap
        scene: [PatchScene, UIScene],
    });
    // Rotating the phone (or resizing the window) re-shapes the game instead of letterboxing it.
    let timer = null;
    const refit = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const s = viewSize();
            if (s.w !== game.scale.width || s.h !== game.scale.height) game.scale.setGameSize(s.w, s.h);
            game.scale.refresh();
        }, 120);
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
}

// ═════════════════════════════════════════════════════════════════════════════
// SURPRISES: Humongous-style click points and easter eggs
//
// Nearly everything above the fence does something when tapped:
//   barn doors swing open on a cow or a hen (third tap in a row: a chick parade),
//   an owl hoots in the hayloft, the rooster on the roof crows, the silo spells
//   A-N-S-E-L, its jack-o'-lantern sneezes seeds on the third tap, the sun puts on
//   shades (then giggles, then yawns), clouds puff and drizzle leaves (third tap: a
//   rainbow), the starry sky plays Twinkle Twinkle one note per tap, the moon winks
//   (third tap: the cow jumps over it), the hills send up a flock and echo, fence
//   posts play like a xylophone, and the tree line sometimes hides a squirrel.
//   Tap Hoppah twice (or get lucky) and Ansel scoops him up for a cuddle until he
//   wriggles free. Visitors come and go: robins on the fence, a crow on the silo
//   pumpkin, a hot-air balloon.
// Found without words: a glint now and then on something not found yet, the
// pointing hand shows one when the player has been idle a while, critters fidget,
// and each new find pops out a sticker that flies to a badge under the sound
// button (tap it for the sticker tray; silhouettes hint at the rest).
//
// This section is self-contained and runs before boot() (which waits for the font).
// The rest of the file only has one-line hooks, each marked "surprises".
// Art: make_art.py writes egg_*.png and surprises.json.
// ═════════════════════════════════════════════════════════════════════════════
const EGG_SAVE = 'uppah.pumpkinpatch.surprises';
const EGG_AGAIN = 4000;        // ms: taps closer together than this count as "again!" (3rd one escalates)
const EGG_FLOOR = 1830;        // world y: nothing below the fence-post tops is a surprise (play area)
const EGG_TWINKLE = [0, 0, 7, 7, 9, 9, 7, 5, 5, 4, 4, 2, 2, 0];    // Twinkle Twinkle, one note per tap
const EGG_PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];         // fence-post xylophone
const EGG_NOTE_TINT = [0xffd35a, 0xff9a3a, 0xff7a6a, 0x9ad26a, 0x7fb4f0, 0xc49af0];

function loadFound() {
    try {
        const a = JSON.parse(localStorage.getItem(EGG_SAVE));
        return new Set(Array.isArray(a) ? a : []);
    } catch (e) { return new Set(); }
}
function saveFound(set) {
    try { localStorage.setItem(EGG_SAVE, JSON.stringify([...set])); } catch (e) {}
}

// ── Surprise sounds (same little synth as everything else) ──────────────────
Object.assign(Sfx, {
    found() {
        // a soft "new sticker!" chime
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => this._tone('triangle', f, f, 0.18, 0.08, now + i * 0.06));
    },

    moo() {
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(130, now);
        o.frequency.linearRampToValueAtTime(165, now + 0.25);
        o.frequency.linearRampToValueAtTime(112, now + 0.8);
        f.type = 'lowpass'; f.Q.value = 5;
        f.frequency.setValueAtTime(350, now);
        f.frequency.linearRampToValueAtTime(950, now + 0.3);
        f.frequency.linearRampToValueAtTime(380, now + 0.8);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.42, now + 0.08);
        g.gain.setValueAtTime(0.36, now + 0.55);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(now); o.stop(now + 0.9);
    },

    bawk() {
        // buk-buk-BAWK
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this._tone('square', 720, 520, 0.05, 0.07, now);
        this._tone('square', 720, 520, 0.05, 0.07, now + 0.09);
        this._tone('sawtooth', 640, 1150, 0.07, 0.09, now + 0.2);
        this._tone('sawtooth', 1150, 700, 0.17, 0.09, now + 0.27);
    },

    peep(i = 0) {
        if (!this.ctx) return;
        const f = 2100 + (i % 4) * 170;
        this._tone('sine', f, f * 1.25, 0.07, 0.09);
    },

    hoot() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [[0, 0.22], [0.32, 0.42]].forEach(([t, d]) => {
            this._tone('sine', 430, 360, d, 0.22, now + t);
            this._tone('sine', 860, 720, d, 0.03, now + t);
        });
    },

    whooo() {
        // owl turning its head right round: "whoo?"
        if (!this.ctx) return;
        this._tone('sine', 300, 560, 0.5, 0.16);
    },

    rooster() {
        // cock-a-doodle-doo
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [[0, 520, 700, 0.1], [0.13, 640, 620, 0.08], [0.25, 700, 880, 0.12], [0.42, 900, 600, 0.45]].forEach(([t, a, b, d]) => {
            this._tone('sawtooth', a, b, d, 0.07, now + t);
            this._tone('square', a * 2, b * 2, d, 0.025, now + t);
        });
    },

    caw() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [0, 0.24].forEach(t => {
            this._tone('sawtooth', 520, 360, 0.16, 0.11, now + t);
            this._noise(0.12, 'bandpass', 1400, 2, 0.08, now + t);
        });
    },

    creak() {
        // barn door hinges
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(170, now);
        o.frequency.linearRampToValueAtTime(260, now + 0.3);
        lfo.frequency.value = 38; lg.gain.value = 55;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.06, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        o.connect(g); g.connect(this.master);
        o.start(now); lfo.start(now); o.stop(now + 0.36); lfo.stop(now + 0.36);
    },

    sneeze() {
        // ah... ah... CHOO!
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this._tone('triangle', 400, 520, 0.22, 0.15, now);
        this._tone('triangle', 480, 640, 0.25, 0.17, now + 0.3);
        this._noise(0.28, 'bandpass', 2600, 0.8, 0.5, now + 0.62);
        this._tone('square', 900, 300, 0.12, 0.1, now + 0.62);
    },

    slide() {
        // slide whistle down, then a ding: sunglasses on
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        this._tone('sine', 1500, 500, 0.32, 0.18, now);
        this._tone('triangle', 1975, 1975, 0.4, 0.1, now + 0.34);
    },

    yawn() {
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(330, now);
        o.frequency.linearRampToValueAtTime(390, now + 0.3);
        o.frequency.exponentialRampToValueAtTime(160, now + 1.0);
        f.type = 'bandpass'; f.Q.value = 5;
        f.frequency.setValueAtTime(500, now);
        f.frequency.linearRampToValueAtTime(1100, now + 0.35);
        f.frequency.linearRampToValueAtTime(400, now + 1);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.4, now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(now); o.stop(now + 1.1);
    },

    twinkle(semi) {
        // glockenspiel note, semitones above C5
        if (!this.ctx) return;
        const f = 523.25 * Math.pow(2, semi / 12), now = this.ctx.currentTime;
        this._tone('sine', f, f, 0.5, 0.2, now);
        this._tone('sine', f * 4, f * 4, 0.12, 0.035, now);
    },

    whoosh() {
        // shooting star
        if (!this.ctx) return;
        const c = this.ctx, now = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(3500, now);
        f.frequency.exponentialRampToValueAtTime(600, now + 0.6);
        const g = c.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.18, now + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(now); src.stop(now + 0.7);
    },

    puff() {
        if (!this.ctx) return;
        this._noise(0.25, 'lowpass', 700, 0.7, 0.25);
        this._tone('sine', 220, 330, 0.15, 0.1);
    },

    tweet(i = 0) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime, b = 2600 + (i % 3) * 300;
        this._tone('sine', b, b * 1.4, 0.06, 0.08, now);
        this._tone('sine', b * 1.1, b * 1.5, 0.06, 0.07, now + 0.08);
    },

    chitter() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 6; i++) this._tone('square', 1800 + (i % 2) * 400, 1500, 0.03, 0.05, now + i * 0.045);
    },

    marimba(semi) {
        // wooden fence-post note, semitones above middle C
        if (!this.ctx) return;
        const f = 261.63 * Math.pow(2, semi / 12), now = this.ctx.currentTime;
        this._tone('triangle', f, f, 0.3, 0.26, now);
        this._tone('sine', f * 4, f * 4, 0.06, 0.05, now);
    },

    fwoosh() {
        // hot-air balloon burner
        if (!this.ctx) return;
        this._noise(0.5, 'lowpass', 900, 1.2, 0.35);
        this._noise(0.4, 'bandpass', 300, 1, 0.2);
    },

    echo() {
        // "hoo-hoo!" bouncing back off the hills
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [1, 0.45, 0.2].forEach((v, i) => {
            const t = now + i * 0.42;
            this._tone('triangle', 660, 620, 0.14, 0.2 * v, t);
            this._tone('triangle', 520, 500, 0.2, 0.2 * v, t + 0.16);
        });
    },

    rainbow() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => {
            const f = 392 * Math.pow(2, s / 12);
            this._tone('triangle', f, f, 0.25, 0.08, now + i * 0.05);
        });
    },

    bonk() {
        // an acorn hits the ground
        if (!this.ctx) return;
        this._tone('square', 900, 500, 0.05, 0.07);
    },

    diddle() {
        // "hey diddle diddle" as the cow jumps over the moon
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [[0, 7], [0.15, 9], [0.3, 7], [0.45, 4], [0.6, 12]].forEach(([t, s]) => {
            const f = 392 * Math.pow(2, s / 12);
            this._tone('square', f, f, 0.13, 0.06, now + t);
        });
    },
});

// What each sticker says when it's tapped in the tray
const EGG_VOICE = {
    cow: () => Sfx.moo(), hen: () => Sfx.bawk(), owl: () => Sfx.hoot(), rooster: () => Sfx.rooster(),
    sign: () => Sfx.marimba(12), jack: () => Sfx.giggle(), crow: () => Sfx.caw(), sun: () => Sfx.slide(),
    moon: () => Sfx.twinkle(12), stars: () => Sfx.twinkle(7), cloud: () => Sfx.puff(), flock: () => Sfx.echo(),
    fence: () => Sfx.marimba(7), bird: () => Sfx.tweet(0), squirrel: () => Sfx.chitter(), balloon: () => Sfx.fwoosh(),
    giraffe: () => Sfx.hum(), hoppah: () => Sfx.boing(),
};

// ── PatchScene side: the world ──────────────────────────────────────────────
const PatchEggs = {
    eggsPreload() {
        this.load.json('surprises', ART + 'surprises.json');
        // the clouds are listed in the json, so queue them once it arrives
        this.load.once('filecomplete-json-surprises', (key, type, J) => {
            (J && J.clouds || []).forEach(c => this.load.image(c.key, ART + c.key + '.png'));
        });
        ['egg_cow', 'egg_hen', 'egg_chick', 'egg_owl', 'egg_owl_eyes', 'egg_rooster', 'egg_crow', 'egg_bird',
            'egg_flock', 'egg_squirrel', 'egg_acorn', 'egg_seed', 'egg_note', 'egg_balloon', 'egg_cow_jump',
            'egg_rainbow', 'egg_shooting_star', 'egg_sun_rays', 'egg_shades', 'egg_sun', 'egg_moon',
            'egg_door_l', 'egg_door_r', 'egg_barn_dark', 'egg_letters', 'egg_post', 'egg_stickers',
        ].forEach(k => this.load.image(k, ART + k + '.png'));
    },

    // Strips are loaded as plain images; cut them into numbered frames (sizes from the json).
    eggFrames(J) {
        for (const [key, [fw, fh]] of Object.entries(J.frames)) {
            if (!this.textures.exists(key)) continue;
            const tex = this.textures.get(key);
            if (tex.has(0)) continue;
            const n = Math.max(1, Math.round(tex.source[0].width / fw));
            for (let i = 0; i < n; i++) tex.add(i, 0, i * fw, 0, fw, fh);
        }
        const st = this.textures.get('egg_stickers'), px = J.stickerPx;
        if (!st.has('s0')) {
            J.stickers.forEach((id, i) => {
                st.add('s' + i, 0, i * px, 0, px, px);     // found
                st.add('g' + i, 0, i * px, px, px, px);    // not yet: a dim silhouette
            });
        }
    },

    eggsCreate() {
        this.found = loadFound();
        const J = this.eggJ = this.cache.json.get('surprises') || null;
        if (!J) return;
        this.eggFrames(J);
        this.eggState = {};
        this.eggTimers = {};
        const B = J.barn;

        // Barn: dark inside, two door leaves (copies of the painted ones), and whoever lives there
        this.eggBarnDark = this.add.image(B.dark[0], B.dark[1], 'egg_barn_dark').setOrigin(0, 0).setDepth(0.2);
        this.eggDoorL = this.add.image(B.doorL[0], B.doorL[1], 'egg_door_l').setOrigin(0, 0).setDepth(0.4);
        this.eggDoorR = this.add.image(B.doorR[0], B.doorR[1], 'egg_door_r').setOrigin(1, 0).setDepth(0.4);
        this.eggPal = this.add.sprite(B.floor[0], B.floor[1], 'egg_cow', 0).setOrigin(0.5, 1).setDepth(0.3).setVisible(false);
        this.eggChicks = [0, 1, 2].map(() => this.add.sprite(0, 0, 'egg_chick', 0).setOrigin(0.5, 1).setDepth(2.5).setVisible(false));
        this.eggBarnS = { open: false, closeAt: 0, visits: 0 };

        // Hayloft owl, and its eyes glinting in the dark now and then
        this.eggOwlImg = this.add.sprite(B.loft[0], B.loft[1], 'egg_owl', 0).setOrigin(0.5, 1).setDepth(0.3).setVisible(false);
        this.eggOwlEyes = this.add.image(B.loft[0], B.loft[1] - 14, 'egg_owl_eyes').setDepth(0.31).setAlpha(0);
        this.eggOwlEyesT = Phaser.Math.FloatBetween(5, 9);

        // Rooster perched on the roof's left eave, looking out over the patch
        this.eggRoo = this.add.sprite(J.rooster[0], J.rooster[1], 'egg_rooster', 0).setOrigin(0.5, 1).setDepth(0.5).setFlipX(true);
        this.eggRoo.homeY = J.rooster[1];
        this.eggRooT = 3;

        // Silo letters (copies that hop out of the sign), and pumpkin seeds for the sneeze
        this.eggLetters = J.letters.map((L, i) => {
            const s = this.add.sprite(L.x, L.y, 'egg_letters', i).setDepth(0.5).setVisible(false);
            s.homeY = L.y;
            return s;
        });
        this.eggSeeds = calmFx(this.add.particles(0, 0, 'egg_seed', {
            lifespan: { min: 700, max: 1200 }, speedX: { min: -220, max: 220 }, speedY: { min: -220, max: 20 },
            gravityY: 700, rotate: { start: 0, end: 360 }, scale: { min: 0.7, max: 0.95 }, emitting: false,
        })).setDepth(1.2);

        // Sky: faces for the sun and moon, the clouds (copies, shown only while they puff), a rainbow
        this.eggRays = this.add.sprite(J.sun[0], J.sun[1], 'egg_sun_rays', 0).setDepth(0.11).setAlpha(0);
        this.eggSunImg = this.add.sprite(J.sun[0], J.sun[1], 'egg_sun', 0).setDepth(0.12).setVisible(false);
        this.eggShades = this.add.image(J.shades[0], J.shades[1], 'egg_shades').setDepth(0.13).setVisible(false);
        this.eggMoonImg = this.add.sprite(J.moon[0], J.moon[1], 'egg_moon', 0).setDepth(0.12).setVisible(false);
        this.eggClouds = J.clouds.filter(c => this.textures.exists(c.key))
            .map(c => ({ ...c, n: 0, last: -1e9, img: this.add.image(c.x, c.y, c.key).setDepth(0.14).setVisible(false) }));
        this.eggRainbow = this.add.image(0, 0, 'egg_rainbow').setOrigin(0.5, 0.1).setDepth(0.13).setAlpha(0);

        // Visitors that come and go on their own
        this.eggCrow = { img: this.add.sprite(0, 0, 'egg_crow', 0).setOrigin(0.5, 1).setDepth(1.1).setVisible(false),
            state: 'away', t: Phaser.Math.FloatBetween(25, 45), idle: 2 };
        this.eggBirds = [];
        this.eggBirdT = Phaser.Math.FloatBetween(8, 16);
        this.eggBalloon = { img: this.add.sprite(0, 0, 'egg_balloon', 0).setDepth(0.6).setVisible(false),
            state: 'away', t: Phaser.Math.FloatBetween(40, 65), x: 0, baseY: 0, lift: 0, dir: 1, speed: 40 };
        this.eggSquirrel = this.add.sprite(0, 0, 'egg_squirrel', 0).setOrigin(0.5, 1).setDepth(0.5).setVisible(false);
        this.eggPosts = [];

        // A quiet glint that shows where something hasn't been found yet
        this.eggGlint = this.add.image(0, 0, 'sparkle').setDepth(4).setAlpha(0);
        this.eggGlintT = 6;

        const anim = (key, tex, frames, rate) => {
            if (!this.anims.exists(key)) {
                this.anims.create({ key, frames: frames.map(f => ({ key: tex, frame: f })), frameRate: rate, repeat: -1 });
            }
        };
        anim('egg_flock_flap', 'egg_flock', [0, 1], 9);
        anim('egg_bird_fly', 'egg_bird', [2, 3], 12);
        anim('egg_crow_fly', 'egg_crow', [2, 3], 8);
    },

    // ── Tapping ─────────────────────────────────────────────────────────────
    // Called from handleTap() after the hovering drop and the bunny, so gameplay keeps
    // priority. Returns true if a surprise took the tap.
    eggTap(wx, wy) {
        if (!this.eggJ || wy > EGG_FLOOR) return false;
        if (this.pumpkinAt(wx, wy)) return false;                 // pumpkins first, even mid-air
        if (this.tower.length >= 2) {                              // so does the tower (knock it down)
            const top = this.towerTop();
            if (Math.abs(wx - HAY_X) < 140 && wy > top.y - 60) return false;
        }
        const r = this.eggReact(wx, wy);
        if (!r) return false;
        if (r.id) this.eggFound(r.id, r.x ?? wx, r.y ?? wy);
        if (!r.handled) return false;                              // the classic reaction (tapScenery) runs
        if (!this.anyLoose()) this.more();                         // "tap anywhere for MORE!" still works
        return true;
    },

    // Work out what was tapped and react. Returns { id: sticker, handled } or null.
    eggReact(wx, wy) {
        const J = this.eggJ;
        const near = (x, y, rx, ry) => Math.abs(wx - x) < rx && Math.abs(wy - y) < ry;
        const dist = (x, y) => Phaser.Math.Distance.Between(wx, wy, x, y);

        // visitors first: they're in front of the scenery
        const bl = this.eggBalloon;
        if (bl.state === 'drift' && near(bl.img.x, bl.img.y, 56, 74)) { this.eggBalloonTap(); return { id: 'balloon', handled: true }; }
        const cr = this.eggCrow;
        if ((cr.state === 'in' || cr.state === 'perched') && near(cr.img.x, cr.img.y - 20, 46, 36)) {
            this.eggCrowTap(); return { id: 'crow', handled: true };
        }
        for (const b of this.eggBirds) {
            if ((b.state === 'in' || b.state === 'sit') && near(b.img.x, b.img.y - 14, 38, 32)) {
                this.eggBirdTap(b); return { id: 'bird', handled: true };
            }
        }
        const sq = this.eggSquirrel;
        if (sq.visible && near(sq.x, sq.y - 30, 46, 46)) { this.eggChitter(); return { id: 'squirrel', handled: true }; }

        // the giraffe walks in front of the barn and trees (its own reaction lives in tapScenery)
        if (this.eggGiraffeAt(wx, wy)) return { id: 'giraffe', handled: false };

        // silo: the jack-o'-lantern on top (third tap in a row: it sneezes), ANSEL'S below
        if (Math.abs(wx - SILO_X) < 95 && wy > SILO_TOP_Y - 150 && wy < SILO_TOP_Y + 20) {
            return { id: 'jack', handled: this.eggJack() };
        }
        if (Math.abs(wx - SILO_X) < 60 && wy >= SILO_TOP_Y + 20 && wy < 1765) { this.eggSign(); return { id: 'sign', handled: true }; }

        // barn: rooster on the roof, owl in the hayloft, animals behind the doors
        const roo = this.eggRoo;
        if (near(roo.x, roo.y - 28, 44, 38)) { this.eggRooster(); return { id: 'rooster', handled: true }; }
        const B = J.barn;
        if (wx > 368 && wx < 676 && wy > 1464 && wy < 1765) {
            if (near(B.loft[0], B.loft[1] - 18, 42, 36)) { this.eggOwl(); return { id: 'owl', handled: true }; }
            if (wy < 1572) { this.eggRooster(); return { id: 'rooster', handled: true, x: roo.x, y: roo.y - 30 }; }
            return { id: this.eggBarn(), handled: true };
        }

        // sky
        if (dist(J.sun[0], J.sun[1]) < 100) { this.eggSun(); return { id: 'sun', handled: true }; }
        if (dist(J.moon[0], J.moon[1]) < 90) { this.eggMoon(); return { id: 'moon', handled: true }; }
        for (const c of this.eggClouds) {
            if (near(c.x, c.y, c.w / 2 + 14, c.h / 2 + 14)) { this.eggCloud(c); return { id: 'cloud', handled: true, x: c.x, y: c.y }; }
        }

        // fence posts play notes
        const P = J.posts;
        if (wy > P.top - 22 && wy < P.top + 40) {
            let bi = -1, bd = 34;
            P.xs.forEach((x, i) => { const d = Math.abs(wx - x); if (d < bd) { bd = d; bi = i; } });
            if (bi >= 0) { this.eggPost(bi); return { id: 'fence', handled: true, x: P.xs[bi], y: P.top - 10 }; }
        }

        if (wy < 790) { this.eggStars(wx, wy); return { id: 'stars', handled: true }; }
        if (wy > 1478 && wy < 1588) { this.eggHills(wx, wy); return { id: 'flock', handled: true }; }
        if (wy >= 1588 && wy < 1800) { this.eggTrees(wx); return { id: null, handled: true }; }
        // the rest of the giraffe's old tap box (tapScenery handles it)
        const g = this.raffe;
        if (Math.abs(wx - g.x) < 95 && wy > GIRAFFE_Y - 340 && wy < GIRAFFE_Y - 20) return { id: 'giraffe', handled: false };
        return null;
    },

    // Is the giraffe itself (body, neck or head) under the finger?
    eggGiraffeAt(wx, wy) {
        const g = this.raffe, d = g.dir, y0 = g.img.y;
        if (Math.abs(wx - (g.x - d * 20)) < 74 && wy > y0 - 168 && wy < y0) return true;
        const hx = g.x + d * 76, hy = y0 - 308;
        if (Math.abs(wx - hx) < 46 && Math.abs(wy - hy) < 42) return true;
        const sx = g.x + d * 20, sy = y0 - 150, ex = g.x + d * 68, ey = y0 - 290;
        const L2 = (ex - sx) ** 2 + (ey - sy) ** 2;
        const t = Phaser.Math.Clamp(((wx - sx) * (ex - sx) + (wy - sy) * (ey - sy)) / L2, 0, 1);
        return Phaser.Math.Distance.Between(wx, wy, sx + t * (ex - sx), sy + t * (ey - sy)) < 28;
    },

    // Tap counter: how many times in a row (within EGG_AGAIN) this has been tapped.
    eggCount(id) {
        const s = this.eggState[id] || (this.eggState[id] = { n: 0, last: -1e9 });
        const now = this.time.now;
        s.n = now - s.last < EGG_AGAIN ? s.n + 1 : 1;
        s.last = now;
        return s.n;
    },

    // One pending "put it away" timer per surprise; a new tap pushes it back.
    eggLater(id, ms, fn) {
        if (this.eggTimers[id]) this.eggTimers[id].remove(false);
        this.eggTimers[id] = this.time.delayedCall(ms, fn);
    },

    // Ansel names what happened, unless he's busy with a pumpkin or just said something else.
    eggSay(text, ms = 1000) {
        if (this.ansel.busy || this.hovering) return;
        if (this.bubble.visible && this.bubbleTimer > 250 && this.bubbleText.text !== this.eggLastSay) return;
        this.eggLastSay = text;
        this.say(text, ms, true); // surprises keep their lines (see the filter in say)
    },

    // First time something is found: once its reaction has played, a sticker pops out of it
    // with a chime and flies up to the badge under the sound button.
    eggFound(id, x, y) {
        if (!id || !this.eggJ || this.found.has(id) || !this.eggJ.stickers.includes(id)) return;
        this.found.add(id);
        saveFound(this.found);
        this.time.delayedCall(1100, () => {
            const cam = this.cameras.main, v = cam.worldView;
            Sfx.found();
            if (this.ui && this.ui.eggSticker) this.ui.eggSticker(id, (x - v.x) * cam.zoom, (y - v.y) * cam.zoom);
        });
    },

    // ── Barn ────────────────────────────────────────────────────────────────
    eggBarn() {
        const b = this.eggBarnS, n = this.eggCount('barn');
        const parade = n % 3 === 0;
        if (!parade) b.visits += 1;
        const kind = parade || b.visits % 2 === 0 ? 'hen' : 'cow';
        const wasOpen = b.open;
        if (!b.open) this.eggBarnOpen();
        b.closeAt = this.time.now + (parade ? 2300 : 1700);
        const pal = this.eggPal, B = this.eggJ.barn;
        this.tweens.killTweensOf(pal);
        pal.setTexture(kind === 'cow' ? 'egg_cow' : 'egg_hen', 0).setVisible(true).setFlipX(kind === 'hen' && Math.random() < 0.5);
        pal.y = B.floor[1];
        pal.setScale(1, 0);
        this.tweens.add({ targets: pal, scaleY: 1, duration: 220, delay: wasOpen ? 0 : 150, ease: 'Back.Out' });
        this.time.delayedCall(wasOpen ? 120 : 280, () => {
            if (!pal.visible) return;
            pal.setFrame(1);
            this.tweens.add({ targets: pal, y: B.floor[1] - 8, duration: 90, yoyo: true, ease: 'Quad.Out' });
            if (kind === 'cow') { Sfx.moo(); this.eggSay('MOO!'); } else { Sfx.bawk(); if (!parade) this.eggSay('BAWK!', 900); }
            this.time.delayedCall(kind === 'cow' ? 700 : 450, () => pal.setFrame(0));
        });
        if (parade) this.eggChickParade();
        return kind;
    },

    eggBarnOpen() {
        this.eggBarnS.open = true;
        Sfx.creak();
        this.tweens.killTweensOf([this.eggDoorL, this.eggDoorR]);
        this.eggDoorL.x = this.eggJ.barn.doorL[0];
        this.eggDoorR.x = this.eggJ.barn.doorR[0];
        // each leaf swings out on its hinge and ends up flat against the barn wall
        this.tweens.add({ targets: [this.eggDoorL, this.eggDoorR], scaleX: -1, duration: 280, ease: 'Back.Out' });
    },

    eggBarnClose() {
        this.eggBarnS.open = false;
        const pal = this.eggPal;
        this.tweens.add({ targets: pal, scaleY: 0, duration: 140, ease: 'Quad.In', onComplete: () => pal.setVisible(false) });
        this.tweens.add({
            targets: [this.eggDoorL, this.eggDoorR], scaleX: 1, duration: 240, delay: 120, ease: 'Quad.In',
            onComplete: () => Sfx.thunk(20, 2),
        });
    },

    eggChickParade() {
        const B = this.eggJ.barn, dir = Math.random() < 0.5 ? -1 : 1;
        this.eggSay('CHICKS!', 1200);
        this.eggChicks.forEach((c, i) => {
            this.tweens.killTweensOf(c);
            const x0 = B.floor[0] + dir * 6, y0 = B.floor[1] + 40;   // in the field, just above the top rail
            const out = x0 + dir * (80 + i * 48);
            c.setPosition(x0, y0).setVisible(false).setAlpha(1).setFlipX(dir < 0).setFrame(0);
            this.time.delayedCall(220 + i * 160, () => {
                c.setVisible(true);
                Sfx.peep(i);
                this.tweens.add({ targets: c, x: out, duration: 560 });
                this.tweens.add({ targets: c, y: y0 - 14, duration: 93, yoyo: true, repeat: 2, ease: 'Quad.Out' });
                this.time.delayedCall(820, () => {
                    c.setFlipX(dir > 0);
                    Sfx.peep(i + 2);
                    this.tweens.add({ targets: c, x: x0, duration: 480 });
                    this.tweens.add({ targets: c, y: y0 - 12, duration: 80, yoyo: true, repeat: 2, ease: 'Quad.Out' });
                    this.tweens.add({ targets: c, alpha: 0, delay: 380, duration: 120, onComplete: () => c.setVisible(false) });
                });
            });
        });
    },

    eggDoorRattle() {
        // the doors jiggle as if someone inside wants out (an invitation, no sound)
        const B = this.eggJ.barn, L = this.eggDoorL, R = this.eggDoorR;
        this.tweens.killTweensOf([L, R]);
        L.x = B.doorL[0];
        R.x = B.doorR[0];
        this.tweens.add({ targets: L, x: B.doorL[0] - 4, duration: 60, yoyo: true, repeat: 2, onComplete: () => { L.x = B.doorL[0]; } });
        this.tweens.add({ targets: R, x: B.doorR[0] + 4, duration: 60, yoyo: true, repeat: 2, onComplete: () => { R.x = B.doorR[0]; } });
    },

    eggOwl() {
        const o = this.eggOwlImg, n = this.eggCount('owl');
        this.eggOwlEyes.setAlpha(0);
        this.tweens.killTweensOf(o);
        if (!o.visible || o.scaleY < 1) {
            o.setVisible(true).setScale(1, o.visible ? o.scaleY : 0);
            this.tweens.add({ targets: o, scaleY: 1, duration: 200, ease: 'Back.Out' });
        }
        o.setFrame(0).setFlipX(false);
        Sfx.hoot();
        this.eggSay('HOO HOO!');
        if (n % 3 === 0) {
            // owls can turn their heads right round
            this.time.delayedCall(260, () => Sfx.whooo());
            for (let i = 0; i < 6; i++) this.time.delayedCall(260 + i * 90, () => o.setFrame(2).setFlipX(i % 2 === 0));
            this.time.delayedCall(260 + 6 * 90, () => o.setFrame(0).setFlipX(false));
        } else {
            this.time.delayedCall(560, () => o.setFrame(1));
            this.time.delayedCall(680, () => o.setFrame(2).setFlipX(Math.random() < 0.5));
            this.time.delayedCall(1000, () => o.setFrame(1));
            this.time.delayedCall(1120, () => o.setFrame(0).setFlipX(false));
        }
        this.eggLater('owl', 1900, () => this.tweens.add({
            targets: o, scaleY: 0, duration: 160, ease: 'Quad.In', onComplete: () => o.setVisible(false),
        }));
    },

    eggRooster() {
        const r = this.eggRoo, n = this.eggCount('rooster');
        this.tweens.killTweensOf(r);
        r.y = r.homeY;
        r.busy = true;
        if (this.eggRooDone) this.eggRooDone.remove(false);
        if (n % 3 === 0) {
            // a big flappy jump first
            r.setFrame(3);
            this.tweens.add({ targets: r, y: r.homeY - 44, duration: 240, yoyo: true, ease: 'Quad.Out' });
            this.sparkles.explode(6, r.x, r.y - 30);
            this.time.delayedCall(500, () => { r.setFrame(2); Sfx.rooster(); });
            this.eggRooDone = this.time.delayedCall(1500, () => { r.setFrame(0); r.busy = false; });
        } else {
            this.tweens.add({ targets: r, y: r.homeY - 10, duration: 90, yoyo: true, ease: 'Quad.Out' });
            this.time.delayedCall(120, () => { r.setFrame(2); Sfx.rooster(); });
            this.eggRooDone = this.time.delayedCall(1100, () => { r.setFrame(0); r.busy = false; });
        }
        this.eggSay('DOODLE-DOO!', 1200);
    },

    // ── Silo ────────────────────────────────────────────────────────────────
    eggJack() {
        const n = this.eggCount('jack');
        const c = this.eggCrow;
        if (c.state === 'in' || c.state === 'perched') this.eggCrowLeave(true);   // tapping the pumpkin shoos the crow
        if (n % 3 !== 0) return false;      // the classic wink and wobble (tapScenery)
        // ah... ah... CHOO!
        const p = this.silo;
        Sfx.sneeze();
        this.tweens.killTweensOf(p);
        p.setAngle(0).setScale(1);
        this.tweens.add({ targets: p, scaleY: 1.1, scaleX: 0.96, duration: 150, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
        this.time.delayedCall(620, () => {
            p.setTexture('silo_pumpkin_wink');
            this.tweens.add({ targets: p, angle: { from: -10, to: 0 }, scaleX: { from: 1.15, to: 1 }, scaleY: { from: 0.85, to: 1 },
                duration: 420, ease: 'Back.Out' });
            this.eggSeeds.explode(18, SILO_X, SILO_TOP_Y - 28);   // out of its mouth
            this.time.delayedCall(700, () => p.setTexture('silo_pumpkin'));
            this.eggSay('BLESS YOU!', 1100);
        });
        return true;
    },

    eggSign() {
        if (this.eggSignBusy) { this.sparkles.explode(3, SILO_X, 1630); return; }
        this.eggSignBusy = true;
        const J = this.eggJ, steps = [0, 2, 4, 5, 7, 9];
        this.eggLetters.forEach((L, i) => this.time.delayedCall(i * 200, () => {
            L.setVisible(true).setTintFill(0xffb347).setScale(1).setY(L.homeY);
            this.tweens.add({
                targets: L, scale: 2, y: L.homeY - 18, duration: 120, yoyo: true, hold: 60, ease: 'Quad.Out',
                onComplete: () => L.setVisible(false).setY(L.homeY).setScale(1),
            });
            Sfx.marimba(12 + steps[i]);
            this.eggSay(J.letters[i].ch + '!', 380);
        }));
        this.time.delayedCall(this.eggLetters.length * 200 + 140, () => {
            Sfx.giggle();
            this.sparkles.explode(10, SILO_X, 1625);
            this.eggSay('ANSEL!', 1100);
            this.eggSignBusy = false;
        });
    },

    // ── Sky ─────────────────────────────────────────────────────────────────
    eggSun() {
        const J = this.eggJ, f = this.eggSunImg, rays = this.eggRays, sh = this.eggShades;
        const k = this.eggCount('sun') % 3;
        this.tweens.killTweensOf([f, rays, sh]);
        f.setVisible(true).setAlpha(1).setScale(1);
        rays.setAlpha(1).setScale(0.85);
        this.tweens.add({ targets: rays, scale: 1, duration: 320, ease: 'Back.Out' });
        if (this.eggSunSpin) this.eggSunSpin.remove(false);
        let fr = 0;
        this.eggSunSpin = this.time.addEvent({ delay: 150, repeat: 12, callback: () => rays.setFrame(fr ^= 1) });
        sh.setVisible(false);
        if (k === 1) {
            f.setFrame(1);
            this.tweens.add({ targets: f, scale: 1.1, duration: 110, yoyo: true, ease: 'Quad.Out' });
            sh.setVisible(true).setAlpha(1).setPosition(J.shades[0], J.shades[1] - 130);
            this.tweens.add({ targets: sh, y: J.shades[1], duration: 420, ease: 'Bounce.Out' });
            Sfx.slide();
            this.eggSay('COOL!');
        } else if (k === 2) {
            f.setFrame(2);
            this.tweens.add({ targets: f, scale: 1.1, duration: 110, yoyo: true, ease: 'Quad.Out' });
            Sfx.giggle();
            this.sparkles.explode(8, J.sun[0], J.sun[1] + 20);
            this.eggSay('SUNNY!');
        } else {
            f.setFrame(3);
            this.tweens.add({ targets: f, scaleY: 1.07, duration: 500, yoyo: true, ease: 'Sine.InOut' });
            Sfx.yawn();
            this.eggSay('YAWN!', 1100);
        }
        this.eggLater('sun', 2000, () => this.tweens.add({
            targets: [f, rays, sh], alpha: 0, duration: 350,
            onComplete: () => { f.setVisible(false); sh.setVisible(false); },
        }));
    },

    eggMoon() {
        const J = this.eggJ, m = this.eggMoonImg, n = this.eggCount('moon');
        this.tweens.killTweensOf(m);
        m.setVisible(true).setAlpha(1).setScale(1).setFrame(1);
        this.tweens.add({ targets: m, scale: 1.1, duration: 120, yoyo: true, ease: 'Quad.Out' });
        Sfx.twinkle(12);
        this.time.delayedCall(140, () => Sfx.twinkle(19));
        this.time.delayedCall(380, () => m.setFrame(2));
        this.time.delayedCall(900, () => m.setFrame(1));
        this.eggShootingStar(J.moon[0] - 420, J.moon[1] - 60);
        if (n % 3 === 0) this.eggCowOverMoon();
        else this.eggSay('MOON!');
        this.eggLater('moon', n % 3 === 0 ? 2200 : 1800, () => this.tweens.add({
            targets: m, alpha: 0, duration: 350, onComplete: () => m.setVisible(false),
        }));
    },

    eggShootingStar(x, y) {
        const s = this.add.image(x, y, 'egg_shooting_star').setDepth(0.2).setAngle(14).setAlpha(0);
        Sfx.whoosh();
        this.tweens.add({ targets: s, alpha: 1, duration: 120 });
        this.tweens.add({
            targets: s, x: x + 560, y: y + 140, duration: 750, ease: 'Sine.In',
            onComplete: () => { this.sparkles.explode(4, s.x, s.y); s.destroy(); },
        });
    },

    eggCowOverMoon() {
        // hey diddle diddle
        const J = this.eggJ;
        const c = this.add.image(J.moon[0] - 230, J.moon[1] + 70, 'egg_cow_jump').setDepth(0.3).setAngle(-14);
        Sfx.moo();
        this.time.delayedCall(300, () => Sfx.diddle());
        this.tweens.add({ targets: c, x: J.moon[0] + 230, angle: 14, duration: 1500 });
        this.tweens.add({ targets: c, y: J.moon[1] - 120, duration: 750, yoyo: true, ease: 'Sine.Out' });
        this.time.delayedCall(750, () => this.sparkles.explode(10, c.x, c.y));
        this.tweens.add({ targets: c, alpha: 0, delay: 1350, duration: 200, onComplete: () => c.destroy() });
        this.eggSay('OVER THE MOON!', 1500);
    },

    eggStars(wx, wy) {
        const i = this.eggTwinkleI = ((this.eggTwinkleI ?? -1) + 1) % EGG_TWINKLE.length;
        Sfx.twinkle(EGG_TWINKLE[i]);
        const s = this.add.image(wx, wy, 'sparkle').setDepth(0.25).setScale(0.5);
        this.tweens.add({ targets: s, scale: 2.4, duration: 180, ease: 'Back.Out', yoyo: true, hold: 120, onComplete: () => s.destroy() });
        this.sparkles.explode(3, wx, wy);
        if (i === 6 || i === 13) this.time.delayedCall(300, () => this.eggShootingStar(wx - 420, wy - 90));
        if (i === 13) this.eggSay('TWINKLE!');
    },

    eggCloud(c) {
        const now = this.time.now;
        c.n = now - c.last < EGG_AGAIN ? c.n + 1 : 1;
        c.last = now;
        const img = c.img, rainbow = c.n % 3 === 0;
        this.tweens.killTweensOf(img);
        img.setVisible(true).setScale(1);
        Sfx.puff();
        this.tweens.add({
            targets: img, scaleX: 1.14, scaleY: 1.2, duration: 130, yoyo: true, hold: 50, ease: 'Quad.Out',
            onComplete: () => { img.setScale(1); if (!c.rainbow) img.setVisible(false); },
        });
        // it drizzles leaves
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(80 + i * 140, () =>
                this.treeLeaves.explode(2, c.x + Phaser.Math.Between(-c.w / 3, c.w / 3), c.y + c.h * 0.3));
        }
        if (rainbow) this.eggRainbowUnder(c);
        else this.eggSay('PUFF!', 800);
    },

    eggRainbowUnder(c) {
        const r = this.eggRainbow;
        this.tweens.killTweensOf(r);
        if (this.eggRainbowCloud && this.eggRainbowCloud !== c) {
            this.eggRainbowCloud.rainbow = false;
            this.eggRainbowCloud.img.setVisible(false);
        }
        this.eggRainbowCloud = c;
        c.rainbow = true;
        r.setPosition(c.x, c.y).setAlpha(0).setScale(0.5, 0.3);
        Sfx.rainbow();
        this.eggSay('RAINBOW!', 1300);
        this.tweens.add({ targets: r, alpha: 1, scaleX: 1, scaleY: 1, duration: 450, ease: 'Back.Out' });
        this.time.delayedCall(350, () => {
            this.sparkles.explode(6, c.x - 110, c.y + 100);
            this.sparkles.explode(6, c.x + 110, c.y + 100);
        });
        this.tweens.add({
            targets: r, alpha: 0, delay: 1700, duration: 400,
            onComplete: () => { c.rainbow = false; c.img.setVisible(false); },
        });
    },

    eggHills(wx, wy) {
        // "hello!" and the hills say it back, while a flock lifts off
        Sfx.echo();
        this.eggSay('HELLO!', 900);
        for (let i = 0; i < 5; i++) {
            const b = this.add.sprite(wx + Phaser.Math.Between(-70, 70), 1572 + Phaser.Math.Between(-8, 8), 'egg_flock', 0).setDepth(0.5);
            b.play({ key: 'egg_flock_flap', startFrame: i % 2 });
            const dir = (i % 2 ? 1 : -1) * (Math.random() < 0.75 ? 1 : -1);
            this.tweens.add({
                targets: b, x: b.x + dir * Phaser.Math.Between(90, 220), y: b.y - Phaser.Math.Between(150, 280),
                duration: Phaser.Math.Between(1300, 1800), delay: i * 70, ease: 'Sine.Out', onComplete: () => b.destroy(),
            });
            this.tweens.add({ targets: b, alpha: 0, delay: 1000 + i * 70, duration: 500 });
        }
    },

    // ── Fence ───────────────────────────────────────────────────────────────
    eggPost(i) {
        const P = this.eggJ.posts, x = P.xs[i];
        Sfx.marimba(EGG_PENTA[i % EGG_PENTA.length]);
        const img = this.eggPosts[i] || (this.eggPosts[i] = this.add.image(x, P.bottom, 'egg_post').setOrigin(0.5, 1).setDepth(3.05));
        this.tweens.killTweensOf(img);
        img.setVisible(true).setScale(1);
        this.tweens.add({ targets: img, scaleX: 1.2, scaleY: 1.08, duration: 70, yoyo: true, ease: 'Quad.Out', onComplete: () => img.setVisible(false) });
        const note = this.add.image(x + 8, P.top - 18, 'egg_note').setDepth(3.1).setScale(1.25)
            .setTint(EGG_NOTE_TINT[i % EGG_NOTE_TINT.length]);
        this.tweens.add({
            targets: note, y: note.y - 90, x: note.x + Phaser.Math.Between(-18, 18), duration: 900, ease: 'Sine.Out',
            onComplete: () => note.destroy(),
        });
        this.tweens.add({ targets: note, alpha: 0, delay: 480, duration: 420 });
        // a good long tune: sparkles, and any robins on the fence sing along
        const s = this.eggState.music || (this.eggState.music = { n: 0, last: -1e9 });
        s.n = this.time.now - s.last < 1500 ? s.n + 1 : 1;
        s.last = this.time.now;
        if (s.n === 8) {
            this.sparkles.explode(12, x, P.top - 40);
            this.eggBirds.forEach((b, j) => this.time.delayedCall(150 + j * 120, () => Sfx.tweet(j)));
            this.eggSay('MUSIC!');
        }
    },

    eggBirdsArrive() {
        const P = this.eggJ.posts, v = this.cameras.main.worldView, a = this.ansel;
        const spots = P.xs.map((x, i) => i).filter(i => {
            const x = P.xs[i];
            return x > v.x + 50 && x < v.right - 50 && Math.abs(x - HAY_X) > 220 && Math.abs(x - a.x) > 140;
        });
        Phaser.Utils.Array.Shuffle(spots);
        const n = Math.min(spots.length, Phaser.Math.Between(1, 3));
        if (n === 0) { this.eggBirdT = 6; return; }
        for (let k = 0; k < n; k++) {
            const i = spots[k], x = P.xs[i], y = P.top + 1;
            const fromX = x + (Math.random() < 0.5 ? -1 : 1) * 260;
            const img = this.add.sprite(fromX, Math.max(v.y - 30, y - 420), 'egg_bird', 2).setOrigin(0.5, 1).setDepth(3.1)
                .setFlipX(fromX > x);
            img.play('egg_bird_fly');
            const b = { img, x, y, post: i, state: 'in', t: Phaser.Math.FloatBetween(12, 20), idle: 1 };
            this.eggBirds.push(b);
            this.tweens.add({
                targets: img, x, y, duration: 1100 + k * 200, delay: k * 250, ease: 'Sine.Out',
                onComplete: () => { if (b.state !== 'in') return; img.stop(); img.setFrame(0); b.state = 'sit'; },
            });
        }
    },

    eggBirdFly(b, chirp) {
        if (b.state === 'out' || b.state === 'gone') return;
        b.state = 'out';
        this.tweens.killTweensOf(b.img);
        const dir = Math.random() < 0.5 ? -1 : 1;
        b.img.setFlipX(dir < 0).play('egg_bird_fly');
        if (chirp) Sfx.tweet(b.post);
        this.tweens.add({
            targets: b.img, x: b.img.x + dir * 380, y: b.img.y - 460, duration: 1300, ease: 'Sine.In',
            onComplete: () => { b.img.destroy(); b.state = 'gone'; },
        });
    },

    eggBirdTap(b) {
        Sfx.tweet(0);
        this.eggSay('TWEET!', 900);
        this.sparkles.explode(4, b.img.x, b.img.y - 16);
        this.eggBirdFly(b, false);
        this.eggBirds.forEach((o, j) => { if (o !== b) this.time.delayedCall(120 + j * 90, () => this.eggBirdFly(o, true)); });
    },

    // ── Trees ───────────────────────────────────────────────────────────────
    eggTrees(wx) {
        this.shakeTree(wx);
        const n = this.eggCount('tree');
        if (n % 3 === 0) this.eggSquirrelPop(wx);
    },

    eggSquirrelPop(wx) {
        const s = this.eggSquirrel;
        if (s.visible) { this.eggChitter(); return; }
        const x = Phaser.Math.Clamp(wx, 80, WORLD_W - 80), y0 = 1700, top = 1614;
        s.setPosition(x, y0).setVisible(true).setAlpha(0).setFrame(0).setFlipX(x > WORLD_W / 2).setScale(1);
        this.tweens.add({ targets: s, alpha: 1, duration: 120 });
        this.tweens.add({ targets: s, y: top, duration: 260, ease: 'Quad.Out', onComplete: () => this.eggChitter() });
        this.eggLater('squirrel', 1700, () => {
            this.tweens.add({ targets: s, y: y0, duration: 240, ease: 'Quad.In' });
            this.tweens.add({ targets: s, alpha: 0, delay: 120, duration: 120, onComplete: () => s.setVisible(false) });
        });
        // two acorns tumble out of the leaves
        for (let i = 0; i < 2; i++) {
            const a = this.add.image(x + (i ? 30 : -26), top - 10, 'egg_acorn').setDepth(0.55);
            this.tweens.add({
                targets: a, y: 1772, angle: (i ? 1 : -1) * 200, duration: 600 + i * 120, delay: 250 + i * 160, ease: 'Quad.In',
                onComplete: () => {
                    Sfx.bonk();
                    this.tweens.add({ targets: a, alpha: 0, delay: 200, duration: 300, onComplete: () => a.destroy() });
                },
            });
        }
        this.eggFound('squirrel', x, top - 30);
        this.eggSay('SQUIRREL!', 1100);
    },

    eggChitter() {
        const s = this.eggSquirrel;
        Sfx.chitter();
        for (let i = 0; i < 4; i++) this.time.delayedCall(i * 90, () => s.setFrame(i % 2 ? 0 : 1));
        this.tweens.add({ targets: s, scaleY: 1.08, duration: 60, yoyo: true, repeat: 1 });
    },

    // ── Hoppah: now and then Ansel scoops the bunny up, and he wriggles free ──
    // Called first thing in tapHoppah(). Returns true when the cuddle takes the tap
    // (the second tap in a row, or one tap in three); otherwise the classic boing runs.
    eggHoppah() {
        const h = this.hop, a = this.ansel;
        this.eggFound('hoppah', h.x, h.y - 60);
        if (!this.eggJ) return false;
        if (this.eggGrab) {                              // already being cuddled
            if (this.eggGrab.phase === 'hold') Sfx.giggle();
            return true;
        }
        const n = this.eggCount('hoppah');
        const free = !a.busy && !a.carrying && !this.hovering && !this.roundOver;
        if (!free || Math.abs(a.x - h.x) > 420 || !(n % 2 === 0 || Math.random() < 1 / 3)) return false;
        // Ansel toddles over; Hoppah sits tight once he lands (see eggGrabTick)
        h.scared = false;
        const G = this.eggGrab = { phase: 'approach', t: 0, arrived: false, img: null };
        G.cb = () => { G.arrived = true; };
        this.walkTo(this.standSpot(h.phase === 'sit' ? h.x : h.toX, 62), G.cb);
        Sfx.boop(20);
        this.eggSay('BUNNY!', 900);
        return true;
    },

    // Every frame during a cuddle (runs just before updateHoppah, which keeps drawing him).
    eggGrabTick(dt) {
        const G = this.eggGrab, h = this.hop, a = this.ansel;
        if (!G || G.phase !== 'approach') return;
        G.t += dt;
        if (h.phase === 'sit') h.t = 99;                  // sit tight, Hoppah
        const goingThere = a.goal && a.goal.then === G.cb;
        // anything else asked of Ansel (or a long wait) and the bunny just carries on
        if ((!goingThere && !G.arrived) || G.t > 2.5 || !h.active || a.carrying || this.hovering) {
            if (h.phase === 'sit') h.t = 0.1;
            this.eggGrab = null;
            return;
        }
        if (G.arrived && h.phase === 'sit') this.eggGrabHold();
    },

    eggGrabHold() {
        const G = this.eggGrab, h = this.hop, a = this.ansel;
        G.phase = 'hold';
        a.busy = true;
        a.goal = null;
        h.t = 99;
        this.face(h.x);
        this.setPose('scoop');
        Sfx.pickup();
        // a stand-in bunny does the cuddle; the real one waits, hidden, until he springs free
        const p = G.img = this.add.image(h.x, h.y, 'hoppah_stand').setOrigin(0.5, 305 / 327).setScale(0.3)
            .setDepth(21).setFlipX(a.dir < 0);
        h.img.setVisible(false);
        h.shadow.setVisible(false);
        const holdX = a.x + a.dir * 30, holdY = GROUND - 92;
        this.tweens.add({ targets: p, x: holdX, y: holdY, scale: 0.27, duration: 240, ease: 'Quad.Out' });
        this.time.delayedCall(260, () => {
            this.setPose('hug');
            Sfx.giggle();
            this.say('HOPPAH!', 1100);
            // he wriggles...
            this.tweens.add({ targets: p, angle: { from: -14, to: 14 }, duration: 80, yoyo: true, repeat: 6, ease: 'Sine.InOut' });
            this.tweens.add({ targets: p, x: holdX + a.dir * 6, duration: 110, yoyo: true, repeat: 3 });
            [180, 500, 820].forEach(ms => this.time.delayedCall(ms, () => Sfx.peep(3)));
        });
        // ...and springs free with a big boing
        this.time.delayedCall(1450, () => this.eggGrabEscape());
    },

    eggGrabEscape() {
        const G = this.eggGrab, h = this.hop, a = this.ansel;
        if (!G || !G.img) return;
        const p = G.img, dir = h.dir || 1;
        const landX = Phaser.Math.Clamp(a.x + dir * 250, PLAY_L - 60, PLAY_R + 60);
        this.tweens.killTweensOf(p);
        p.setAngle(0).setTexture('hoppah_jump').setFlipX(dir < 0);
        Sfx.boing();
        this.time.delayedCall(140, () => Sfx.boing());
        this.sparkles.explode(14, p.x, p.y - 40);
        this.tweens.add({ targets: p, x: landX, scale: 0.3, duration: 560 });
        this.tweens.add({
            targets: p, y: p.y - 170, duration: 280, ease: 'Quad.Out',
            onComplete: () => this.tweens.add({ targets: p, y: GROUND, duration: 280, ease: 'Quad.In' }),
        });
        this.setPose('cheer');
        this.say('WHOA!', 900);
        this.time.delayedCall(570, () => {
            // the real Hoppah lands where the stand-in did and hops off, fast
            p.destroy();
            h.x = landX; h.y = GROUND;
            h.img.setVisible(true).setFlipX(dir < 0).setPosition(h.x, h.y);
            h.shadow.setVisible(true);
            h.scared = true; h.phase = 'sit'; h.t = 0.05;
            this.dust.explode(5, landX, GROUND);
            this.eggGrab = null;
        });
        this.time.delayedCall(950, () => {
            this.setPose('run');
            a.busy = false;
            Sfx.giggle();
        });
    },

    // ── Crow on the silo pumpkin ────────────────────────────────────────────
    eggCrowPerch() {
        return { x: SILO_X + 30, y: this.silo.y - this.silo.displayHeight + 27 };
    },

    eggCrowArrive() {
        const c = this.eggCrow, v = this.cameras.main.worldView, p = this.eggCrowPerch();
        const fromLeft = Math.random() < 0.5;
        c.state = 'in';
        c.img.setVisible(true).setAlpha(1).setFlipX(!fromLeft)
            .setPosition(fromLeft ? v.x - 60 : v.right + 60, Math.max(v.y + 40, p.y - 260));
        c.img.play('egg_crow_fly');
        this.tweens.add({ targets: c.img, x: p.x, duration: 2400, ease: 'Sine.Out' });
        this.tweens.add({
            targets: c.img, y: p.y, duration: 2400, ease: 'Quad.InOut',
            onComplete: () => {
                if (c.state !== 'in') return;
                c.img.stop(); c.img.setFrame(0);
                c.state = 'perched';
                c.t = Phaser.Math.FloatBetween(12, 18);
                c.idle = 1.5;
            },
        });
    },

    eggCrowLeave(caw) {
        const c = this.eggCrow;
        if (c.state !== 'in' && c.state !== 'perched') return;
        this.tweens.killTweensOf(c.img);
        c.state = 'out';
        if (caw) Sfx.caw();
        const dir = c.img.x < this.cameras.main.worldView.centerX ? -1 : 1;
        c.img.setFlipX(dir < 0).play('egg_crow_fly');
        this.tweens.add({
            targets: c.img, x: c.img.x + dir * 700, y: c.img.y - 420, duration: 1800, ease: 'Sine.In',
            onComplete: () => { c.img.stop(); c.img.setVisible(false); c.state = 'away'; c.t = Phaser.Math.FloatBetween(40, 75); },
        });
    },

    eggCrowTap() {
        const c = this.eggCrow;
        this.tweens.killTweensOf(c.img);
        c.img.stop();
        c.img.setFrame(1);
        c.state = 'perched';
        Sfx.caw();
        this.eggSay('CAW CAW!');
        this.siloWink(false);
        this.time.delayedCall(380, () => this.eggCrowLeave(false));
    },

    // ── Hot-air balloon ─────────────────────────────────────────────────────
    eggBalloonLaunch() {
        const b = this.eggBalloon, v = this.cameras.main.worldView;
        b.dir = Math.random() < 0.5 ? 1 : -1;
        b.x = b.dir > 0 ? v.x - 120 : v.right + 120;
        b.baseY = Phaser.Math.Clamp(v.y + 80, 480, 1520);    // up in the sky, or just over the hills
        b.speed = (v.width + 260) / 26;
        b.lift = 0;
        b.state = 'drift';
        b.img.setVisible(true).setFrame(0);
    },

    eggBalloonTap() {
        const b = this.eggBalloon, n = this.eggCount('balloon');
        b.img.setFrame(1);
        Sfx.fwoosh();
        this.time.delayedCall(700, () => b.img.setFrame(0));
        this.tweens.killTweensOf(b);
        this.tweens.add({ targets: b, lift: Math.max(-320, b.lift - 50), duration: 900, ease: 'Sine.Out' });
        this.sparkles.explode(n % 3 === 0 ? 24 : 8, b.img.x, b.img.y + 50);
        if (n % 3 === 0) {
            Sfx.rainbow();
            this.burst.explode(16, b.img.x, b.img.y + 40);
            this.eggSay('WHEEE!');
        } else {
            this.eggSay('BALLOON!');
        }
    },

    // ── Every frame ─────────────────────────────────────────────────────────
    eggsUpdate(dt, time) {
        if (!this.eggJ || !this.started) return;
        this.eggGrabTick(dt);

        // barn doors close again once it's quiet
        const bs = this.eggBarnS;
        if (bs.open && this.time.now > bs.closeAt) this.eggBarnClose();

        // the rooster pecks and looks around
        const r = this.eggRoo;
        if (!r.busy) {
            this.eggRooT -= dt;
            if (this.eggRooT <= 0) {
                this.eggRooT = Phaser.Math.FloatBetween(2.5, 6);
                if (Math.random() < 0.3) r.setFlipX(!r.flipX);
                else {
                    [[0, 1], [140, 0], [300, 1], [440, 0]].forEach(([ms, f]) =>
                        this.time.delayedCall(ms, () => { if (!r.busy) r.setFrame(f); }));
                }
            }
        }

        // two eyes blink in the dark hayloft now and then
        if (!this.eggOwlImg.visible) {
            this.eggOwlEyesT -= dt;
            if (this.eggOwlEyesT <= 0) {
                this.eggOwlEyesT = this.found.has('owl') ? Phaser.Math.FloatBetween(20, 35) : Phaser.Math.FloatBetween(9, 16);
                const e = this.eggOwlEyes;
                this.tweens.add({ targets: e, alpha: 1, duration: 200 });
                this.time.delayedCall(900, () => e.setAlpha(0));
                this.time.delayedCall(1000, () => { if (!this.eggOwlImg.visible) e.setAlpha(1); });
                this.time.delayedCall(1500, () => this.tweens.add({ targets: e, alpha: 0, duration: 250 }));
            }
        }

        // crow visits the silo pumpkin
        const c = this.eggCrow;
        if (c.state === 'away') {
            c.t -= dt;
            if (c.t <= 0 && !this.gigiState) this.eggCrowArrive();
        } else if (c.state === 'perched') {
            c.t -= dt;
            c.idle -= dt;
            if (c.idle <= 0) {
                c.idle = Phaser.Math.FloatBetween(1.5, 3.5);
                if (Math.random() < 0.5) c.img.setFlipX(!c.img.flipX);
                else {
                    c.img.setFrame(1);
                    this.time.delayedCall(160, () => { if (c.state === 'perched') c.img.setFrame(0); });
                }
            }
            if (c.t <= 0) this.eggCrowLeave(false);
        }

        // robins on the fence (Ansel running past sends them off)
        if (!this.eggBirds.length) {
            this.eggBirdT -= dt;
            if (this.eggBirdT <= 0 && !this.gigiState) this.eggBirdsArrive();
        } else {
            const a = this.ansel;
            for (const b of this.eggBirds) {
                if (b.state !== 'sit') continue;
                b.t -= dt;
                b.idle -= dt;
                if (b.idle <= 0) {
                    b.idle = Phaser.Math.FloatBetween(0.8, 2.6);
                    const k = Math.random();
                    if (k < 0.35) {
                        b.img.setFrame(1);
                        this.time.delayedCall(150, () => { if (b.state === 'sit') b.img.setFrame(0); });
                    } else if (k < 0.6) b.img.setFlipX(!b.img.flipX);
                    else this.tweens.add({ targets: b.img, y: b.y - 10, duration: 90, yoyo: true });
                }
                const startled = a.moving && Math.abs(a.x - b.img.x) < 90;
                if (b.t <= 0 || startled) this.eggBirdFly(b, startled);
            }
            this.eggBirds = this.eggBirds.filter(b => b.state !== 'gone');
            if (!this.eggBirds.length) this.eggBirdT = Phaser.Math.FloatBetween(18, 34);
        }

        // a hot-air balloon drifts over once in a while
        const bl = this.eggBalloon;
        if (bl.state === 'away') {
            bl.t -= dt;
            if (bl.t <= 0) this.eggBalloonLaunch();
        } else {
            bl.x += bl.dir * bl.speed * dt;
            bl.img.setPosition(bl.x, bl.baseY + Math.sin(time / 700) * 8 + bl.lift);
            const v = this.cameras.main.worldView;
            if ((bl.dir > 0 && bl.x > v.right + 160) || (bl.dir < 0 && bl.x < v.x - 160)) {
                bl.state = 'away';
                bl.img.setVisible(false);
                bl.t = Phaser.Math.FloatBetween(70, 120);
            }
        }

        this.eggGlintTick(dt);
    },

    // Where each surprise can be pointed at, if it's on screen right now.
    eggSpots() {
        const J = this.eggJ, f = this.found, v = this.cameras.main.worldView, out = [];
        const onScreen = (x, y) => x > v.x + 40 && x < v.right - 40 && y > v.y + 60 && y < v.bottom - 30;
        const add = (id, done, x, y, moving) => { if (onScreen(x, y)) out.push({ id, done, x, y, moving: !!moving }); };
        const B = J.barn, g = this.raffe;
        add('barn', f.has('cow') && f.has('hen'), B.floor[0], B.floor[1] - 70);
        add('owl', f.has('owl'), B.loft[0], B.loft[1] - 16);
        add('rooster', f.has('rooster'), this.eggRoo.x, this.eggRoo.y - 30);
        add('sign', f.has('sign'), SILO_X, 1640);
        add('jack', f.has('jack'), SILO_X, SILO_TOP_Y - 60);
        add('sun', f.has('sun'), J.sun[0] - 20, J.sun[1] + 40);
        add('moon', f.has('moon'), J.moon[0], J.moon[1]);
        add('giraffe', f.has('giraffe'), g.x + g.dir * 76, g.img.y - 308, true);
        const cx = v.centerX;
        const cl = this.eggClouds.filter(c => onScreen(c.x, c.y));
        if (cl.length) { const c = cl[Math.floor(this.time.now / 9000) % cl.length]; add('cloud', f.has('cloud'), c.x, c.y); }
        const P = J.posts;
        const pi = P.xs.reduce((bi, x, i) => (Math.abs(x - cx - 180) < Math.abs(P.xs[bi] - cx - 180) ? i : bi), 0);
        add('fence', f.has('fence'), P.xs[pi], P.top - 6);
        const side = cx < SILO_X + 120 && cx > 340 ? 900 : cx;     // somewhere clear of the barn and silo
        add('flock', f.has('flock'), side + 160, 1552);
        add('squirrel', f.has('squirrel'), side - 140, 1650);
        if (v.y < 700) add('stars', f.has('stars'), Phaser.Math.Clamp(cx - 200, v.x + 80, v.right - 80), Math.max(v.y + 90, 520));
        if (this.eggCrow.state === 'perched') add('crow', f.has('crow'), this.eggCrow.img.x, this.eggCrow.img.y - 20);
        for (const b of this.eggBirds) if (b.state === 'sit') add('bird', f.has('bird'), b.img.x, b.img.y - 14);
        if (this.eggBalloon.state === 'drift') add('balloon', f.has('balloon'), this.eggBalloon.img.x, this.eggBalloon.img.y, true);
        if (this.hop.active) add('hoppah', f.has('hoppah'), this.hop.x, this.hop.y - 60, true);
        return out;
    },

    eggGlintTick(dt) {
        this.eggGlintT -= dt;
        if (this.eggGlintT > 0) return;
        this.eggGlintT = this.idleT > 3 ? Phaser.Math.FloatBetween(3.5, 5.5) : Phaser.Math.FloatBetween(7, 11);
        if (this.hovering || this.dropping) return;      // never distract from a drop
        const spots = this.eggSpots();
        let pool = spots.filter(s => !s.done);
        if (!pool.length) {
            if (Math.random() > 0.3) return;             // everything found: just the odd twinkle
            pool = spots;
        }
        if (!pool.length) return;
        const s = Phaser.Utils.Array.GetRandom(pool);
        if (s.id === 'barn' && !this.eggBarnS.open && Math.random() < 0.5) { this.eggDoorRattle(); return; }
        const g = this.eggGlint;
        this.tweens.killTweensOf(g);
        g.setPosition(s.x, s.y).setAlpha(1).setScale(0).setAngle(0);
        const k = 1.4 * Math.max(1, this.textScale * 0.8);
        this.tweens.add({ targets: g, scale: k, angle: 90, duration: 260, yoyo: true, ease: 'Sine.Out', onComplete: () => g.setAlpha(0) });
    },

    // The pointing hand: after a long idle spell, now and then it shows a surprise
    // that hasn't been found yet (never while learning to stack or during a drop).
    eggHint(target) {
        if (!this.eggJ || !this.started || this.tower.length < 2 || this.hovering || this.ansel.carrying || this.idleT < 9) {
            this.eggHintSpot = null;
            return target;
        }
        if ((this.idleT - 9) % 12 > 3.5) { this.eggHintSpot = null; return target; }
        if (!this.eggHintSpot) {
            const pool = this.eggSpots().filter(s => !s.done && !s.moving);
            if (!pool.length) return target;
            this.eggHintSpot = Phaser.Utils.Array.GetRandom(pool);
        }
        return { x: this.eggHintSpot.x, y: this.eggHintSpot.y };
    },
};

// ── UIScene side: the sticker badge and tray ────────────────────────────────
// A found sticker flies to a small badge under the sound button (a star and "7/18").
// Tapping the badge drops the sticker tray down from the top: found stickers in
// colour, the rest as silhouettes that hint at what's still out there. Tapping a
// sticker in the tray makes its noise. The tray also drops in when all are found.
// The UI registers its own pointer and resize listeners, so layout() and the
// pointer handler need no changes.
const EGG_BADGE_Y = 120;       // just under the sound button (its tap area ends at y 115)

const UIEggs = {
    eggUiCreate() {
        const P = this.patch, J = P.eggJ;
        this.eggUi = null;
        if (!J) return;
        const N = J.stickers.length;
        const tray = this.add.container(0, -400).setDepth(90).setVisible(false);
        const bg = this.add.nineslice(0, 0, 'panel', null, 120, 64, 20, 20, 20, 20).setOrigin(0.5, 0);
        tray.add(bg);
        const slots = J.stickers.map((id, i) => {
            const s = this.add.image(0, 0, 'egg_stickers', (P.found.has(id) ? 's' : 'g') + i);
            tray.add(s);
            return s;
        });
        const badge = this.add.container(0, 0).setDepth(89).setVisible(false);
        const bb = this.add.nineslice(0, 0, 'panel', null, 136, 52, 20, 20, 20, 20).setOrigin(1, 0);
        const star = this.add.image(-110, 26, 'sparkle').setScale(1.2);
        const count = this.add.text(-94, 27, '', {
            fontFamily: FONT, fontSize: '18px', color: '#ffe3a6', stroke: INK, strokeThickness: 5,
        }).setOrigin(0, 0.5);
        badge.add([bb, star, count]);
        const fx = calmFx(this.add.particles(0, 0, 'sparkle', {
            lifespan: 600, speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 },
            scale: { start: 1, end: 0 }, emitting: false,
        })).setDepth(96);
        this.eggUi = { J, N, tray, bg, slots, badge, star, count, fx, shown: false, sc: 1, trayY: 14, trayH: 64, tw: 120 };
        this.eggUiCount();
        this.eggUiLayout(this.scale.width, this.scale.height);
        this.scale.on('resize', size => this.eggUiLayout(size.width, size.height));
        this.input.on('pointerdown', p => this.eggUiTap(p));
        // the badge shows during play only (not on the title or the end-of-round card)
        this.time.addEvent({ delay: 250, loop: true, callback: () => {
            const on = !!P.started && !P.roundOver;
            badge.setVisible(on);
            if (!on && this.eggUi.shown) this.hideEggTray();
        } });
    },

    eggUiCount() {
        const E = this.eggUi;
        if (E) E.count.setText(this.patch.found.size + '/' + E.N);
    },

    // The tray sits between the count panel and the sound button.
    eggUiLayout(w, h) {
        const E = this.eggUi;
        if (!E) return;
        const left = 300, right = w - 236, gap = right - left, px = E.J.stickerPx;
        let sc = 1, cols = E.N, rows = 1;
        for (sc of [1, 0.85, 0.7]) {
            cols = Math.max(1, Math.min(E.N, Math.floor((gap - 24) / (px * sc))));
            rows = Math.ceil(E.N / cols);
            if (rows <= (sc === 1 ? 2 : 3)) break;
        }
        cols = Math.ceil(E.N / rows);
        const slot = px * sc, tw = cols * slot + 24, th = rows * slot + 20;
        E.bg.setSize(tw, th);
        E.slots.forEach((s, i) => s.setScale(sc).setPosition(-tw / 2 + 12 + slot * (i % cols + 0.5),
            10 + slot * (Math.floor(i / cols) + 0.5)));
        E.tray.x = tw <= gap ? left + gap / 2 : w / 2;
        Object.assign(E, { sc, tw, trayH: th, trayY: 14 });
        E.tray.y = E.shown ? E.trayY : -th - 10;
        E.badge.setPosition(w - 20, EGG_BADGE_Y);
    },

    eggOnBadge(p) {
        return p.x > this.scale.width - 160 && p.y >= EGG_BADGE_Y - 4 && p.y < EGG_BADGE_Y + 60;
    },

    // Index of the sticker under the pointer (tray showing), or -1.
    eggSlotAt(p) {
        const E = this.eggUi;
        if (!E || !E.shown) return -1;
        const half = E.J.stickerPx * E.sc / 2;
        return E.slots.findIndex(s => Math.abs(p.x - (E.tray.x + s.x)) < half && Math.abs(p.y - (E.tray.y + s.y)) < half);
    },

    // Does this tap belong to the badge or the open tray? (The patch ignores those taps.)
    eggUiHit(p) {
        const E = this.eggUi, P = this.patch;
        if (!E || !P.started || P.roundOver) return false;
        if (this.eggOnBadge(p)) return true;
        return E.shown && Math.abs(p.x - E.tray.x) < E.tw / 2 && p.y > E.tray.y && p.y < E.tray.y + E.trayH;
    },

    eggUiTap(p) {
        if (!this.eggUiHit(p)) return false;
        const E = this.eggUi;
        if (this.eggOnBadge(p)) {
            this.tweens.add({ targets: E.star, scale: 1.6, duration: 120, yoyo: true });
            if (E.shown) this.hideEggTray();
            else this.showEggTray(4000);
            return true;
        }
        const i = this.eggSlotAt(p);
        if (i >= 0) {
            const s = E.slots[i], id = E.J.stickers[i];
            this.tweens.killTweensOf(s);
            s.setScale(E.sc).setAngle(0);
            this.tweens.add({ targets: s, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 1, onComplete: () => s.setAngle(0) });
            if (this.patch.found.has(id) && EGG_VOICE[id]) EGG_VOICE[id]();
        }
        this.showEggTray(3000);
        return true;
    },

    showEggTray(ms = 3000) {
        const E = this.eggUi;
        if (!E) return;
        if (E.hideTimer) E.hideTimer.remove(false);
        E.hideTimer = this.time.delayedCall(ms, () => this.hideEggTray());
        if (E.shown) return;
        E.shown = true;
        this.tweens.killTweensOf(E.tray);
        E.tray.setVisible(true);
        this.tweens.add({ targets: E.tray, y: E.trayY, duration: 320, ease: 'Back.Out' });
    },

    hideEggTray() {
        const E = this.eggUi;
        if (!E || !E.shown) return;
        E.shown = false;
        if (E.hideTimer) E.hideTimer.remove(false);
        this.tweens.killTweensOf(E.tray);
        this.tweens.add({
            targets: E.tray, y: -E.trayH - 10, duration: 260, ease: 'Quad.In',
            onComplete: () => { if (!E.shown) E.tray.setVisible(false); },
        });
    },

    // A new surprise: its sticker pops out where it was found and flies to the badge
    // (or into its slot if the tray is open).
    eggSticker(id, sx, sy) {
        const E = this.eggUi;
        if (!E) return;
        const i = E.J.stickers.indexOf(id);
        if (i < 0) return;
        const slot = E.slots[i];
        slot.setFrame('s' + i);
        const w = this.scale.width, h = this.scale.height;
        const fly = this.add.image(Phaser.Math.Clamp(sx, 30, w - 30), Phaser.Math.Clamp(sy, 40, h - 30),
            'egg_stickers', 's' + i).setDepth(95).setScale(0.4);
        const toTray = E.shown;
        const tx = toTray ? E.tray.x + slot.x : w - 88, ty = toTray ? E.trayY + slot.y : EGG_BADGE_Y + 23;
        this.tweens.add({ targets: fly, scale: 1.7, y: fly.y - 30, duration: 240, ease: 'Back.Out' });
        this.tweens.add({
            targets: fly, x: tx, y: ty, scale: toTray ? E.sc : 0.5, delay: 520, duration: 620, ease: 'Cubic.InOut',
            onComplete: () => {
                fly.destroy();
                this.eggUiCount();
                E.fx.explode(8, tx, ty);
                this.tweens.add({ targets: toTray ? slot : E.star, scale: (toTray ? E.sc : 1.1) * 1.5, duration: 130, yoyo: true });
                // every last one found: show off the full sticker book
                if (this.patch.found.size === E.N) {
                    Sfx.fanfare();
                    this.showEggTray(5000);
                    this.time.delayedCall(350, () => E.slots.forEach((s, j) => this.time.delayedCall(j * 50, () =>
                        this.tweens.add({ targets: s, scale: E.sc * 1.35, duration: 110, yoyo: true }))));
                }
            },
        });
    },
};

Object.assign(PatchScene.prototype, PatchEggs);
Object.assign(UIScene.prototype, UIEggs);
// ═════════════════════════════════════════════════════════════ end SURPRISES ══

// ═════════════════════════════════════════════════════════════════════════════
// HOW TO PLAY: an illustrated, skippable explainer, plus the title card's extras
//
// Four wooden-sign panels built from the game's own sprites, each with a little
// looping scene: STACK 'EM UP (the goal, the landing ring, heavy at the bottom,
// controls), DON'T LET IT FALL (pumpkin lives, wind, earning lives back), BOOM!
// (banking the tower) and BEAT THE SUNSET (the afternoon is the clock, the last BOOM,
// what else is in the patch). Touch players see taps; mouse-and-keyboard players
// (DESKTOP) see keycaps. NEXT / BACK / SKIP buttons, swipes, a tap on the card, the
// page pumpkins and the keyboard (→ Space Enter: next, ←: back, Esc: skip) all work.
// It opens by itself after the title tap until the player has started HTP_AUTO rounds
// (counted in localStorage), from the title's "?" button (or ? / H) any time, and from
// the pause menu (which also gets a HOME button).
// Title extras: the flat dark shade becomes stepped bands so the live patch shows
// through, the round's HUD stays off the title, a best-score line, and "?" and HOME
// (back to the Uppah home page) buttons; the sound button sits above the shade.
// Self-contained: UIScene's tap and key handlers ask htpTap() / htpKey() first.
// One-line hooks elsewhere are marked "how to play".
// Art: make_art.py (how to play section) writes keys.png, key_wide.png, icon_home.png.
// ═════════════════════════════════════════════════════════════════════════════
const HTP_SAVE = 'uppah.pumpkinpatch.rounds'; // rounds started, ever
const HTP_AUTO = 3;                            // the card opens by itself until this many rounds
// the Uppah home page; a page that hosts the game on its own sets window.UPPAH_HOME = null
// (no home to go to), which hides the HOME buttons
const HTP_HOME = window.UPPAH_HOME === undefined ? '../../' : window.UPPAH_HOME;
const HTP_COL = { cream: '#fff6e0', gold: '#ffd35a', orange: '#ff9a3a', red: '#ff6a4a', ink: 0x1b130d };
// Windows onto the patch for the illustrations (world px): close up for the tower
// panels, wider for the afternoon (it shows the sun).
const HTP_NEAR = { x: 630, y: 1560, w: 660, h: 600 };
const HTP_WIDE = { x: 1040, y: 1360, w: 880, h: 800 };

function htpRounds() {
    try { return parseInt(localStorage.getItem(HTP_SAVE), 10) || 0; } catch (e) { return 0; }
}
function htpTxt(size, color, stroke) {
    return { fontFamily: FONT, fontSize: size + 'px', color, stroke: INK, strokeThickness: stroke };
}
// His standing frame for menus and the how-to (never the toss / holding frame there).
function htpHero() { return ANSEL_POSES.hero || ANSEL_POSES.stand; }

// Rows: { p, c } a paragraph (c: colour name); { ic, t } an icon and its text.
// touch / desk rows only show for that kind of player. Icons: { img, f, s, tint, n }
// a sprite (n copies); { keys: [...] } keycaps ('left' 'right' 'up' 'down', 'SPACE',
// or a letter); { bubble: text } a speech bubble.
const HTP_PAGES = [
    { title: "STACK 'EM UP", art: 'htpArtStack', rows: [
        { p: 'PICK UP PUMPKINS AND STACK THEM ON THE HAY BALE, AS TALL AS YOU DARE.' },
        { ic: { img: 'target', s: 0.7 }, t: 'THE RING MARKS THE LANDING.' },
        { ic: { img: 'pumpkin_deep_xl', s: 0.6 }, t: 'HEAVY ONES MAKE A STEADY BASE.' },
        { touch: true, ic: { img: 'hand' }, t: 'TAP A PUMPKIN TO PICK IT UP.' },
        { touch: true, ic: { img: 'hand' }, t: 'TAP AGAIN TO DROP IT.' },
        { desk: true, ic: { keys: ['left', 'right'] }, t: 'WALK (A, D)' },
        { desk: true, ic: { keys: ['down'] }, t: 'PICK UP (S)' },
        { desk: true, ic: { keys: ['SPACE'] }, t: 'LIFT, DROP (↑, W)' },
    ] },
    { title: "DON'T LET IT FALL", art: 'htpArtFall', rows: [
        { p: 'A PUMPKIN THAT ROLLS OR FALLS OFF THE TOWER COSTS A PUMPKIN LIFE.' },
        { ic: { img: 'windsock', f: 6, s: 0.3 }, t: 'GUSTS PUSH THE PUMPKIN AND TIP CROOKED TOWERS.' },
        { p: 'START WITH 3. EARN UP TO 5:', c: 'gold' },
        { ic: { img: 'sparkle', n: 3 }, t: '3 PERFECT DROPS IN A ROW' },
        { ic: { img: 'haybale', s: 0.5 }, t: 'BOOM A TALL TOWER' },
        { ic: { img: 'egg_cloud_2', s: 0.6 }, t: 'REACH NEW HEIGHTS' },
        { ic: { img: 'pumpkin_golden', s: 0.6 }, t: 'GOLDEN PUMPKINS' },
    ] },
    { title: 'BOOM!', art: 'htpArtBoom', rows: [
        { p: 'ONCE THE TOWER IS 3 TALL, A BOOM SIGN SHOWS UP AT THE FOOT OF THE BALE.' },
        { p: "BOOM BANKS THE TOWER'S POINTS AND KNOCKS IT DOWN. TALLER TOWER, BIGGER BONUS." },
        { p: 'IF IT FALLS FIRST, THOSE POINTS ARE LOST.', c: 'orange' },
        { p: 'ONE MORE, OR CASH IN NOW?', c: 'gold' },
        { touch: true, ic: { img: 'hand' }, t: 'TAP THE BALE TO BOOM.' },
        { desk: true, ic: { keys: ['B'] }, t: 'HOLD B TO BOOM, OR CLICK THE BALE.' },
    ] },
    { title: 'BEAT THE SUNSET', art: 'htpArtDay', rows: [
        { p: 'A ROUND IS ONE AFTERNOON: GOLD, THEN DUSK.' },
        { p: "AT SUNSET, OR WHEN YOUR LIVES RUN OUT, ANSEL BOOMS WHAT'S STILL STANDING.", c: 'gold' },
        { ic: { img: 'sprout', s: 1 }, t: 'VINE PUMPKINS GROW BIGGER OVER TIME. TAP ONE TO PICK IT, OR A SPROUT TO WATER IT.' },
        { ic: { img: 'leafpile_a', s: 0.55 }, t: 'LEAF PILES HIDE SOME. NOTHING LEFT? TAP: MORE!' },
        { ic: { img: 'sparkle', n: 2 }, t: 'TAP THE SCENERY, TOO.' },
        { desk: true, ic: { keys: ['P', 'M'] }, t: 'PAUSE, MUTE' },
    ] },
];

// ── loading (PatchScene) ─────────────────────────────────────────────────────
const PatchHtp = {
    htpPreload() {
        this.load.spritesheet('keys', ART + 'keys.png', { frameWidth: 52, frameHeight: 52 });
        this.load.image('key_wide', ART + 'key_wide.png');
        this.load.image('icon_home', ART + 'icon_home.png');
    },
};

// ── the card, the title extras, the pause menu's buttons (UIScene) ───────────
const UIHtp = {
    htpCreate() {
        const H = this.htp = { open: false, mode: null, page: 0, pass: false, leaving: false,
            timers: [], plain: [], down: null, desk: DESKTOP, openedAt: -1e9 };
        H.shade = this.add.rectangle(0, 0, 10, 10, HTP_COL.ink, 0.7).setOrigin(0).setDepth(140).setVisible(false);
        H.root = this.add.container(0, 0).setDepth(150).setVisible(false);
        H.panel = this.add.nineslice(0, 0, 'panel', null, 100, 100, 20, 20, 20, 20);
        H.wood = this.add.tileSprite(0, 0, 80, 80, 'panel', 'planks');
        H.title = this.add.text(0, 0, '', htpTxt(36, HTP_COL.orange, 10)).setOrigin(0.5);
        H.pageC = this.add.container(0, 0);
        H.skip = this.htpButton('SKIP', 20, 156, 68);
        H.back = this.htpButton('BACK', 20, 156, 68);
        H.next = this.htpButton('NEXT', 24, 184, 68, HTP_COL.gold);
        H.dots = HTP_PAGES.map(() => this.add.image(0, 0, 'icon_pumpkin'));
        // darker wood so the buttons read as buttons on the sign; NEXT in warm orange
        H.skip.bg.setTint(0xb88a64); H.back.bg.setTint(0xb88a64); H.next.bg.setTint(0xffb070);
        H.root.add([H.panel, H.wood, H.title, H.pageC, H.skip, H.back, H.next, ...H.dots]);
        H.maskG = this.make.graphics({ add: false });
        H.mask = H.maskG.createGeometryMask();
        this.htpTitleCreate();
        this.htpPauseCreate();

        this.input.on('pointerup', p => this.htpPointerUp(p));
        this.scale.on('resize', size => this.htpLayout(size.width, size.height));
        this.events.on('update', () => this.htpTitleSync());
        this.htpLayout(this.scale.width, this.scale.height);
    },

    // A wooden button: container with a hit size (bw x bh) and a label.
    htpButton(label, size, w, h, color) {
        const c = this.add.container(0, 0);
        c.bg = this.add.nineslice(0, 0, 'panel', null, w, h, 20, 20, 20, 20);
        c.label = this.add.text(0, 2, label, htpTxt(size, color || HTP_COL.cream, 6)).setOrigin(0.5);
        c.add([c.bg, c.label]);
        c.bw = w; c.bh = h;
        return c;
    },

    // ...with the little red barn: back to the Uppah home page
    htpHomeButton() {
        const b = this.htpButton('HOME', 20, 188, 84);
        b.label.setX(26);
        b.add(this.add.image(-52, -2, 'icon_home'));
        if (!HTP_HOME) { b.setVisible(false); b.setVisible = function () { return this; }; }
        return b;
    },

    htpHit(btn, p) {
        if (!btn || !btn.visible) return false;
        for (let o = btn; o; o = o.parentContainer) if (!o.visible) return false;
        const m = btn.getWorldTransformMatrix();
        return Math.abs(p.x - m.tx) < btn.bw / 2 && Math.abs(p.y - m.ty) < btn.bh / 2;
    },

    // ── title extras ─────────────────────────────────────────────────────────
    htpTitleCreate() {
        const H = this.htp, T = this.t;
        H.bands = this.add.graphics();
        this.title.addAt(H.bands, 0);
        if (T.shade) T.shade.setVisible(false);
        H.best = this.add.text(0, 0, '', htpTxt(20, HTP_COL.gold, 6)).setOrigin(0.5);
        H.help = this.htpButton('?', 36, 84, 84, HTP_COL.gold);
        H.help.label.setPosition(2, 4);
        H.home = this.htpHomeButton();
        this.title.add([H.best, H.help, H.home]);
        // the sound button stays visible (and in reach) over the title
        if (this.soundBtn) this.soundBtn.setDepth(101);
        if (this.soundIcon) this.soundIcon.setDepth(101);
        this.tweens.add({ targets: H.help, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    },

    // Keeps the extras lined up with the title (whatever size it is), redraws the stepped
    // bands when the title's layout changes, and keeps the in-round HUD off the title.
    htpTitleSync() {
        const H = this.htp, T = this.t;
        if (!H) return;
        this.htpHud(!this.patch.started);
        if (!this.title.visible) return;
        const w = this.scale.width, h = this.scale.height;
        const b = this.patch.best || {};
        const line = b.score ? 'BEST ' + Number(b.score).toLocaleString('en-US') + (b.count ? ' · TALLEST ' + b.count : '') : '';
        if (H.best.text !== line) H.best.setText(line);
        const t2 = T.t2.getBounds(), howB = T.how ? T.how.getBounds() : { top: h * 0.8 };
        H.best.setPosition(w / 2, t2.bottom + 30);
        const top = Math.round((line ? t2.bottom + 60 : t2.bottom + 30) / 8) * 8;
        const bot = Math.round((howB.top - 30) / 8) * 8;
        const key = [w, h, top, bot].join();
        if (key === H.bandKey) return;
        H.bandKey = key;
        // a see-through veil over the live patch, darker in steps behind the title and the hints
        const g = H.bands.clear(), steps = 8, veil = 0.42, dark = 0.84;
        g.fillStyle(0x2b1810, veil).fillRect(0, top, w, bot - top);
        for (let i = 0; i < steps; i++) {
            const a = dark - (dark - veil) * i / steps;
            g.fillStyle(0x2b1810, a).fillRect(0, Math.round(top * i / steps), w, Math.ceil(top / steps));
            const y0 = bot + Math.round((h - bot) * i / steps), b2 = veil + (dark - veil) * (i + 1) / steps;
            g.fillStyle(0x2b1810, b2).fillRect(0, y0, w, Math.ceil((h - bot) / steps));
        }
    },

    // The round's HUD (count panel, score, lives) means nothing on the title, and the patch's
    // own Ansel would stand behind the title's: hide them from their cameras there (their
    // visibility and alpha stay their own business).
    htpHud(hide) {
        const H = this.htp, cam = this.cameras.main;
        if (hide === !!H.hudHidden) return;
        H.hudHidden = hide;
        const P = this.patch, pc = P.cameras.main, a = P.ansel;
        if (a) [a.img, a.shadow].forEach(o => { if (o) o.cameraFilter = hide ? o.cameraFilter | pc.id : o.cameraFilter & ~pc.id; });
        if (hide) {
            const r = this.panel.getBounds();
            H.hud = this.children.list.filter(o => o !== this.title && o.depth < 50 && o.x >= r.left - 4 &&
                o.x <= r.right + 4 && o.y >= r.top - 4 && o.y <= r.bottom + 4);
            H.hud.forEach(o => { o.cameraFilter |= cam.id; });
        } else {
            (H.hud || []).forEach(o => { o.cameraFilter &= ~cam.id; });
        }
    },

    // ── pause menu: HOW TO PLAY and HOME under PAUSED ────────────────────────
    htpPauseCreate() {
        const H = this.htp, P = this.pauseUi;
        if (!P || !P.root) return;
        H.pHelp = this.htpButton('HOW TO PLAY', 20, 300, 84, HTP_COL.gold);
        H.pHome = this.htpHomeButton();
        P.root.add([H.pHelp, H.pHome]);
    },

    // ── showing and hiding ───────────────────────────────────────────────────
    // mode: 'auto' (after the title tap; ends by starting the round), 'title' (the "?"
    // button: CLOSE goes back to the title, PLAY! starts) or 'pause' (back to the pause menu).
    showHowTo(mode = 'title', onClose = null) {
        const H = this.htp;
        if (!H || H.open) return;
        Sfx.init(); // a tap or a key got us here, so the music may start
        Object.assign(H, { open: true, mode, onClose, openedAt: this.time.now, down: null });
        if (mode !== 'pause') {
            this.tweens.killTweensOf(this.title);
            this.tweens.add({ targets: this.title, alpha: 0, duration: 200 });
        }
        H.shade.setVisible(true).setAlpha(0);
        H.root.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: [H.shade, H.root], alpha: 1, duration: 220 });
        H.page = 0;
        this.htpBuildPage();
    },

    hideHowTo() {
        const H = this.htp;
        if (!H.open) return;
        H.open = false;
        H.down = null;
        this.tweens.add({ targets: [H.shade, H.root], alpha: 0, duration: 180, onComplete: () => {
            if (H.open) return;
            H.shade.setVisible(false);
            H.root.setVisible(false);
            this.htpClear();
        } });
    },

    // Called from startGame(): true when the card takes over (it starts the game when done).
    htpGate() {
        const H = this.htp;
        if (!H) return false;
        if (H.leaving || H.open) return true;
        if (H.pass || htpRounds() >= HTP_AUTO) return false;
        this.showHowTo('auto');
        return true;
    },

    htpRoundStarted() {
        try { localStorage.setItem(HTP_SAVE, String(htpRounds() + 1)); } catch (e) {}
    },

    htpGo(i) {
        const H = this.htp;
        i = Phaser.Math.Clamp(i, 0, HTP_PAGES.length - 1);
        if (i === H.page) return;
        H.page = i;
        Sfx.pop();
        this.htpBuildPage();
    },

    htpNext() {
        const H = this.htp;
        if (H.page < HTP_PAGES.length - 1) this.htpGo(H.page + 1);
        else this.htpFinish('done');
    },

    // done: the last page's PLAY! / DONE. skip: SKIP / CLOSE.
    htpFinish(kind) {
        const H = this.htp, mode = H.mode;
        this.hideHowTo();
        if (mode === 'pause') { if (H.onClose) H.onClose(); return; }
        if (mode === 'title' && kind === 'skip') {
            this.tweens.killTweensOf(this.title);
            this.tweens.add({ targets: this.title, alpha: 1, duration: 250 });
            return;
        }
        H.pass = true;
        Sfx.pickup();
        this.startGame();
    },

    htpLeave() {
        const H = this.htp;
        H.leaving = true;
        Sfx.pop();
        this.cameras.main.fadeOut(250, 27, 19, 13);
        this.time.delayedCall(260, () => { window.location.href = HTP_HOME; });
    },

    // ── input ────────────────────────────────────────────────────────────────
    // UIScene's tap handler asks this first: true means the tap was ours.
    htpTap(p) {
        const H = this.htp;
        if (!H) return false;
        if (H.leaving) return true;
        if (!H.open) {
            if (this.paused) {
                if (this.htpHit(H.pHelp, p)) { Sfx.pop(); this.showHowTo('pause'); return true; }
                if (this.htpHit(H.pHome, p)) { this.htpLeave(); return true; }
                return false;
            }
            if (this.patch.started || !this.title.visible || this.title.alpha < 0.6) return false;
            if (this.htpHit(H.help, p)) { Sfx.init(); Sfx.pop(); this.showHowTo('title'); return true; }
            if (this.htpHit(H.home, p)) { this.htpLeave(); return true; }
            return false;
        }
        H.down = null;
        if (this.hitButton(p)) return false; // the sound button still works
        if (this.time.now - H.openedAt < 150) return true;
        if (this.htpHit(H.skip, p)) { this.htpFinish('skip'); return true; }
        if (this.htpHit(H.back, p)) { this.htpGo(H.page - 1); return true; }
        if (this.htpHit(H.next, p)) { this.htpNext(); return true; }
        const dot = H.dots.findIndex(d => Math.abs(p.x - H.root.x - d.x) < 24 && Math.abs(p.y - H.root.y - d.y) < 28);
        if (dot >= 0) { this.htpGo(dot); return true; }
        H.down = { x: p.x, y: p.y };
        return true;
    },

    // A swipe turns the page; a plain tap on the card goes on (not past the last page).
    htpPointerUp(p) {
        const H = this.htp;
        if (!H.open || !H.down) return;
        const dx = p.x - H.down.x, dy = p.y - H.down.y;
        H.down = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { this.htpGo(H.page + (dx < 0 ? 1 : -1)); return; }
        const inCard = Math.abs(p.x - H.root.x) < H.cw / 2 && Math.abs(p.y - H.root.y) < H.ch / 2;
        if (inCard && Math.abs(dx) < 24 && Math.abs(dy) < 24 && H.page < HTP_PAGES.length - 1) this.htpNext();
    },

    // UIScene's key handler asks this first: true means the key was ours. (M still mutes.)
    htpKey(e) {
        const H = this.htp, code = e.code;
        if (!H || H.leaving) return !!H;
        const help = e.key === '?' || code === 'KeyH';
        if (!H.open) {
            if (help && (this.paused || (!this.patch.started && this.title.visible))) {
                this.showHowTo(this.paused ? 'pause' : 'title');
                return true;
            }
            return false;
        }
        if (code === 'KeyM') return false;
        if (this.time.now - H.openedAt < 150) return true; // the key that opened it
        if (['ArrowRight', 'KeyD', 'Space', 'Enter', 'ArrowUp', 'KeyW'].includes(code)) this.htpNext();
        else if (code === 'ArrowLeft' || code === 'KeyA') this.htpGo(H.page - 1);
        else if (code === 'Escape' || code === 'Backspace' || help) this.htpFinish('skip');
        else if (/^Digit[1-9]$/.test(code)) this.htpGo(Number(code.slice(5)) - 1);
        return true;
    },

    // ── layout ───────────────────────────────────────────────────────────────
    htpLayout(w, h) {
        const H = this.htp, portrait = h > w;
        H.portrait = portrait;
        H.shade.setSize(w, h);
        H.cw = portrait ? Math.min(w - 28, 692) : Math.min(w - 56, 1184);
        H.ch = portrait ? Math.min(h - (h < 1100 ? 40 : 200), 1340) : h - 32; // short screens: all the room
        H.root.setPosition(Math.round(w / 2), Math.round(h / 2));
        H.panel.setSize(H.cw, H.ch);
        H.wood.setSize(H.cw - 24, H.ch - 24);
        H.title.setPosition(0, -H.ch / 2 + 58);
        const fy = H.ch / 2 - 58, pad = portrait ? 34 : 44;
        H.skip.setPosition(-H.cw / 2 + pad + 78, fy);
        H.next.setPosition(H.cw / 2 - pad - 92, fy);
        H.back.setPosition(H.next.x - 184 / 2 - 18 - 78, fy);
        const dotY = portrait ? fy - 76 : fy, dotX = portrait ? 0 : (H.skip.x + 78 + H.back.x - 78) / 2;
        H.dots.forEach((d, i) => d.setPosition(dotX + (i - (H.dots.length - 1) / 2) * 44, dotY));
        // title: HOME top left; "?" where the pause button goes in a round (it's hidden here)
        H.home.setPosition(20 + 94, 62);
        H.help.setPosition(w - 170, 62);
        H.bandKey = null;
        // pause menu: the two buttons under PAUSED / TAP TO PLAY
        if (H.pHelp) {
            const y = h / 2 + 170;
            H.pHelp.setPosition(w / 2 - 104, y);
            H.pHome.setPosition(w / 2 + 160, y);
        }
        if (H.open) this.htpBuildPage();
    },

    // Clears the page: its timers, its tweens, its objects.
    htpClear() {
        const H = this.htp;
        H.timers.forEach(t => t.remove(false));
        H.timers = [];
        (H.plain || []).forEach(o => this.tweens.killTweensOf(o)); // tweened plain objects (sway, day)
        H.plain = [];
        const kill = o => { this.tweens.killTweensOf(o); if (o.list) o.list.forEach(kill); };
        kill(H.pageC);
        H.pageC.removeAll(true);
    },

    // The scenes' sound effects play through their first run only, not on every loop.
    htpSfx(name, ...args) {
        if (this.time.now - this.htp.builtAt < 6000 && Sfx[name]) Sfx[name](...args);
    },

    htpLater(ms, fn) {
        const H = this.htp;
        H.timers = H.timers.filter(t => t.loop || !t.hasDispatched);
        const ev = this.time.delayedCall(ms, fn);
        H.timers.push(ev);
        return ev;
    },

    // Runs fn now and every ms after (the illustrations' loops).
    htpLoop(ms, fn) {
        const ev = this.time.addEvent({ delay: ms, loop: true, callback: fn });
        this.htp.timers.push(ev);
        fn();
    },

    htpBuildPage() {
        const H = this.htp, pg = HTP_PAGES[H.page], last = H.page === HTP_PAGES.length - 1;
        this.htpClear();
        H.builtAt = this.time.now;
        H.title.setText(pg.title);
        H.skip.label.setText(H.mode === 'auto' ? 'SKIP' : 'CLOSE');
        H.next.label.setText(last ? (H.mode === 'pause' ? 'DONE' : 'PLAY!') : 'NEXT');
        H.back.setVisible(H.page > 0);
        H.dots.forEach((d, i) => d.setScale(i === H.page ? 0.62 : 0.46).setAlpha(i === H.page ? 1 : 0.4));
        this.tweens.killTweensOf(H.next);
        H.next.setScale(1);
        if (last) this.tweens.add({ targets: H.next, scale: 1.08, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

        // text rows for this kind of player
        const rows = pg.rows.filter(r => !(r.touch && H.desk) && !(r.desk && !H.desk)).map(r => this.htpRow(r));
        H.iconW = Math.max(72, ...rows.map(r => r.icon ? r.icon.iw + 22 : 0));
        const innerW = H.cw - 2 * (H.portrait ? 30 : 40);
        const top = -H.ch / 2 + 106, bottom = H.ch / 2 - (H.portrait ? 160 : 104);
        const avail = bottom - top;
        let gap = 16;
        const measure = tw => rows.reduce((s, r) => s + this.htpRowFit(r, tw) + gap, -gap);
        // Squarer screens wrap the text onto more lines. Rather than let it run into the buttons,
        // step the text down a little (and tighten the gaps) until the page fits.
        const STEPS = [[20, 16], [18, 12], [17, 10], [16, 8], [15, 6]];
        const setSize = ([px, g]) => {
            gap = g;
            rows.forEach(r => r.text.setFontSize(px).setLineSpacing(Math.round(px / 2)));
        };
        let artW, artH, tw, th;
        if (H.portrait) {
            tw = innerW;
            for (const st of STEPS) {
                setSize(st);
                th = measure(tw);
                if (th + 30 + 220 <= avail) break;
            }
            artW = innerW;
            // the picture takes what the text leaves; on a short screen it goes, never the words
            const room = avail - th - 30;
            artH = room >= 120 ? Math.min(Math.round(artW / 1.1), room) : 0;
            artW = Math.min(artW, Math.round(artH * 1.1));
            const used = (artH ? artH + 30 : 0) + th, y0 = top + Math.max(0, (avail - used) / 2);
            if (artH) this.htpArtBox(pg.art, -artW / 2, y0, artW, artH);
            this.htpPlaceRows(rows, -tw / 2, y0 + (artH ? artH + 30 : 0), gap);
        } else {
            // give the picture as much room as the text allows, then shrink the text if needed
            let fits = false;
            for (const st of STEPS) {
                setSize(st);
                for (let f = 0.46; f >= 0.28; f -= 0.02) {
                    artW = Math.round(innerW * f);
                    th = measure(innerW - artW - 32);
                    if (th <= avail) { fits = true; break; }
                }
                if (fits) break;
            }
            const x0 = -innerW / 2;
            if (!fits) {
                // a very square screen: the text gets the whole width and the picture steps aside
                th = measure(innerW);
                this.htpPlaceRows(rows, x0, top + Math.max(0, (avail - th) / 2), gap);
                return;
            }
            artH = Math.min(avail, Math.round(artW / 1.1));
            artW = Math.round(artH * 1.1);
            th = measure(innerW - artW - 32);
            this.htpArtBox(pg.art, x0, top + (avail - artH) / 2, artW, artH);
            this.htpPlaceRows(rows, x0 + artW + 32, top + Math.max(0, (avail - th) / 2), gap);
        }
    },

    // ── text rows ────────────────────────────────────────────────────────────
    htpRow(r) {
        const color = HTP_COL[r.c] || HTP_COL.cream;
        const text = this.add.text(0, 0, r.p || r.t, Object.assign(htpTxt(20, color, 6), { lineSpacing: 10 }));
        const icon = r.ic ? this.htpIcon(r.ic) : null;
        this.htp.pageC.add(icon ? [icon, text] : [text]);
        return { text, icon };
    },

    // Wraps the row to width tw and returns its height.
    htpRowFit(row, tw) {
        row.text.setWordWrapWidth(row.icon ? tw - this.htp.iconW : tw);
        row.h = Math.max(row.text.height, row.icon ? row.icon.ih : 0);
        return row.h;
    },

    htpPlaceRows(rows, x, y, gap) {
        for (const r of rows) {
            if (r.icon) {
                const iw = this.htp.iconW;
                r.icon.setPosition(x + (iw - 14) / 2, y + r.h / 2);
                r.text.setPosition(x + iw, y + (r.h - r.text.height) / 2);
            } else {
                r.text.setPosition(x, y);
            }
            y += r.h + gap;
        }
    },

    htpIcon(ic) {
        const c = this.add.container(0, 0);
        c.ih = 44;
        if (ic.keys) {
            const parts = ic.keys.map(k => {
                if (k === 'SPACE') {
                    const kc = this.add.container(0, 0, [this.add.image(0, 0, 'key_wide'),
                        this.add.text(0, -4, 'SPACE', htpTxt(20, '#2b1810', 0)).setOrigin(0.5)]);
                    kc.kw = 132;
                    return kc;
                }
                const arrow = ['left', 'right', 'up', 'down'].indexOf(k);
                const kc = this.add.container(0, 0, [this.add.image(0, 0, 'keys', arrow + 1)]);
                if (arrow < 0) kc.add(this.add.text(1, -3, k, htpTxt(20, '#2b1810', 0)).setOrigin(0.5));
                kc.kw = 52;
                return kc;
            });
            const total = parts.reduce((s, k) => s + k.kw, 0) + 6 * (parts.length - 1);
            let x = -total / 2;
            for (const k of parts) { k.setX(x + k.kw / 2); x += k.kw + 6; c.add(k); }
            c.ih = 52;
            c.iw = total;
        } else if (ic.bubble) {
            const t = this.add.text(0, -6, ic.bubble, htpTxt(20, '#2b1810', 0)).setOrigin(0.5);
            const bw = t.width + 28;
            c.add([this.add.nineslice(0, 18, 'bubble', null, bw, 52, 16, 16, 16, 16).setOrigin(0.5, 1),
                this.add.image(-bw / 4, 16, 'bubble_tail').setOrigin(0.5, 0), t]);
            c.ih = 56;
            c.iw = bw;
        } else {
            const key = this.textures.exists(ic.img) ? ic.img : 'sparkle';
            const n = ic.n || 1;
            for (let i = 0; i < n; i++) {
                const im = this.add.image((i - (n - 1) / 2) * 30, 0, key, ic.f).setScale(ic.s || 1);
                if (ic.tint) im.setTint(ic.tint);
                c.add(im);
                c.ih = Math.max(c.ih, im.displayHeight);
                c.iw = (n - 1) * 30 + im.displayWidth;
            }
            if (ic.img === 'sparkle') this.tweens.add({ targets: c.list, scale: 1.25, duration: 500, yoyo: true, repeat: -1,
                delay: this.tweens.stagger(160), ease: 'Sine.InOut' });
        }
        return c;
    },

    // ── illustrations ────────────────────────────────────────────────────────
    // A framed window at (x, y) on the card, artW x artH, onto a little scene built
    // in world px (HTP_NEAR or HTP_WIDE), scaled to fit and clipped to the frame.
    htpArtBox(name, x, y, artW, artH) {
        const H = this.htp;
        H.pageC.add(this.add.rectangle(x - 6, y - 6, artW + 12, artH + 12, 0x2b1810).setOrigin(0));
        const box = name === 'htpArtDay' ? HTP_WIDE : HTP_NEAR;
        const s = Math.min(artW / box.w, artH / box.h);
        const c = this.add.container(x + (artW - box.w * s) / 2, y + (artH - box.h * s) / 2).setScale(s);
        c.s = s;
        c.box = box;
        H.pageC.add(c);
        H.maskG.clear().fillStyle(0xffffff).fillRect(H.root.x + x, H.root.y + y, artW, artH);
        c.setMask(H.mask);
        // the patch itself: background, the silo's pumpkin, the fence in front
        const crop = key => this.add.image(-box.x, -box.y, key).setOrigin(0).setCrop(box.x, box.y, box.w, box.h);
        c.add(crop('background'));
        if (box === HTP_NEAR) c.add(this.add.image(SILO_X - box.x, SILO_TOP_Y + 8 - box.y, 'silo_pumpkin').setOrigin(0.5, 1));
        c.add(crop('foreground'));
        this[name](c);
    },

    // helpers in the scene's world px (relative to its box)
    htpW(c, x, y) { return { x: x - c.box.x, y: y - c.box.y }; },

    htpPumpkin(c, key, x, bottom) {
        const spec = PUMPKIN_SPECS[key], bh = (spec.h + 1) * 4, imgH = (spec.h + 8) * 4;
        const p = this.htpW(c, x, bottom - bh / 2);
        const img = this.add.image(p.x, p.y, key).setOrigin(0.5, (24 + 2 * spec.h) / imgH);
        img.bw = (spec.w + 1) * 4; img.bh = bh;
        c.add(img);
        return img;
    },

    // a tower on the bale, bottom first: returns its pumpkins and the y of its top
    htpTower(c, keys, x = HAY_X) {
        let top = HAY_TOP;
        const items = keys.map(k => { const it = this.htpPumpkin(c, k, x, top); top -= it.bh; return it; });
        return { items, top };
    },

    htpBale(c, x = HAY_X) {
        const p = this.htpW(c, x, GROUND + 4);
        c.add(this.add.image(p.x, p.y, 'shadow').setScale(1.35, 1));
        const img = this.add.image(p.x, p.y, 'haybale').setOrigin(0.5, 1);
        c.add(img);
        return img;
    },

    // Ansel in his everyday clothes, feet at (x, GROUND); frame names as in ANSEL_POSES.
    htpAnsel(c, frame, x, dir = 1) {
        const AF = this.patch.anselData, p = this.htpW(c, x, GROUND);
        c.add(this.add.image(p.x, p.y + 4, 'shadow'));
        const img = this.add.image(p.x, p.y, this.patch.anselKey(frame, 'everyday')).setFlipX(dir < 0);
        if (AF) img.setOrigin(AF.footX / AF.w, AF.footY / AF.h);
        else img.setOrigin(0.5, 1);
        c.add(img);
        return img;
    },

    htpPose(img, frame) { img.setTexture(this.patch.anselKey(frame, 'everyday')); },

    // text inside a scaled scene, sized in screen px so it stays readable
    htpArtText(c, x, y, text, px, color) {
        const t = this.add.text(x, y, text, htpTxt(Math.round(px / c.s), color, Math.round(7 / c.s))).setOrigin(0.5);
        c.add(t);
        return t;
    },

    htpPop(c, x, y, text, px, color) {
        const t = this.htpArtText(c, x, y, text, px, color).setScale(0.3);
        this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' });
        this.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 900, duration: 500, onComplete: () => t.destroy() });
        return t;
    },

    htpSparkles(c) {
        const e = this.add.particles(0, 0, 'sparkle', {
            lifespan: { min: 450, max: 800 }, speed: { min: 120, max: 320 }, angle: { min: 0, max: 360 },
            scale: { start: 1.5, end: 0 }, rotate: { start: 0, end: 180 }, emitting: false,
        });
        c.add(e);
        return e;
    },

    htpHand(c) {
        const h = this.add.image(0, 0, 'hand').setOrigin(0.4, 0).setScale(1.3).setVisible(false);
        c.add(h);
        return h;
    },

    htpTapAt(hand, x, y) {
        hand.setPosition(x, y).setVisible(true).setAlpha(1).setScale(1.3);
        this.tweens.add({ targets: hand, y: y - 14, scale: 1.15, duration: 110, yoyo: true });
        this.tweens.add({ targets: hand, alpha: 0, delay: 600, duration: 200 });
    },

    // 1. A pumpkin sways over the tower with its landing ring under it; a tap drops it
    //    dead centre: PERFECT!
    htpArtStack(c) {
        this.htpBale(c);
        const tower = this.htpTower(c, ['pumpkin_deep_xl', 'pumpkin_orange_l']);
        this.htpPumpkin(c, 'pumpkin_white_m', 1200, GROUND);
        this.htpAnsel(c, htpHero(), 790);
        const top = this.htpW(c, HAY_X, tower.top);
        const ring = this.add.image(top.x, top.y + 6, 'target').setAlpha(0.75);
        c.add(ring);
        const pk = this.htpPumpkin(c, 'pumpkin_orange_m', HAY_X, tower.top - 150);
        ring.setScale(pk.bw / 128, 1);
        const hoverY = pk.y, restY = top.y - pk.bh / 2;
        const hand = this.htpHand(c), fx = this.htpSparkles(c);
        const sway = { u: -1 };
        this.htp.plain.push(sway);
        const place = () => { pk.x = top.x + sway.u * 80; ring.setX(pk.x); };
        this.htpLoop(3900, () => {
            pk.setPosition(top.x - 80, hoverY).setAlpha(1).setScale(1).setAngle(0);
            ring.setVisible(true);
            sway.u = -1;
            place();
            const tw = this.tweens.add({ targets: sway, u: 1, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut', onUpdate: place });
            this.htpLater(1990, () => {
                this.htpTapAt(hand, top.x + 46, hoverY + 30);
                tw.stop();
                sway.u = 0;
                place();
                this.htpLater(90, () => {
                    ring.setVisible(false);
                    this.tweens.add({ targets: pk, y: restY, duration: 180, ease: 'Quad.In', onComplete: () => {
                        this.tweens.add({ targets: pk, scaleX: 1.12, scaleY: 0.88, duration: 70, yoyo: true });
                        fx.explode(18, top.x, top.y);
                        this.htpPop(c, top.x, top.y - 150, 'PERFECT!', 24, HTP_COL.gold);
                        this.htpSfx('perfect', 1);
                    } });
                });
            });
            this.htpLater(3500, () => this.tweens.add({ targets: pk, alpha: 0, duration: 260 }));
        });
    },

    // 2. A pumpkin lands too far off the edge, rolls off and falls: a life goes dark.
    //    Then one flies back in (lives can be earned back).
    htpArtFall(c) {
        this.htpBale(c);
        const tower = this.htpTower(c, ['pumpkin_deep_xl', 'pumpkin_orange_l']);
        const top = this.htpW(c, HAY_X, tower.top);
        // the life row, like the HUD's
        const row = this.add.container(30, 28);
        row.add(this.add.nineslice(0, 0, 'panel', null, 3 * 84 + 40, 116, 20, 20, 20, 20).setOrigin(0));
        const lives = [0, 1, 2].map(i => { const im = this.add.image(62 + i * 84, 58, 'icon_pumpkin').setScale(1.25); row.add(im); return im; });
        c.add(row);
        const pk = this.htpPumpkin(c, 'pumpkin_white_m', HAY_X + 60, tower.top - 160);
        const hoverY = pk.y, restY = top.y - pk.bh / 2, groundY = GROUND - c.box.y - pk.bh / 2;
        const fx = this.htpSparkles(c);
        const flash = this.add.rectangle(0, 0, c.box.w, c.box.h, 0xff3020, 0).setOrigin(0);
        c.add(flash);
        this.htpLoop(5600, () => {
            pk.setPosition(top.x + 60, hoverY).setAngle(0).setAlpha(1);
            lives.forEach(l => l.setAlpha(1).clearTint().setScale(1.25));
            this.tweens.add({ targets: pk, y: restY, delay: 500, duration: 200, ease: 'Quad.In', onComplete: () => {
                this.htpSfx('thunk', 20, 3);
                this.tweens.add({ targets: pk, angle: 16, x: pk.x + 14, duration: 320, ease: 'Sine.In', onComplete: () => {
                    this.htpSfx('uhoh');
                    this.tweens.add({ targets: pk, x: pk.x + 170, angle: 220, duration: 700, ease: 'Linear' });
                    this.tweens.add({ targets: pk, y: groundY, duration: 700, ease: 'Quad.In', onComplete: () => {
                        this.tweens.add({ targets: pk, y: groundY - 26, duration: 140, yoyo: true, ease: 'Quad.Out' });
                        this.htpPop(c, pk.x, groundY - 90, '-1', 28, HTP_COL.red);
                        lives[2].setAlpha(0.3).setTint(0x5a4a3a);
                        this.tweens.add({ targets: lives[2], scale: 1.0, duration: 90, yoyo: true, repeat: 2 });
                        flash.setFillStyle(0xff3020, 0.3);
                        this.tweens.add({ targets: flash, fillAlpha: 0, duration: 300 });
                    } });
                } });
            } });
            // ...and a life flies back in
            this.htpLater(3400, () => {
                const fly = this.add.image(top.x, top.y - 40, 'icon_pumpkin').setScale(1.6);
                c.add(fly);
                const tx = row.x + lives[2].x, ty = row.y + lives[2].y;
                this.htpSfx('pickup');
                this.tweens.add({ targets: fly, x: tx, duration: 750, ease: 'Sine.InOut' });
                this.tweens.add({ targets: fly, y: { value: ty, ease: 'Back.In' }, angle: 360, scale: 1.25, duration: 750, onComplete: () => {
                    fly.destroy();
                    lives[2].setAlpha(1).clearTint();
                    this.tweens.add({ targets: lives[2], scale: 1.6, duration: 140, yoyo: true });
                    fx.explode(12, tx, ty);
                    this.htpPop(c, tx + 120, ty + 30, '+1', 26, HTP_COL.gold);
                    this.htpSfx('bonus');
                } });
            });
            this.htpLater(5200, () => this.tweens.add({ targets: pk, alpha: 0, duration: 250 }));
        });
    },

    // 3. A four-pumpkin tower with the BOOM sign on its bale; a tap sends Ansel to shove
    //    it, it goes flying, and its points are banked.
    htpArtBoom(c) {
        this.htpBale(c);
        const keys = ['pumpkin_deep_xl', 'pumpkin_orange_l', 'pumpkin_green_m', 'pumpkin_orange_s'];
        const tower = this.htpTower(c, keys);
        const homes = tower.items.map(it => ({ x: it.x, y: it.y }));
        const top = this.htpW(c, HAY_X, tower.top);
        const sp = this.htpW(c, HAY_X, GROUND - 24);  // its top edge, at the bale's foot
        const sign = this.add.container(sp.x, sp.y);
        const st = this.htpArtText(c, 0, 0, 'BOOM!', 22, HTP_COL.orange);
        const sv = this.htpArtText(c, 0, 0, '+1,260', 20, HTP_COL.gold);
        const sw = Math.max(st.width, sv.width) + 40, sh = st.height + sv.height + 18;
        st.setY(12 + st.height / 2);
        sv.setY(sh - 12 - sv.height / 2);
        sign.add([this.add.nineslice(0, sh / 2, 'panel', null, sw, sh, 20, 20, 20, 20), st, sv]);
        c.add(sign);
        const walk = (ANSEL_CYCLES.walk && ANSEL_CYCLES.walk.everyday) || [htpHero()];
        const ansel = this.htpAnsel(c, htpHero(), 690);
        const startX = ansel.x, shoveX = HAY_X - 150 - c.box.x;
        const hand = this.htpHand(c), fx = this.htpSparkles(c);
        const burst = this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7], lifespan: { min: 900, max: 1600 },
            speedX: { min: -320, max: 320 }, speedY: { min: -620, max: -240 }, gravityY: 620,
            rotate: { start: 0, end: 720 }, scale: { min: 1, max: 1.4 }, emitting: false,
        });
        c.add(burst);
        this.htpLoop(5600, () => {
            tower.items.forEach((it, i) => it.setPosition(homes[i].x, homes[i].y).setAngle(0).setAlpha(1));
            sign.setVisible(true).setScale(1).setAngle(0);
            this.tweens.add({ targets: sign, angle: { from: -4, to: 4 }, duration: 90, yoyo: true, repeat: 2, delay: 300,
                onComplete: () => sign.setAngle(0) });
            ansel.setX(startX);
            this.htpPose(ansel, htpHero());
            this.htpLater(800, () => this.htpTapAt(hand, sp.x + 30, sp.y + 30));
            this.htpLater(1000, () => {
                let f = 0;
                const run = this.time.addEvent({ delay: 80, repeat: 5, callback: () => this.htpPose(ansel, walk[++f % walk.length]) });
                this.htp.timers.push(run);
                this.tweens.add({ targets: ansel, x: shoveX, duration: 480 });
            });
            this.htpLater(1500, () => this.htpPose(ansel, ANSEL_POSES.shove || htpHero()));
            this.htpLater(1700, () => {
                this.htpSfx('boom');
                sign.setVisible(false);
                fx.explode(30, top.x, top.y + 60);
                burst.explode(24, top.x, top.y + 100);
                this.tweens.add({ targets: c, x: c.x + 8, duration: 50, yoyo: true, repeat: 3 });
                tower.items.forEach((it, i) => {
                    const dx = (i % 2 ? -1 : 1) * (60 + 70 * i) + 120, up = 160 + 60 * i;
                    this.tweens.add({ targets: it, x: it.x + dx, angle: (i % 2 ? -1 : 1) * (220 + 90 * i), duration: 1000 });
                    this.tweens.add({ targets: it, y: it.y - up, duration: 380, ease: 'Quad.Out', onComplete: () =>
                        this.tweens.add({ targets: it, y: GROUND - c.box.y - it.bh / 2, duration: 520, ease: 'Quad.In' }) });
                });
                this.htpPop(c, top.x, top.y - 10, '+1,260', 30, HTP_COL.gold);
                this.htpLater(250, () => this.htpSfx('fanfare'));
                this.htpLater(500, () => this.htpPose(ansel, htpHero()));
            });
            this.htpLater(5100, () => this.tweens.add({ targets: tower.items, alpha: 0, duration: 300 }));
        });
    },

    // 4. The afternoon passes over the patch (the same light as the round's clock), while
    //    gusts flap the windsock, blow leaves through and sway a little tower.
    htpArtDay(c) {
        const bale = this.htpBale(c, 1520);
        const sway = this.add.container(bale.x, bale.y - 4 - HAY_H);
        c.add(sway);
        let topY = 0;
        for (const k of ['pumpkin_orange_l', 'pumpkin_orange_m', 'pumpkin_gold_s']) {
            const spec = PUMPKIN_SPECS[k], bh = (spec.h + 1) * 4;
            sway.add(this.add.image(0, topY - bh / 2, k).setOrigin(0.5, (24 + 2 * spec.h) / ((spec.h + 8) * 4)));
            topY -= bh;
        }
        const sockP = this.htpW(c, 1250, WINDSOCK_Y);
        const sock = this.add.sprite(sockP.x, sockP.y, 'windsock', 0).setOrigin(WINDSOCK_POLE, 1);
        c.add(sock);
        const leaves = this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7], x: -40, y: { min: 40, max: c.box.h - 160 },
            speedX: { min: 520, max: 900 }, speedY: { min: -60, max: 80 }, lifespan: 1900,
            rotate: { start: 0, end: 720 }, scale: { min: 1.1, max: 1.6 }, frequency: 70, emitting: false,
        });
        c.add(leaves);
        // dusk: the same multiply the round uses (UIScene.setDusk), over this window only
        const dusk = this.add.rectangle(0, 0, c.box.w, c.box.h, 0xffffff).setOrigin(0)
            .setBlendMode(Phaser.BlendModes.MULTIPLY);
        c.add(dusk);
        const label = this.add.container(28, 26);
        const lt = this.htpArtText(c, 0, 0, '', 20, HTP_COL.cream).setOrigin(0, 0.5);
        const lb = this.add.nineslice(0, 0, 'panel', null, 100, lt.height + 30, 20, 20, 20, 20).setOrigin(0, 0.5);
        label.add([lb, lt]);
        c.add(label);
        const stops = [[0, 0xffffff], [0.5, 0xfff2dc], [0.8, 0xffc898], [1, 0x9c88c4]];
        const day = { d: 0 };
        this.htp.plain.push(day);
        const C = Phaser.Display.Color;
        const paint = () => {
            const d = day.d;
            let i = 0;
            while (i < stops.length - 2 && d > stops[i + 1][0]) i++;
            const [a0, c0] = stops[i], [a1, c1] = stops[i + 1];
            const t = Phaser.Math.Clamp((d - a0) / (a1 - a0), 0, 1) * 100;
            const m = C.Interpolate.ColorWithColor(C.ValueToColor(c0), C.ValueToColor(c1), 100, t);
            dusk.setFillStyle(C.GetColor(m.r, m.g, m.b));
            const name = d < 0.45 ? 'AFTERNOON' : d < 0.78 ? 'GOLDEN HOUR' : d < 0.98 ? 'DUSK' : 'SUNSET!';
            if (lt.text !== name) {
                lt.setText(name).setX(36).setColor(name === 'SUNSET!' ? HTP_COL.gold : HTP_COL.cream);
                lb.setSize(lt.width + 72, lt.height + 30);
            }
        };
        this.htpLoop(8200, () => {
            day.d = 0;
            paint();
            this.tweens.add({ targets: day, d: 1, delay: 600, duration: 6000, ease: 'Linear', onUpdate: paint, onComplete: paint });
        });
        // gusts: calm, a warning flutter, then a gust that streams leaves and sways the tower
        let lvl = 0;
        const flap = this.time.addEvent({ delay: 130, loop: true, callback: () => {
            sock.setFrame(lvl * 2 + (sock.frame.name % 2 ? 0 : 1));
        } });
        this.htp.timers.push(flap);
        this.htpLoop(5200, () => {
            lvl = 0;
            this.htpLater(1500, () => { lvl = 1; leaves.setFrequency(260); leaves.start(); });
            this.htpLater(2300, () => {
                lvl = 3;
                leaves.setFrequency(60);
                this.htpSfx('wind', 0.4, 2);
                this.tweens.add({ targets: sway, angle: { from: 0, to: 3.2 }, duration: 500, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
            });
            this.htpLater(4400, () => { lvl = 1; leaves.stop(); });
        });
    },
};

Object.assign(PatchScene.prototype, PatchHtp);
Object.assign(UIScene.prototype, UIHtp);
// ══════════════════════════════════════════════════════════ end HOW TO PLAY ══

// Wait (briefly) for the pixel font so text isn't drawn in a fallback face.
const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('20px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))])
    : Promise.resolve();
fontReady.then(boot, boot);
})();
