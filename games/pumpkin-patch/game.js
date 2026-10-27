// ═════════════════════════════════════════════════════════════════════════════
// Ansel's Pumpkin Patch — an Uppah minigame
//
// Ansel toddles around a fall pumpkin patch, picks up pumpkins (DOWN!),
// carries them on his head, and tosses them onto a hay-bale tower (UPPAH!).
// Tap again to drop the swaying pumpkin onto the stack; he counts each one.
// Every tap gets a reaction (pumpkins hop, Ansel jumps, trees drop leaves,
// Hoppah the bunny boings), and a little hand shows what to tap — no reading. Pumpkins that land
// well lock into the tower; ones that roll off can be picked up again.
// Leaf piles hide surprise pumpkins. When the patch runs out, tap and Ansel
// shouts MORE! and a fresh batch tumbles in. When the tower is big, tap it
// (or press DOWN beside it) to knock it all down.
//
// Controls
//   Touch / mouse : tap a pumpkin (he fetches and lifts it), tap again to drop,
//                   tap leaf piles, Ansel, trees or the bunny, tap the tower to topple it,
//                   tap anywhere for MORE! when the patch is empty
//   Keyboard      : ←/→ walk · ↓ pick up / dive / knock down · ↑ or Space uppah / more
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
const GROUND = 2080;               // top of the dirt path
const PLAY_L = 150, PLAY_R = 1770; // walls
const HAY_X = 960;
const HAY_W = 160, HAY_H = 88;
const HAY_TOP = GROUND - HAY_H;
// Scenery anchors (game px): the silo's pumpkin sits on its top, the giraffe walks behind the fence
const SILO_X = 736, SILO_TOP_Y = 1592;
const GIRAFFE_Y = 1852, GIRAFFE_SPEED = 34;

// ── Ansel poses: scale chosen so his head is the same size in every pose ─────
const HEAD_PX = 86;
const POSES = {
    run:   { headSrc: 117, foot: 27, h: 370 },
    up:    { headSrc: 180, foot: 5,  h: 509 },
    down:  { headSrc: 201, foot: 0,  h: 436 },
    dizzy: { headSrc: 136, foot: 6,  h: 444 },
};
const RUN_SCALE = HEAD_PX / POSES.run.headSrc;
const HEAD_TOP = Math.round((343 - 27) * RUN_SCALE); // feet → top of hair, run frames
const WALK_SPEED = 380, HEAVY_SPEED = 270;

// Drop timing. The swaying pumpkin glides back and forth at a steady speed (like
// Stack). Everything tightens as the tower grows, and an adaptive "level" speeds up
// after perfect drops and slows down after misses, so a toddler and a grown-up both
// get a fair challenge.
const TIMING = {
    perfectZone: n => Math.max(18, 36 - n * 1.2),      // px from centre that snaps perfect
    goodFactor: 2.2,                                     // good zone = perfect zone x this
    goodKeep: 0.3,                                       // good drops keep 30% of their miss
    okKeep: n => Math.min(0.8, 0.45 + n * 0.03),         // wide drops keep most of it
    nestle: n => Math.max(0.4, 0.78 - n * 0.025),        // share of the pumpkin below that "catches"
    amp: n => Math.min(60 + n * 7, 170),                 // sway half-width
    speed: (n, level) => Math.min(560, 170 + level * 26 + n * 8), // px per second
    levelUp: { perfect: 1, good: 0.25, ok: -0.75, miss: -1.5 },
    combos: [3, 5, 10],
};
const COUNT_WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
// Show the pointing-hand hint after this long without a tap (always for the first pumpkins).
const HINT_IDLE = 4;

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
const LAYOUT = [
    { key: 'pumpkin_orange_m', x: 420 },
    { key: 'pumpkin_gold_s',   x: 520 },
    { key: 'pumpkin_green_m',  x: 640 },
    { key: 'pumpkin_deep_xl',  x: 800 },
    { key: 'pumpkin_white_m',  x: 1110 },
    { key: 'pumpkin_orange_s', x: 1220 },
    { key: 'pumpkin_orange_l', x: 1345 },
    { key: 'pumpkin_warty_s',  x: 1470 },
    { key: 'pumpkin_gold_s',   x: 1570 },
];
// What a MORE! batch is drawn from (repeats = more likely)
const MORE_POOL = [
    'pumpkin_orange_m', 'pumpkin_orange_m', 'pumpkin_orange_l', 'pumpkin_orange_s',
    'pumpkin_white_m', 'pumpkin_green_m', 'pumpkin_warty_s', 'pumpkin_gold_s', 'pumpkin_deep_xl',
];
const MORE_BATCH = 5;

// ── Growing patch: pumpkins grow in two lanes of the vine rows behind the path ──
// Tap a ripe one and Ansel (in his straw hat) wades in, tugs it off the vine and
// carries it back; tap an unripe one and he waters it so it grows.
const LANES = [
    { y: 1930, scale: 0.8, depth: 4 },   // back row
    { y: 1994, scale: 0.9, depth: 6 },   // front row
];
const GROW_SPOTS = [
    { lane: 0, x: 300 }, { lane: 0, x: 560 }, { lane: 0, x: 790 }, { lane: 0, x: 1190 },
    { lane: 0, x: 1430 }, { lane: 0, x: 1660 },
    { lane: 1, x: 450 }, { lane: 1, x: 700 }, { lane: 1, x: 1290 }, { lane: 1, x: 1545 },
];
const GROW = { sproutDelay: [4, 8], stageTime: [9, 14], goldenChance: 0.06 };
// Where his straw hat sits for each pose (px above his feet at full size, x nudge facing right)
const HAT_POS = { run: { top: 232, dx: 0 }, up: { top: 226, dx: -8 }, down: { top: 182, dx: -2 }, dizzy: { top: 240, dx: 2 } };
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

const FONT = '"Press Start 2P", monospace';
const INK = '#2b1810';

// ─────────────────────────────────────────────────────────────────────────────
// Sound: chiptune voice + effects synthesized with WebAudio (same voice as the
// Uppah runner), plus the shared background music.
// ─────────────────────────────────────────────────────────────────────────────
const Sfx = {
    ctx: null, master: null, muted: false, music: null,

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.9;
            this.master.connect(this.ctx.destination);
            this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
            const d = this.noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { this.ctx = null; }
        try {
            this.music = new Audio(SHARED + 'The_Perfect_Score.mp3');
            this.music.loop = true;
            this.music.volume = 0.22;
            this.music.play().catch(() => {});
        } catch (e) {}
    },

    setMuted(m) {
        this.muted = m;
        if (this.master) this.master.gain.value = m ? 0 : 0.9;
        if (this.music) this.music.muted = m;
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
        // toddler "MO-ORE!": nasal "m" opening into a rising "o", settling on "re",
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
};

