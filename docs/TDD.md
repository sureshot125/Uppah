# UPPAH - Technical Design Document (TDD)
*Version 2.0*

## 1. Architecture Overview
To maintain a strict payload limit (target: < 3MB total for the web), the game relies exclusively on **Vanilla HTML5 Canvas** and **ES6 Javascript Modules**. No external frameworks (like Phaser or React) are used. This keeps the engine footprint under 50KB, reserving the bulk of the 3MB budget for high-quality image and audio assets.

## 2. Directory Structure
```text
/
├── index.html        (Entry point, UI overlay definitions)
├── css/
│   └── main.css      (UI styling, animations, flexbox layouts)
├── assets/           (Images, sounds. Heavily compressed WebP/PNGs)
├── docs/             (GDD, TDD)
└── src/
    ├── core/
    │   ├── Game.js       (Main Loop, state management, delta time)
    │   ├── Input.js      (Touch/Keyboard event handling)
    │   └── Assets.js     (Image preloader and caching)
    ├── entities/
    │   ├── Entity.js     (Base class for renderable objects)
    │   ├── Baby.js       (Player controller, state machine)
    │   ├── Gigi.js       (Boss logic)
    │   └── Animal.js     (Hoppah, Duckduck variants)
    └── systems/
        ├── Physics.js    (Gravity, collision detection)
        ├── Spawner.js    (Entity pooling and rhythm generation)
        └── UIManager.js  (DOM manipulation for meters, speech bubbles)
```

## 3. Core Systems

### 3.1 The Game Loop (`Game.js`)
Uses `window.requestAnimationFrame` to generate a delta-time (`dt`) passed to all `update(dt)` methods. This ensures physics and animations are frame-rate independent.

### 3.2 State Management
*   **Global State**: `START`, `PLAYING`, `GAMEOVER`.
*   **Player State (`Baby.js`)**: Managed internally via a lightweight switch/case (`STANDING`, `DUCKED`, `JUMPED`).

### 3.3 Physics & Collision (`Physics.js`)
*   **Gravity**: Applied constantly to airborne entities (`y += velocity * dt`).
*   **Collision**: A simple AABB (Axis-Aligned Bounding Box) or radial distance check logic is sufficient. No complex rigid body physics required.

### 3.4 Input Handling (`Input.js`)
Captures `touchstart`, `touchend`, `mousedown`, and `mouseup` bound to the DOM elements explicitly overlaying the canvas. This abstracts input away from the game loop, providing a clean `Input.isDucking()` or `Input.justJumped()` API for the Player class.

## 4. Asset Management Payload Strategy
Given the **3MB max payload constraint**:
1.  **Code Bloat**: Minified vanilla JS will take < 30KB. CSS < 10KB. HTML < 5KB.
2.  **Images (Current bottleneck: ~2.8MB)**:
    *   Images currently use fat PNGs. Moving forward, PNGs can be crushed or converted to WebP.
    *   Reusing sprites dynamically via Canvas `globalCompositeOperation` or tinting rather than loading redundant color variations.
3.  **Audio**: Use low-bitrate `.mp3` or `.ogg` files. Short 1-second barks ("uppah"), meaning audio budget should sit comfortably at ~400KB total.

## 5. Extensibility (Levels vs Endless)
Currently, `Spawner.js` generates completely random infinite gameplay. To transition to the GDD's structured Level 1 -> 5 design, `Game.js` will load JSON "Level Configurations" defining specific spawn patterns and minigame trigger distances.
