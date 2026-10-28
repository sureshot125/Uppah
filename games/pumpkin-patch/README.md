# Ansel's Pumpkin Patch

An Uppah minigame. Ansel picks up pumpkins around a fall patch and stacks them on a hay bale. A round is one afternoon (3½ minutes) and the score is the pounds of pumpkins you harvest: they're at risk on the tower until you BOOM it, and a tall tower banks a bonus.

## How to play

- **Tap a pumpkin.** Ansel picks it up, carries it on his head and lifts it over the stack ("uppah!").
- **Where pumpkins come from.** A round starts with 5 pumpkins on the path and a couple hidden in the leaf piles. After that they come from the vine rows behind the path.
  - Vine pumpkins keep growing while they're left: sprout, then a small pumpkin (gold, orange or warty), medium (orange, white or green), large (orange), and finally XL (the deep orange giant). Now and then one grows golden instead of large. Each bigger size takes longer.
  - Tap a pumpkin of any size and Ansel puts on his straw hat, wades in, picks it and carries it to the bale.
  - Tap a bare spot or a sprout and he waters it. It jumps a size at once and grows half again as fast until it's picked. He doesn't pick anything on a watering trip; he steps back to the field's edge, ready for your next tap.
  - **Water early, pick big:** a big pumpkin weighs more (see Scoring) and is a wide, steady base. But it's heavy: a slower carry, it swings a little faster when tossed up, and on top of a smaller one it's a shaky joint.
  - BOOMed pumpkins are banked and spent: they fly off, settle and fade away.
  - Pumpkins that fall off a bad drop stay on the path to be picked up again.
- **Tap again** to drop it. A plain ring on the stack shows where it will land (wind drift included). It doesn't tell you whether it will stay: that's for you to judge from weight, order and lean.
- **Stack honestly.** A pumpkin lands where you drop it. A drop very near the centre (within 12% of the flat top's half-width) is PERFECT: it snaps to dead centre, so a careful tower never leans. If its centre is past the edge of the one below, it rolls off. Only a player's very first round gets help with the first two pumpkins (and the pointing hand shows the very first one); after that it's all on you.
- **Solid and shaky joints.** Every pumpkin and the one under it make a joint. It's **solid** when the pumpkin landed in the middle half of the one under it (within half its flat top's half-width of centre) and is no bigger a size than it (and not much wider). A solid joint holds through any gust, at any height, and through any landing on top. A **shaky** joint (off-centre, or big on small) can give way to a gust or a heavy landing, and then only the pumpkins above it fall; the solid part below stays. So build big at the bottom, small on top, and centred, and the weather can't touch you.
- **You can see the risk.** A tower with no shaky joints barely sways, even in a gale. A pumpkin on a shaky joint gives a small rock every few seconds, and when a gust that could take it is coming (the leaves are already streaming) it creaks and rocks harder. Cash in with BOOM, or keep going.
- **Wind.** Watch the windsock beside the bale and the leaves; they start streaming a second before a gust. A gust pushes the hovering pumpkin and drifts it as it falls (aim upwind; the ring shows where it will really land), so aiming stays hard, and it can topple a shaky joint (more easily the more is stacked on it). Gusts get stronger as the tower grows and toward sunset.
- **Scoring: pounds of pumpkins.** Each pumpkin that lands and stays puts its weight on the tower: small 5 lb, medium 10, large 20, XL 40, golden 50. A PERFECT drop counts double; a small, quiet PERFECT over the pumpkin is all it shows. Nothing else pops up when a pumpkin lands.
- **BOOM!** Once the tower is 3 tall, a wooden BOOM sign on the hay bale shows what it would bank. Tapping the bale (or holding B for half a second) sends Ansel to shove it: that banks the tower's pounds plus a **tall-tower bonus** of +10% for every pumpkin over 3, up to double (+100% at 13), and knocks it down. One banner says it, e.g. "BOOM! 180 LB" and, under it, "+50% TALL TOWER". The pounds on the tower aren't safe until then: if it falls first, the pounds of the pumpkins that fell are lost. One more, or cash in now? Every round also ends in a BOOM: whatever is still standing at sunset is banked the same way. The moon is the top of the sky: a tower that reaches it is banked with a MOON BOOM. The landmark banners (OVER THE FENCE!, TO THE MOON! ...) are just celebrations.
- **Rounds.** The afternoon lasts 3½ minutes and the sky turns gold, then dusky. A round only ends at sunset, when Ansel BOOMs whatever is still standing. The end card (SUNSET!) shows that last BOOM, TODAY'S HARVEST (the round's pounds), the tallest tower, your best harvest, and how many secrets (surprise stickers) you've found, with any new this round, beside a picture of the round's tallest tower and Ansel. Wide screens put the picture and the table side by side; tall and squarish ones stack them. Tap to play again. At sunset Hoppah hops over and jumps into Ansel's arms for NIGHT NIGHT before the end card.
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
| Push your luck: pounds ride on the tower until BOOM banks them, and a tall tower banks a bonus | Can't Stop / "press your luck" games |
| Wind is telegraphed (~1.4 s of leaves and whoosh), alternates sides, and is present but not dominant | Paper Toss; owner feedback |
| A round always runs to sunset (3½ minutes) | Owner feedback ("the game ending before the time limit ... doesn't make sense", "the day slightly longer") |
| One score unit, pounds harvested; a PERFECT drop counts double; no lives, no mults, no number pops | Owner feedback ("this is getting overwhelming ... the numbers themselves aren't very significant or interpretable") |
| A well-built tower never falls: only shaky joints (off-centre, or big on small) can give way | Owner feedback ("a tower that was built robustly shouldn't just fall over randomly") |
| Perfect drops say PERFECT quietly and climb in pitch | Stack (Ketchapp) |
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
  - `RULES`: first-round help, scoring (`lb`, `goldenLb`, `perfectZone`; the tall-tower bonus `tallFrom`, `tallPer`, `tallCap`), what makes a joint solid (`solidShare`, `wideTol`) and how much wind a shaky one catches (`shakyWind`), flat-top widths, wobble, wind, sway (`solidSway`), BOOM, the 3½-minute day (`day`; gusts and dusk are timed as fractions of it).
  - `SIZE_OF`: each variety's size class (small, medium, large, XL), for its pounds and joint order.
  - `HEFT`: how heavy each variety is.
  - `STAGES`: CALM, BREEZY, WINDY, GUSTY, STORMY and WILD WIND, by tower height, each with the hover's sway width and speed and the gust strength.
