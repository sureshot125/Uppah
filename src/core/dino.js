// ══════════════════════════════════════════════════════════════════════════════
// UPPAH — Dino Edition  (v4 — Chrome Dino-faithful physics)
//
// Core inspiration from Chrome's offline.js:
//   SPEED        : 6  → scaled to ~360px/s for our dt-based loop
//   ACCELERATION : 0.001/frame → ~0.6px/s per second
//   MAX_SPEED    : 13 → ~780px/s cap
//   GRAVITY      : ~0.6 units/frame² → 2200 px/s²
//   JUMP_VEL     : 12 units/frame → -700px/s
//   Obstacle gap : MIN_GAP_COEFFICIENT × speed (enforced minimum, not random timer)
//   Birds appear : after score 450, three height tiers
//
// UPPAH twist:
//   • Ballballs on the ground (coin lane, some require a jump)
//   • Collecting ballballs refills the distance (health) bar
//   • Distance bar drains passively; reaching 0 = Gigi catches baby = Game Over
//   • Gigi is always rendered on-screen left, scales closer in danger
//   • Hoppah: ground obstacle (jump over) OR bouncing (duck under)
//   • Duckduck: air obstacle (duck) OR ground (jump)
// ══════════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let W      = canvas.width;   // will be set dynamically
let H      = canvas.height;  // will be set dynamically

// ── Physics & Speed (Chrome-faithful, converted to px/s) ───────────────────
let SCALE           = 4;       // recalculated in resizeCanvas()
const GRAVITY_PX    = 2200;    // px/s²
const JUMP_VEL      = -710;    // px/s  (Chrome: -12 units/frame @ 60fps → -720)
const INIT_SPEED    = 360;     // px/s
const MAX_SPEED     = 580;     // px/s — soft cap, feels fair
const ACCEL         = 2.0;     // px/s per second — gentler ramp
const MIN_GAP_COEFF = 1.1;     // gap = MIN_GAP_COEFF × speed  (seconds)

// ── Layout ─────────────────────────────────────────────────────────────────
let GROUND_Y = 445;   // y of floor line — recalculated on resize
let BABY_X   = 220;   // baby left-edge screen x — recalculated on resize

function resizeCanvas() {
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    canvas.width  = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    W = canvas.width;
    H = canvas.height;

    GROUND_Y = Math.round(H * 0.93);

    // SCALE tracks canvas height relative to the 480px reference.
    // Capped at 4 so desktops (H > 480) look exactly as originally designed.
    SCALE = Math.max(1.5, Math.min(4, (H / 480) * 4));

    // Baby sits at 25% from left — gives 75% of width as reaction window.
    // On desktop 960px: BABY_X = 240 (was 220, barely perceptible shift).
    BABY_X = Math.round(W * 0.25);

    // Character render sizes derived from SCALE so sprite matches hitbox proportionally.
    BABY_RENDER_H    = Math.round(40 * SCALE);   // 160px at SCALE=4 (reference)
    BABY_RENDER_W    = Math.round(BABY_RENDER_H * (252 / 370));
    BABY_FOOT_OFFSET = Math.round(BABY_RENDER_H * (27  / 370));
    GIGI_RENDER_H    = Math.round(47.5 * SCALE); // 190px at SCALE=4 (reference)
    GIGI_RENDER_W    = Math.round(GIGI_RENDER_H * (354 / 496));
    GIGI_FOOT_OFFSET = Math.round(GIGI_RENDER_H * (37  / 496));

    // Keep player hitbox in sync (safe to call before player is defined at boot)
    if (typeof player !== 'undefined') {
        player.w = 24 * SCALE;
        player.h = player.state === 'DUCKING' ? 18 * SCALE : 32 * SCALE;
        if (player.state === 'RUNNING') player.y = GROUND_Y;
    }
}

// ── Distance/Health bar ────────────────────────────────────────────────────
const MAX_DIST      = 100;     // abstract units (like HP)
const DRAIN_RATE    = 3.5;     // units/second passive drain
const DANGER_THRESH = 22;      // below this → danger state

// ── Obstacle score gates ───────────────────────────────────────────────────
const AIR_OBS_GATE  = 400;

// ── Assets ─────────────────────────────────────────────────────────────────
const images = {};
// Ansel (Baby): 6 frames, 252×370 RGBA. bottom padding = 27px → 7.3%
const ANSEL_FRAMES     = 6;
let BABY_RENDER_H    = 160;
let BABY_RENDER_W    = Math.round(BABY_RENDER_H * (252 / 370)); // ~109px
let BABY_FOOT_OFFSET = Math.round(BABY_RENDER_H * (27  / 370)); // ~12px

// Gigi (Mom): 8 frames, 354×496 RGBA. bottom padding = 37px → 7.5%
const GIGI_FRAMES      = 8;
let GIGI_RENDER_H    = 190;
let GIGI_RENDER_W    = Math.round(GIGI_RENDER_H * (354 / 496)); // ~136px
let GIGI_FOOT_OFFSET = Math.round(GIGI_RENDER_H * (37  / 496)); // ~14px

let gigiRunFrame = 0;
let gigiRunClock = 0;

