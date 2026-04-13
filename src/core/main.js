// Game Configuration & State
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const uiLayer = document.getElementById('ui-layer');

// Game State
let gameState = 'START'; // START, PLAYING, GAME-OVER
let time = 0;
let lastFrameTime = 0;
let score = 0;

// MVP Meters
let diaperMeter = 100; // 0-100
let happyMeter = 0; // 0-100
let ballballCount = 0;

// Constants
const GRAVITY = 800; // pixels per second squared
const GROUND_Y = 550;
const GAME_SPEED = 200; // base floor scroll speed

// Player (Baby)
const player = {
    x: 80,
    y: GROUND_Y,
    width: 24, // matching pixel art
    height: 32,
    state: 'STANDING', // STANDING, DUCKED, JUMPED
    vy: 0,
    jumpPower: -400,
    saying: null, // text for speech bubble
    sayTimer: 0
};

// Boss (Gigi)
const gigi = {
    x: -150, 
    targetDist: -150, 
    y: GROUND_Y - 40,
    width: 32,
    height: 48,
    speedModifier: 1.0
};

// Entities list
let entities = []; 

// Input state
const keys = { leftZoneActive: false, rightZoneActive: false };

// UI Elements
const diaperFill = document.getElementById('diaper-fill');
const happyFill = document.getElementById('happy-fill');
const scoreValue = document.getElementById('score-value');
const ballballValue = document.getElementById('ballball-value');
const speechBubble = document.getElementById('speech-bubble');
const gigiWarning = document.getElementById('gigi-warning');
const startScreen = document.getElementById('start-screen');

// Image Assets
const images = {};
const imageUrls = {
    baby_standing: 'assets/baby_standing.png',
    baby_ducking: 'assets/baby_ducking.png',
    baby_jumping: 'assets/baby_jumping.png',
    ballball: 'assets/basketball.png',
    duckduck: 'assets/duckduck_small.png',
    gigi: 'assets/gigi_standing.png',
    hoppah: 'assets/hoppah_jumping.png'
};

let imagesLoaded = 0;
const totalImages = Object.keys(imageUrls).length;

function init() {
    for (const key in imageUrls) {
        images[key] = new Image();
        images[key].onload = () => {
            imagesLoaded++;
            if(imagesLoaded === totalImages) {
                setupControls();
                requestAnimationFrame(gameLoop);
            }
        };
        images[key].src = imageUrls[key];
    }
    startScreen.addEventListener('click', startGame);
}

function startGame() {
    startScreen.classList.add('hidden');
    gameState = 'PLAYING';
    diaperMeter = 100;
    happyMeter = 0;
    score = 0;
    ballballCount = 0;
    entities = [];
    gigi.x = -150;
    gigi.targetDist = -150;
    time = 0;
    lastFrameTime = performance.now();
    player.saying = "uppah!";
    player.sayTimer = 1.0;
}

function setupControls() {
    const leftZone = document.getElementById('zone-left');
    const rightZone = document.getElementById('zone-right');

    // Touch controls
    leftZone.addEventListener('touchstart', (e) => { e.preventDefault(); handleDuck(true); });
    leftZone.addEventListener('touchend', (e) => { e.preventDefault(); handleDuck(false); });
    rightZone.addEventListener('touchstart', (e) => { e.preventDefault(); handleJump(); });

    // Mouse fallback
    leftZone.addEventListener('mousedown', () => handleDuck(true));
    leftZone.addEventListener('mouseup', () => handleDuck(false));
    leftZone.addEventListener('mouseleave', () => handleDuck(false));
    rightZone.addEventListener('mousedown', () => handleJump());
    
    // Keyboard fallback for desktop testing
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') handleDuck(true);
        if (e.key === 'ArrowUp' || e.key === ' ') handleJump();
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowDown') handleDuck(false);
    });
}

function showSpeech(text, type, duration) {
    player.saying = text;
    player.sayTimer = duration;
    speechBubble.textContent = text;
    speechBubble.className = '';
    speechBubble.classList.add(`show-${type}`);
    
    // Position near player
    // Screen scales differently from canvas, so we roughly estimate based on container
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    
    speechBubble.style.left = `${(player.x + 30) * scaleX}px`;
    speechBubble.style.top = `${(player.y - 40) * scaleY}px`;
}

function handleDuck(isDucking) {
    if (gameState !== 'PLAYING') return;
    keys.leftZoneActive = isDucking;
    
    if (isDucking && player.state !== 'JUMPED') {
        player.state = 'DUCKED';
        player.height = 32; // smaller hitbox
        if(player.saying !== "down") showSpeech("down", "down", 999);
    } else if (!isDucking && player.state === 'DUCKED') {
        player.state = 'STANDING';
        player.height = 48;
        player.saying = null;
        speechBubble.className = 'hidden';
    }
}

