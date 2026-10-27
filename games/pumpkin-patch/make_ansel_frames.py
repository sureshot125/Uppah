#!/usr/bin/env python3
"""Cut the owner's Ansel sprite sheets into clean game frames for Pumpkin Patch.

    python3 games/pumpkin-patch/make_ansel_frames.py [--preview out.png]

Reads the four sheets in art/source/ (1024 px wide, lossy WebP, flat blue background,
text labels under each frame) and writes:

    art/ansel/everyday/*.png   navy cap, white shirt, overalls, brown shoes
    art/ansel/farmer/*.png     straw hat, gloves, green boots, overalls
    art/ansel/frames.json      canvas size, feet anchor and per-frame data for game.js

What it does to every frame:
  1. Cut: the frame's cell on the sheet (labels and headings left out), background keyed
     out by colour distance, specks of WebP noise dropped.
  2. Pumpkins: the baked-in pumpkin is erased on the sheet, with its stem, dark outline and
     anti-alias fringe (the game draws its own pumpkin, of the right variety). Clear hand,
     glove and sleeve colours inside it are kept.
  3. Re-grid: each sheet is pixel art scaled up by a non-integer factor (the pitch: sheet
     px per art pixel). The frame is resampled back onto its art-pixel grid, with the grid
     phase picked per frame to best reproduce the sheet. Pitches are set so his head comes
     out the same size on every sheet (he is ~86 art px tall standing, cap or hat included).
  4. Clean: one palette for all frames (no colour flicker between frames), hard alpha,
     isolated specks removed.
  5. Repair where the pumpkin was: under a pumpkin carried on his head the cap or hat top
     is filled in from his walk frame, enclosed holes are filled from their surroundings,
     and the cut edges and hands get a fresh outline, so every frame reads with no pumpkin.
     frames.json records where the baked pumpkin sat, so the game draws its own pumpkin
     there, in front of him (his hands tuck behind it; WebP colour bleed leaves too little
     of the hands that were in front of the baked one to keep as a separate layer).
  6. Line up: every frame goes on one canvas with the feet on one baseline and the body
     (the overalls) centred, then is scaled up x3 with nearest neighbour (one art pixel =
     3 game px; the old Ansel sprites were ~3.7, the scenery is 4).

Water drops and the watering can in the watering frames stay baked in. A dizzy frame per
outfit is made from the standing frame plus a few pixel stars (there's no dizzy art).

Needs Pillow, numpy and scipy.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import ConvexHull

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'art', 'source')
OUT = os.path.join(HERE, 'art', 'ansel')
SCALE = 3          # game px per art pixel
COLORS = 56        # shared palette size
SQ = np.ones((3, 3), bool)
PLUS = ndimage.generate_binary_structure(2, 1)

# Sheet px per art pixel. walk, carry and the first watering row show a clear pixel grid
# (2.135, 2.565, 2.56). But the sheets don't all draw him the same size: the pick-up sheet
# is softer, the carry sheet draws him ~12% smaller (hat brim 33 vs 37 art px) and the
# second watering row ~10% bigger (244 sheet px standing vs 222). Those pitches are scaled
# so his head comes out the same size as on the walk sheet.
SHEETS = {
    'walk':  {'file': 'ansel_walk_sheet.webp', 'pitch': 2.135},
    'pick':  {'file': 'ansel_pickup_toss_sheet.webp', 'pitch': 1.90},
    'carry': {'file': 'ansel_carry_sheet.webp', 'pitch': 2.565 / 1.12},   # drawn ~12% smaller
    'water': {'file': 'ansel_watering_sheet.webp', 'pitch': 2.56},
}


def cells(sheet, outfit, y0, y1, bands, names, **opt):
    out = []
    for (x0, x1), name in zip(bands, names):
        if name:
            out.append(dict(name=name, sheet=sheet, outfit=outfit, box=(x0, y0, x1, y1), **opt))
    return out


# Each frame: its cell on the sheet (x0, y0, x1, y1), and what the baked pumpkin is doing:
#   hold=None      no pumpkin
#   hold='erase'   pumpkin beside him or in the air: erase it
#   hold='bottom'  he holds it; the game sits its pumpkin on the same bottom (ground, his head)
#   hold='center'  he holds it at his chest; the game centres its pumpkin there
# head=True: the pumpkin sat on his head, so the top of his cap or hat gets filled back in.
FRAMES = []
# Walk cycle (6 + 6)
FRAMES += cells('walk', 'everyday', 42, 241,
                [(0, 170), (170, 344), (344, 522), (522, 689), (689, 863), (863, 1024)],
                ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6'])
FRAMES += cells('walk', 'farmer', 325, 526,
                [(0, 170), (170, 348), (348, 523), (523, 691), (691, 858), (858, 1024)],
                ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_6'])
# Pick up and toss (7 + 7): stand beside, bend, crouch-grab, tug 1, tug 2, heave, toss
PICK = ['pick_1', 'pick_2', 'pick_3', 'tug_1', 'tug_2', 'heave', 'toss']
PICK_HOLD = ['erase', 'erase', 'bottom', 'bottom', 'bottom', 'center', 'erase']
for outfit, y0, y1, ytoss, bands in (
        ('everyday', 40, 211, 2, [(0, 164), (164, 306), (306, 450), (450, 590), (590, 737), (737, 877), (877, 1024)]),
        ('farmer', 288, 462, 262, [(0, 164), (164, 311), (311, 451), (451, 594), (594, 740), (740, 881), (881, 1024)])):
    for (x0, x1), name, hold in zip(bands, PICK, PICK_HOLD):
        FRAMES.append(dict(name=name, sheet='pick', outfit=outfit, hold=hold,
                           box=(x0, ytoss if name == 'toss' else y0, x1, y1)))
# Carry walk, hands on head (everyday has frames 1, 2, contact, 4 and 6; farmer 1, 2, 3 and 6)
FRAMES += cells('carry', 'everyday', 92, 331,
                [(0, 154), (154, 280), (280, 409), (409, 550), (550, 700)],
                ['carry_1', 'carry_2', 'carry_3', 'carry_4', 'carry_6'], hold='bottom', head=True)
FRAMES += cells('carry', 'farmer', 471, 715,
                [(0, 176), (176, 349), (349, 523), (523, 700)],
                ['carry_1', 'carry_2', 'carry_3', 'carry_6'], hold='bottom', head=True)
# Heavy carry, hugging it at chest height (two frames drawn per outfit)
FRAMES += cells('carry', 'everyday', 118, 331, [(700, 866), (866, 1024)], ['heavy_1', 'heavy_2'], hold='center')
FRAMES += cells('carry', 'farmer', 496, 715, [(700, 865), (865, 1024)], ['heavy_1', 'heavy_2'], hold='center')
# Watering (farmer only, 12). The second row is drawn bigger: 244 sheet px standing vs 222.
FRAMES += cells('water', 'farmer', 48, 287,
                [(0, 171), (171, 338), (338, 531), (531, 680), (680, 846), (846, 1024)],
                ['water_%d' % i for i in range(1, 7)], drops=True)
FRAMES += cells('water', 'farmer', 440, 709,
                [(0, 176), (176, 356), (356, 525), (525, 688), (688, 849), (849, 1024)],
                ['water_%d' % i for i in range(7, 13)], drops=True, pitch=2.56 * 244 / 222)

# Nudges (art px, + = forward) where the overalls' centre isn't where the body reads.
NUDGE = {}
# The frame the dizzy frame is built from.
DIZZY_FROM = 'pick_1'

# Hands painted back in. Where the sheet's pumpkin was, his hands were drawn over it and
# went with it (WebP smears the pumpkin's orange into them), leaving arms that end in stubs.
# Each entry is the centre of a chunky mitt, in art px of the frame's cut (the --dump view,
# before line-up), read off the frames: at the end of each arm, on the pumpkin's side or
# top. Everyday hands are skin; farmer hands are his brown gloves. The farmer's pick, tug
# and heave frames kept most of their gloves, so only the frames that lost them get new ones.
HANDS = {
    ('everyday', 'pick_3'):  [(44, 63), (42, 75)],
    ('everyday', 'tug_1'):   [(53, 68), (43, 74)],
    ('everyday', 'tug_2'):   [(58, 60), (52, 63)],
    ('everyday', 'heave'):   [(50, 38), (49, 44)],
    ('everyday', 'heavy_1'): [(46, 43), (49, 62)],
    ('everyday', 'heavy_2'): [(41, 44), (45, 61)],
    ('everyday', 'carry_1'): [(28, 26), (53, 28)],
    ('everyday', 'carry_2'): [(22, 26), (43, 28)],
    ('everyday', 'carry_3'): [(19, 26), (41, 28)],
    ('everyday', 'carry_4'): [(18, 26), (43, 28)],
    ('everyday', 'carry_6'): [(21, 26), (48, 28)],
    ('farmer', 'heavy_1'):   [(41, 45)],
    ('farmer', 'heavy_2'):   [(43, 44)],
    ('farmer', 'carry_1'):   [(29, 24), (56, 26)],
    ('farmer', 'carry_2'):   [(27, 25), (52, 26)],
    ('farmer', 'carry_3'):   [(28, 25), (55, 26)],
    ('farmer', 'carry_6'):   [(26, 26), (52, 27)],
}
# A mitt, 5 x 4 art px inside its outline, centred on the spot: o outline, L/M/D light, mid and
# shadow (lit from the top left like the rest of him), the bottom row hinting at fingers.
MITT = ['.ooooo.', 'oLLLLMo', 'oLLLMMo', 'oMMMMDo', 'oMDMDDo', '.ooooo.']
HAND_RAMP = {
    'everyday': [(230, 160, 128), (228, 151, 114), (174, 124, 102)],   # his skin, from face and arms
    'farmer': [(157, 123, 94), (124, 98, 79), (108, 85, 70)],          # his gloves
}


# ── helpers ──────────────────────────────────────────────────────────────────
def hsv(rgb):
    """HSV (h in degrees, s and v 0..1) of an (..., 3) array."""
    a = np.asarray(rgb, float) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-9), 0)
    dd = np.maximum(d, 1e-9)
    rc, gc, bc = (mx - r) / dd, (mx - g) / dd, (mx - b) / dd
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    h = np.where(d > 1e-9, (h / 6.0) % 1.0, 0) * 360
    return h, s, mx


def background(img):
    border = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]])
    return np.median(border, axis=0)


def drop_small(mask, n, structure=SQ):
    lab, k = ndimage.label(mask, structure=structure)
    if not k:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, k + 1))
    keep = np.zeros(k + 1, bool)
    keep[1:] = sizes >= n
    return keep[lab]


def fill_hull(mask):
    ys, xs = np.nonzero(mask)
    out = Image.new('L', (mask.shape[1], mask.shape[0]), 0)
    if len(xs) >= 3:
        pts = np.concatenate([np.stack([xs + dx, ys + dy], 1) for dx in (0, 1) for dy in (0, 1)])
        try:
            hull = ConvexHull(pts)
            ImageDraw.Draw(out).polygon([tuple(map(float, pts[i])) for i in hull.vertices], fill=1)
        except Exception:
            pass
    return (np.asarray(out) > 0) | mask


def cut(sheet_img, bg, box, drops):
    """Foreground of one cell: colour and soft alpha (0..1), specks of noise dropped."""
    x0, y0, x1, y1 = box
    c = sheet_img[y0:y1, x0:x1].astype(float)
    d = np.sqrt(((c - bg) ** 2).sum(-1))
    fg = drop_small(d > 30, 6 if drops else 40)
    soft = np.clip((d - 22) / 40.0, 0, 1) * ndimage.binary_dilation(fg, iterations=1)
    return c, soft


def erase_pumpkin(c, soft):
    """Erase the baked pumpkin on the sheet. Returns the new alpha and masks (sheet px):
    erased (what was taken out), hull (the pumpkin's outline), front (his pixels kept inside
    it) and body (the pumpkin's body, for its size)."""
    fg = soft > 0.5
    h, s, v = hsv(c)
    orange = drop_small(fg & (h >= 12) & (h <= 38) & (s >= 0.78) & (v >= 0.3), 12)
    if not orange.any():
        return soft, None
    # the pumpkin is the biggest orange blob and whatever orange sits right next to it
    lab, n = ndimage.label(orange, structure=SQ)
    sizes = ndimage.sum(orange, lab, range(1, n + 1))
    near = ndimage.binary_dilation(lab == 1 + int(np.argmax(sizes)), SQ, iterations=6)
    orange &= np.isin(lab, list(set(np.unique(lab[near & orange])) - {0}))
    ys, xs = np.nonzero(orange)
    top, left, right = ys.min(), xs.min(), xs.max()
    cx, w = (left + right) / 2, right - left
    yy, xx = np.mgrid[0:c.shape[0], 0:c.shape[1]]
    # the stem: olive green sitting on its top middle (his gloves and boots are olive too)
    green = fg & (h >= 50) & (h <= 160) & (s >= 0.2) & (v >= 0.12)
    stem = green & (yy >= top - 18) & (yy <= top + 3) & (np.abs(xx - cx) <= 0.3 * w + 3)
    lab, n = ndimage.label(stem, structure=SQ)
    touch = set(np.unique(lab[ndimage.binary_dilation(orange, SQ, iterations=5)])) - {0}
    stem = np.isin(lab, list(touch))
    hull = fill_hull(orange | stem)
    region = ndimage.binary_dilation(hull, SQ, iterations=5) & fg   # + shading, outline, fringe
    # Inside that, only his hands, gloves and sleeves stay: clear skin/glove/shirt/denim colours
    # (skin, straw, shoes and gloves all have G >= 0.6 R and B >= 0.4 R; the pumpkin's oranges,
    # ribs and dark edge don't), away from the figure's edge, plus a 2 px rim around them.
    # WebP smears colour ~2 px, so his pixels right against the pumpkin may go too; the
    # repair step re-outlines that edge.
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    shading = (R > 60) & (G < 0.56 * R) & (B < 0.35 * R)
    interior = ndimage.binary_erosion(fg, SQ, border_value=0)
    seed = region & interior & (G >= 0.6 * R) & (B >= 0.4 * R) & (v >= 0.3)
    seed &= ~ndimage.binary_dilation(orange, SQ, iterations=1) & ~ndimage.binary_dilation(stem, SQ, iterations=2)
    seed = drop_small(seed, 20)                                      # hand-sized, not specks
    front = region & (seed | (ndimage.binary_dilation(seed, SQ, iterations=2) & ~shading & ~orange & ~stem))
    erased = region & ~front
    soft = soft.copy()
    soft[erased] = 0
    return soft, dict(erased=erased, hull=hull, front=front & hull, body=orange)


class Grid:
    """An art-pixel grid laid over a sheet crop: pitch p, phase (ox, oy), size gw x gh."""

    def __init__(self, p, ox, oy, W, H):
        self.p, self.ox, self.oy = p, ox, oy
        self.gw, self.gh = int(np.ceil((W - ox) / p)) + 1, int(np.ceil((H - oy) / p)) + 1
        self.xs = ox - p + (np.arange(self.gw) + 0.5) * p
        self.ys = oy - p + (np.arange(self.gh) + 0.5) * p
        self.sub = np.array([-0.28, 0.0, 0.28]) * p

    def points(self):
        for dy in self.sub:
            for dx in self.sub:
                yield np.meshgrid(self.ys + dy - 0.5, self.xs + dx - 0.5, indexing='ij')

    def mean(self, a):
        acc = np.zeros((self.gh, self.gw))
        for Y, X in self.points():
            acc += ndimage.map_coordinates(a.astype(float), [Y, X], order=1, mode='constant')
        return acc / len(self.sub) ** 2

    def cell_of(self, W, H):
        iy = np.clip(((np.arange(H) + 0.5 - (self.oy - self.p)) // self.p).astype(int), 0, self.gh - 1)
        ix = np.clip(((np.arange(W) + 0.5 - (self.ox - self.p)) // self.p).astype(int), 0, self.gw - 1)
        return iy, ix


def regrid(c, soft, p):
    """Resample onto the art-pixel grid (pitch p), trying grid phases; keep the best fit."""
    H, W = soft.shape
    w = soft ** 2                                   # colour comes from solid pixels, not edges
    cw = c * w[..., None]
    on_sheet = soft > 0.5
    best = None
    steps = 6
    for oy in np.arange(steps) * p / steps:
        for ox in np.arange(steps) * p / steps:
            g = Grid(p, ox, oy, W, H)
            acc_w = g.mean(w)
            col = np.stack([g.mean(cw[..., k]) for k in range(3)], -1) / np.maximum(acc_w, 1e-6)[..., None]
            alpha = g.mean(soft)
            iy, ix = g.cell_of(W, H)
            rc = col[iy][:, ix]
            ra = alpha[iy][:, ix] > 0.5
            err = (np.abs(rc - c).sum(-1) * (on_sheet & ra)).sum() + 255 * 1.5 * (on_sheet != ra).sum()
            if best is None or err < best[0]:
                best = (err, col, alpha, g)
    _, col, alpha, g = best
    return np.clip(col, 0, 255), alpha > 0.5, g


def nearest(pal, px):
    wts = np.array([0.3, 0.59, 0.11]) * 3
    d = (((px[:, None, :] - pal[None, :, :]) ** 2) * wts).sum(-1)
    return d.argmin(1)


def build_palette(samples, n):
    allpx = np.concatenate(samples).astype(np.uint8)
    side = int(np.ceil(np.sqrt(len(allpx))))
    pad = np.zeros((side * side - len(allpx), 3), np.uint8) + allpx[0]
    img = Image.fromarray(np.concatenate([allpx, pad]).reshape(side, side, 3))
    q = img.quantize(colors=n, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
    return np.array(q.getpalette()[:n * 3], float).reshape(n, 3)


def classify(pal):
    h, s, v = hsv(pal)
    lum = pal @ np.array([0.3, 0.59, 0.11])
    return {
        'dark': lum < 58,
        'denim': (h >= 200) & (h <= 232) & (s >= 0.3) & (v >= 0.3) & (v <= 0.88),
        'water': (h >= 175) & (h <= 235) & (s >= 0.08) & (s <= 0.6) & (v >= 0.75),
    }


def despeckle(idx, on, cls, drops):
    lab, n = ndimage.label(on, structure=SQ)
    if n <= 1:
        return on
    sizes = ndimage.sum(on, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    for i in range(1, n + 1):
        if sizes[i - 1] >= 3:
            keep[i] = True
        elif drops:
            keep[i] = bool(cls['water'][idx][lab == i].any())
    return on & keep[lab]


def restore_head(fr, templates, ink):
    """Fill the top of his cap or hat (under a carried pumpkin) from the best-matching walk frame."""
    idx, on, gone = fr['idx'], fr['on'], fr['gone']
    keep_out = ndimage.binary_dilation(fr['frontmask'] | gone, SQ)
    ys, xs = np.nonzero(on)
    best = None
    for t in templates:
        tys, txs = np.nonzero(t['on'])
        ttop = tys.min()
        head = t['on'] & (np.arange(t['on'].shape[0])[:, None] < ttop + 26)
        hy, hx = np.nonzero(head)
        for dy in range(-30, 31):
            for dx in range(-24, 25):
                y2, x2 = hy + dy, hx + dx
                ok = (y2 >= 0) & (y2 < on.shape[0]) & (x2 >= 0) & (x2 < on.shape[1])
                y2, x2, sy, sx = y2[ok], x2[ok], hy[ok], hx[ok]
                both = on[y2, x2] & ~keep_out[y2, x2]
                same = (idx[y2, x2] == t['idx'][sy, sx]) & both
                score = same.sum() - 0.6 * (both & ~same).sum() - 0.3 * (~on[y2, x2] & ~gone[y2, x2]).sum()
                if best is None or score > best[0]:
                    best = (score, t, dy, dx, sy, sx, y2, x2)
    _, t, dy, dx, sy, sx, y2, x2 = best
    fill = ~on[y2, x2] & ndimage.binary_dilation(gone, SQ, iterations=2)[y2, x2]
    idx[y2[fill], x2[fill]] = t['idx'][sy[fill], sx[fill]]
    on[y2[fill], x2[fill]] = True


def repair(fr, ink, dark):
    """Fill enclosed holes where the pumpkin was, and outline the cut edges and hands."""
    idx, on, gone = fr['idx'], fr['on'], fr['gone']
    near = ndimage.binary_dilation(gone, SQ, iterations=1)
    holes = ndimage.binary_fill_holes(on) & ~on & near
    if holes.any():
        src = on & ~dark[idx]
        _, (iy, ix) = ndimage.distance_transform_edt(~src, return_indices=True)
        idx[holes] = idx[iy[holes], ix[holes]]
        on |= holes
    # crumbs left where the pumpkin was (bits of its edge) go
    lab, n = ndimage.label(on, structure=SQ)
    if n > 1:
        sizes = ndimage.sum(on, lab, range(1, n + 1))
        for i in range(1, n + 1):
            if i != 1 + int(np.argmax(sizes)) and sizes[i - 1] < 40 and \
                    (ndimage.binary_dilation(near, SQ, iterations=2) & (lab == i)).any():
                on &= lab != i
    light = on & ~dark[idx]
    edge = ~on & ndimage.binary_dilation(light, PLUS) & near
    idx[edge] = ink
    on |= edge
    fr['outline'] = edge


def paint_hands(fr, pal, ink, dark):
    """Paint mitts at the frame's HANDS spots, and work out its front layer: the hands the
    game draws over its own pumpkin (the mitts, and for the farmer the gloves the frame kept)."""
    f = fr['f']
    idx, on = fr['idx'], fr['on']
    H, W = on.shape
    ramp = nearest(pal, np.array(HAND_RAMP[f['outfit']], float))
    front = np.zeros_like(on)
    ring = np.zeros_like(on)
    spots = HANDS.get((f['outfit'], f['name']), [])
    for cx, cy in spots:
        x0, y0 = cx - 3, cy - 3
        foot = np.zeros_like(on)
        cells = []
        for j, row in enumerate(MITT):
            for i, ch in enumerate(row):
                y, x = y0 + j, x0 + i
                if ch != '.' and 0 <= y < H and 0 <= x < W:
                    foot[y, x] = True
                    cells.append((y, x, ch))
        # where the mitt meets his arm (skin or glove, not outline) there's no line: it runs on
        arm = on & ~dark[idx] & ~foot
        joins = ndimage.binary_dilation(arm, PLUS) & foot
        for y, x, ch in cells:
            if ch == 'o' and joins[y, x]:
                idx[y, x] = ramp[1]
            elif ch == 'o':
                idx[y, x] = ink
                ring[y, x] = True
            else:
                idx[y, x] = ramp['LMD'.index(ch)]
            on[y, x] = True
            front[y, x] = True
    fr['hand_spots'] = list(spots)
    if f['outfit'] == 'farmer':
        # gloves the frame kept over the pumpkin go in front too, with their outline
        kept = drop_small(fr['frontmask'] & on, 12) & ~front
        kept |= ndimage.binary_dilation(kept, PLUS) & on & dark[idx]
        front |= kept
    # in the front layer each mitt is outlined all round (it sits on the pumpkin, not the arm)
    fidx = idx.copy()
    fidx[front & ~ring & ndimage.binary_dilation(~front, PLUS) & ~dark[idx]] = ink
    fr['front'] = front if front.any() else None
    fr['front_idx'] = fidx


# ── pixel stars for the dizzy frame ──────────────────────────────────────────
STAR = ['..o..', '.oyo.', 'oyYyo', '.oyo.', '..o..']


def stamp_star(rgba, x, y, ink, gold, light):
    for j, row in enumerate(STAR):
        for i, ch in enumerate(row):
            yy, xx = y + j, x + i
            if ch != '.' and 0 <= yy < rgba.shape[0] and 0 <= xx < rgba.shape[1]:
                rgba[yy, xx] = {'o': ink, 'y': gold, 'Y': light}[ch]


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    sheets = {}
    for k, s in SHEETS.items():
        img = np.asarray(Image.open(os.path.join(SRC, s['file'])).convert('RGB'))
        sheets[k] = (img, background(img))

    # pass 1: cut, erase pumpkins, re-grid
    raw = []
    for f in FRAMES:
        img, bg = sheets[f['sheet']]
        c, soft = cut(img, bg, f['box'], f.get('drops'))
        pk = None
        if f.get('hold'):
            soft, pk = erase_pumpkin(c, soft)
        col, on, g = regrid(c, soft, f.get('pitch', SHEETS[f['sheet']]['pitch']))
        art = None
        if pk:
            art = {k: g.mean(m) > 0.5 for k, m in pk.items()}
            art['body'] = g.mean(pk['body']) > 0.3
        raw.append((f, col, on, art))
        print('cut', f['outfit'], f['name'], on.shape)

    # one palette for everything
    pal = build_palette([col[on] for _, col, on, _ in raw], COLORS)
    cls = classify(pal)
    ink = int(np.argmin(pal @ [0.3, 0.59, 0.11]))

    # pass 2: palette and specks
    frames = []
    for f, col, on, art in raw:
        idx = nearest(pal, col.reshape(-1, 3)).reshape(on.shape)
        on = despeckle(idx, on, cls, f.get('drops'))
        fr = dict(f=f, idx=idx, on=on, art=art)
        if art:
            fr['gone'] = art['erased'] & ~on
            fr['frontmask'] = art['front'] & on
        frames.append(fr)

    # pass 3: repair where the pumpkins were
    for fr in frames:
        if not fr['art']:
            continue
        f = fr['f']
        if f.get('head'):
            temps = [t for t in frames if t['f']['outfit'] == f['outfit'] and t['f']['name'].startswith('walk_')]
            restore_head(fr, temps, ink)
        repair(fr, ink, cls['dark'])
        paint_hands(fr, pal, ink, cls['dark'])
        b = fr['art']['body']
        if b.any() and f['hold'] in ('bottom', 'center'):
            ys, xs = np.nonzero(b)
            fr['pbox'] = dict(top=ys.min(), bottom=ys.max() + 1, left=xs.min(), right=xs.max() + 1)

    if '--dump' in sys.argv:   # debugging: the repaired frames before anchoring
        d = sys.argv[sys.argv.index('--dump') + 1]
        os.makedirs(d, exist_ok=True)
        np.save(os.path.join(d, 'palette.npy'), pal)
        for fr in frames:
            if fr['art']:
                np.savez(os.path.join(d, f"{fr['f']['outfit']}_{fr['f']['name']}.npz"), idx=fr['idx'], on=fr['on'],
                         gone=fr['gone'], body=fr['art']['body'], hull=fr['art']['hull'], front=fr['frontmask'])
            elif fr['f']['name'] in ('walk_1', 'pick_1', 'toss'):
                np.savez(os.path.join(d, f"{fr['f']['outfit']}_{fr['f']['name']}.npz"), idx=fr['idx'], on=fr['on'])

    # anchors: feet at the bottom of the biggest piece, body centre at the overalls
    for fr in frames:
        on, idx = fr['on'], fr['idx']
        lab, n = ndimage.label(on, structure=SQ)
        sizes = ndimage.sum(on, lab, range(1, n + 1))
        ys, xs = np.nonzero(lab == (1 + int(np.argmax(sizes))))
        fr['ay'] = ys.max() + 1
        dy, dx = np.nonzero(cls['denim'][idx] & on)
        fr['ax'] = (dx.mean() + 0.5 if len(dx) else xs.mean() + 0.5) + NUDGE.get((fr['f']['outfit'], fr['f']['name']), 0)

    # derived: dizzy (standing frame + stars over his head)
    for outfit in ('everyday', 'farmer'):
        base = next(fr for fr in frames if fr['f']['outfit'] == outfit and fr['f']['name'] == DIZZY_FROM)
        frames.append(dict(base, f=dict(base['f'], name='dizzy', hold=None), front=None, pbox=None, hand_spots=None,
                           stars=True))

    # one canvas for every frame, anchor (feet, body centre) at the same spot
    ext = [0, 0, 0, 0]  # left, right, up, down (art px from the anchor)
    for fr in frames:
        ys, xs = np.nonzero(fr['on'])
        ext[0] = max(ext[0], fr['ax'] - xs.min())
        ext[1] = max(ext[1], xs.max() + 1 - fr['ax'])
        ext[2] = max(ext[2], fr['ay'] - ys.min() + (8 if fr.get('stars') else 0))
        ext[3] = max(ext[3], ys.max() + 1 - fr['ay'])
    half = int(np.ceil(max(ext[0], ext[1]))) + 1
    up, down = int(np.ceil(ext[2])) + 1, int(np.ceil(ext[3])) + 1
    CW, CH, FX, FY = 2 * half, up + down, half, up

    pal8 = np.concatenate([pal, np.full((len(pal), 1), 255)], 1).astype(np.uint8)
    meta = {'scale': SCALE, 'w': CW * SCALE, 'h': CH * SCALE, 'footX': FX * SCALE, 'footY': FY * SCALE,
            'frames': {}}
    for outfit in ('everyday', 'farmer'):
        os.makedirs(os.path.join(OUT, outfit), exist_ok=True)
    written = []
    for fr in frames:
        f = fr['f']
        ox, oy = int(round(FX - fr['ax'])), int(FY - fr['ay'])

        def place(mask, idx=None):
            idx = fr['idx'] if idx is None else idx
            canvas = np.zeros((CH, CW, 4), np.uint8)
            ys, xs = np.nonzero(mask)
            canvas[ys + oy, xs + ox] = pal8[idx[ys, xs]]
            return canvas

        body = place(fr['on'])
        if fr.get('stars'):
            top = int(np.nonzero(fr['on'])[0].min()) + oy
            gold, light = np.array([255, 214, 72, 255], np.uint8), np.array([255, 248, 200, 255], np.uint8)
            for sx, sy in ((-13, 1), (-3, -6), (8, -2)):
                stamp_star(body, FX + sx, top + sy, pal8[ink], gold, light)
        key = f"{f['outfit']}/{f['name']}"
        info = {'top': int(FY - np.nonzero(body[..., 3])[0].min()) * SCALE}
        save(body, os.path.join(OUT, f['outfit'], f['name'] + '.png'))
        written.append((key, body))
        if fr.get('pbox'):
            b = fr['pbox']
            px = (b['left'] + b['right']) / 2 + ox - FX
            py = FY - (b['bottom'] + oy) if f['hold'] == 'bottom' else FY - ((b['top'] + b['bottom']) / 2 + oy)
            info['hold'] = {'x': round(float(px) * SCALE, 1), 'y': round(float(py) * SCALE, 1),
                            'w': int(b['right'] - b['left']) * SCALE, 'h': int(b['bottom'] - b['top']) * SCALE,
                            'anchor': f['hold']}
        if fr.get('front') is not None and f.get('hold') in ('bottom', 'center'):
            # his hands over the pumpkin: the game draws this layer above its own pumpkin
            front = place(fr['front'], fr['front_idx'])
            save(front, os.path.join(OUT, f['outfit'], f['name'] + '_front.png'))
            written.append((key + '_front', front))
            info['front'] = True
        if fr.get('hand_spots') and f.get('hold') in ('bottom', 'center'):
            info['hands'] = [[round(float(cx + 0.5 + ox - FX) * SCALE, 1), round(float(FY - (cy + 0.5 + oy)) * SCALE, 1)]
                             for cx, cy in fr['hand_spots']]
        meta['frames'][key] = info
    meta = json.loads(json.dumps(meta, default=int))
    with open(os.path.join(OUT, 'frames.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
        fh.write('\n')
    print('canvas', CW * SCALE, 'x', CH * SCALE, 'feet at', FX * SCALE, FY * SCALE, '| images', len(written))
    if preview:
        write_preview(preview, written, meta)


def save(rgba, path):
    big = Image.fromarray(rgba, 'RGBA').resize((rgba.shape[1] * SCALE, rgba.shape[0] * SCALE), Image.NEAREST)
    big.save(path, optimize=True)


def write_preview(path, written, meta):
    """A contact sheet: each image on a grey board with the baseline and anchor marked."""
    cols = 12
    w, h = meta['w'], meta['h']
    rows = (len(written) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * w, rows * h), (96, 120, 96, 255))
    d = ImageDraw.Draw(sheet)
    for i, (key, rgba) in enumerate(written):
        x, y = (i % cols) * w, (i // cols) * h
        img = Image.fromarray(rgba).resize((w, h), Image.NEAREST)
        d.line([(x, y + meta['footY']), (x + w, y + meta['footY'])], fill=(60, 80, 60, 255))
        d.line([(x + meta['footX'], y), (x + meta['footX'], y + h)], fill=(60, 80, 60, 255))
        sheet.alpha_composite(img, (x, y))
        d.text((x + 4, y + 4), key, fill=(255, 255, 255, 255))
    sheet.save(path)
    print('preview', path)


if __name__ == '__main__':
    main()