const ASSETS = {
    // Ansel run animation (6 frames)
    ansel_01: 'assets/Ansel Running frames/frame_01.png',
    ansel_02: 'assets/Ansel Running frames/frame_02.png',
    ansel_03: 'assets/Ansel Running frames/frame_03.png',
    ansel_04: 'assets/Ansel Running frames/frame_04.png',
    ansel_05: 'assets/Ansel Running frames/frame_05.png',
    ansel_06: 'assets/Ansel Running frames/frame_06.png',
    // Gigi run animation (8 frames)
    gigi_01: 'assets/Gigi Running frames/frame_01.png',
    gigi_02: 'assets/Gigi Running frames/frame_02.png',
    gigi_03: 'assets/Gigi Running frames/frame_03.png',
    gigi_04: 'assets/Gigi Running frames/frame_04.png',
    gigi_05: 'assets/Gigi Running frames/frame_05.png',
    gigi_06: 'assets/Gigi Running frames/frame_06.png',
    gigi_07: 'assets/Gigi Running frames/frame_07.png',
    gigi_08: 'assets/Gigi Running frames/frame_08.png',
    ansel_down:    'assets/Ansel Down.png',
    ansel_lose:    'assets/Ansel Lose.png',
    ansel_up:      'assets/Ansel Up.png',
    ansel_damage:  'assets/Ansel damage.png',
    hoppah_stand:  'assets/hoppah_standing.png?v=13',
    hoppah_jump:   'assets/hoppah_jumping.png?v=13',
    duckduck:      'assets/duckduck_ground.png?v=13',
    duckduck_sky:  'assets/duckduck_sky.png?v=15',
    ballball:      'assets/BallBall.png?v=13',
    golden:        'assets/golden_ballball.png?v=13',
    background:    'assets/Background.png?v=2'
};
let assetsLoaded = 0;

function getAnselFrame(idx) {
    const n = ((idx % ANSEL_FRAMES) + 1).toString().padStart(2, '0');
    return images['ansel_' + n];
}
function getGigiFrame(idx)  {
    const n = ((idx % GIGI_FRAMES) + 1).toString().padStart(2, '0');
    return images['gigi_' + n];
}


// ── DOM ────────────────────────────────────────────────────────────────────
const startScreen    = document.getElementById('start-screen');
const pauseScreen    = document.getElementById('pause-screen');
const scoreVal       = document.getElementById('score-val');
const hiScoreVal     = document.getElementById('hi-score-val');
const stumbleFlash   = document.getElementById('stumble-flash');
const speedFlash     = document.getElementById('speed-flash');
const dangerVignette = document.getElementById('danger-vignette');
const distBarFill    = document.getElementById('distance-bar-fill');
const pauseBtn       = document.getElementById('pause-btn');
const muteBtn        = document.getElementById('mute-btn');
const bgMusic        = document.getElementById('bg-music');
const levelClearMusic = document.getElementById('level-clear-music');

// ── Audio State ─────────────────────────────────────────────────────────────
let audioCtx = null;
let isMusicMuted = false;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function getSfxVol() {
    return (!bgMusic || bgMusic.paused || isMusicMuted) ? 1.0 : 2.0;
}

function playUppahSound() {
    // Nintendo-era chiptune voice: sawtooth+formant + 8-bit crusher + pulse arpeggio shimmer
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const now = audioCtx.currentTime;

        // +1 semitone — lowered to be less squeaky (×1.06)
        const sh = Math.pow(2, 1 / 12);

        // 8-bit WaveShaper crusher at output (harsh retro quantisation)
        const crusher = audioCtx.createWaveShaper();
        (() => {
            const bits = 8, steps = 1 << bits, len = 512;
            const c = new Float32Array(len);
            for (let i = 0; i < len; i++) {
                const x = (i / len) * 2 - 1;
                c[i] = Math.round(x * steps * 0.5) / (steps * 0.5);
            }
            crusher.curve = c;
            crusher.oversample = 'none'; // keep aliasing — that's the charm
        })();

        // Master envelope: UP (0→80ms) — "p" consonant dip (80ms→130ms) — PAH (130ms→300ms)
        const master = audioCtx.createGain();
        master.gain.setValueAtTime(vol * 0.45,  now);
        master.gain.setValueAtTime(vol * 0.45,  now + 0.08);          // "UP" sustain
        master.gain.linearRampToValueAtTime(vol * 0.01, now + 0.10);  // "p" dip start
        master.gain.setValueAtTime(vol * 0.01,  now + 0.13);          // "p" dip hold
        master.gain.linearRampToValueAtTime(vol * 0.45, now + 0.15);  // "PAH" onset
        master.gain.exponentialRampToValueAtTime(0.001, now + 0.35);  // "PAH" fade
        crusher.connect(master);
        master.connect(audioCtx.destination);

        // ── Layer 1: Sawtooth + bandpass voice ──────────────────────────────
        // Pitch contour: "UP" (280→480Hz shifted) then "pah" falls (→340Hz shifted)
        const vOsc  = audioCtx.createOscillator();
        const vFilt = audioCtx.createBiquadFilter();
        const vGain = audioCtx.createGain();
        vOsc.type = 'sawtooth';
        vOsc.frequency.setValueAtTime(280 * sh, now);                       // "uh" onset
        vOsc.frequency.exponentialRampToValueAtTime(480 * sh, now + 0.09);  // "UP" rise
        vOsc.frequency.exponentialRampToValueAtTime(340 * sh, now + 0.20);  // "pah" settle
        vFilt.type = 'bandpass';
        vFilt.frequency.setValueAtTime(900, now);
        vFilt.frequency.linearRampToValueAtTime(1250, now + 0.09);  // "ah" formant
        vFilt.Q.value = 5;
        vGain.gain.value = 0.65;
        vOsc.connect(vFilt); vFilt.connect(vGain); vGain.connect(crusher);
        vOsc.start(now); vOsc.stop(now + 0.23);

        // ── Layer 2: 12.5% pulse arpeggio C5 → E5 → G5 ─────────────────────
        // Fires on the "PAH" syllable (135ms onwards) for the "happy shimmer"
        const pWave = (() => {
            const D = 0.125, M = 32;
            const re = new Float32Array(M + 1);
            const im = new Float32Array(M + 1);
            for (let n = 1; n <= M; n++) {
                im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * D);
            }
            return audioCtx.createPeriodicWave(re, im, { disableNormalization: false });
        })();

        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const t = now + 0.15 + i * 0.06;
            const aOsc  = audioCtx.createOscillator();
            const aGain = audioCtx.createGain();
            aOsc.setPeriodicWave(pWave);
            aOsc.frequency.value = freq;
            aGain.gain.setValueAtTime(0.30, t);
            aGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
            aOsc.connect(aGain); aGain.connect(crusher);
            aOsc.start(t); aOsc.stop(t + 0.06);
        });

    } catch(e) {}
}