// ─────────────────────────────────────────────────────────────────────────────
const MB = () => Phaser.Physics.Matter.Matter.Body;
const MSleep = () => Phaser.Physics.Matter.Matter.Sleeping;

function loadBest() {
    try { return JSON.parse(localStorage.getItem('uppah.pumpkinpatch.best')) || { count: 0, height: 0 }; }
    catch (e) { return { count: 0, height: 0 }; }
}
function saveBest(b) {
    try { localStorage.setItem('uppah.pumpkinpatch.best', JSON.stringify(b)); } catch (e) {}
}

// ═════════════════════════════════════════════════════════════════════════════
class PatchScene extends Phaser.Scene {
    constructor() { super('patch'); }

    preload() {
        for (let i = 1; i <= 6; i++) this.load.image('ansel_' + i, `${SHARED}Ansel Running frames/frame_0${i}.png`);
        for (let i = 1; i <= 8; i++) this.load.image('gigi_' + i, `${SHARED}Gigi Running frames/frame_0${i}.png`);
        this.load.image('ansel_up', SHARED + 'Ansel Up.png');
        this.load.image('ansel_down', SHARED + 'Ansel Down.png');
        this.load.image('ansel_dizzy', SHARED + 'Ansel damage.png');
        this.load.image('hoppah_stand', SHARED + 'hoppah_standing.png');
        this.load.image('hoppah_jump', SHARED + 'hoppah_jumping.png');
        const art = ['background', 'haybale', 'leafpile_a', 'leafpile_b',
            'bubble', 'bubble_tail', 'panel', 'icon_pumpkin', 'sound_on', 'sound_off',
            'hand', 'sparkle', 'dust', 'shadow', 'target',
            'foreground', 'silo_pumpkin', 'silo_pumpkin_wink',
            'sprout', 'pumpkin_unripe', 'watering_can', 'drop', 'straw_hat',
            ...Object.keys(PUMPKIN_SPECS)];
        art.forEach(k => this.load.image(k, ART + k + '.png'));
        this.load.spritesheet('leaves', ART + 'leaves.png', { frameWidth: 28, frameHeight: 28 });
        this.load.spritesheet('giraffe', ART + 'giraffe.png', { frameWidth: 224, frameHeight: 352 });
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
        this.level = 0;           // adaptive sway speed (see TIMING)
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
        this.add.image(HAY_X, GROUND + 4, 'haybale').setOrigin(0.5, 1).setDepth(8);
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
        this.ansel = {
            x: 700, dir: 1, frame: 0, frameT: 0, moving: false, carrying: null,
            goal: null, busy: false, pose: 'run', bob: 0, jumpY: 0,
            laneY: 0, depthScale: 1, baseScale: 1, farming: false, walkingLane: false,
            img: this.add.image(700, GROUND, 'ansel_1').setDepth(20),
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

        // Farming props: straw hat (stays on once he's been farming) and a watering can
        this.hat = this.add.image(0, 0, 'straw_hat').setOrigin(0.5, 1).setDepth(20.2).setVisible(false);
        this.can = this.add.image(0, 0, 'watering_can').setOrigin(0.2, 0.7).setDepth(20.3).setVisible(false);
        this.drops = this.add.particles(0, 0, 'drop', {
            lifespan: 520, speedX: { min: -20, max: 20 }, speedY: { min: 90, max: 200 }, gravityY: 500,
            scale: { start: 1, end: 0.6 }, emitting: false,
        }).setDepth(33);

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
        this.burst = this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7],
            lifespan: { min: 1400, max: 2600 },
            speedX: { min: -300, max: 300 }, speedY: { min: -620, max: -240 },
            gravityY: 520, rotate: { start: 0, end: 720 }, scale: { min: 0.9, max: 1.3 },
            emitting: false,
        }).setDepth(31);
        // Leaves shaken loose from the tree line flutter down
        this.treeLeaves = this.add.particles(0, 0, 'leaves', {
            frame: [0, 1, 2, 3, 4, 5, 6, 7],
            lifespan: { min: 2200, max: 3400 }, speedX: { min: -70, max: 70 }, speedY: { min: 30, max: 110 },
            gravityY: 40, rotate: { start: 0, end: 360 }, scale: { min: 0.9, max: 1.3 }, emitting: false,
        }).setDepth(30);
        // Dust kicked up by landings and footsteps
        this.dust = this.add.particles(0, 0, 'dust', {
            lifespan: { min: 350, max: 600 }, speedX: { min: -140, max: 140 }, speedY: { min: -90, max: -10 },
            gravityY: 120, scale: { start: 1.2, end: 0.2 }, alpha: { start: 1, end: 0 }, emitting: false,
        }).setDepth(32);
        // A little puff wherever a finger lands, so every tap does something
        this.poof = this.add.particles(0, 0, 'dust', {
            lifespan: 380, speed: { min: 70, max: 170 }, angle: { min: 0, max: 360 },
            scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 }, emitting: false,
        }).setDepth(65);
        // Sparkles for perfect drops and the bunny
        this.sparkles = this.add.particles(0, 0, 'sparkle', {
            lifespan: { min: 450, max: 800 }, speed: { min: 90, max: 280 }, angle: { min: 0, max: 360 },
            scale: { start: 1.3, end: 0 }, rotate: { start: 0, end: 180 }, emitting: false,
        }).setDepth(63);

        // Gigi cameo actor
        this.gigi = this.add.image(-400, GROUND, 'gigi_1').setOrigin(0.5, 1 - 37 / 496).setDepth(18).setVisible(false);
        this.gigiState = null;

        // Physics events → sounds
        this.matter.world.on('collisionstart', ev => this.onCollide(ev));

        // Camera
        const cam = this.cameras.main;
        cam.setBounds(0, 0, WORLD_W, WORLD_H);
        this.camZoom = this.baseZoom();
        this.camX = 700;
        this.camY = WORLD_H - this.scale.height / (2 * this.camZoom);
        cam.setZoom(this.camZoom);
        cam.centerOn(this.camX, this.camY);
        this.scale.on('resize', size => this.cameras.main.setSize(size.width, size.height));

        // Input
        this.input.on('pointerdown', p => this.onTap(p));
        this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,M');
        this.input.keyboard.on('keydown', e => this.onKey(e));

        this.scene.launch('ui');
        this.ui = this.scene.get('ui');
        this.events.once('shutdown', () => this.matter.world.off('collisionstart'));
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
            density: 0.0016, slop: 0.04, sleepThreshold: 45, label: 'item',
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

    towerTop() {
        let top = HAY_TOP, x = HAY_X, half = HAY_W / 2;
        for (const it of this.tower) {
            if (it.body && it.body.bounds.min.y < top) {
                top = it.body.bounds.min.y; x = it.body.position.x; half = it.bw / 2;
            }
        }
        return { y: top, x, half };
    }

    // ── Ansel ───────────────────────────────────────────────────────────────
    setPose(pose) {
        const a = this.ansel, P = POSES[pose];
        a.pose = pose;
        const key = pose === 'run' ? 'ansel_' + (a.frame + 1) : 'ansel_' + pose;
        a.img.setTexture(key);
        a.baseScale = HEAD_PX / P.headSrc;
        a.img.setScale(a.baseScale * a.depthScale);
        a.img.setOrigin(0.5, 1 - P.foot / P.h);
        a.img.setFlipX(a.dir < 0);
    }

    say(text, ms = 1100) {
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
            this.setPose('down');
            Sfx.down();
            this.say('DOWN');
            this.time.delayedCall(330, () => {
                this.removeBody(it);
                it.state = 'carried';
                a.carrying = it;
                Sfx.pickup();
                this.tweens.add({
                    targets: it.img, x: a.x, y: GROUND - HEAD_TOP - it.bh / 2 + 12, angle: 0,
                    duration: 260, ease: 'Quad.Out',
                    onComplete: () => {
                        a.busy = false;
                        a.frame = 0;
                        this.setPose('run');
                        if (it.heavy) this.say('BIG ONE!');
                        else if (it.bw < 17 * 4) this.say('LITTLE ONE!');
                        else if (this.tower.length > 0 && Math.random() < 0.4) { Sfx.more(); this.say('MORE!'); }
                        else this.say(Phaser.Utils.Array.GetRandom(['PUNKIN!', 'PUMPKIN!', 'MINE!']));
                        // straight to the stack: tap-to-fetch, tap-to-drop (two taps per pumpkin)
                        this.time.delayedCall(200, () => this.placeOnTower());
                    },
                });
            });
        });
    }

    placeOnTower() {
        const a = this.ansel;
        if (!a.carrying || a.busy) return;
        this.walkTo(this.standSpot(HAY_X, 175), () => {
            const it = a.carrying;
            if (!it) return;
            this.face(HAY_X);
            a.busy = true;
            this.setPose('up');
            Sfx.uppah();
            this.say('UPPAH!');
            const top = this.towerTop();
            // the sway starts at the far edge on Ansel's side, so you wait for it to come over
            const side = a.x < top.x ? -1 : 1;
            this.hoverAmp = TIMING.amp(this.tower.length);
            const hx = top.x + side * this.hoverAmp, hy = top.y - it.bh / 2 - 120;
            it.state = 'hover';
            a.carrying = null;
            this.tweens.add({ targets: it.img, x: hx, duration: 520, ease: 'Sine.InOut' });
            this.tweens.add({
                targets: it.img, y: { value: hy, ease: 'Back.Out' }, duration: 520,
                onComplete: () => {
                    this.hovering = it;
                    this.hoverT = 0;
                    this.hoverU = side < 0 ? 0 : 2 * this.hoverAmp;
                    this.hoverBaseX = top.x;
                    this.time.delayedCall(250, () => { a.busy = false; this.setPose('run'); });
                },
            });
        });
    }

    drop() {
        const it = this.hovering;
        if (!it) return;
        this.hovering = null;
        this.ghost.setVisible(false);
        const top = this.towerTop();
        // grade the timing: perfect snaps dead-centre, good gets pulled most of the way in,
        // a wide drop keeps most of its miss and may roll off
        const off = it.img.x - top.x;
        it.grade = this.gradeDrop(off);
        it.perfect = it.grade === 'perfect';
        const x = top.x + off * this.dropKeep(it.grade);
        this.addBody(it, x, it.img.y, it.perfect ? 0 : Phaser.Math.DegToRad(it.img.angle * 0.5));
        it.state = 'falling';
        it.fromDrop = true; // only things Ansel drops can join the tower
        Sfx.down();
        this.say('DOWN!', 800);
    }

    gradeDrop(off) {
        const zone = TIMING.perfectZone(this.tower.length);
        const d = Math.abs(off);
        return d < zone ? 'perfect' : d < zone * TIMING.goodFactor ? 'good' : 'ok';
    }

    dropKeep(grade) {
        return grade === 'perfect' ? 0 : grade === 'good' ? TIMING.goodKeep : TIMING.okKeep(this.tower.length);
    }

    bumpLevel(kind) {
        this.level = Phaser.Math.Clamp(this.level + TIMING.levelUp[kind], 0, 10);
    }

    dive(pile) {
        const a = this.ansel;
        if (a.busy || a.carrying) return;
        this.walkTo(this.standSpot(pile.x, 60), () => {
            this.face(pile.x);
            a.busy = true;
            this.setPose('down');
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

    knockDown() {
        const a = this.ansel;
        if (a.busy || a.carrying || this.tower.length < 2 || this.hovering) return;
        this.walkTo(this.standSpot(HAY_X, 150), () => {
            this.face(HAY_X);
            a.busy = true;
            this.setPose('down');
            this.say('BOOM!', 900);
            this.time.delayedCall(200, () => {
                Sfx.boom();
                this.cameras.main.shake(380, 0.012);
                const top = this.towerTop();
                this.burst.explode(40, HAY_X, HAY_TOP);
                const dirAway = a.x < HAY_X ? 1 : -1;
                for (const it of this.tower) {
                    MB().setStatic(it.body, false);
                    MSleep().set(it.body, false);
                    const k = (GROUND - it.body.position.y) / 200;
                    MB().setVelocity(it.body, { x: dirAway * (6 + Math.random() * 7) + (Math.random() - 0.5) * 8,
                                                y: -6 - Math.random() * 7 - k });
                    MB().setAngularVelocity(it.body, (Math.random() - 0.5) * 0.3);
                    it.state = 'falling';
                    it.airT = 0;
                }
                this.tower = [];
                this.reached.clear();
                this.streak = 0;
                this.wobbleAmp = 0;
                this.ui.setCount(0);
                this.time.delayedCall(450, () => this.setPose('dizzy'));
                this.time.delayedCall(1500, () => { Sfx.more(); this.say('MORE!'); });
                this.time.delayedCall(1700, () => { a.busy = false; this.setPose('run'); });
            });
        });
    }

    // Is there anything left to pick up (not counting pumpkins still hidden in leaves)?
    anyLoose() {
        return this.items.some(it => it.body && it.state !== 'tower' && it.state !== 'hidden') ||
            (this.spots || []).some(sp => sp.stage >= 3 && !sp.busy);
    }

    more() {
        const a = this.ansel;
        if (a.busy || a.carrying || this.hovering || this.anyLoose()) return;
        a.busy = true;
        this.setPose('up');
        Sfx.more();
        this.say('MORE!', 1300);
        // the whole patch grows: every spot comes up a stage, rippling out from Ansel
        const order = [...this.spots].sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
        order.forEach((sp, i) => {
            this.time.delayedCall(250 + i * 110, () => {
                if (sp.busy) return;
                this.growSpot(sp);
                if (sp.stage < 3 && i % 2 === 0) this.growSpot(sp);
            });
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
        this.tapGuard = this.time.now + 300; // the "tap to play" tap is not a game tap
        Sfx.init();
        this.time.delayedCall(300, () => this.say('PUMPKINS!', 1500));
    }

    onTap(p) {
        if (!this.started || this.time.now < (this.tapGuard || 0)) return;
        if (this.ui.hitButton(p)) return;
        // toddler palm guard: ignore a second tap that lands almost instantly
        if (this.time.now - this.lastTapAt < 120) return;
        this.lastTapAt = this.time.now;
        this.idleT = 0;
        this.poof.explode(6, p.worldX, p.worldY);
        this.handleTap(p.worldX, p.worldY);
    }

    pumpkinAt(wx, wy) {
        let best = null, bd = 1e9;
        for (const it of this.items) {
            if (!it.body || it.state === 'tower' || it.state === 'hidden') continue;
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
        if (this.tapScenery(wx, wy)) return;

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
        // tapping Ansel: "MORE!" when the patch is empty, otherwise a happy jump
        if (Math.abs(wx - a.x) < 70 && wy > GROUND - HEAD_TOP - 20 && wy < GROUND + 10) {
            if (!this.anyLoose()) this.more(); else this.anselJump();
            return;
        }
        const top = this.towerTop();
        if (this.tower.length >= 2 && Math.abs(wx - HAY_X) < 140 && wy > top.y - 60 && wy < GROUND) {
            this.knockDown(); return;
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
        this.setPose('up');
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
        Sfx.boing();
        this.sparkles.explode(10, h.x, h.y - 60);
        if (!this.ansel.busy) this.say('HOPPAH!', 1000);
        h.scared = true;
        h.phase = 'hop'; h.t = 0; h.fromX = h.x; h.toX = h.x + h.dir * 230; h.dur = 0.55; h.height = 150;
    }

    // ── Growing patch ───────────────────────────────────────────────────────
    createPatch() {
        this.spots = GROW_SPOTS.map((g, i) => {
            const sp = { ...g, stage: 0, t: 0, img: null, key: null, golden: false, busy: false };
            // start with a mix: some ripe, some green, some sprouts
            const start = [3, 2, 3, 1, 2, 3, 2, 1, 3, 2][i % 10];
            for (let k = 0; k < start; k++) this.growSpot(sp, false);
            return sp;
        });
    }

    growSpot(sp, fx = true) {
        if (sp.stage >= 3) return;
        sp.stage += 1;
        const lane = LANES[sp.lane];
        let key, scale = lane.scale;
        if (sp.stage === 1) { key = 'sprout'; scale *= 1.4; }
        else if (sp.stage === 2) key = 'pumpkin_unripe';
        else {
            sp.golden = Math.random() < GROW.goldenChance;
            sp.key = sp.golden ? 'pumpkin_golden' : Phaser.Utils.Array.GetRandom(MORE_POOL);
            key = sp.key;
        }
        if (!sp.img) sp.img = this.add.image(sp.x, lane.y + 6, key).setOrigin(0.5, 1).setDepth(lane.depth);
        sp.img.setTexture(key).setScale(scale).setAngle(0);
        sp.t = Phaser.Math.FloatBetween(...GROW.stageTime);
        if (fx) {
            sp.img.setScale(scale * 0.5);
            this.tweens.add({ targets: sp.img, scale, duration: 260, ease: 'Back.Out' });
            this.sparkles.explode(sp.stage === 3 ? 5 : 2, sp.x, lane.y - 20);
            if (sp.stage === 3) Sfx.pop();
            if (sp.golden) this.sparkles.explode(12, sp.x, lane.y - 40);
        }
    }

    updatePatch(dt) {
        if (!this.started) return;
        for (const sp of this.spots) {
            if (sp.busy || sp.stage >= 3) continue;
            sp.t -= dt;
            if (sp.t <= 0) this.growSpot(sp);
        }
        // a golden pumpkin glints now and then so it gets noticed
        for (const sp of this.spots) {
            if (sp.golden && sp.stage >= 3 && sp.img && Math.random() < dt * 1.5) {
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

    harvest(sp) {
        const a = this.ansel;
        if (a.busy || a.carrying || sp.busy || !sp.img) return;
        const lane = LANES[sp.lane];
        const side = a.x <= sp.x ? -1 : 1;
        let standX = sp.x + side * 78 * lane.scale;
        if (standX < PLAY_L + 40 || standX > PLAY_R - 40) standX = sp.x - side * 78 * lane.scale;
        this.walkTo(standX, () => {
            // claim the spot only on arrival, so a change of mind on the way leaves it free
            if (sp.busy || !sp.img || a.busy || a.carrying) return;
            sp.busy = true;
            a.busy = true;
            this.face(sp.x);
            if (!a.farming) { a.farming = true; this.sparkles.explode(6, a.x, GROUND - HEAD_TOP - 10); }
            this.enterLane(lane, () => (sp.stage >= 3 ? this.pickFromVine(sp, lane) : this.waterSpot(sp, lane)));
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
                if (a.carrying) a.carrying.img.setDepth(10);
                if (then) then();
            } });
    }

    pickFromVine(sp, lane) {
        const a = this.ansel;
        const ds = lane.scale;
        const img = sp.img;
        this.setPose('down');
        Sfx.down();
        this.say('DOWN!', 700);
        // grab the stem and tug: the pumpkin wiggles on its vine
        Sfx.tug();
        this.tweens.add({ targets: img, angle: { from: -9, to: 9 }, duration: 120, yoyo: true, repeat: 2,
            onRepeat: () => Sfx.tug(), onComplete: () => { img.angle = 0; } });
        this.time.delayedCall(820, () => {
            // pop! off the vine
            Sfx.pop();
            this.treeLeaves.explode(6, sp.x, lane.y - 16);
            const key = sp.key, golden = sp.golden;
            const it = this.makeItem(key, img.x, img.y - img.displayHeight / 2);
            it.golden = golden;
            if (golden) it.heavy = true;
            it.state = 'lifting';
            it.img.setScale(ds).setDepth(a.img.depth + 0.1);
            img.destroy();
            sp.img = null; sp.stage = 0; sp.key = null; sp.golden = false; sp.busy = false;
            sp.t = Phaser.Math.FloatBetween(...GROW.sproutDelay);
            const headY = (GROUND - a.laneY) - (HEAD_TOP + it.bh / 2 - 14 + 16) * ds;
            const done = () => {
                it.state = 'carried';
                a.carrying = it;
                a.frame = 0;
                this.setPose('run');
                if (golden) { this.say('GOLDEN!', 1100); Sfx.perfect(3); }
                else if (it.heavy) this.say('HEAVY!', 1000);
                else { Sfx.more(); this.say('MORE!', 900); }
                this.leaveLane(it.heavy, () => {
                    a.busy = false;
                    this.time.delayedCall(150, () => this.placeOnTower());
                });
            };
            if (it.heavy) {
                // it's heavy: up a little, sag, then heave it onto his head
                this.say('NNNGH!', 900);
                this.tweens.chain({ targets: it.img, tweens: [
                    { y: it.img.y - 28 * ds, duration: 260, ease: 'Quad.Out' },
                    { y: it.img.y - 12 * ds, duration: 220, ease: 'Quad.In' },
                    { x: a.x, y: headY, duration: 420, ease: 'Back.Out', onComplete: done },
                ] });
                this.cameras.main.shake(110, 0.003);
            } else {
                this.tweens.add({ targets: it.img, x: a.x, y: headY, duration: 280, ease: 'Quad.Out', onComplete: done });
            }
        });
    }

    waterSpot(sp, lane) {
        const a = this.ansel;
        const ds = lane.scale;
        const feetY = GROUND - a.laneY;
        const canX = a.x + a.dir * 34 * ds, canY = feetY - 96 * ds;
        this.can.setVisible(true).setScale(ds).setFlipX(a.dir < 0).setPosition(canX, canY).setAngle(0)
            .setOrigin(a.dir < 0 ? 0.8 : 0.2, 0.7).setDepth(a.img.depth + 0.3);
        this.tweens.add({ targets: this.can, angle: a.dir * 32, duration: 220, ease: 'Quad.Out' });
        Sfx.water();
        const spoutX = canX + a.dir * 60 * ds, spoutY = canY - 4 * ds;
        for (let i = 0; i < 7; i++) {
            this.time.delayedCall(180 + i * 110, () => this.drops.explode(3, spoutX, spoutY));
        }
        this.time.delayedCall(1050, () => {
            this.growSpot(sp);
            this.say(sp.stage >= 3 ? (sp.golden ? 'GOLDEN!' : 'PUMPKIN!') : 'GROW!', 900);
            this.tweens.add({ targets: this.can, angle: 0, duration: 160, onComplete: () => this.can.setVisible(false) });
            sp.busy = false;
            this.leaveLane(false, () => { a.busy = false; });
        });
    }

    // ── Scenery: giraffe and silo ───────────────────────────────────────────
    tapScenery(wx, wy) {
        const r = this.raffe;
        if (Math.abs(wx - r.x) < 95 && wy > GIRAFFE_Y - 340 && wy < GIRAFFE_Y - 20) {
            r.mode = 'look'; r.t = 1.6; r.frame = 0;
            r.img.setFrame(0);
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
            if (r.t <= 0) { r.mode = 'look'; r.t = Phaser.Math.FloatBetween(2, 4); r.img.setFrame(0); }
        } else if (r.t <= 0) {
            r.mode = 'walk';
            r.t = Phaser.Math.FloatBetween(7, 14);
            if (Math.random() < 0.35) r.dir = -r.dir;
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
        if (code === 'KeyM') { this.ui.toggleSound(); return; }
        if (!this.started) {
            if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(code)) this.ui.startGame();
            return;
        }
        const a = this.ansel;
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
        // DOWN: pick up something close, else dive a pile, else knock the tower down
        if (a.carrying) return;
        let best = null, bd = 150;
        for (const it of this.items) {
            if (!it.body || it.state === 'tower' || it.state === 'hidden') continue;
            const d = Math.abs(it.body.position.x - a.x);
            if (d < bd && it.body.position.y > HAY_TOP - 40) { best = it; bd = d; }
        }
        if (best) { this.pickUp(best); return; }
        for (const pile of this.piles) {
            if (Math.abs(pile.x - a.x) < 150) { this.dive(pile); return; }
        }
        if (this.tower.length >= 2 && Math.abs(a.x - HAY_X) < 260) { this.knockDown(); return; }
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
                if (it.heavy && rv > 6) this.cameras.main.shake(120, 0.004);
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

        // Walk cycle
        if (a.pose === 'run') {
            if (a.moving) {
                a.frameT += dt;
                if (a.frameT > 0.085 * 270 / speed) {
                    a.frameT = 0;
                    a.frame = (a.frame + 1) % 6;
                    if (a.frame === 0 || a.frame === 3) Sfx.step(a.frame === 3);
                }
            } else {
                a.frame = 0;
            }
            a.img.setTexture('ansel_' + (a.frame + 1));
            a.img.setFlipX(a.dir < 0);
        } else {
            a.img.setFlipX(a.dir < 0);
        }
        a.img.x = a.x;
        const idleBob = a.moving ? 0 : Math.sin(time / 380) * 1.5;
        const ds = a.depthScale;
        const feetY = GROUND - a.laneY;
        a.img.y = feetY + idleBob - a.jumpY;
        a.img.setScale(a.baseScale * ds);
        // a heavy pumpkin makes him sway as he walks
        a.img.angle = (a.carrying && a.carrying.heavy && a.moving) ? Math.sin(time / 110) * 3 : 0;
        const ak = 1 - a.jumpY / 200;
        a.shadow.setPosition(a.x, feetY + 4).setScale(0.95 * ak * ds, ak * ds).setAlpha(ak);
        // straw hat
        if (a.farming) {
            const hp = HAT_POS[a.pose] || HAT_POS.run;
            this.hat.setVisible(true).setScale(ds).setFlipX(a.dir < 0)
                .setPosition(a.x + hp.dx * a.dir * ds, feetY + idleBob - a.jumpY - (hp.top - 24) * ds)
                .setDepth(a.img.depth + 0.2)
                .setAngle(a.img.angle);
        }

        // Carried item rides on his head
        if (a.carrying && a.carrying.state === 'carried' && (!a.busy || a.walkingLane)) {
            const walkBob = a.moving ? Math.abs(Math.sin(a.frame / 6 * Math.PI * 2)) * 6 : 0;
            const hatLift = a.farming ? 16 : 0;
            a.carrying.img.setScale(ds);
            a.carrying.img.x = a.x + a.dir * 2 * ds;
            a.carrying.img.y = feetY - (HEAD_TOP + a.carrying.bh / 2 - 14 + hatLift) * ds - walkBob + idleBob;
            a.carrying.img.angle = a.moving ? Math.sin(time / 120) * 4 : 0;
            if (a.carrying.golden && Math.random() < 0.15) {
                this.sparkles.explode(1, a.carrying.img.x + Phaser.Math.Between(-30, 30), a.carrying.img.y);
            }
        }

        // Hovering item sways above the stack
        if (this.hovering) {
            this.hoverT += dt;
            const it = this.hovering;
            const top = this.towerTop();
            const amp = this.hoverAmp;
            // steady glide back and forth (a triangle wave), readable like Stack's sliding block
            this.hoverU += TIMING.speed(this.tower.length, this.level) * dt;
            const P = 4 * amp, u = ((this.hoverU % P) + P) % P;
            const off = u < 2 * amp ? -amp + u : 3 * amp - u;
            const targetY = top.y - it.bh / 2 - 110;
            it.img.x = this.hoverBaseX + off;
            it.img.y = Phaser.Math.Linear(it.img.y, targetY + Math.sin(this.hoverT * 5) * 5, 0.15);
            it.img.angle = Math.sin(this.hoverT * 3) * 4;
            this.hoverBaseX = Phaser.Math.Linear(this.hoverBaseX, top.x, 0.05);
            // landing ring on top of the stack: gold = perfect, white = good, faint = wide
            const grade = this.gradeDrop(it.img.x - top.x);
            const perfect = grade === 'perfect';
            this.hoverGrade = grade;
            this.ghost.setVisible(true)
                .setPosition(top.x + (it.img.x - top.x) * this.dropKeep(grade), top.y + 6)
                .setScale((it.bw / 128) * (perfect ? 1.15 : 1), perfect ? 1.15 : 1)
                .setTint(perfect ? 0xffc93a : 0xffffff)
                .setAlpha(perfect ? 1 : grade === 'good' ? 0.8 : 0.35 + Math.sin(time / 120) * 0.1);
        }

        // Tower wobble (visual only): springy sway that grows toward the top and dies down
        this.wobbleT += dt;
        this.wobbleAmp *= Math.pow(0.3, dt);
        const st = this.towerTop();
        const stackTop = st.y;
        this.stackTopX = st.x;
        this.stackTopHalf = st.half;
        const stackH = Math.max(1, HAY_TOP - stackTop);

        // Sync physics items → sprites, and decide what joins the tower
        for (const it of this.items) {
            if (!it.body) { it.shadow.setVisible(false); continue; }
            it.img.x = it.body.position.x;
            it.img.y = it.body.position.y;
            it.img.rotation = it.body.angle;
            if (it.state === 'tower' || it.body.isStatic) {
                const f = Phaser.Math.Clamp((HAY_TOP - it.body.position.y) / stackH, 0, 1);
                const sway = Math.sin(this.wobbleT * 8) * this.wobbleAmp * Math.pow(f, 1.3);
                it.img.x += sway;
                it.img.rotation += sway * 0.004;
                continue;
            }
            // contact shadow, shrinking as the pumpkin rises off the ground
            const k = Phaser.Math.Clamp(1 - (GROUND - it.body.bounds.max.y) / 450, 0.25, 1);
            it.shadow.setVisible(true).setPosition(it.body.position.x, GROUND + 3)
                .setScale((it.bw / 136) * k, k).setAlpha(k);
            it.airT += dt;
            // Toddler "nestle": a dropped pumpkin whose middle is over the one below settles
            // in instead of rolling off (damped slide and spin, gentle pull to centre).
            if (it.fromDrop && it.body.bounds.max.y >= stackTop - 6 &&
                Math.abs(it.body.position.x - this.stackTopX) < this.stackTopHalf * TIMING.nestle(this.tower.length)) {
                const b = it.body;
                MB().setAngularVelocity(b, b.angularVelocity * 0.6);
                MB().setVelocity(b, { x: b.velocity.x * 0.6 + (this.stackTopX - b.position.x) * 0.02, y: b.velocity.y });
                MB().setAngle(b, b.angle * 0.9);
            }
            const v = Math.hypot(it.body.velocity.x, it.body.velocity.y);
            const resting = it.body.isSleeping || (v < 0.3 && Math.abs(it.body.angularVelocity) < 0.02);
            it.settleT = resting ? it.settleT + dt : 0;
            if (it.settleT > 0.35) {
                const bottom = it.body.bounds.max.y;
                const onStack = bottom < HAY_TOP + 8 && Math.abs(it.body.position.x - HAY_X) < 260;
                if (onStack && it.fromDrop) {
                    this.lockIntoTower(it);
                } else if (it.state === 'falling') {
                    it.state = 'ground';
                    if (it.fromDrop) {
                        // rolled off the stack: the perfect run is over and the sway eases off
                        this.streak = 0;
                        this.ui.setStreak(0);
                        this.bumpLevel('miss');
                        Sfx.uhoh();
                        this.say('UH OH!', 900);
                    }
                }
                it.fromDrop = false;
            }
        }

        // Speech bubble follows his head
        if (this.bubble.visible) {
            this.bubbleTimer -= delta;
            const headY = (GROUND - a.laneY) - (HEAD_TOP + (a.carrying ? a.carrying.bh - 4 : 14) + (a.farming ? 18 : 0)) * a.depthScale;
            const ts = this.textScale;
            const r = this.bubbleRoot;
            r.setScale(ts);
            r.x = Phaser.Math.Clamp(a.x + a.dir * 70 * ts, PLAY_L + 60, PLAY_R - 60);
            r.y = headY;
            this.bubbleTail.x = Phaser.Math.Clamp((a.x - r.x) / ts + a.dir * 10, -this.bubbleBg.width / 2 + 16, this.bubbleBg.width / 2 - 16);
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
        this.updateHoppah(dt);
        this.updateScenery(dt);
        this.updatePatch(dt);
        this.updateGigi(dt);
        this.updateCamera(dt);
    }

    lockIntoTower(it) {
        const prevTop = this.towerTop();
        MB().setStatic(it.body, true);
        it.state = 'tower';
        it.shadow.setVisible(false);
        this.tower.push(it);
        const top = this.towerTop();
        const height = Math.round(GROUND - top.y);
        const n = this.tower.length;
        this.ui.setCount(n);
        // squash, and set the whole stack wobbling (more if it landed off-centre)
        this.tweens.add({ targets: it.img, scaleX: 1.16, scaleY: 0.86, duration: 100, yoyo: true, ease: 'Quad.Out' });
        const off = Math.abs(it.body.position.x - prevTop.x);
        this.wobbleAmp = Math.min(22, this.wobbleAmp + 4 + off * 0.12);

        // count it out loud: "ONE!" "TWO!" ... with a climbing note
        Sfx.count(n);
        this.say((n <= COUNT_WORDS.length ? COUNT_WORDS[n - 1] : String(n)) + '!', 1000);
        const num = this.add.text(it.body.position.x, it.body.bounds.min.y - 20, String(n), {
            fontFamily: FONT, fontSize: '56px', color: '#fff6e0', stroke: INK, strokeThickness: 12,
        }).setOrigin(0.5, 1).setDepth(62).setScale(0.4 * this.textScale);
        this.tweens.add({ targets: num, scale: this.textScale, duration: 220, ease: 'Back.Out' });
        this.tweens.add({ targets: num, y: num.y - 90, alpha: 0, delay: 500, duration: 700, onComplete: () => num.destroy() });

        // perfect drops sparkle, and a run of them climbs in pitch (like Stack)
        const grade = it.grade || 'ok';
        if (grade === 'perfect') {
            this.streak += 1;
            this.sparkles.explode(10 + Math.min(10, this.streak * 2), it.body.position.x, it.body.bounds.min.y);
            this.time.delayedCall(140, () => Sfx.perfect(this.streak));
            if (TIMING.combos.includes(this.streak)) {
                this.time.delayedCall(420, () => {
                    Sfx.fanfare();
                    this.ui.banner('PERFECT x' + this.streak + '!');
                    this.sparkles.explode(30, it.body ? it.body.position.x : HAY_X, top.y);
                });
            }
        } else {
            this.streak = 0;
            if (grade === 'good') {
                this.sparkles.explode(4, it.body.position.x, it.body.bounds.min.y);
                this.time.delayedCall(120, () => Sfx.good());
            }
        }
        this.bumpLevel(grade);
        this.ui.setStreak(this.streak);
        it.perfect = false;
        it.grade = null;
        if (this.tower.length > this.best.count || height > this.best.height) {
            this.best = { count: Math.max(this.best.count, this.tower.length), height: Math.max(this.best.height, height) };
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

    celebrate(m) {
        Sfx.fanfare();
        this.ui.banner(m.text);
        const top = this.towerTop();
        this.burst.explode(30, top.x, top.y);
        this.time.delayedCall(900, () => {
            if (!this.ansel.busy && !this.ansel.carrying) {
                this.setPose('up');
                this.time.delayedCall(700, () => { if (!this.ansel.busy) this.setPose('run'); });
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
        this.gigi.setVisible(true).setScale(0.95).setFlipX(!fromLeft);
        this.gigi.x = fromLeft ? v.x - 200 : v.right + 200;
    }

    updateGigi(dt) {
        const g = this.gigiState;
        if (!g) return;
        g.t += dt;
        const run = () => {
            g.frameT = (g.frameT || 0) + dt;
            if (g.frameT > 0.08) { g.frameT = 0; g.frame = (g.frame + 1) % 8; }
            this.gigi.setTexture('gigi_' + (g.frame + 1));
        };
        if (g.phase === 'in') {
            run();
            this.gigi.x += g.dir * 520 * dt;
            if ((g.dir > 0 && this.gigi.x >= g.stopX) || (g.dir < 0 && this.gigi.x <= g.stopX)) {
                g.phase = 'cheer'; g.t = 0; g.frame = 0;
                this.gigi.setTexture('gigi_1');
                this.gigiSay = this.add.text(this.gigi.x, GROUND - 420, 'WOW, ANSEL!', {
                    fontFamily: FONT, fontSize: '26px', color: '#fff6e0', stroke: INK, strokeThickness: 8,
                }).setOrigin(0.5).setDepth(61).setScale(this.textScale);
                this.tweens.add({ targets: this.gigiSay, y: GROUND - 445, duration: 400, yoyo: true, repeat: 3 });
            }
        } else if (g.phase === 'cheer') {
            this.gigi.y = GROUND - Math.abs(Math.sin(g.t * 9)) * 26;
            if (g.t > 2.8) {
                g.phase = 'out'; g.t = 0;
                this.gigi.y = GROUND;
                this.gigi.setFlipX(g.dir > 0);
                g.dir = -g.dir;
                if (this.gigiSay) { this.gigiSay.destroy(); this.gigiSay = null; }
            }
        } else if (g.phase === 'out') {
            run();
            this.gigi.x += g.dir * 520 * dt;
            const v = this.cameras.main.worldView;
            if (this.gigi.x < v.x - 300 || this.gigi.x > v.right + 300) {
                this.gigi.setVisible(false);
                this.gigiState = null;
            }
        }
    }

    // Picture hint, no words: a little hand taps on whatever to touch next.
    // Always shown for the first pumpkins, then only after a few idle seconds.
    updateHint(time) {
        const a = this.ansel;
        let target = null;
        const learning = this.tower.length < 2;
        if (this.started && (learning || this.idleT > HINT_IDLE) && !a.busy) {
            if (this.hovering) {
                const top = this.towerTop();
                target = { x: top.x, y: top.y + 8, timing: true };
            } else if (a.carrying) {
                target = null; // he's already on his way to the stack
            } else if (!this.anyLoose()) {
                target = { x: a.x, y: GROUND - HEAD_TOP * 0.6 };
            } else {
                let best = null, bd = 1e9;
                for (const it of this.items) {
                    if (!it.body || it.state === 'tower' || it.state === 'hidden') continue;
                    const d = Math.abs(it.body.position.x - a.x);
                    if (d > 70 && d < bd) { bd = d; best = it; }
                }
                if (best) target = { x: best.body.position.x, y: best.body.position.y };
                else {
                    const ripe = this.spots.filter(sp => sp.stage >= 3 && !sp.busy && sp.img)
                        .sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
                    if (ripe) target = { x: ripe.x, y: ripe.img.y - ripe.img.displayHeight * 0.4 };
                }
            }
        }
        if (target) {
            // press-and-lift tapping motion, fingertip on the target
            // during the sway it presses exactly when the pumpkin is in the perfect zone
            const ph = (time % 1100) / 1100;
            const press = target.timing ? (this.hoverGrade === 'perfect' ? 1 : 0) : (ph < 0.18 ? 1 : 0);
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
        const minZoom = Math.max(w / WORLD_W, h / WORLD_H);
        return Math.max(minZoom, 1);
    }

    updateCamera(dt) {
        const cam = this.cameras.main;
        const a = this.ansel;
        const w = this.scale.width, h = this.scale.height;
        const portrait = h > w;
        const minZoom = Math.max(w / WORLD_W, h / WORLD_H); // never show past the world's edges
        const top = this.towerTop();
        let focusTop = top.y;
        if (this.hovering) focusTop = Math.min(focusTop, this.hovering.img.y - this.hovering.bh);
        focusTop -= portrait ? 330 : 240; // headroom so the top of the stack sits below the HUD and banner
        const need = WORLD_H - focusTop;
        const zoomT = Phaser.Math.Clamp(h / need, minZoom, this.baseZoom());
        this.camZoom = Phaser.Math.Linear(this.camZoom, zoomT, 1 - Math.pow(0.02, dt));
        this.textScale = (portrait ? 1.35 : 1) / this.camZoom;
        const visH = h / this.camZoom;
        let cy = WORLD_H - visH / 2;
        if (need > visH) cy = focusTop + visH / 2;
        const busyStack = this.hovering || (a.carrying && Math.abs(a.x - HAY_X) < 400);
        const cx = busyStack ? (a.x + HAY_X) / 2 : a.x;
        this.camX = Phaser.Math.Linear(this.camX, cx, 1 - Math.pow(0.05, dt));
        this.camY = Phaser.Math.Linear(this.camY, cy, 1 - Math.pow(0.03, dt));
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

        // Count panel (with a row of stars for the perfect-drop streak)
        this.panel = this.add.nineslice(20, 20, 'panel', null, 230, 132, 20, 20, 20, 20).setOrigin(0, 0);
        this.add.image(48, 48, 'icon_pumpkin').setOrigin(0, 0);
        this.countText = this.add.text(112, 52, '0', {
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
        T.hero = this.add.image(0, 0, 'ansel_up').setScale(0.55).setOrigin(0.5, 1);
        T.p1 = this.add.image(0, 0, 'pumpkin_deep_xl').setOrigin(0.5, 1);
        T.p2 = this.add.image(0, 0, 'pumpkin_orange_l').setOrigin(0.5, 1);
        T.p3 = this.add.image(0, 0, 'pumpkin_white_m').setOrigin(0.5, 1);
        T.how = this.add.text(0, 0, 'TAP A PUMPKIN · TAP AGAIN TO DROP IT', {
            fontFamily: FONT, fontSize: '14px', color: '#ffe3a6', stroke: INK, strokeThickness: 5, align: 'center',
        }).setOrigin(0.5);
        T.go = this.add.text(0, 0, 'TAP TO PLAY', {
            fontFamily: FONT, fontSize: '28px', color: '#fff6e0', stroke: INK, strokeThickness: 8,
        }).setOrigin(0.5);
        this.tweens.add({ targets: T.go, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
        this.tweens.add({ targets: [T.p1, T.p2, T.p3], angle: { from: -2, to: 2 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.title.add([T.shade, T.t1, T.t2, T.hero, T.p1, T.p2, T.p3, T.how, T.go]);
        this.title.setDepth(100);

        this.layout(this.scale.width, this.scale.height);
        this.scale.on('resize', size => {
            this.cameras.main.setSize(size.width, size.height);
            this.layout(size.width, size.height);
        });

        this.input.on('pointerdown', p => {
            if (this.hitButton(p)) { this.toggleSound(); return; }
            if (!this.patch.started) this.startGame();
        });
    }

    // Place the HUD and title for the current screen shape (landscape or portrait).
    layout(w, h) {
        const portrait = h > w;
        this.soundBtn.setPosition(w - 20, 20);
        this.soundIcon.setPosition(w - 66, 62);
        this.bannerText.setPosition(w / 2, portrait ? 250 : 200)
            .setFontSize(portrait ? 30 : 40)
            .setWordWrapWidth(w - 60);
        const T = this.t;
        T.shade.setSize(w, h);
        const titleY = portrait ? h * 0.16 : 120;
        T.t1.setPosition(w / 2, titleY);
        T.t2.setPosition(w / 2, titleY + (portrait ? 90 : 70))
            .setFontSize(portrait ? 46 : 54)
            .setWordWrapWidth(w - 40);
        if (portrait) T.t2.setText('PUMPKIN\nPATCH').setLineSpacing(14);
        else T.t2.setText('PUMPKIN PATCH');
        const groundY = portrait ? h * 0.74 : 560;
        T.hero.setPosition(w / 2 - (portrait ? 140 : 150), groundY);
        const px = w / 2 + (portrait ? 130 : 120);
        T.p1.setPosition(px, groundY);
        T.p2.setPosition(px + 2, groundY - 90);
        T.p3.setPosition(px, groundY - 168);
        T.how.setPosition(w / 2, portrait ? h - 150 : 610).setWordWrapWidth(w - 60);
        T.go.setPosition(w / 2, portrait ? h - 80 : 660);
        this.tweens.killTweensOf(T.hero);
        this.tweens.add({ targets: T.hero, y: groundY - 12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
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
        this.tweens.add({ targets: this.title, alpha: 0, duration: 300, onComplete: () => this.title.setVisible(false) });
        this.patch.begin();
    }

    hitButton(p) {
        return p.x > this.scale.width - 120 && p.y < 115;
    }

    toggleSound() {
        Sfx.setMuted(!Sfx.muted);
        this.soundIcon.setTexture(Sfx.muted ? 'sound_off' : 'sound_on');
    }

    setCount(n) {
        this.countText.setText(String(n));
        this.tweens.add({ targets: this.countText, scale: 1.35, duration: 110, yoyo: true });
    }

    setBest(n) { this.bestText.setText('BEST ' + n); }

    banner(text) {
        this.bannerText.setText(text).setAlpha(1).setScale(0.3);
        this.tweens.killTweensOf(this.bannerText);
        this.tweens.add({ targets: this.bannerText, scale: 1, duration: 380, ease: 'Back.Out' });
        this.tweens.add({ targets: this.bannerText, alpha: 0, duration: 500, delay: 2200 });
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
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        physics: { default: 'matter', matter: { enableSleeping: true, debug: false } },
        input: { activePointers: 1 }, // one finger at a time: resting palms and extra fingers are ignored
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

// Wait (briefly) for the pixel font so text isn't drawn in a fallback face.
const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('20px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))])
    : Promise.resolve();
fontReady.then(boot, boot);
})();