function handleJump() {
    if (gameState !== 'PLAYING') return;
    // Only jump if on ground (or close)
    if (player.y >= GROUND_Y) {
        player.vy = player.jumpPower;
        player.state = 'JUMPED';
        showSpeech("uppah!", "uppah", 0.6);
        
        // Hoppah timing game mechanic
        checkHoppahSync();
    }
}

function checkHoppahSync() {
    // Find closest Hoppah
    for(let e of entities) {
        if(e.type === 'HOPPAH' && !e.synced) {
            const timeDiff = Math.abs(e.jumpTimer - 0); // e.jumpTimer approaches 0 when it jumps
            // Simplify: if hoppah is mid air
            if(e.y < GROUND_Y - 20) {
                // Good sync!
                e.synced = true;
                score += 200;
                showSpeech("PERFECT!", "uppah", 0.5);
                // Carrot effect or happy meter up
                happyMeter = Math.min(100, happyMeter + 20);
                return;
            }
        }
    }
}

function spawnEntities(dt) {
    if (Math.random() < 0.02) { // roughly every second
        const r = Math.random();
        if (r < 0.1) spawnHoppah();
        else if (r < 0.3) spawnDuckduck();
        else spawnBallball();
    }
}

function spawnBallball() {
    entities.push({
        type: 'BALLBALL',
        x: canvas.width + 50,
        y: GROUND_Y - Math.random() * 80,
        width: 16, height: 16,
        vx: -50,
        color: '#FF9800',
        collected: false
    });
}

function spawnDuckduck() {
    entities.push({
        type: 'DUCKDUCK',
        x: canvas.width + 50,
        y: GROUND_Y + 16, // on ground
        width: 24, height: 24,
        squeaked: false
    });
}

function spawnHoppah() {
    entities.push({
        type: 'HOPPAH',
        x: canvas.width + 50,
        y: GROUND_Y,
        width: 30, height: 30,
        jumpTimer: Math.random() * 0.5 + 0.5,
        vy: 0,
        synced: false
    });
}