function playDownSound() {
    // Sawtooth + bandpass descending — toddler saying "down"
    // Pitch slides from mid to low, filter shifts "ow" → nasal "n"
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const now = audioCtx.currentTime;
        const osc    = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain   = audioCtx.createGain();
        osc.type = 'sawtooth';
        // "down" — pitch descends the whole word
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(170, now + 0.18);
        osc.frequency.exponentialRampToValueAtTime(130, now + 0.30);
        // Formant: "ow" vowel opens, then closes into nasal "n"
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(700, now);
        filter.frequency.linearRampToValueAtTime(450, now + 0.22);
        filter.Q.value = 3;
        // Envelope: immediate attack, sustain through "ow", fade on "n"
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35 * vol, now + 0.02);
        gain.gain.setValueAtTime(0.28 * vol, now + 0.10);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
        osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.31);
    } catch(e) {}
}

function playFootstepSound(right) {
    // Tiny chiptune pitter-patter — alternating left/right toddler footfall
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        // Right foot slightly higher than left to create L/R alternation
        osc.frequency.setValueAtTime(right ? 230 : 175, now);
        osc.frequency.exponentialRampToValueAtTime(right ? 130 : 100, now + 0.045);
        gain.gain.setValueAtTime(0.12 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.05);
    } catch(e) {}
}

function playCollectSound() {
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.2 * vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01 * vol, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    } catch(e) {}
}

function playGoldenSound() {
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const now = audioCtx.currentTime;
        [800, 1000, 1200].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(freq, now + i * 0.05);
            gain.gain.setValueAtTime(0.2 * vol, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01 * vol, now + i * 0.05 + 0.1);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.05); osc.stop(now + i * 0.05 + 0.1);
        });
    } catch(e) {}
}

function playHitSound() {
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.35 * vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01 * vol, audioCtx.currentTime + 0.2);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    } catch(e) {}
}

function playStartSound() {
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const now = audioCtx.currentTime;
        [600, 800, 1000].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            gain.gain.setValueAtTime(0.2 * vol, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01 * vol, now + i * 0.08 + 0.1);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.1);
        });
    } catch(e) {}
}

function updateMusic() {
    if (!bgMusic || !levelClearMusic) return;
    if (gameState === 'PLAYING') {
        if (bgMusic.paused) {
            bgMusic.muted = isMusicMuted;
            bgMusic.play().catch(() => {});
        }
    } else if (gameState === 'GAME_OVER') {
        if (!bgMusic.paused) bgMusic.pause();
        if (levelClearMusic.paused) {
            levelClearMusic.muted = isMusicMuted;
            levelClearMusic.play().catch(() => {});
        }
    } else {
        if (!bgMusic.paused) bgMusic.pause();
        if (!levelClearMusic.paused) levelClearMusic.pause();
    }
}

function toggleMute() {
    isMusicMuted = !isMusicMuted;
    if (bgMusic) bgMusic.muted = isMusicMuted;
    if (levelClearMusic) levelClearMusic.muted = isMusicMuted;
    muteBtn.textContent = isMusicMuted ? '🔇' : '🔊';
    muteBtn.classList.toggle('is-muted', isMusicMuted);
}
let gameState = 'START';
let lastTime  = 0;
let speed     = INIT_SPEED;
let distance  = MAX_DIST * 0.7; // health bar starts at 70%
let stats     = { hoppahs: 0, ballballs: 0, golden: 0, duckducks: 0 };
let obstacles = [];
let particles = [];
let groundX   = 0;    // for scrolling ground dots
let flashTimer = 0;   // milestone flash timer

// Next obstacle spawn distance (in px the world will scroll before spawning)
let nextGap   = 0;
let scrolled  = 0;    // total px scrolled this run (for gap tracking)
let lastObstacleX = W + 200; // right-edge of last obstacle spawned

let player = {
    y:         GROUND_Y,
    vy:        0,
    state:     'RUNNING',  // RUNNING | JUMPING | DUCKING
    h:         32 * SCALE,
    w:         24 * SCALE,
    runFrame:  0,
    runClock:  0,
    damageClock: 0
};

