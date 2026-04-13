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
const SCALE         = 4;
const GRAVITY_PX    = 2200;      // px/s²
const JUMP_VEL      = -710;      // px/s  (Chrome: -12 units/frame @ 60fps → -720)
const INIT_SPEED    = 360;       // px/s
const MAX_SPEED     = 580;       // px/s — soft cap, feels fair
const ACCEL         = 2.0;       // px/s per second — gentler ramp
const MIN_GAP_COEFF = 1.1;       // gap = MIN_GAP_COEFF × speed  (seconds)

// ── Layout ─────────────────────────────────────────────────────────────────
let GROUND_Y      = 445;       // y of floor line — recalculated on resize
const BABY_X        = 220;       // Baby always drawn here on-screen

function resizeCanvas() {
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    canvas.width  = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    W = canvas.width;
    H = canvas.height;
    GROUND_Y = Math.round(H * 0.93);
}

// ── Distance/Health bar ────────────────────────────────────────────────────
const MAX_DIST      = 100;       // abstract units (like HP)
const DRAIN_RATE    = 3.5;       // units/second passive drain
const DANGER_THRESH = 22;        // below this → danger state

// ── Obstacle score gates (Chrome: pterodactyls unlock at 450) ──────────────
const AIR_OBS_GATE  = 400;       // score before which no air obstacles spawn

// ── Assets ──────────────────────────────────────────────────────────────
const images = {};
// Ansel (Baby): 6 frames, 252×370 RGBA. bottom padding = 27px → 7.3%
const ANSEL_FRAMES     = 6;
const BABY_RENDER_H    = 160;
const BABY_RENDER_W    = Math.round(BABY_RENDER_H * (252 / 370)); // ~109px
const BABY_FOOT_OFFSET = Math.round(BABY_RENDER_H * (27 / 370));  // ~12px

// Gigi (Mom): 8 frames, 354×496 RGBA. bottom padding = 37px → 7.5%
const GIGI_FRAMES      = 8;
const GIGI_RENDER_H    = 190;
const GIGI_RENDER_W    = Math.round(GIGI_RENDER_H * (354 / 496)); // ~136px
const GIGI_FOOT_OFFSET = Math.round(GIGI_RENDER_H * (37 / 496));  // ~14px

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

function getAnselFrame(idx) { return images['ansel_0' + ((idx % ANSEL_FRAMES) + 1)]; }
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

function playJumpSound() {
    if (!audioCtx) return;
    try {
        const vol = getSfxVol();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1 * vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01 * vol, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
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
        gain.gain.setValueAtTime(0.1 * vol, audioCtx.currentTime);
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
            gain.gain.setValueAtTime(0.1 * vol, now + i * 0.05);
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
        gain.gain.setValueAtTime(0.2 * vol, audioCtx.currentTime);
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
            gain.gain.setValueAtTime(0.1 * vol, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01 * vol, now + i * 0.08 + 0.1);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.1);
        });
    } catch(e) {}
}

function updateMusic() {
    if (!bgMusic) return;
    if (gameState === 'PLAYING') {
        if (bgMusic.paused) {
            bgMusic.muted = isMusicMuted;
            bgMusic.play().catch(() => {});
        }
        if (bgMusic.currentTime >= 50) bgMusic.currentTime = 0;
    } else {
        if (!bgMusic.paused) bgMusic.pause();
    }
}

function toggleMute() {
    isMusicMuted = !isMusicMuted;
    bgMusic.muted = isMusicMuted;
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
        if (['ArrowDown','s','S'].includes(e.key)) triggerDuck(true);
        if (['ArrowUp','w','W',' '].includes(e.key)) { e.preventDefault(); triggerJump(); }
    });
    window.addEventListener('keyup', (e) => {
        if (['ArrowDown','s','S'].includes(e.key)) triggerDuck(false);
    });

    const zL = document.getElementById('zone-left');
    const zR = document.getElementById('zone-right');
    zL.addEventListener('touchstart',  (e) => { e.preventDefault(); triggerDuck(true);  }, {passive:false});
    zL.addEventListener('touchend',    (e) => { e.preventDefault(); triggerDuck(false); }, {passive:false});
    zL.addEventListener('mousedown',   () => triggerDuck(true));
    zL.addEventListener('mouseup',     () => triggerDuck(false));
    zL.addEventListener('mouseleave',  () => triggerDuck(false));
    zR.addEventListener('touchstart',  (e) => { e.preventDefault(); initAudio(); triggerJump(); }, {passive:false});
    zR.addEventListener('mousedown',   () => { initAudio(); triggerJump(); });

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
    isDuckHeld = on;
    if (on && player.state !== 'JUMPING') {
        player.state = 'DUCKING';
        player.h = 18 * SCALE;
    } else if (!on && player.state === 'DUCKING') {
        player.state = 'RUNNING';
        player.h = 32 * SCALE;
    }
}

function triggerJump() {
    if (gameState !== 'PLAYING') return;
    if (player.state === 'RUNNING') {
        player.state = 'JUMPING';
        player.vy   = JUMP_VEL;
        playJumpSound();
    }
}

// ── Game lifecycle ─────────────────────────────────────────────────────────
function startGame() {
    initAudio();
    playStartSound();
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
    lastTime = 0;
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
        const hopY = bouncing ? GROUND_Y - 8 * SCALE : GROUND_Y;
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
            GROUND_Y - 8 * SCALE,
            GROUND_Y - 26 * SCALE
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
    groundX = (groundX + speed * dt) % 40;
    scrolled += speed * dt;

    // ── Distance/health bar (passive drain scaled by diffFactor) ───────────
    distance -= DRAIN_RATE * diffFactor * dt;

    // ── Player physics ─────────────────────────────────────────────────────
    if (player.state === 'JUMPING') {
        player.vy += (isDuckHeld ? GRAVITY_PX * 2.5 : GRAVITY_PX) * dt;
        player.y  += player.vy  * dt;
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

    // ── Run animation (Ansel) ─────────────────────────────────────
    if (player.state === 'RUNNING') {
        player.runClock += dt;
        if (player.runClock > 0.08) {
            player.runClock = 0;
            player.runFrame = (player.runFrame + 1) % ANSEL_FRAMES;
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
            // Precise hitboxes for UPPAH Dino
            const shrink = 0.12;
            const px = BABY_X + player.w * shrink;
            const py = player.y - player.h + player.h * shrink;
            const pw = player.w * (1 - shrink*2);
            const ph = player.h * (1 - shrink*2);

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
    // Far left when safe; right behind baby when catching up
    const maxSafeX    = -GIGI_RENDER_W * 0.1; // just barely off the left edge when safe
    const maxDangerX  = 275 - 54.5 - GIGI_RENDER_W + 5; // right behind baby (drawW for Ansel running is ~109)
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

    const targetX = 275 - drawW / 2;
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
