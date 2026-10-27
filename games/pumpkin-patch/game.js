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
        this.eggsPreload(); // surprises
        const art = ['background', 'haybale', 'leafpile_a', 'leafpile_b',
            'bubble', 'bubble_tail', 'panel', 'icon_pumpkin', 'sound_on', 'sound_off',
            'hand', 'sparkle', 'dust', 'shadow', 'target',
            'foreground', 'silo_pumpkin', 'silo_pumpkin_wink',
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

        this.eggsCreate(); // surprises: click points and easter eggs
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
        a.img.setScale(HEAD_PX / P.headSrc);
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
        return this.items.some(it => it.body && it.state !== 'tower' && it.state !== 'hidden');
    }

    more() {
        const a = this.ansel;
        if (a.busy || a.carrying || this.hovering || this.anyLoose()) return;
        a.busy = true;
        this.setPose('up');
        Sfx.more();
        this.say('MORE!', 1300);
        // spread the new batch along the path, away from the tower
        const slots = [];
        for (let x = PLAY_L + 110; x <= PLAY_R - 110; x += 120) {
            const clearOfPiles = this.piles.every(p => Math.abs(x - p.x) > p.img.displayWidth / 2 + 50);
            if (Math.abs(x - HAY_X) > 190 && clearOfPiles) slots.push(x);
        }
        Phaser.Utils.Array.Shuffle(slots);
        const dropY = Math.min(this.cameras.main.worldView.y - 120, GROUND - 760);
        for (let i = 0; i < MORE_BATCH; i++) {
            this.time.delayedCall(350 + i * 170, () => {
                const key = Phaser.Utils.Array.GetRandom(MORE_POOL);
                const x = slots[i] + Phaser.Math.Between(-20, 20);
                const it = this.makeItem(key, x, dropY);
                this.addBody(it, x, dropY, Phaser.Math.FloatBetween(-0.4, 0.4));
                MB().setAngularVelocity(it.body, Phaser.Math.FloatBetween(-0.08, 0.08));
                it.state = 'falling';
                Sfx.pop();
            });
        }
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
        if (this.ui.eggUiHit(p)) return; // surprises: sticker badge and tray
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
        if (this.eggTap(wx, wy)) return; // surprises
        if (this.tapScenery(wx, wy)) return;

        const it = this.pumpkinAt(wx, wy);
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
        if (this.eggHoppah()) return; // surprises: sometimes Ansel scoops the bunny up
        Sfx.boing();
        this.sparkles.explode(10, h.x, h.y - 60);
        if (!this.ansel.busy) this.say('HOPPAH!', 1000);
        h.scared = true;
        h.phase = 'hop'; h.t = 0; h.fromX = h.x; h.toX = h.x + h.dir * 230; h.dur = 0.55; h.height = 150;
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
        a.img.y = GROUND + idleBob - a.jumpY;
        const ak = 1 - a.jumpY / 200;
        a.shadow.setPosition(a.x, GROUND + 4).setScale(0.95 * ak, ak).setAlpha(ak);

        // Carried item rides on his head
        if (a.carrying && a.carrying.state === 'carried' && !a.busy) {
            const walkBob = a.moving ? Math.abs(Math.sin(a.frame / 6 * Math.PI * 2)) * 6 : 0;
            a.carrying.img.x = a.x + a.dir * 2;
            a.carrying.img.y = GROUND - HEAD_TOP - a.carrying.bh / 2 + 14 - walkBob + idleBob;
            a.carrying.img.angle = a.moving ? Math.sin(time / 120) * 4 : 0;
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
            const headY = a.carrying ? GROUND - HEAD_TOP - a.carrying.bh - 10 : GROUND - HEAD_TOP - 14;
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
        this.eggsUpdate(dt, time); // surprises
        this.updateHoppah(dt);
        this.updateScenery(dt);
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
            }
        }
        target = this.eggHint(target); // surprises: now and then the hand shows one
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
        this.eggUiCreate(); // surprises: sticker badge and tray

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
        this.eggSeeds = this.add.particles(0, 0, 'egg_seed', {
            lifespan: { min: 700, max: 1200 }, speedX: { min: -340, max: 340 }, speedY: { min: -300, max: 20 },
            gravityY: 760, rotate: { start: 0, end: 360 }, scale: { min: 0.7, max: 0.95 }, emitting: false,
        }).setDepth(1.2);

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
        this.say(text, ms);
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
        this.setPose('down');
        Sfx.pickup();
        // a stand-in bunny does the cuddle; the real one waits, hidden, until he springs free
        const p = G.img = this.add.image(h.x, h.y, 'hoppah_stand').setOrigin(0.5, 305 / 327).setScale(0.3)
            .setDepth(21).setFlipX(a.dir < 0);
        h.img.setVisible(false);
        h.shadow.setVisible(false);
        const holdX = a.x + a.dir * 30, holdY = GROUND - 92;
        this.tweens.add({ targets: p, x: holdX, y: holdY, scale: 0.27, duration: 240, ease: 'Quad.Out' });
        this.time.delayedCall(260, () => {
            this.setPose('run');
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
        this.setPose('up');
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
        if (this.hovering) return;                       // never distract from a drop
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
        const bb = this.add.nineslice(0, 0, 'panel', null, 92, 46, 20, 20, 20, 20).setOrigin(1, 0);
        const star = this.add.image(-68, 23, 'sparkle').setScale(1.1);
        const count = this.add.text(-54, 24, '', {
            fontFamily: FONT, fontSize: '12px', color: '#ffe3a6', stroke: INK, strokeThickness: 4,
        }).setOrigin(0, 0.5);
        badge.add([bb, star, count]);
        const fx = this.add.particles(0, 0, 'sparkle', {
            lifespan: 500, speed: { min: 60, max: 170 }, angle: { min: 0, max: 360 },
            scale: { start: 1, end: 0 }, emitting: false,
        }).setDepth(96);
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
        const left = 270, right = w - 132, gap = right - left, px = E.J.stickerPx;
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
        return p.x > this.scale.width - 120 && p.y >= EGG_BADGE_Y - 4 && p.y < EGG_BADGE_Y + 54;
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

// Wait (briefly) for the pixel font so text isn't drawn in a fallback face.
const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('20px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))])
    : Promise.resolve();
fontReady.then(boot, boot);
})();