let isDuckHeld = false;
let isJumpHeld = false;  // for variable jump height

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    ctx.imageSmoothingEnabled = false;

    for (const k in ASSETS) {
        images[k] = new Image();
        images[k].onload = images[k].onerror = () => {
            assetsLoaded++;
            if (assetsLoaded === Object.keys(ASSETS).length) {
                setupInputs();
                requestAnimationFrame(loop);
            }
        };
        images[k].src = ASSETS[k];
    }
}

// ── Input ──────────────────────────────────────────────────────────────────
function setupInputs() {
    startScreen.addEventListener('click', () => {
        initAudio();
        if (gameState === 'START' || gameState === 'GAME_OVER') startGame();
    });
    pauseScreen.addEventListener('click', () => {
        initAudio();
        if (gameState === 'PAUSED') resume();
    });
    pauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        initAudio();
        if (gameState === 'PLAYING') pause();
        else if (gameState === 'PAUSED') resume();
    });

    window.addEventListener('keydown', (e) => {
        initAudio();
        if (['Escape','p','P'].includes(e.key)) {
            if (gameState === 'PLAYING') pause();
            else if (gameState === 'PAUSED') resume();
            return;
        }
        if (['ArrowDown','s','S'].includes(e.key)) { e.preventDefault(); triggerDuck(true); }
        if (['ArrowUp','w','W',' '].includes(e.key)) { e.preventDefault(); triggerJump(true); }
    });
    window.addEventListener('keyup', (e) => {
        if (['ArrowDown','s','S'].includes(e.key)) triggerDuck(false);
        if (['ArrowUp','w','W',' '].includes(e.key)) triggerJump(false);
    });

    const zL = document.getElementById('zone-left');
    const zR = document.getElementById('zone-right');
    zL.addEventListener('touchstart',  (e) => { e.preventDefault(); triggerDuck(true);  }, {passive:false});
    zL.addEventListener('touchend',    (e) => { e.preventDefault(); triggerDuck(false); }, {passive:false});
    zL.addEventListener('mousedown',   () => triggerDuck(true));
    zL.addEventListener('mouseup',     () => triggerDuck(false));
    zL.addEventListener('mouseleave',  () => triggerDuck(false));
    zR.addEventListener('touchstart',  (e) => { e.preventDefault(); initAudio(); triggerJump(true); }, {passive:false});
    zR.addEventListener('touchend',    (e) => { e.preventDefault(); triggerJump(false); }, {passive:false});
    zR.addEventListener('mousedown',   () => { initAudio(); triggerJump(true); });
    zR.addEventListener('mouseup',     () => triggerJump(false));
    zR.addEventListener('mouseleave',  () => triggerJump(false));

    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        initAudio();
        toggleMute();
    });

    canvas.addEventListener('click', () => {
        if (gameState === 'PLAYING') pause();
    });
}

function triggerDuck(on) {
    if (gameState !== 'PLAYING') return;
    if (on && !isDuckHeld) {
        // Only fire once on initial press, not on keyboard auto-repeat
        isDuckHeld = true;
        if (player.state !== 'JUMPING') {
            player.state = 'DUCKING';
            player.h = 18 * SCALE;
            playDownSound();
        }
    } else if (!on && isDuckHeld) {
        isDuckHeld = false;
        if (player.state === 'DUCKING') {
            player.state = 'RUNNING';
            player.h = 32 * SCALE;
        }
    }
}

function triggerJump(pressed) {
    if (gameState !== 'PLAYING') return;
    isJumpHeld = pressed;
    if (pressed && player.state === 'RUNNING') {
        player.state = 'JUMPING';
        player.vy   = JUMP_VEL;
        playUppahSound();
    }
}

// ── Game lifecycle ─────────────────────────────────────────────────────────
function startGame() {
    initAudio();
    playStartSound();
    if (levelClearMusic) {
        levelClearMusic.pause();
        levelClearMusic.currentTime = 0;
    }
    gameState      = 'PLAYING';
    stats          = { hoppahs: 0, ballballs: 0, golden: 0, duckducks: 0 };
    speed          = INIT_SPEED;
    distance       = MAX_DIST * 0.7;
    obstacles      = [];
    particles      = [];
    groundX        = 0;
    lastTime       = 0;
    flashTimer     = 0;
    scrolled       = 0;
    lastObstacleX  = W + 200;
    nextGap        = calcGap();
    player.y       = GROUND_Y;
    player.vy      = 0;
    player.state   = 'RUNNING';
    player.h       = 32 * SCALE;
    player.runFrame = 0;
    player.runClock = 0;
    player.damageClock = 0;
    gigiRunFrame   = 0;
    gigiRunClock   = 0;
    isDuckHeld     = false;
    isJumpHeld     = false;

    startScreen.style.display = 'none';
    pauseScreen.style.display = 'none';
    pauseBtn.disabled         = false;
    pauseBtn.textContent      = '⏸ Pause';
    dangerVignette.classList.remove('danger');
    document.getElementById('start-emoji').style.display = 'block';
    document.getElementById('start-title').style.display = 'block';
    document.getElementById('game-over-img').style.display = 'none';
    document.getElementById('start-emoji').textContent = '🍼';
    document.getElementById('start-title').textContent = 'UPPAH!';
    document.getElementById('start-sub').textContent = 'TAP TO PLAY';
    document.getElementById('game-over-stats').style.display = 'none';
    document.getElementById('start-hints').style.display = 'flex';
}

function pause() {
    gameState = 'PAUSED';
    pauseScreen.style.display = 'flex';
    pauseBtn.textContent = '▶ Resume';
}