- The patch: `LAYOUT` (path pumpkins at the start), `GROW` (how long each size takes, how much faster a watered plant grows, the golden chance, each spot's starting stage, the MORE! cooldown), `GROW_SIZES` (the varieties at each size) and `GROW_SPOTS`. `RULES.heavyKick` sets how hard a big one lands, `RULES.hoverHeft` how weight changes its swing.
- `PatchScene.harvest(sp)` is the one entry point for a tap on a vine spot: it picks a pumpkin, or waters a bare spot or a sprout.
- Per-tower state lives in a `Stack` object (one per hay bale), so more bales are a small change.
- Items may carry `it.golden` and `it.heft` (overrides the variety's balance weight).
- `Rules.pounds(key, perfect)` is a pumpkin's pounds, `Rules.bank(lbs, n)` what BOOM banks. `PatchScene.perfectWord(it)` shows the quiet PERFECT, `PatchScene.boomLine()` the BOOM banner. `PatchScene.shakyCues()` rocks and creaks shaky joints. `PatchScene.endRound()` (sunset) does the last BOOM, then shows the end card, which `UIScene.layoutEnd(w, h)` lays out: every piece gets its own box, and the score table scales down as one piece to fit.
- `PatchScene.say()` filters what Ansel says: lines in `SAY_LINES`, or calls that pass `important`.
- One-time help is remembered per device in `localStorage` (`uppah.pumpkinpatch.played`, `.hinted`).

Measured with `sim.js` (1000 rounds each, 3½-minute day, a returning player with no first-round help). Every round runs the whole afternoon. Each action costs a real trip with the game's timings: walking, wading into and out of a vine row, the pick and the slower heavy carry, or 12 frames of watering at 85 ms. Timing players aim the landing ring at the centre with the given timing error.

Three ways to choose pumpkins:
- **grabbers** take the nearest pumpkin of any size;
- **builders** put big ones at the bottom and never a bigger one on a smaller one (the biggest one around that fits);
- **planners** water bare spots and sprouts early and pick large ones (large, golden or XL), or else the biggest around.

Pumpkins stacked per round, never pressing BOOM (p10 / median / p90; a pumpkin that falls and is stacked again counts again):

| Player | Grabber | Builder | Planner |
|---|---|---|---|
| Random tapper | 17 / 21 / 26 | | |
| Casual (150 ms) | 27 / 33 / 39 | 36 / 41 / 46 | 19 / 23 / 26 |
| Good (70 ms) | 42 / 49 / 54 | 44 / 50 / 58 | 24 / 27 / 31 |
| Expert (45 ms) | 51 / 56 / 61 | 45 / 49 / 56 | 26 / 27 / 31 |
| Near-perfect (25 ms) | | 45 / 47 / 50 | |

How high towers get, never pressing BOOM (share of rounds whose tower tops each landmark):

| Player | Clouds (900) | Sky (1300) | Moon (1750) |
|---|---|---|---|
| Casual grabber / builder / planner | 72% / 99% / 96% | 7% / 64% / 47% | 0% / 5% / 2% |
| Good grabber / builder / planner | 99% / 100% / 100% | 35% / 88% / 88% | 0% / 35% / 20% |
| Expert grabber / builder / planner | 100% / 100% / 100% | 62% / 99% / 98% | 0% / 78% / 40% |
| Near-perfect builder | 100% | 100% | 100% |

- The moon takes about 30 pumpkins for builders (at about 170–190 s) and 23 big ones for planners (at about 182–200 s). Grabbers stack big on small all the time, so their towers keep breaking: they don't get there.
- **Stability:** no collapse ever starts at a solid joint (0.00 a round, for every player). Collapses come from your own joints: off-centre ones (builders about 3–5 a round, grabbers 1.5–3.5) and bigger-on-smaller ones (grabbers 1.6–3.4 a round, builders none). Shaky joints are 9% (expert builder) to 41% (casual grabber) of landings.

**Push your luck.** Mean pounds banked for each BOOM strategy (250 rounds each). "at 8": BOOM every time the tower is 8 tall; "shaky 1": BOOM as soon as any joint is shaky; "shaky 3": once a shaky joint carries 3 pumpkins.

| Player | Never | At 3 | At 8 | At 11 | At 14 | At 20 | Shaky 1 | Shaky 3 | Best |
|---|---|---|---|---|---|---|---|---|---|
| Casual grabber | 236 | 408 | 531 | 500 | 454 | 289 | 434 | 492 | at 8 |
| Casual builder | 472 | 531 | 748 | 810 | 841 | 682 | 684 | 773 | at 14 |
| Casual planner | 629 | 629 | 856 | 903 | 879 | 661 | 790 | 871 | at 11 |
| Good grabber | 304 | 475 | 669 | 764 | 765 | 593 | 555 | 628 | at 14 |
| Good builder | 673 | 619 | 871 | 980 | 1,062 | 1,030 | 971 | 1,007 | at 14 |
| Good planner | 841 | 762 | 1,073 | 1,229 | 1,299 | 1,129 | 1,131 | 1,185 | at 14 |
| Expert grabber | 357 | 519 | 723 | 841 | 898 | 801 | 654 | 718 | at 14 |
| Expert builder | 987 | 683 | 955 | 1,088 | 1,171 | 1,194 | 1,146 | 1,188 | at 20 |
| Expert planner | 1,069 | 859 | 1,195 | 1,376 | 1,558 | 1,377 | 1,329 | 1,385 | at 14 |

- Without the tall-tower bonus, BOOMing at every 3 was always the safest and best. With it, the best is in the middle (8–20, mostly 14): BOOMing at 3 pays 47–77% of the best, never BOOMing 40–83%.
- **Big and centred wins:** planners (big pumpkins) bank +70% to +73% over grabbers at their best, builders (big at the bottom, never bigger on smaller) +33% to +58%, and every step of accuracy (casual to good to expert) adds 12–44%.
- **Where the pounds come from** (at each player's best): the pumpkins' own weight 34–52%, PERFECT doubling 10–17%, the tall-tower bonus 32–49%.
- **Watering:** planners water 17–20 times a round, each trip about 2.8 s; grabbers and builders hardly ever. Builders shout MORE! now and then (up to 0.4 a round) when nothing small enough is ripe.
- **Wind** (builders, never pressing BOOM, gusts on and off): the tallest tower's median is 21 vs 26 (casual), 28 vs 32 (good) and 32 vs 32 (expert). Gusts only ever take shaky joints.

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

After the first tap on the title, a four-panel how-to-play card explains the game before the round starts: STACK 'EM UP (the goal, the landing ring, heavy pumpkins at the bottom, the controls), DON'T LET IT FALL (centred and big at the bottom never blows over, gusts only topple shaky spots, a PERFECT drop counts double), BOOM! (your score is pounds, not safe until you BOOM; the tall-tower bonus; what's lost if it falls first) and BEAT THE SUNSET (the afternoon is the clock, the last BOOM at the end of a round, vines, leaf piles, MORE! and the scenery). Each panel has a small looping scene built from the game's own sprites. Touch screens see taps; a mouse and keyboard (`DESKTOP`) see keycaps.

- It opens by itself until the player has started 3 rounds (`HTP_AUTO`, counted in `localStorage` as `uppah.pumpkinpatch.rounds`). After that it's on the title's "?" button (or ? / H), and on the pause menu's HOW TO PLAY button.
- NEXT / BACK / SKIP, a swipe, a tap on the card, the page pumpkins, or keys: → Space Enter next, ← back, 1-4 a page, Esc skip. M still mutes.
- The title shows the live patch through stepped bands instead of a flat shade, keeps the round's HUD and the patch's own Ansel out of the way, and adds the best score, "?" and HOME (back to the Uppah home page, `../../`). The pause menu gets HOW TO PLAY and HOME.

All of it lives in the HOW TO PLAY section near the end of `game.js` (one-line hooks elsewhere are marked `how to play`; UIScene's tap and key handlers ask `htpTap()` / `htpKey()` first) and the how-to-play section of `make_art.py` (`keys.png`, `key_wide.png`, `icon_home.png`).

Leaves: the drifting leaves are spawned across the top of the view (never higher than just above the tree tops, `LEAF_CEIL`; gust-blown ones a little higher, `GUST_LEAF_CEIL`) and then stay put in the world (they don't follow the camera), and they blow with the same wind (`windV`) that fills the windsock and pushes the tower; gusts add a stream of leaves across the view a moment before they hit.
