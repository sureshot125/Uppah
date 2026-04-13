# UPPAH - Game Design Document (GDD)
*Version 2.0*

## 1. Overview
**UPPAH** is an endless/level-based runner emphasizing rhythmic interactions, responsive UI "juice", and a risk/reward collection system driven by the player's internal state (Diaper Meter / Happy Meter).

### Core Philosophy
- **Approachable**: Playable by everyone, including toddlers, via simple two-zone tap/hold inputs.
- **Premium Feel**: High-quality 2D vector/cartoon art, smooth animations, and explosive particle/visual feedback.
- **Reactive**: The game state changes dynamically based on meters. Collecting items is exciting but risky.

## 2. Core Mechanics

### 2.1 The Two-Zone Input
The screen is vertically bisected into two touch/click zones.
*   **Left Zone (Hold to DUCK):** The baby ducks down. Hitbox height shrinks by 50%. The baby constantly says "down down down". Speed decreases slightly. Diaper meter drain slows/recovers slightly (calming down).
*   **Right Zone (Tap to JUMP):** The baby hops upwards (Uppah!). Momentary action with fixed airtime to clear obstacles. Baby says "uppah!".

### 2.2 The Ecosystem (Entities)
1.  **Hoppah (Bunny)**
    *   *Role*: Rhythm Minigame / Score Multiplier.
    *   *Mechanic*: Runs alongside the player and jumps on a set tempo (e.g., every 0.8s).
    *   *Interaction*: If the player jumps within ±0.15s of the Hoppah jumping, they score a "PERFECT!" sync, massive points, and fuel the Happy Meter.
2.  **Duckduck (Rubber Duck)**
    *   *Role*: Direct Collection / Interaction.
    *   *Mechanic*: Stationary or floating obstacles.
    *   *Interaction*: Running through them dynamically squooshes their sprite, plays a squeak, and triggers a "duckduck!" speech bubble. Grants points.
3.  **Ballball (Basketballs, etc.)**
    *   *Role*: Currency / Magnet Collectibles.
    *   *Mechanic*: Spawn dynamically.
    *   *Interaction*: Collecting grants score but slightly drains the Diaper Meter due to excitement. Magnetism range increases linearly with the Happy Meter.

### 2.3 Systemic Pressure (Meters)
*   **Diaper Meter (Health/Game Over limits)**
    *   *Max*: 100. *Drain*: Passive drain (-1/s). Excitement actions (Ballballs) drain it faster. Ducking calms it down (+0.5/s).
    *   *Critical State*: At 0, the boss (Gigi) gains a `2.0x` speed multiplier. The only way to survive is reaching a Checkpoint or finding a Golden Ballball.
*   **Happy Meter (Buffs)**
    *   *Gain*: Squeaking Duckducks, Perfect Hoppah Syncs.
    *   *Effect*: Dictates the pixel-radius of the Player's magnetic collection field.

### 2.4 The Chaser (Gigi)
*   Gigi (a Golden Retriever) represents the fail state. She chases continuously from off-screen left.
*   *Behavior*: Maintains a baseline distance. If the player misses jumps/stumbles (obstacle hitboxes implied for later levels) she catches up.
*   *Game Over*: If Gigi collides with the player.

## 3. Level Progression (The Vision)
While MVP is an endless runner, the full game targets distinct phases:

*   **Level 1: Living Room** (Focus: Ballball sorting minigame, couch climbing up/down). Boss chase over carpet.
*   **Level 2: Kitchen** (Focus: Duckduck rhythm symphony, table ducking). Boss chase over linoleum.
*   **Level 3: Backyard** (Focus: Hoppah sync racing, sprinklers). Boss chase through garden.
*   **Level 4: Playground** (Focus: Ballball juggling, sandbox). Multi-mechanic combo area.
*   **Level 5: Big Park** (Focus: Grand finale chaos). All animals simultaneously. Ride the giant Parade Duck.

## 4. Audio & Visual Juice
*   **Speech Bubbles**: Dynamic DOM or Canvas drawn bubbles attached to the baby's head. Provide critical feedback where audio context may fail on browsers.
*   **Vignettes**: Screen edges pulse red when Gigi is close or Diaper meter is empty.
*   **Color Palette**: Vibrant, heavy use of pinks (`#FF6B9D`), blues (`#6BB6FF`), and warm yellows.

## 5. Monetization / Unlocks (Meta)
Accumulated high scores and ballballs allow unlocking cosmetic skins (Basketball outfit, Duckduck hat) in the main menu.