function resume() {
    gameState = 'PLAYING';
    pauseScreen.style.display = 'none';
    pauseBtn.textContent = '⏸ Pause';
    lastTime = performance.now(); // prevent dt spike on first post-resume frame
}

function gameOver() {
    gameState = 'GAME_OVER';
    pauseBtn.disabled = true;
    document.getElementById('start-emoji').style.display = 'none';
    document.getElementById('start-title').style.display = 'none';
    document.getElementById('game-over-img').style.display = 'block';
    
    // Inject game over stats into its own container
    const goStats = document.getElementById('game-over-stats');
    goStats.style.display = 'block';
    goStats.innerHTML = `<span style="font-size:32px; color:#fff; font-weight:900;">Gigi Caught Ansel!</span><br><br><span style="font-size:18px; color:#FFD63A; font-weight:700; background:rgba(0,0,0,0.5); padding:10px 20px; border-radius:30px; display:inline-block; border:1px solid rgba(255,214,58,0.3);">🏀 ${stats.ballballs} &nbsp; ⭐ ${stats.golden} &nbsp; 🦆 ${stats.duckducks} &nbsp; 🐰 ${stats.hoppahs}</span>`;
    
    // Update button text
    document.getElementById('start-sub').textContent = 'PLAY AGAIN';
    
    document.getElementById('start-hints').style.display = 'none';
    startScreen.style.display = 'flex';
    dangerVignette.classList.add('danger');
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtScore(n) { return Math.floor(n).toString().padStart(5, '0'); }

// Gap calculation with breather mechanism
let spawnCount = 0;
function calcGap() {
    spawnCount++;
    const diffFactor = 1.0 + (scrolled / 30000); 
    const base = MIN_GAP_COEFF * speed / diffFactor; // Tighter gaps at higher difficulty
    // Every 4–6 obstacles, give a wider breather gap
    const isBreather = (spawnCount % (4 + Math.floor(Math.random() * 3)) === 0);
    const mult = isBreather ? (1.6 + Math.random() * 0.5) : (0.75 + Math.random() * 0.5);
    return base * mult;
}

function spawnParticle(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 140 + 50;
        particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 80, life: 1, color });
    }
}

function flashMsg(msg, color) {
    speedFlash.textContent = msg;
    speedFlash.style.color = color;
    speedFlash.style.opacity = 1;
    clearTimeout(speedFlash._t);
    speedFlash._t = setTimeout(() => speedFlash.style.opacity = 0, 900);
}

// Intent-driven coin helper
// intent: 'jump' = arc coins above ground; 'duck' = ground-level train; 'free' = scattered ground coins
function spawnCoins(startX, intent) {
    if (Math.random() < 0.07) {
        // Golden BallBall — always mid-air (must jump to collect)
        const goldY = GROUND_Y - 28 * SCALE;
        obstacles.push({ type:'golden', x:startX, y:goldY,
            w:18*SCALE, h:18*SCALE, hit:false, layer:'coin' });
        return;
    }
    if (intent === 'jump') {
        // Arc of coins at jump-peak height — reward for clearing the obstacle
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            obstacles.push({ type:'ballball',
                x: startX + i * 20*SCALE,
                y: GROUND_Y - (18 + i*3)*SCALE,
                w:16*SCALE, h:16*SCALE, hit:false, layer:'coin' });
        }
    } else if (intent === 'duck') {
        // Ground-level train — collectible while ducking past
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            obstacles.push({ type:'ballball',
                x: startX + i * 18*SCALE,
                y: GROUND_Y,
                w:16*SCALE, h:16*SCALE, hit:false, layer:'coin' });
        }
    } else {
        // Breather / free: 1–2 easy ground coins
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            obstacles.push({ type:'ballball',
                x: startX + i * 22*SCALE,
                y: GROUND_Y,
                w:16*SCALE, h:16*SCALE, hit:false, layer:'coin' });
        }
    }
}

// ── Obstacle spawning ──────────────────────────────────────────────────────
function spawnNext() {
    const r = Math.random();
    let coinIntent = 'free';

    if (speed < 400 || r < 0.45) {
        // Ground obstacle — Hoppah
        const bouncing = Math.random() < 0.50 && speed > 380;
        // bouncing hoppahs must be high enough to clear the ducking hitbox
        const hopY = bouncing ? GROUND_Y - 18 * SCALE : GROUND_Y;
        obstacles.push({
            type:  bouncing ? 'hoppah_bounce' : 'hoppah_still',
            x:     W + 80, y: hopY,
            w:     16 * SCALE, h: 16 * SCALE,
            vy:    0, hit: false, flip: Math.random() < 0.5,
            layer: 'obstacle'
        });
        coinIntent = bouncing ? 'duck' : 'jump';
    } else {
        // Air obstacle — Duckduck branch (Tiers: 0=ground, 1=low-air, 2=high-air)
        const tierRoll = Math.random();
        // Weighted distribution: 15% Ground (Jump), 75% Low-air (Duck), 10% High-air (Jump/Duck)
        const tier = tierRoll < 0.15 ? 0 : tierRoll < 0.90 ? 1 : 2; 

        const yMap = [
            GROUND_Y,
            GROUND_Y - 18 * SCALE, // Must clear ducking hitbox
            GROUND_Y - 30 * SCALE  // High enough to jump or duck
        ];
        
        const isGroundDuck = tier === 0;
        obstacles.push({
            type: 'duckduck',
            x: W + 80, y: yMap[tier],
            w: (isGroundDuck ? 20 : 12) * SCALE,
            h: (isGroundDuck ? 14 : 12) * SCALE,
            tier, hit: false,
            flip: Math.random() < 0.5,
            layer: 'obstacle'
        });
        
        // Tier 0 is a jump event; Tiers 1 & 2 are duck events
        coinIntent = isGroundDuck ? 'jump' : 'duck';
    }

    lastObstacleX = W + 80;
    nextGap = calcGap();

    // BallBalls spawn 35–55% into gap with intent-matching placement
    const gapFraction = 0.35 + Math.random() * 0.2;
    const coinStartX = (W + 80) + (nextGap * gapFraction);
    spawnCoins(coinStartX, coinIntent);
}

