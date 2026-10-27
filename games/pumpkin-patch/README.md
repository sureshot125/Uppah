# Ansel's Pumpkin Patch

An Uppah minigame. Ansel picks up pumpkins around a fall patch and stacks them on a hay bale. The tower can fall, so a round ends when you run out of pumpkin lives or the sun sets.

## How to play

- **Tap a pumpkin.** Ansel picks it up, carries it on his head and lifts it over the stack ("uppah!").
- **Tap again** to drop it. A plain ring on the stack shows where it will land (wind drift included). It doesn't tell you whether it will stay: that's for you to judge from weight, order and lean.
- **Stack honestly.** A pumpkin lands where you drop it. A drop very near the centre is a perfect drop: it snaps most of the way in but keeps a quarter of its miss, so even a run of perfects slowly leans. If its centre is past the edge of the one below, it rolls off. A moderate miss wobbles and sometimes goes over. The whole stack tips if its weight leans past the joint below. Only a player's very first round gets help with the first two pumpkins (and the pointing hand shows the very first one); after that it's all on you.
- **Weight and order matter.** A big, heavy pumpkin is a wide, steady base. A heavy one dropped on a small one rocks hard and often topples. A little one on a big one is easy. Build big at the bottom and small on top. Landing on something at least as heavy scores a bonus.
- **Wind.** Watch the windsock beside the bale and the leaves; they start streaming a second before a gust. A gust pushes the hovering pumpkin and drifts it as it falls (aim upwind; the ring shows where it will really land), sways the tower a little more and leans the hovering pumpkin, and adds a sideways load that can tip a crooked tower (a crooked tower catches more of it). Gusts get stronger as the tower grows and toward sunset.
- **BOOM!** Once the tower is 3 tall, a wooden BOOM sign on the hay bale shows how many points it will bank. Tapping the bale (or holding B for half a second) sends Ansel to shove it: that banks the tower's points × (1 + 0.2 per pumpkin) and knocks it down. If the tower falls first, the points on the fallen pumpkins are lost. Stack one more, or cash in now? Every round also ends in a BOOM: whatever is still standing at sunset (or when the last life goes) is banked with the same height bonus, so there's no reason to cash in just before the end.
- **Pumpkin lives.** You start with 3. Each pumpkin that falls off the tower costs one. You can earn lives back, up to 5:
  - 3 perfect drops in a row: +1.
  - BOOM a tower 8 tall: +1 (14 tall: +2).
  - The first time a tower tops Gigi, the silo, the clouds, the sky and the moon in a round: +1 each.
  - Harvesting a golden pumpkin: +1.

  Each one flies into the life row as a little pumpkin, with a chime.
- **Rounds.** The afternoon lasts 3 minutes and the sky turns gold, then dusky. At sunset, or when the lives run out, Ansel BOOMs whatever is still standing and the round ends. The end card shows that last BOOM, your score, your best, and a picture of the round's tallest tower beside Ansel. Tap to play again.
- Leaf piles hide surprise pumpkins. **Tap anywhere for MORE!** when the patch runs out. Ansel, the trees, Hoppah the bunny and lots of the scenery react when tapped.