function updateGame(dt) {
    time += dt;
    
    // Diaper drain
    diaperMeter -= dt * 1; 
    if (keys.leftZoneActive && player.state !== 'JUMPED') diaperMeter += dt * 0.5; // restore a bit when ducking calmly?
    
    // Speed up gigi if diaper bad
    if (diaperMeter <= 0) {
        diaperMeter = 0;
        gigi.speedModifier = 2.0;
        gigiWarning.classList.remove('hidden');
        document.getElementById('game-container').classList.add('vignette-danger');
    } else {
        gigiWarning.classList.add('hidden');
        document.getElementById('game-container').classList.remove('vignette-danger');
        gigi.speedModifier = 1.0;
    }

    // Gigi movement
    if (player.x - gigi.x > 300) gigi.x += 10 * dt * gigi.speedModifier;
    else if (player.x - gigi.x < 100) gigi.x -= 5 * dt; // backs off slightly if too close unless very dirty
    if (diaperMeter <= 0) gigi.x += 20 * dt * gigi.speedModifier; // unstoppable if 0
    
    // Player Physics
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    
    if (player.y > GROUND_Y) {
        player.y = GROUND_Y;
        player.vy = 0;
        if (player.state === 'JUMPED') {
            player.state = keys.leftZoneActive ? 'DUCKED' : 'STANDING';
            if(player.state === 'STANDING') {
               speechBubble.className = 'hidden'; 
            }
        }
    }

    // Speech Timer
    if (player.sayTimer > 0) {
        player.sayTimer -= dt;
        if (player.sayTimer <= 0 && !keys.leftZoneActive) {
            speechBubble.className = 'hidden';
            player.saying = null;
        }
    }

    // Magnetism
    let magnetRange = 32 + (happyMeter / 100) * 100;

    spawnEntities(dt);

    for (let i = entities.length - 1; i >= 0; i--) {
        let e = entities[i];
        
        // Movement
        e.x -= GAME_SPEED * dt;
        
        if (e.type === 'HOPPAH') {
            e.jumpTimer -= dt;
            if(e.jumpTimer <= 0 && e.y >= GROUND_Y) {
                e.vy = -350; // Jump!
                e.jumpTimer = 0.8; // jump rate
            }
            e.vy += GRAVITY * dt;
            e.y += e.vy * dt;
            if(e.y > GROUND_Y) {
                e.y = GROUND_Y;
                e.vy = 0;
            }
            e.x -= 20 * dt; // Hoppah moves slightly left relative to camera
        }
        
        if (e.type === 'BALLBALL') {
            e.x += e.vx * dt; // bouncy movement
            // Magnet 
            let dist = Math.hypot(e.x - player.x, e.y - player.y);
            if(dist < magnetRange) {
                e.x += (player.x - e.x) * 5 * dt;
                e.y += (player.y - e.y) * 5 * dt;
            }
        }

        // Collisions
        let hitDist = Math.hypot((player.x+player.width/2) - (e.x+e.width/2), (player.y-player.height/2) - (e.y-e.height/2));
        
        if (hitDist < 30) {
            if (e.type === 'BALLBALL' && !e.collected) {
                e.collected = true;
                ballballCount++;
                score += 50;
                diaperMeter -= 0.5; // excitement
                entities.splice(i, 1);
                continue;
            }
            
            if (e.type === 'DUCKDUCK' && !e.squeaked) {
                e.squeaked = true;
                score += 100;
                happyMeter += 5;
                e.height = 10; // compress animation
                e.y += 14;
                showSpeech("duckduck!", "duckduck", 0.5);
            }
        }

        // Cleanup
        if (e.x < -100) entities.splice(i, 1);
    }

    // Update UI
    diaperFill.style.width = Math.max(0, diaperMeter) + '%';
    if(diaperMeter < 25) diaperFill.style.backgroundColor = '#FFB366';
    else if(diaperMeter < 50) diaperFill.style.backgroundColor = '#FFE6B3';
    else diaperFill.style.backgroundColor = '#FFFFFF';

    happyFill.style.width = Math.max(0, happyMeter) + '%';
    scoreValue.textContent = score;
    ballballValue.textContent = ballballCount;

    // Loss condition
    if (gigi.x > player.x - 20) {
        gameState = 'GAME-OVER';
        startScreen.querySelector('h1').textContent = 'CAUGHT!';
        startScreen.querySelector('p').textContent = 'Tap to Retry';
        startScreen.classList.remove('hidden');
    }
}

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw solid sky background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Floor
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, GROUND_Y + 48, canvas.width, canvas.height - GROUND_Y);
    ctx.fillStyle = '#7CFC00'; // Grass
    ctx.fillRect(0, GROUND_Y + 40, canvas.width, 10);

    ctx.save();
    ctx.imageSmoothingEnabled = false; // Crisp pixel art scaling
    const SCALE = 3; // Upscale by 3x
    
    // Draw Gigi (Boss)
    ctx.drawImage(images.gigi, gigi.x, gigi.y - (48 * SCALE) + 48, 32 * SCALE, 48 * SCALE);

    // Draw Player
    const pSprite = player.state === 'JUMPED' ? images.baby_jumping : (player.state === 'DUCKED' ? images.baby_ducking : images.baby_standing);
    const sW = 24 * SCALE;
    const sH = (player.state === 'DUCKED' ? 20 : 32) * SCALE;
    ctx.drawImage(pSprite, player.x, player.y - sH + 48, sW, sH);
    
    // Draw entities
    for (let e of entities) {
        if(e.type === 'BALLBALL') {
            ctx.drawImage(images.ballball, e.x, e.y, 16 * SCALE, 16 * SCALE);
        } else if (e.type === 'DUCKDUCK') {
            const duckH = e.squeaked ? 8 * SCALE : 12 * SCALE;
            const duckYOffset = e.squeaked ? 4 * SCALE : 0;
            ctx.drawImage(images.duckduck, e.x, e.y - duckH + 48 + duckYOffset, 12 * SCALE, duckH);
        } else if (e.type === 'HOPPAH') {
            ctx.drawImage(images.hoppah, e.x, e.y - (20 * SCALE) + 48, 16 * SCALE, 20 * SCALE);
            if(e.synced) {
                ctx.strokeStyle = 'gold';
                ctx.lineWidth = 2;
                ctx.strokeRect(e.x-2, e.y - (20 * SCALE) + 46, (16 * SCALE)+4, (20 * SCALE)+4);
            }
        }
    }

    ctx.restore();
}

function gameLoop(currentTime) {
    if(!lastFrameTime) lastFrameTime = currentTime;
    const dt = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;
    
    if (dt < 0.1) { // prevent huge jumps on tab switch
        if (gameState === 'PLAYING') {
            updateGame(dt);
        }
        drawGame();
    }
    
    requestAnimationFrame(gameLoop);
}

init();