// ── Update ─────────────────────────────────────────────────────────────────
function update(dt) {
    if (dt > 0.08) dt = 0.08; // cap spike (Chrome Dino does same)

    // ── Score & speed (Chrome-faithful acceleration curve) ─────────────────
    scoreVal.textContent = `🏀 ${stats.ballballs}  ⭐ ${stats.golden}  🦆 ${stats.duckducks}  🐰 ${stats.hoppahs}`;
    document.getElementById('distance-text').textContent = 'DISTANCE';

    // Difficulty scaling
    const diffFactor = 1.0 + (scrolled / 30000); 

    // Speed milestone tracking (flash removed)
    const milestone = Math.floor(speed / 80);
    if (flashTimer !== milestone) { flashTimer = milestone; }

    const curMaxSpeed = MAX_SPEED + (diffFactor - 1) * 80; // Slowly raise max speed

    if (speed < curMaxSpeed) {
        speed = Math.min(curMaxSpeed, speed + ACCEL * dt);
    }

    // ── Ground scroll ──────────────────────────────────────────────────────
    // Subtract instead of modulo to avoid floating-point accumulation drift
    groundX += speed * dt;
    if (groundX >= 40) groundX -= 40;
    scrolled += speed * dt;

    // ── Distance/health bar (passive drain scaled by diffFactor) ───────────
    distance -= DRAIN_RATE * diffFactor * dt;

    // ── Player physics ─────────────────────────────────────────────────────
    if (player.state === 'JUMPING') {
        // Variable jump height:
        //  - Holding duck mid-air → 2.5× gravity (fast-fall, same as before)
        //  - Released jump key while still rising → 3× gravity (short hop)
        //  - Holding jump key → normal gravity (full arc)
        let grav = GRAVITY_PX;
        if (isDuckHeld) {
            grav *= 2.5; // fast-fall
        } else if (!isJumpHeld && player.vy < 0) {
            grav *= 3;   // jump-cut: released early while ascending
        }
        player.vy += grav * dt;
        player.y  += player.vy * dt;
        if (player.y >= GROUND_Y) {
            player.y   = GROUND_Y;
            player.vy  = 0;
            player.state = isDuckHeld ? 'DUCKING' : 'RUNNING';
            player.h   = isDuckHeld ? 18*SCALE : 32*SCALE;
        }
    }

    if (player.damageClock > 0) {
        player.damageClock -= dt;
    }

    // ── Run animation (Ansel) + footstep sounds ─────────────────────────────
    if (player.state === 'RUNNING') {
        player.runClock += dt;
        if (player.runClock > 0.08) {
            player.runClock = 0;
            player.runFrame = (player.runFrame + 1) % ANSEL_FRAMES;
            // Trigger pitter-patter on frame 0 (right foot) and frame 3 (left foot)
            if (player.runFrame === 0) playFootstepSound(true);
            if (player.runFrame === 3) playFootstepSound(false);
        }
    }

    // ── Run animation (Gigi — always chasing) ──────────────────────
    gigiRunClock += dt;
    if (gigiRunClock > 0.075) { // slightly faster than Ansel
        gigiRunClock = 0;
        gigiRunFrame = (gigiRunFrame + 1) % GIGI_FRAMES;
    }

    // ── Spawning (gap-based, Chrome style) ─────────────────────────────────
    // Find rightmost obstacle x
    let rightmostX = -Infinity;
    for (const o of obstacles) {
        if (o.layer === 'obstacle' && !o.hit) rightmostX = Math.max(rightmostX, o.x);
    }
    const gapToLastSpawn = (W + 80) - rightmostX;
    if (rightmostX === -Infinity || gapToLastSpawn >= nextGap) {
        spawnNext();
    }

    // ── Update obstacles ───────────────────────────────────────────────────
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= speed * dt;

        // Bouncing hoppah physics
        if (o.type === 'hoppah_bounce') {
            o.vy += GRAVITY_PX * dt;
            o.y  += o.vy * dt;
            if (o.y >= GROUND_Y) {
                o.y  = GROUND_Y;
                o.vy = -350;
            }
        }

        // ── Collision check ─────────────────────────────────────────────
        if (!o.hit) {
            // Hitbox: shrink 12% on each side horizontally.
            // Y is only inset from the top — feet are anchored to GROUND_Y so
            // the bottom of the hitbox is intentionally flush with the ground.
            const shrink = 0.12;
            const px = BABY_X + player.w * shrink;
            const py = player.y - player.h + player.h * shrink;
            const pw = player.w * (1 - shrink * 2);
            const ph = player.h * (1 - shrink * 2);

            const ox = o.x + o.w * shrink;
            const oy = o.y - o.h + o.h * shrink;
            const ow = o.w * (1 - shrink*2);
            const oh = o.h * (1 - shrink*2);

            const hit = px < ox+ow && px+pw > ox && py < oy+oh && py+ph > oy;

            if (hit) {
                o.hit = true;
                if (o.layer === 'coin') {
                    // Collect ballball
                    if (o.type === 'golden') {
                        stats.golden++;
                        playGoldenSound();
                    } else {
                        stats.ballballs++;
                        playCollectSound();
                    }
                    const boost = o.type === 'golden' ? MAX_DIST : 5.7;
                    distance = o.type === 'golden' ? MAX_DIST : Math.min(MAX_DIST, distance + boost);
                    const col = o.type === 'golden' ? '#FFD700' : '#FFB300';
                    spawnParticle(BABY_X + player.w/2, player.y - player.h/2, col, 6);
                    if (o.type === 'golden') flashMsg('✨ GOLDEN BALLBALL!', '#FFD700');
                } else {
                    // Hit obstacle — stumble → lose distance
                    distance -= 25;
                    playHitSound();
                    player.damageClock = 0.4;
                    spawnParticle(BABY_X + player.w/2, player.y - player.h/2, '#FF4444', 10);
                    stumbleFlash.style.opacity = 1;
                    setTimeout(() => stumbleFlash.style.opacity = 0, 140);
                }
            }
        }

        // Cleanup off-screen
        if (o.x < -o.w - 60) {
            if (o.layer === 'obstacle' && !o.hit) {
                if (o.type.startsWith('hoppah')) stats.hoppahs++;
                if (o.type === 'duckduck') stats.duckducks++;
            }
            obstacles.splice(i, 1);
        }
    }

    // ── Particles ──────────────────────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x   += p.vx * dt;
        p.y   += p.vy * dt;
        p.vy  += 400 * dt;
        p.life -= dt * 2.2;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // ── Distance bar UI ────────────────────────────────────────────────────
    const pct = Math.max(0, Math.min(1, distance / MAX_DIST));
    distBarFill.style.width = (pct * 100) + '%';
    const hue = Math.round(pct * 120); // 120=green, 0=red
    distBarFill.style.background = `hsl(${hue}, 90%, 45%)`;
    const inDanger = distance < DANGER_THRESH;
    dangerVignette.classList.toggle('danger', inDanger);

    // ── Game over ──────────────────────────────────────────────────────────
    if (distance <= 0) { distance = 0; gameOver(); }
}