Keyboard: arrows or A/D to walk; Down or S to pick up, harvest the nearest vine pumpkin, or dive into a leaf pile; Up, W or Space to lift, drop, ask for more or play again; hold B to BOOM (a single press does nothing, so a stray key can't bank the tower); P or Esc to pause; M to mute (remembered).

The pause button sits beside the sound button, and the game pauses itself when the tab is hidden.

## Design rules

| Rule | Where it comes from |
|---|---|
| Two taps per pumpkin, tap-then-tap, no dragging | Stack's one-tap drop; works the same with a mouse or a finger |
| Every tap reacts instantly; busy taps are queued | Toca Boca, Sago Mini, Pok Pok |
| Rules are shown in the world, not in UI: the landing ring, the windsock, streaming leaves, wobble, creaks, the dusk | Owner feedback ("calm screen") |
| No outcome hints: the ring shows where it lands, not whether it stays; help is for a player's first round only | UX review ("tap when the ring is gold") |
| Ansel speaks up only for big moments (UPPAH!, MORE!, BOOM, golden, milestones, falls, surprises) | UX review; the players aren't toddlers |
| Honest stacking: centre of weight over the joint or it goes; weight and size change how a drop behaves | Owner feedback; Jenga / Mount Your Friends physical stakes |
| Push your luck: points ride on the tower until BOOM banks them | Can't Stop / "press your luck" games |
| Wind is telegraphed (~1.4 s of leaves and whoosh), alternates sides, and is present but not dominant | Paper Toss; owner feedback |
| Achievements earn lives back, each with a pumpkin flying into the life row | Owner feedback; arcade extra lives |
| Perfect drops sparkle and climb in pitch | Stack (Ketchapp) |
| Up to three touches, broad contacts ignored, 120 ms double-hit guard | A resting palm can't block a finger; stops accidental double taps |

## Files

- `index.html` and `game.js`: the game (Phaser 3.90 with Matter physics, vendored in `../lib`).
- `sim.js`: headless balance sim. It loads the `<rules>` block straight out of `game.js` and plays thousands of rounds with simulated players (random tappers, "good zone" tappers, timing players), BOOM strategies and fixed-offset drops. Run `node games/pumpkin-patch/sim.js [rounds]`. Try tunings without editing the game: `SIM_RULES='{"impact":0.6}' node games/pumpkin-patch/sim.js`.
- `art/`: pixel art, generated by `make_art.py` (needs Pillow). Run `python3 games/pumpkin-patch/make_art.py` after changing it.
- `art/ansel/`: Ansel's frames, everyday (cap) and farmer (straw hat, from his first trip into the vine rows), cut from the owner's sprite sheets in `art/source/` by `make_ansel_frames.py` (needs Pillow, numpy and scipy). It erases the baked-in pumpkins (the game draws its own), cleans and re-grids the pixels, lines the frames up on one canvas and writes `frames.json` (feet anchor, and where each frame's pumpkin sat). Poses with no art yet borrow the closest frame; see `ANSEL_POSES` in `game.js`.
- `audio/pumpkin_patch_shuffle.mp3`: the level's theme. The intro plays once, then 26.006 s to 122.008 s loops, with a 60 ms crossfade baked in when it's decoded. `audio/pumpkin_patch_afternoon.mp3` is the earlier theme; add `?music=afternoon` to the URL to hear it.
- Gigi and Hoppah come from the shared `assets/` folder.

## Tuning

- The rules live in the `<rules>` block near the top of `game.js`:
  - `RULES`: lives and how to earn them, first-round help, the perfect-drop snap, flat-top widths, wobble, wind, sway, BOOM, points, the 3-minute day.
  - `HEFT`: how heavy each variety is.
  - `STAGES`: CALM, BREEZY, WINDY, GUSTY, STORMY and WILD WIND, by tower height, each with sway width and speed, perfect zone and gust strength.
- Per-tower state lives in a `Stack` object (one per hay bale), so more bales are a small change.
- Items may carry `it.golden` (scores ×3) and `it.heft` (overrides the variety's weight).
- `PatchScene.earnLife(n, x, y)` awards lives from anywhere, with the fly-in.
- `PatchScene.say()` filters what Ansel says: lines in `SAY_LINES`, or calls that pass `important`.
- One-time help is remembered per device in `localStorage` (`uppah.pumpkinpatch.played`, `.hinted`).

Measured with `sim.js` (2000 rounds each, 3-minute day, a returning player with no first-round help), pumpkins stacked per round (p10 / median / p90). Timing players aim the landing ring at the centre with the given timing error.

| Player | Never BOOM | Reach sunset |
|---|---|---|
| Random tapper | 3 / 6 / 10 | 0% |
| Casual (150 ms) | 4 / 8 / 15 | 0% |
| Good (70 ms) | 11 / 19 / 30 | 1% (93% if they BOOM at 8) |
| Expert (45 ms) | 16 / 26 / 37 | 8% (90% if they BOOM at 14) |
| Near-perfect (25 ms) | 25 / 37 / 43 | 33% |

Wind is present but not dominant. Players stack 8 vs 8 with gusts on and off (casual), 19 vs 20 (good) and 26 vs 31 (expert). Gusts topple a tower 0.09 (casual) to 0.46 (expert) times per round, always one that was already leaning. Pressing BOOM at 8–14 banks a median of about 25,000 for a good player; an expert pushing to 18 banks about 49,000. Never pressing BOOM (only the automatic one at the end) scores a median of about 5,000 (good) and 14,500 (expert), so cashing in during the round still pays.

The game picks its resolution from the screen's shape (720 on the short side) and re-fits when a phone rotates, so it fills both landscape and portrait screens.

## Surprises (click points and easter eggs)

Nearly everything above the fence does something when tapped, Humongous-style. The third tap in a row on the same thing often does something bigger.

| Tap | What happens |
|---|---|
| Barn doors | They creak open on a cow (MOO) or a hen (BAWK). Third tap: a chick parade along the fence. |
| Hayloft window | An owl pops up, hoots and blinks. Third tap: it turns its head right round. |
| Rooster on the roof | Cock-a-doodle-doo. Third tap: a flappy jump first. |
| Silo sign | A-N-S-E-L hop out one letter at a time, each with a note. |
| Silo jack-o'-lantern | Winks and wobbles. Third tap: ah... ah... CHOO, and seeds fly ("BLESS YOU!"). |
| Sun | Sunglasses drop on; then it giggles; then it yawns. |
| Clouds | Puff up and drizzle leaves. Third tap: a rainbow. |
| Starry sky | Twinkle Twinkle, one note per tap, with a shooting star at the end of each line. |
| Moon | Smiles and winks. Third tap: the cow jumps over the moon. |
| Hills | Ansel shouts hello, the hills echo, a flock lifts off. |
| Fence posts | A xylophone, low on the left, high on the right. |
| Trees | Leaves flutter down. Third tap: a squirrel leaps out with acorns. |
| Hoppah | Boings. Second tap in a row (or one tap in three): Ansel scoops him up for a cuddle until he wriggles free. |
| Visitors | Robins land on the fence (Ansel running past scares them), a crow sits on the silo pumpkin, a hot-air balloon drifts over. All can be tapped. |

Finding them needs no words. Owl eyes blink in the dark hayloft, the rooster pecks, the barn doors rattle, and a small glint now and then marks something not found yet. After a long idle spell the pointing hand sometimes shows one. Each first find pops a sticker that flies to the badge under the sound button. Tap the badge to see the sticker tray: found stickers in colour, the rest as silhouettes. Found stickers are saved in `localStorage` (`uppah.pumpkinpatch.surprises`).

All of it lives in the SURPRISES section near the end of `game.js` (one-line hooks elsewhere are marked `surprises`) and the surprises section of `make_art.py`, which writes the `egg_*.png` sprites and `art/surprises.json`. The json says where the overlays line up with the background. Clouds, sun, moon, barn doors, letters and fence posts are copied pixel-for-pixel out of the rendered background, so they move without repainting the scene.

## How to play card, title and pause extras

After the first tap on the title, a four-panel how-to-play card explains the game before the round starts: STACK 'EM UP (the goal, the landing ring, heavy pumpkins at the bottom, the controls), DON'T LET IT FALL (pumpkin lives, gusts, the ways to earn lives back), BOOM! (banking the tower, what's lost if it falls first) and BEAT THE SUNSET (the afternoon is the clock, the last BOOM at the end of a round, vines, leaf piles, MORE! and the scenery). Each panel has a small looping scene built from the game's own sprites. Touch screens see taps; a mouse and keyboard (`DESKTOP`) see keycaps.

- It opens by itself until the player has started 3 rounds (`HTP_AUTO`, counted in `localStorage` as `uppah.pumpkinpatch.rounds`). After that it's on the title's "?" button (or ? / H), and on the pause menu's HOW TO PLAY button.
- NEXT / BACK / SKIP, a swipe, a tap on the card, the page pumpkins, or keys: → Space Enter next, ← back, 1-4 a page, Esc skip. M still mutes.
- The title shows the live patch through stepped bands instead of a flat shade, keeps the round's HUD and the patch's own Ansel out of the way, and adds the best score, "?" and HOME (back to the Uppah home page, `../../`). The pause menu gets HOW TO PLAY and HOME.

All of it lives in the HOW TO PLAY section near the end of `game.js` (one-line hooks elsewhere are marked `how to play`; UIScene's tap and key handlers ask `htpTap()` / `htpKey()` first) and the how-to-play section of `make_art.py` (`keys.png`, `key_wide.png`, `icon_home.png`).
