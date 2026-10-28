# Ansel's Pumpkin Patch

An Uppah minigame. Ansel picks up pumpkins around a fall patch and stacks them on a hay bale. A round is one afternoon: the tower can fall, and every pumpkin that falls costs a pumpkin life, but the round always runs to sunset, where the lives you have left add to your score.

## How to play

- **Tap a pumpkin.** Ansel picks it up, carries it on his head and lifts it over the stack ("uppah!").
- **Where pumpkins come from.** A round starts with 5 pumpkins on the path and a couple hidden in the leaf piles. After that they come from the vine rows behind the path.
  - Vine pumpkins keep growing while they're left: sprout, then a small pumpkin (gold, orange or warty), medium (orange, white or green), large (orange), and finally XL (the deep orange giant). Now and then one grows golden instead of large. Each bigger size takes longer.
  - Tap a pumpkin of any size and Ansel puts on his straw hat, wades in, picks it and carries it to the bale.
  - Tap a bare spot or a sprout and he waters it. It jumps a size at once and grows half again as fast until it's picked. He doesn't pick anything on a watering trip; he steps back to the field's edge, ready for your next tap.
  - **Water early, pick big:** a big pumpkin scores more (points × its weight relative to a medium's, from about 0.6× to 2×) and is a wide, steady base. But it's heavy: a slower carry, it swings a little faster when tossed up, it lands harder, and it's risky on top of a smaller one.
  - BOOMed pumpkins are banked and spent: they fly off, settle and fade away.
  - Pumpkins that fall off a bad drop stay on the path to be picked up again.
- **Tap again** to drop it. A plain ring on the stack shows where it will land (wind drift included). It doesn't tell you whether it will stay: that's for you to judge from weight, order and lean.
- **Stack honestly.** A pumpkin lands where you drop it. A drop very near the centre is a perfect drop: it snaps most of the way in but keeps a quarter of its miss, so even a run of perfects slowly leans. If its centre is past the edge of the one below, it rolls off. A moderate miss wobbles and sometimes goes over. The whole stack tips if its weight leans past the joint below. Only a player's very first round gets help with the first two pumpkins (and the pointing hand shows the very first one); after that it's all on you.
- **Weight and order matter.** A big, heavy pumpkin is a wide, steady base. A heavy one dropped on a small one rocks hard and often topples. A little one on a big one is easy. Build big at the bottom and small on top. Landing on something at least as heavy scores a bonus.
- **Wind.** Watch the windsock beside the bale and the leaves; they start streaming a second before a gust. A gust pushes the hovering pumpkin and drifts it as it falls (aim upwind; the ring shows where it will really land), sways the tower a little more and leans the hovering pumpkin, and adds a sideways load that can tip a crooked tower (a crooked tower catches more of it). Gusts get stronger as the tower grows and toward sunset.
- **BOOM!** Once the tower is 3 tall, a wooden BOOM sign on the hay bale shows how many points it will bank. Tapping the bale (or holding B for half a second) sends Ansel to shove it: that banks the tower's points × (1 + 0.2 per pumpkin) and knocks it down. If the tower falls first, the points on the fallen pumpkins are lost, and so is a pumpkin life for each one. Stack one more, or cash in now? A BOOM also ends the perfect-drop streak, so banking tiny towers can't farm the combo. Every round also ends in a BOOM: whatever is still standing at sunset is banked with the same height bonus, so there's no reason to cash in just before the end.
- **Pumpkin lives.** You start with 3. Each pumpkin that falls off the tower costs one; with none left, a fall costs just its points. Running out never ends the round. At sunset, after the last BOOM, each life left adds 8% of your score (5 lives: +40%). You can earn lives back, up to 5:
  - 3 perfect drops in a row: +1.
  - BOOM a tower 8 tall: +1 (14 tall: +2).
  - The first time a tower tops Gigi, the silo, the clouds, the sky and the moon in a round: +1 each. Also halfway between the high ones (760, 1100 and 1550 px), so a long climb keeps paying.
  - Harvesting a golden pumpkin: +1.

  Each one flies into the life row as a little pumpkin, with a chime.
- **Rounds.** The afternoon lasts 3 minutes and the sky turns gold, then dusky. A round only ends at sunset: Ansel BOOMs whatever is still standing, then the lives left fly one by one from the life row into the score. The end card (SUNSET!) shows that last BOOM, the lives bonus, your score, the tallest tower, your best, and how many secrets (surprise stickers) you've found, with any new this round, beside a picture of the round's tallest tower and Ansel. Wide screens put the picture and the table side by side; tall and squarish ones stack them. Tap to play again. At sunset Hoppah hops over and jumps into Ansel's arms for NIGHT NIGHT before the end card.
- Leaf piles hide surprise pumpkins. **MORE!** If there's no pumpkin to pick anywhere (path or vines), tap empty ground or Ansel and he shouts MORE!: every plant in the patch grows a size and the leaf piles fill again. It needs 20 seconds before it works again; until then, water. Ansel, the trees, Hoppah the bunny and lots of the scenery react when tapped.

Keyboard: arrows or A/D to walk; Down or S to pick up, pick or water the nearest vine spot, or dive into a leaf pile; Up, W or Space to drop, ask for more or play again; hold B to BOOM (a single press does nothing, so a stray key can't bank the tower); P or Esc to pause; M to mute (remembered). While Ansel carries a pumpkin back to the bale, the walking keys, Up and Down do nothing.

The pause button sits beside the sound button, and the game pauses itself when the tab is hidden.

## What a tap does

One tap, one action: no double taps or long presses. Which zone a tap lands in depends on what's happening; `PatchScene.tapZones()` lists them in one place, and `?zones=1` on the URL draws them over the game.

| When | A tap or click |
|---|---|
| Title, how-to-play card, pause menu, end card | Belongs to that screen (play, turn the page, resume, play again). It never reaches the patch. |
| Any time in a round | The sound and pause buttons, the sticker badge and the open sticker tray take their own taps first. |
| A pumpkin swaying over the tower (the ring is showing) | Drops it, wherever you tap. |
| The toss (the pumpkin flying up out of Ansel's hands, about 0.4 s) | Nothing. A drop then would be unaimed; tap once the ring shows. |
| Ansel carrying a pumpkin back to the bale | Nothing, and it isn't kept for later: the walk back can't be interrupted. |
| Ansel busy (picking up, watering, diving, BOOM, MORE!, a jump) | The pumpkin or plant you tapped wiggles at once, and Hoppah and the scenery react at once. A tap on something to fetch, water or walk to waits until he's free: only the latest, for 0.6 s at most, and it's forgotten if he starts anything else. The bale, the plank and the tower do nothing. |
| A pumpkin falling onto the tower | As when idle, but the tower, the bale and the BOOM plank do nothing, so a late second tap on a drop is harmless. |
| Ansel idle or walking | 1. The BOOM plank: BOOM. 2. A pumpkin on the path (or the dirt straight below it) or in the vines: pick it; a sprout or a bare vine spot: water it; a leaf pile: dive in; Hoppah: boing; Ansel: a happy jump (MORE! when there's nothing to pick). The one nearest your finger, for its size, wins. 3. The tower: nothing. The bale, or a thumb's width around the plank: BOOM. 4. The scenery above the fence: its surprise. 5. Anywhere else: Ansel walks there (MORE! when there's nothing to pick). |

- Every target is at least a thumb (48 CSS px) across at any zoom, so small pumpkins, sprouts and bare vine spots are easy to hit on a phone.
- Each surprise's tap zone sits on its art: critters and visitors use their sprite's own box (the barn doors follow them open or shut, the giraffe's head follows its pose), and painted scenery uses `art/surprises.json`, down to the hills and the tree line, which follow the painted skyline column by column. Small ones get a margin and are at least a thumb too, except that neighbouring fence posts (88 px apart) split the fence between them.
- A resting palm is ignored only if the contact is bigger than any thumb (radius over 75 CSS px), or broad (over 56 px) while another finger is already down. Phones report a thumb as a much bigger contact than a fingertip (iOS in steps of about 10 px: roughly 21 for a light touch, 31 for a firmer one; Android varies by phone), and the old limit of 28 px threw firm thumb taps away.
- One finger bouncing (a second hit within 120 ms and a thumb's width of the first) is one tap; a second finger tapping elsewhere is a new tap.

## Design rules

| Rule | Where it comes from |
|---|---|
| Two taps per pumpkin, tap-then-tap, no dragging | Stack's one-tap drop; works the same with a mouse or a finger |
| Every tap reacts instantly; a tap made while Ansel is busy waits (the latest one, briefly) and never fires late | Toca Boca, Sago Mini, Pok Pok; owner feedback |
| Rules are shown in the world, not in UI: the landing ring, the windsock, streaming leaves, wobble, creaks, the dusk | Owner feedback ("calm screen") |
| No outcome hints: the ring shows where it lands, not whether it stays; help is for a player's first round only | UX review ("tap when the ring is gold") |
| Ansel speaks up only for big moments (UPPAH!, MORE!, BOOM, golden, milestones, falls, surprises) | UX review; the players aren't toddlers |
| Honest stacking: centre of weight over the joint or it goes; weight and size change how a drop behaves | Owner feedback; Jenga / Mount Your Friends physical stakes |
| Push your luck: points ride on the tower until BOOM banks them | Can't Stop / "press your luck" games |
| Wind is telegraphed (~1.4 s of leaves and whoosh), alternates sides, and is present but not dominant | Paper Toss; owner feedback |
| Achievements earn lives back, each with a pumpkin flying into the life row | Owner feedback; arcade extra lives |
| A round always runs to sunset; falls cost lives, and lives left are an end-of-day bonus | Owner feedback ("the game ending before the time limit ... doesn't make sense") |
| Perfect drops sparkle and climb in pitch | Stack (Ketchapp) |
| Up to three touches; only a contact bigger than any thumb (or a broad one beside another finger) is ignored; 120 ms double-hit guard per spot | A resting palm can't block a finger, and a thumb is never mistaken for a palm |
| Thumb-sized targets; when two are close, the one that matters for play wins; the drop works anywhere | Owner feedback ("tapping on the landing spot should drop") |

## Files

- `index.html` and `game.js`: the game (Phaser 3.90 with Matter physics, vendored in `../lib`).
- `sim.js`: headless balance sim. It loads the `<rules>` block straight out of `game.js` and plays thousands of rounds with simulated players (random tappers, "good zone" tappers, timing players), BOOM strategies and fixed-offset drops. Run `node games/pumpkin-patch/sim.js [rounds]`. Try tunings without editing the game: `SIM_RULES='{"impact":0.6}' node games/pumpkin-patch/sim.js`.
- `art/`: pixel art, generated by `make_art.py` (needs Pillow). Run `python3 games/pumpkin-patch/make_art.py` after changing it.
- `art/ansel/`: Ansel's frames, everyday (cap) and farmer (straw hat, worn exactly while he's in the vine rows: on as he steps in, off as he steps back out; every round starts in the cap), cut from the owner's sprite sheets in `art/source/` by `make_ansel_frames.py` (needs Pillow, numpy and scipy). It erases the baked-in pumpkins (the game draws its own), cleans and re-grids the pixels, lines the frames up on one canvas and writes `frames.json` (feet anchor, and where each frame's pumpkin sat). Poses with no art yet borrow the closest frame; see `ANSEL_POSES` in `game.js`.
- `audio/pumpkin_patch_shuffle.mp3`: the level's theme. The intro plays once, then 26.006 s to 122.008 s loops, with a 60 ms crossfade baked in when it's decoded. `audio/pumpkin_patch_afternoon.mp3` is the earlier theme; add `?music=afternoon` to the URL to hear it.
- Gigi and Hoppah come from the shared `assets/` folder.

## Tuning

- The rules live in the `<rules>` block near the top of `game.js`:
  - `RULES`: lives, how to earn them and what they're worth at sunset (`livesBonus`), first-round help, the perfect-drop snap, flat-top widths, wobble, wind, sway, BOOM, points, the 3-minute day.
  - `HEFT`: how heavy each variety is.
  - `STAGES`: CALM, BREEZY, WINDY, GUSTY, STORMY and WILD WIND, by tower height, each with sway width and speed, perfect zone and gust strength.
- The patch: `LAYOUT` (path pumpkins at the start), `GROW` (how long each size takes, how much faster a watered plant grows, the golden chance, each spot's starting stage, the MORE! cooldown), `GROW_SIZES` (the varieties at each size) and `GROW_SPOTS`. `RULES.sizePow` sets how much size is worth, `RULES.heavyKick` how hard a big one lands, `RULES.hoverHeft` how weight changes its swing.
- `PatchScene.harvest(sp)` is the one entry point for a tap on a vine spot: it picks a pumpkin, or waters a bare spot or a sprout.
- Per-tower state lives in a `Stack` object (one per hay bale), so more bales are a small change.
- Items may carry `it.golden` (scores ×3) and `it.heft` (overrides the variety's weight).
- `PatchScene.earnLife(n, x, y)` awards lives from anywhere, with the fly-in. `PatchScene.endRound()` (sunset) does the last BOOM and the lives bonus (`UIScene.cashLives`), then shows the end card, which `UIScene.layoutEnd(w, h)` lays out: every piece gets its own box, and the score table scales down as one piece to fit.
- `PatchScene.say()` filters what Ansel says: lines in `SAY_LINES`, or calls that pass `important`.
- One-time help is remembered per device in `localStorage` (`uppah.pumpkinpatch.played`, `.hinted`).

Measured with `sim.js` (2000 rounds each, 3-minute day, a returning player with no first-round help). Every round runs the whole afternoon. Each action costs a real trip with the game's timings: walking, wading into and out of a vine row, the pick and the slower heavy carry, or 12 frames of watering at 85 ms. Timing players aim the landing ring at the centre with the given timing error. Two styles:
- **grabbers** take the nearest pumpkin of any size;
- **planners** water bare spots and sprouts early and pick large ones (large, golden or XL), or else the biggest around.

Pumpkins stacked per round, never pressing BOOM (p10 / median / p90; a pumpkin that falls and is stacked again counts again):

| Player | Grabber | Planner |
|---|---|---|
| Random tapper | 15 / 19 / 24 | |
| Casual (150 ms) | 26 / 31 / 36 | 16 / 19 / 23 |
| Good (70 ms) | 38 / 43 / 47 | 20 / 22 / 26 |
| Expert (45 ms) | 43 / 47 / 51 | 21 / 23 / 24 |
| Near-perfect (25 ms) | 44 / 48 / 51 | |

How high towers get, never pressing BOOM (share of rounds whose tower tops each landmark; the height is measured from the ground):

| Player | Gigi (400) | Silo (620) | Clouds (900) | Sky (1300) | Moon (1750) | The moon takes |
|---|---|---|---|---|---|---|
| Random tapper | 100% | 98% | 42% | 1% | 0% | |
| Casual grabber | 100% | 100% | 88% | 31% | 3% | 30 pumpkins, about 167 s |
| Casual planner | 100% | 100% | 93% | 41% | 0% | |
| Good grabber | 100% | 100% | 100% | 82% | 25% | 30 pumpkins, about 155 s |
| Good planner | 100% | 100% | 100% | 88% | 13% | 23 pumpkins, about 176 s |
| Expert grabber | 100% | 100% | 100% | 98% | 54% | 31 pumpkins, about 148 s |
| Expert planner | 100% | 100% | 100% | 98% | 43% | 23 pumpkins, about 176 s |
| Near-perfect grabber | 100% | 100% | 100% | 100% | 89% | 31 pumpkins, about 136 s |

- A fallen tower is rebuilt from the pumpkins on the path, so the moon is a race against the sunset. Planners get there on big pumpkins but only just (about 176 s of 180).
- Breaks of 12+ towers, by cause (good / expert grabbers): gusts 39% / 51%, heavy on light 24% / 14%, lean building up 25% / 22%, a gust at the moment of landing 12% / 14%.

**Push your luck.** Mean score when pressing BOOM every time the tower reaches a height (500 rounds each):

| Player | BOOM at 4 | 8 | 14 | 18 | 24 | Never | Best |
|---|---|---|---|---|---|---|---|
| Casual grabber | 7,818 | 10,269 | 11,109 | 11,064 | 9,726 | 9,433 | 14 |
| Casual planner | 9,500 | 12,921 | 14,244 | 13,498 | 11,576 | 11,576 | 14 |
| Good grabber | 12,201 | 20,938 | 26,767 | 27,392 | 28,343 | 20,590 | 24 |
| Good planner | 13,918 | 24,099 | 29,301 | 32,107 | 31,900 | 30,916 | 18 |
| Expert grabber | 12,644 | 27,027 | 41,009 | 45,816 | 50,813 | 34,804 | 24 |
| Expert planner | 14,605 | 30,831 | 43,006 | 49,454 | 59,556 | 57,613 | 24 |

- Cashing in every 4 pumpkins pays 25–70% of the best; never pressing BOOM pays 68–85% of it for grabbers, whose tall towers fall in the gusts.
- Good and expert planners' big-pumpkin towers rarely fall and grow slowly, so for them one tower held to sunset is within 3–4% of the best: the sunset, not the risk, is their limit (and a BOOM spends big pumpkins that took a while to grow). A casual planner's never-BOOM tower pays 81% of the best.
- **Lives bonus:** 7% of the score at the best strategy for casual grabbers, 18–27% for everyone else. Never pressing BOOM, grabbers end the day with 0.2–1 lives (3–9% of the score).
- **Planner against grabber**, each at its best: +28% (casual), +13% (good), +17% (expert).
- **Pumpkin weight:** planners stack fewer pumpkins in a day, because big ones are slow trips (about 4.3 s per pick against 2.5 s), but heavier ones (average weight about 2.3 against 0.9–1.1 for grabbers; about 75% large or bigger).
- **Watering:**
  - Planners water 15–19 times a round, each trip about 2.8 s.
  - Grabbers never need to, since there's nearly always some pumpkin to grab.
  - MORE! was never needed in the sim; it's there for a patch picked bare.
- **Wind:** with gusts on and off (grabbers, never pressing BOOM), the tallest tower's median is 19 vs 19 (casual), 26 vs 31 (good) and 31 vs 35 (expert), and the median score 6,394 vs 8,444, 15,844 vs 31,010 and 31,314 vs 50,851. Gusts cause 24% (casual) to 69% (expert) of the pumpkins lost.

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

All of it lives in the SURPRISES section near the end of `game.js` (one-line hooks elsewhere are marked `surprises`) and the surprises section of `make_art.py`, which writes the `egg_*.png` sprites and `art/surprises.json`. The json says where the overlays line up with the background, and (under `scenery`) where the barn, the silo, the stars, the hills and the tree line are painted, measured from the drawn colours, so the tap zones (`eggZones()` in `game.js`) stay on the art when the scene is repainted. Clouds, sun, moon, barn doors, letters and fence posts are copied pixel-for-pixel out of the rendered background, so they move without repainting the scene. Add `?zones=1` to the URL to see every surprise's tap zone.

## How to play card, title and pause extras

After the first tap on the title, a four-panel how-to-play card explains the game before the round starts: STACK 'EM UP (the goal, the landing ring, heavy pumpkins at the bottom, the controls), DON'T LET IT FALL (pumpkin lives and what the ones left at sunset are worth, gusts, the ways to earn lives back), BOOM! (banking the tower, what's lost if it falls first) and BEAT THE SUNSET (the afternoon is the clock, the last BOOM and the lives bonus at the end of a round, vines, leaf piles, MORE! and the scenery). Each panel has a small looping scene built from the game's own sprites. Touch screens see taps; a mouse and keyboard (`DESKTOP`) see keycaps.

- It opens by itself until the player has started 3 rounds (`HTP_AUTO`, counted in `localStorage` as `uppah.pumpkinpatch.rounds`). After that it's on the title's "?" button (or ? / H), and on the pause menu's HOW TO PLAY button.
- NEXT / BACK / SKIP, a swipe, a tap on the card, the page pumpkins, or keys: → Space Enter next, ← back, 1-4 a page, Esc skip. M still mutes.
- The title shows the live patch through stepped bands instead of a flat shade, keeps the round's HUD and the patch's own Ansel out of the way, and adds the best score, "?" and HOME (back to the Uppah home page, `../../`). The pause menu gets HOW TO PLAY and HOME.

All of it lives in the HOW TO PLAY section near the end of `game.js` (one-line hooks elsewhere are marked `how to play`; UIScene's tap and key handlers ask `htpTap()` / `htpKey()` first) and the how-to-play section of `make_art.py` (`keys.png`, `key_wide.png`, `icon_home.png`).

Leaves: the drifting leaves are spawned across the top of the view (never higher than just above the tree tops, `LEAF_CEIL`; gust-blown ones a little higher, `GUST_LEAF_CEIL`) and then stay put in the world (they don't follow the camera), and they blow with the same wind (`windV`) that fills the windsock and pushes the tower; gusts add a stream of leaves across the view a moment before they hit.