// ── Draw ───────────────────────────────────────────────────────────────────
function draw() {
    ctx.clearRect(0, 0, W, H);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d0d1a');
    sky.addColorStop(0.75, '#1a1838');
    sky.addColorStop(1, '#251d4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Horizon glow
    ctx.fillStyle = 'rgba(255,107,157,0.04)';
    ctx.fillRect(0, GROUND_Y - 60, W, 60);

    if (images.background && images.background.complete && images.background.naturalWidth > 0) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Stretch to fill the entire physical canvas
        ctx.drawImage(images.background, 0, 0, W, H);
        ctx.restore();
    } else {
        // ── Ground Fallback ────────────────────────────────────────────────────
        ctx.fillStyle = '#2a3a1a';
        ctx.fillRect(0, GROUND_Y + 2, W, H - GROUND_Y - 2);

        // Ground line
        ctx.strokeStyle = '#5aaa2a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();

        // Scrolling dashes (Chrome Dino's signature ground detail)
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        for (let x = groundX - 40; x < W + 40; x += 40) {
            ctx.fillRect(x, GROUND_Y + 6, 22, 3);
        }
        // Simple procedural clouds fallback if image is missing
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        const cx = (performance.now() * 0.02) % (W + 300);
        ctx.beginPath(); ctx.ellipse(W - cx, GROUND_Y - 80,  70, 25, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(W - cx + 320, GROUND_Y - 110, 90, 30, 0, 0, Math.PI*2); ctx.fill();
    }

    // ── Ground strip (always drawn over background) ─────────────────────────
    // Grass top edge
    ctx.fillStyle = 'rgba(60, 140, 40, 0.75)';
    ctx.fillRect(0, GROUND_Y, W, 6);
    // Slight shadow underneath for depth
    ctx.fillStyle = 'rgba(20, 80, 10, 0.5)';
    ctx.fillRect(0, GROUND_Y + 6, W, H - GROUND_Y - 6);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';


    // ── Draw coins (render behind obstacles and characters) ────────────────
    for (const o of obstacles) {
        if (o.layer !== 'coin' || o.hit) continue;
        const img = o.type === 'golden' ? images.golden : images.ballball;
        
        if (o.type === 'golden') {
            ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14;
        } else {
            ctx.shadowColor = '#FF9800'; ctx.shadowBlur = 8;
        }
        drawImg(img, o.x, o.y - o.h, o.w, o.h);
        ctx.shadowBlur = 0;
    }


    // ── Gigi (always on screen, left side, animated) ────────────────────────
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const safeRatio   = Math.max(0, Math.min(1, distance / MAX_DIST));
    // Gigi slides from just-off-left-edge (safe) to right behind Ansel (max danger)
    const maxSafeX    = -GIGI_RENDER_W * 0.1;                    // barely off-screen left
    const maxDangerX  = BABY_X - GIGI_RENDER_W + 10;             // right edge flush with Ansel's left
    const gigiScreenX = maxDangerX - safeRatio * (maxDangerX - maxSafeX);

    // Pulse red glow when in danger
    if (distance < DANGER_THRESH) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.009);
        ctx.shadowColor = '#FF0000'; ctx.shadowBlur = 28 * pulse;
    }
    // Anchor feet precisely to GROUND_Y
    drawImg(getGigiFrame(gigiRunFrame), gigiScreenX, GROUND_Y - GIGI_RENDER_H + GIGI_FOOT_OFFSET, GIGI_RENDER_W, GIGI_RENDER_H);
    ctx.shadowBlur = 0;
    ctx.imageSmoothingEnabled = false;

    // ── Draw obstacle entities ─────────────────────────────────────────────
    for (const o of obstacles) {
        if (o.layer !== 'obstacle') continue;
        ctx.globalAlpha = o.hit ? 0.15 : 1;

        let flipped = o.flip;
        if (flipped) {
            ctx.save();
            ctx.translate(o.x + o.w/2, 0);
            ctx.scale(-1, 1);
        }

        if (o.type === 'hoppah_still') {
            const renderH = o.w * (327/293);
            drawImg(images.hoppah_stand, flipped ? -o.w/2 : o.x, o.y - renderH, o.w, renderH);
        } else if (o.type === 'hoppah_bounce') {
            const renderH = o.w * (329/274);
            drawImg(images.hoppah_jump,  flipped ? -o.w/2 : o.x, o.y - renderH, o.w, renderH);
        } else if (o.type === 'duckduck') {
            const isSky = o.tier > 0;
            const img = isSky ? images.duckduck_sky : images.duckduck;
            const drawW = isSky ? o.w * 2.5 : o.w; // Larger sky ducks
            const renderH = drawW * (523/769);       // correct 769x523 aspect ratio
            const flap = isSky ? Math.sin(performance.now() * 0.015) * 6 : 0;
            const drawX = flipped ? -drawW/2 : o.x - (drawW - o.w)/2;
            drawImg(img, drawX, o.y - renderH + flap, drawW, renderH);
        }
        
        if (flipped) {
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    // ── Baby (always at BABY_X) ──────────────────────────────────────────
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let pImg;
    let drawW, drawH, footOff;

    if (gameState === 'GAME_OVER') {
        pImg    = images.ansel_lose;
        drawH   = BABY_RENDER_H;
        drawW   = drawH * (490 / 540);
        footOff = BABY_FOOT_OFFSET;
    } else if (player.damageClock > 0) {
        pImg    = images.ansel_damage;
        drawH   = BABY_RENDER_H;
        drawW   = drawH * (328 / 444);
        footOff = BABY_FOOT_OFFSET;
    } else if (player.state === 'JUMPING') {
        pImg    = images.ansel_up;
        drawH   = BABY_RENDER_H;
        drawW   = drawH * (428 / 588);
        footOff = BABY_FOOT_OFFSET;
    } else if (player.state === 'DUCKING') {
        pImg    = images.ansel_down;
        drawH   = BABY_RENDER_H * 0.65; // visibly smaller
        drawW   = drawH * (458 / 510);
        footOff = BABY_FOOT_OFFSET * 0.65;
    } else {
        pImg    = getAnselFrame(player.runFrame);
        drawW   = BABY_RENDER_W;
        drawH   = BABY_RENDER_H;
        footOff = BABY_FOOT_OFFSET;
    }

    // Center the sprite on the hitbox's horizontal midpoint
    const targetX = BABY_X + player.w / 2 - drawW / 2;
    // Anchor feet to ground: drawY = player.y - drawH + footOff
    drawImg(pImg, targetX, player.y - drawH + footOff, drawW, drawH);
    ctx.imageSmoothingEnabled = false;

    // ── Speech bubbles for jump/duck ──────────────────────────────────────
    if (gameState === 'PLAYING' && (player.state === 'JUMPING' || player.state === 'DUCKING')) {
        const txt = player.state === 'JUMPING' ? 'Uppah!' : 'Down!';
        const px = targetX + drawW + 4;
        const py = player.y - drawH - 10;

        ctx.font = '900 20px Outfit';
        const tw = ctx.measureText(txt).width;
        const bw = tw + 28;
        const bh = 36;
        const bx = px;
        const by = py - bh;

        // Bubble background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(bx, by, bw, bh, 10);
        } else {
            ctx.rect(bx, by, bw, bh);
        }
        ctx.fill();

        // Tail
        ctx.beginPath();
        ctx.moveTo(bx + 14, by + bh);
        ctx.lineTo(bx + 2,  by + bh + 14);
        ctx.lineTo(bx + 26, by + bh);
        ctx.fill();

        // Text
        ctx.fillStyle = '#FF6B9D';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx + bw / 2, by + bh / 2);
    }

    // ── Particles ──────────────────────────────────────────────────────────
    for (let p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
}

// Helper: draw image if loaded; else draw a colour rect placeholder
function drawImg(img, x, y, w, h) {
    x = Math.round(x);
    y = Math.round(y);
    if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, w, h);
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x, y, w, h);
    }
}

// ── Game Loop ──────────────────────────────────────────────────────────────
function loop(t) {
    let dt = lastTime ? Math.min((t - lastTime) / 1000, 0.08) : 0;
    lastTime = t;

    if (gameState === 'PLAYING') update(dt);
    updateMusic();
    draw();
    requestAnimationFrame(loop);
}

init();
