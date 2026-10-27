#!/usr/bin/env python3
"""Rebuild Ansel's game frames for Pumpkin Patch from the owner's sprite sheets.

    python3 games/pumpkin-patch/make_ansel_frames.py [--preview out.png] [--dump dir]

Reads the four sheets in art/source/ (1024 px wide, lossy WebP, flat blue background,
text labels under each frame) and writes, in the same style as everything make_art.py
draws (4 game px per art pixel, a small palette, a selective dark outline):

    art/ansel/everyday/*.png   navy cap, white shirt, overalls, brown shoes
    art/ansel/farmer/*.png     straw hat, gloves, green boots, overalls
    art/ansel/frames.json      canvas size, feet anchor and per-frame data for game.js

For every frame:
  1. Cut: the frame's cell on the sheet (labels and headings left out), the flat background
     keyed out, specks of WebP noise dropped.
  2. Pumpkins: the baked-in pumpkin is erased on the sheet, with its stem, dark outline and
     fringe (the game draws its own pumpkin, of the right variety).
  3. Palette: every sheet pixel is matched to one colour of PALETTE (22 colours for both
     outfits: skin, hair, cap, shirt, denim, shoes, straw, gloves, boots, watering can, water).
  4. Re-grid: the frame is resampled onto a grid of art pixels sized so he stands ~64 art px
     to the top of his cap (255 game px). Each art pixel takes the colour most of its sheet
     pixels have, not an average, so nothing is blurred; the grid's phase is picked per frame
     to keep cells as pure as possible. Pitches are set per sheet so his head is the same size
     everywhere (the sheets draw him at different sizes).
  5. Clean: stray single pixels go, his own dark edge is taken off and replaced by
     make_art.py's selective outline (each edge pixel is the colour it touches, darkened
     toward the shared ink), so he sits in the scene like the pumpkins and the bale.
  6. Repair: under a pumpkin carried on his head the cap or hat top is filled back in from his
     walk frame, holes left by the pumpkin are filled, and hands are painted back as small
     mitts (HANDS) where the pumpkin took them. FACE_FIX patches pixels the downsample breaks.
     Frames where he holds a pumpkin also get <frame>_front.png, his hands alone, which the
     game draws over its own pumpkin so the pumpkin reads as held.
  7. Line up: every frame goes on one canvas with the feet on one baseline and the body (the
     overalls) centred, then is scaled up x4 with nearest neighbour.

Water drops and the watering can in the watering frames stay. A dizzy frame per outfit is
the standing frame plus a few pixel stars (there's no dizzy art yet).

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
SCALE = 4                      # game px per art pixel, like make_art.py
INK = (43, 24, 16)             # make_art.py's outline colour
OUTLINE = 0.62                 # make_art.py's outline() strength
INK_SHARE = 0.26               # a cell this much ink (by weight) is drawn as ink
SQ = np.ones((3, 3), bool)
PLUS = ndimage.generate_binary_structure(2, 1)

# The palette: char, the colour it matches on the sheets, and the clean colour drawn.
PALETTE = [
    ('k', (14, 11, 12), INK),               # outline, eyes, brows (the sheets' near-black)
    ('n', (36, 35, 42), (40, 38, 52)),      # cap, dark
    ('N', (60, 56, 64), (68, 64, 84)),      # cap
    ('h', (60, 40, 32), (64, 40, 30)),      # hair, dark
    ('b', (98, 64, 50), (104, 66, 46)),     # hair, shoe shadow
    ('B', (146, 98, 70), (152, 104, 70)),   # shoes
    ('T', (158, 118, 78), (158, 120, 82)),  # gloves, straw shadow
    ('y', (200, 154, 94), (208, 160, 92)),  # straw
    ('Y', (228, 192, 132), (236, 200, 132)),  # straw, light
    ('q', (178, 112, 86), (182, 110, 80)),  # skin, shadow
    ('s', (220, 148, 112), (224, 148, 108)),  # skin
    ('S', (234, 166, 132), (242, 178, 140)),  # skin, light
    ('w', (196, 186, 176), (194, 184, 174)),  # shirt, shade
    ('W', (234, 224, 210), (244, 236, 222)),  # shirt, eye whites, teeth
    ('e', (52, 70, 100), (50, 70, 112)),    # denim, dark
    ('d', (80, 112, 158), (78, 112, 164)),  # denim
    ('D', (102, 138, 186), (108, 144, 194)),  # denim, light
    ('o', (76, 86, 64), (72, 84, 56)),      # boots, dark
    ('O', (104, 116, 86), (108, 122, 84)),  # boots
    ('c', (100, 108, 118), (104, 112, 124)),  # watering can, dark
    ('C', (150, 160, 166), (166, 176, 182)),  # watering can
    ('A', (190, 226, 250), (182, 224, 252)),  # water drops
]
CHARS = [p[0] for p in PALETTE]
CH = {c: i for i, c in enumerate(CHARS)}
MATCH = np.array([p[1] for p in PALETTE], float)
COLOUR = np.array([p[2] for p in PALETTE], np.uint8)
BG = len(PALETTE)              # label for "nothing here"

# Sheet px per art pixel. Measured on the walk sheet, he is 85.5 sheet-grid px tall standing
# (cap top to soles) on a 2.135 px grid; at 64 art px tall that's a pitch of 2.135 * 85.5 / 64.
# The other sheets draw him at other sizes, so their pitches are scaled to give the same head:
# the pick-up sheet is softer (1.90 px grid), the carry sheet draws him ~12% smaller (hat brim
# 33 vs 37) and the second watering row ~10% bigger (244 sheet px standing vs 222).
K = 85.5 / 64
SHEETS = {
    'walk':  {'file': 'ansel_walk_sheet.webp', 'pitch': 2.135 * K},
    'pick':  {'file': 'ansel_pickup_toss_sheet.webp', 'pitch': 1.90 * K},
    'carry': {'file': 'ansel_carry_sheet.webp', 'pitch': 2.565 / 1.12 * K},
    'water': {'file': 'ansel_watering_sheet.webp', 'pitch': 2.56 * K},
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
                ['water_%d' % i for i in range(7, 13)], drops=True, pitch=2.56 * 244 / 222 * K)

# Nudges (art px, + = forward) where the overalls' centre isn't where the body reads.
NUDGE = {}
# The frame the dizzy frame is built from.
DIZZY_FROM = 'pick_1'

# Hands painted back in. Where the sheet's pumpkin was, his hands were drawn over it and went
# with it (WebP smears the pumpkin's orange into them), leaving arms that end in stubs. Each
# entry is a mitt's top-left corner in the frame's re-gridded cut (see --dump), read off the
# frames: at the end of each arm, on the pumpkin's side or top. Everyday mitts are skin, the
# farmer's are his gloves.
HANDS = {
    ('everyday', 'pick_3'): [(26, 55), (33, 45)],
    ('everyday', 'tug_1'): [(28, 55), (37, 49)],
    ('everyday', 'tug_2'): [(32, 47), (39, 46)],
    ('everyday', 'heave'): [(35, 28), (34, 31)],
    ('everyday', 'heavy_1'): [(31, 44), (27, 35)],
    ('everyday', 'heavy_2'): [(27, 45), (21, 35)],
    ('farmer', 'pick_3'): [(28, 55), (31, 47)],
    ('farmer', 'tug_1'): [(29, 47), (32, 38)],
    ('farmer', 'tug_2'): [(39, 44), (40, 37)],
    ('farmer', 'heave'): [(34, 27), (34, 30)],
    ('farmer', 'heavy_1'): [(34, 46)],
    ('farmer', 'heavy_2'): [(35, 45)],
}
# Carrying on his head, the hands hold the pumpkin's sides low down: worked out from where
# the pumpkin was (see paint_hands).
# 3 x 2 art px inside the outline: L light, M mid, D shadow (lit from the top left).
MITT = ['LLM', 'MMD']
HAND_RAMP = {'everyday': 'Ssq', 'farmer': 'TTb'}

# Pixel fixes the downsample needs (faces mostly): frame -> list of (x, y, char) in the
# frame's re-gridded cut ('.' clears a pixel).
FACE_FIX = {}

# His head, drawn by hand at this size: the downsample can't keep a face 16 px wide, and a
# head drawn once keeps the cap or hat and the face the same from frame to frame. It's pasted
# onto every frame, lined up where it matches the downsampled head best. Faces: 'normal',
# 'grin' (eyes squeezed happy, mouth open: the toss and the BOOM) and 'strain' (eyes shut
# tight, teeth gritted: tugging and heaving).
FACES = {
    'normal': [
        ".hhhhbhhhSShhhSShhhhh...",
        ".hhhbhhSSSSSSSSSSSShh...",
        "..hhhsSShhhSSSSShhSSq...",
        "..hhsqsSWkSSSSSSkSSSq...",
        "..hhssqSSkSSSSSSkSSSq...",
        "...hssSSSSSSSSSSSSSSq...",
        "....sSSSSSSSSSSSSSqSq...",
        "....qsSSSSSSSSSSSSSs....",
        ".....qsSSSSSqqqSSSs.....",
        "......qsSSSSSSSSSs......",
        ".......qqssssssqq.......",
        "........qqqqqqq.........",
    ],
    'grin': [
        ".hhhhbhhhSShhhSShhhhh...",
        ".hhhbhhSSSSSSSSSSSShh...",
        "..hhhsSSSSSSSSSSSSSSq...",
        "..hhsqsSSkSSSSSSkSSSq...",
        "..hhssqSkSkSSSSkSkSSq...",
        "...hssSSSSSSSSSSSSSSq...",
        "....sSSSSSkkkkkSSSqSq...",
        "....qsSSSSkWWWkSSSSs....",
        ".....qsSSSkqqqkSSSs.....",
        "......qsSSSkkkSSSSs.....",
        ".......qqssssssqq.......",
        "........qqqqqqq.........",
    ],
    'strain': [
        ".hhhhbhhhSShhhSShhhhh...",
        ".hhhbhhSSSSSSSSSSSShh...",
        "..hhhsSSShSSSSShSSSSq...",
        "..hhsqsSkkSSSSSkkSSSq...",
        "..hhssqSSSSSSSSSSSSSq...",
        "...hssSSSSSSSSSSSSSSq...",
        "....sSSSSSSSSSSSSSqSq...",
        "....qsSSSSkkkkkSSSSs....",
        ".....qsSSkWWWWWkSSs.....",
        "......qsSSkkkkkSSs......",
        ".......qqssssssqq.......",
        "........qqqqqqq.........",
    ],
}
FACE = FACES['normal']
HEADS = {
    'everyday': {'rows': [
        "......nNNNNNn...........",
        "....nNNNNNNNNNn.........",
        "...nNNNnNNNNNNNNn.......",
        "..nNNNnNNNNNNqqNNn......",
        "..nNNNnNNNNNNqqNNNn.....",
        ".nNNNnNNNNNNNNNNNNn.....",
        ".nNNNnNNNNNNNNNNNNNn....",
        ".nNNnNNNNNNNNNNNNNNNNNn.",
        ".nnnnnnnnnnNNNNNNNNNNNNn",
        ".hhhhhhhhhkkkkkkkkkkkkk.",
    ], 'face_x': 0},
    'farmer': {'rows': [
        "............yYYYYYYYy...........",
        "..........yYYYYYYYYYYYy.........",
        ".........yYYYYYYYYYYYYYy........",
        "........yYYYYyYYYYYYYYYYy.......",
        "........yYYYyYYYYYYYYYYYy.......",
        "........yyYyYYYYYYYYYYYyy.......",
        "........TbbbbbbbbbbbbbbbbT......",
        "....yyyyyTTTTTTTTTTTTTTTTyyyyyy.",
        "..yYYYYYYYYYYYYYYYYYYYYYYYYYYYYy",
        ".yYYYyyyyyyyyyyyyyyyyyyyyyyyYYYY",
        "TTTTTTkkkkkkkkkkkkkkkkkkkkkkTTTT",
    ], 'face_x': 7},
}
FACE_OF = {'toss': 'grin', 'tug_1': 'strain', 'tug_2': 'strain', 'heave': 'strain'}
# Frames with his hands up by his head: there only what's under the new head is cleared
# (cap, hat and hair colours can go anywhere near it; skin and gloves could be his hands).
TIGHT = ['carry_1', 'carry_2', 'carry_3', 'carry_4', 'carry_6', 'heave', 'toss']


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


def lab(rgb):
    """CIE Lab of an (..., 3) sRGB array."""
    c = np.asarray(rgb, float) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    xyz /= np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


MATCH_LAB = lab(MATCH)


def background(img):
    border = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]])
    return np.median(border, axis=0)


def drop_small(mask, n, structure=SQ):
    lab_, k = ndimage.label(mask, structure=structure)
    if not k:
        return mask
    sizes = ndimage.sum(mask, lab_, range(1, k + 1))
    keep = np.zeros(k + 1, bool)
    keep[1:] = sizes >= n
    return keep[lab_]


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
    lab_, n = ndimage.label(orange, structure=SQ)
    sizes = ndimage.sum(orange, lab_, range(1, n + 1))
    near = ndimage.binary_dilation(lab_ == 1 + int(np.argmax(sizes)), SQ, iterations=6)
    orange &= np.isin(lab_, list(set(np.unique(lab_[near & orange])) - {0}))
    ys, xs = np.nonzero(orange)
    top, left, right = ys.min(), xs.min(), xs.max()
    cx, w = (left + right) / 2, right - left
    yy, xx = np.mgrid[0:c.shape[0], 0:c.shape[1]]
    # the stem: olive green sitting on its top middle (his gloves and boots are olive too)
    green = fg & (h >= 50) & (h <= 160) & (s >= 0.2) & (v >= 0.12)
    stem = green & (yy >= top - 18) & (yy <= top + 3) & (np.abs(xx - cx) <= 0.3 * w + 3)
    lab_, n = ndimage.label(stem, structure=SQ)
    touch = set(np.unique(lab_[ndimage.binary_dilation(orange, SQ, iterations=5)])) - {0}
    stem = np.isin(lab_, list(touch))
    hull = fill_hull(orange | stem)
    region = ndimage.binary_dilation(hull, SQ, iterations=5) & fg   # + shading, outline, fringe
    # Inside that, only his hands, gloves and sleeves stay: clear skin/glove/shirt/denim colours
    # (skin, straw, shoes and gloves all have G >= 0.6 R and B >= 0.4 R; the pumpkin's oranges,
    # ribs and dark edge don't), away from the figure's edge, plus a 2 px rim around them.
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
    return soft, dict(erased=erased, hull=hull, body=orange)


# Colours each outfit can't have (so, say, his shirt's grey shade can't turn into the can).
NOT_IN = {'everyday': 'yYTOocCA', 'farmer': 'nNBcCA'}


def labels(c, soft, outfit, water=False):
    """Match every sheet pixel to the palette (BG where there's nothing)."""
    L = lab(c)
    d = ((L[..., None, :] - MATCH_LAB) ** 2).sum(-1)
    for ch in NOT_IN[outfit]:
        if not (water and ch in 'cCA'):
            d[..., CH[ch]] = 1e12
    out = d.argmin(-1)
    out[soft <= 0.5] = BG
    return out


class Grid:
    """An art-pixel grid over a sheet crop: pitch p, phase (ox, oy). Cell (i, j) covers sheet
    x in [ox + (i - 1) p, ox + i p), and likewise for y."""

    def __init__(self, p, ox, oy, W, H):
        self.p, self.ox, self.oy = p, ox, oy
        self.ix = np.floor((np.arange(W) + 0.5 - ox) / p).astype(int) + 1
        self.iy = np.floor((np.arange(H) + 0.5 - oy) / p).astype(int) + 1
        self.gw, self.gh = self.ix.max() + 1, self.iy.max() + 1
        fx = ((np.arange(W) + 0.5 - ox) / p) % 1.0
        fy = ((np.arange(H) + 0.5 - oy) / p) % 1.0
        # sheet pixels near a cell's middle count more than those on its edge
        self.w = np.outer(1.2 - np.abs(fy - 0.5) * 1.6, 1.2 - np.abs(fx - 0.5) * 1.6)
        self.cell = (self.iy[:, None] * self.gw + self.ix[None, :])

    def votes(self, lab_, weight=None):
        w = self.w if weight is None else self.w * weight
        n = BG + 1
        v = np.bincount((self.cell * n + lab_).ravel(), weights=w.ravel(), minlength=self.gw * self.gh * n)
        return v.reshape(self.gh, self.gw, n)

    def share(self, mask):
        """Share of each cell (weighted) that a sheet-px mask covers."""
        tot = np.bincount(self.cell.ravel(), weights=self.w.ravel(), minlength=self.gw * self.gh)
        m = np.bincount(self.cell.ravel(), weights=(self.w * mask).ravel(), minlength=self.gw * self.gh)
        return (m / np.maximum(tot, 1e-9)).reshape(self.gh, self.gw)


def regrid(lab_, p):
    """Re-grid at pitch p, each cell taking its dominant colour; the phase with the purest cells wins."""
    H, W = lab_.shape
    boost = np.where(lab_ == CH['k'], 1.5, 1.0)          # thin outlines, eyes and brows hold on
    best = None
    steps = 6
    for oy in np.arange(steps) * p / steps:
        for ox in np.arange(steps) * p / steps:
            g = Grid(p, ox, oy, W, H)
            v = g.votes(lab_, boost)
            purity = v.max(-1).sum() / v.sum()
            if best is None or purity > best[0]:
                best = (purity, g, v)
    _, g, v = best
    idx = v.argmax(-1)
    tot = v.sum(-1)
    # fine dark lines are thinner than a cell: enough ink makes it ink
    idx[(v[..., CH['k']] >= INK_SHARE * tot) & (idx != BG)] = CH['k']
    face_features(lab_, g, idx)
    idx[tot < 0.35 * g.p * g.p] = BG                     # cells mostly off the cut are empty
    return idx, g


SKIN = [CH['S'], CH['s'], CH['q']]


def face_features(lab_, g, idx):
    """Eyes, brows and teeth are a sheet pixel or two across, so no cell is mostly eye. Find
    them on the sheet (small dark or white marks with skin all round) and draw each one into
    the cells it covers: dark marks as ink, white ones (eye glints, teeth) as white."""
    skin = np.isin(lab_, SKIN + [CH['W']])
    for chars, out, lo, hi in (('khb', 'k', 3, 90), ('W', 'W', 3, 60)):
        mark = np.isin(lab_, [CH[c] for c in chars])
        comp, n = ndimage.label(mark, structure=SQ)
        for i in range(1, n + 1):
            m = comp == i
            size = m.sum()
            if not lo <= size <= hi:
                continue
            ring = ndimage.binary_dilation(m, SQ, iterations=2) & ~m
            if skin[ring].mean() < (0.42 if out == 'k' else 0.6):
                continue
            ys, xs = np.nonzero(m)
            cells = {}
            for y, x in zip(ys, xs):
                key = (g.iy[y], g.ix[x])
                cells[key] = cells.get(key, 0) + 1
            cy, cx = g.iy[int(round(ys.mean()))], g.ix[int(round(xs.mean()))]
            for (cy2, cx2), cnt in cells.items():
                if (cy2, cx2) == (cy, cx) or cnt >= 0.3 * g.p * g.p:
                    if out == 'W' and idx[cy2, cx2] == CH['k']:
                        continue
                    idx[cy2, cx2] = CH[out]


def neighbours(idx):
    """The 8 neighbours of every pixel (BG off the edge), shape (8, H, W)."""
    P = np.pad(idx, 1, constant_values=BG)
    H, W = idx.shape
    return np.stack([P[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]
                     for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx])


def clean(idx, drops):
    """No single-pixel noise: a pixel unlike all 8 neighbours takes their commonest colour
    (eyes and other ink details, and water drops, stay); tiny loose bits go."""
    for _ in range(2):
        nb = neighbours(idx)
        alone = (nb != idx).all(0) & (idx != BG) & (idx != CH['k']) & (idx != CH['A'])
        if not alone.any():
            break
        counts = np.stack([(nb == c).sum(0) for c in range(BG + 1)])
        counts[BG] = counts[BG] * 0.5             # rather a colour than a hole
        idx = np.where(alone, counts.argmax(0), idx)
    on = idx != BG
    lab_, n = ndimage.label(on, structure=SQ)
    if n > 1:
        sizes = ndimage.sum(on, lab_, range(1, n + 1))
        for i in range(1, n + 1):
            if sizes[i - 1] < 4 and not (drops and (idx[lab_ == i] == CH['A']).any()):
                idx[lab_ == i] = BG
    return idx


def drop_loose(fr):
    """Bits of the pumpkin's edge left floating where it was go."""
    idx, gone = fr['idx'], fr['gone']
    on = idx != BG
    lab_, n = ndimage.label(on, structure=SQ)
    if n > 1:
        sizes = ndimage.sum(on, lab_, range(1, n + 1))
        near = ndimage.binary_dilation(gone, SQ, iterations=3)
        for i in range(1, n + 1):
            if i != 1 + int(np.argmax(sizes)) and sizes[i - 1] < 40 and (near & (lab_ == i)).any():
                idx[lab_ == i] = BG


def fill_holes(fr):
    """Holes the pumpkin left inside him take the colour of what's around them."""
    idx, gone = fr['idx'], fr['gone']
    on = idx != BG
    holes = ndimage.binary_fill_holes(on) & ~on & ndimage.binary_dilation(gone, SQ)
    if holes.any():
        src = on & (idx != CH['k'])
        _, (iy, ix) = ndimage.distance_transform_edt(~src, return_indices=True)
        idx[holes] = idx[iy[holes], ix[holes]]


GROUPS = {c: g for g, cs in (('hat', 'nNyYT'), ('hair', 'hb'), ('skin', 'Ssq'), ('ink', 'k'), ('white', 'W'))
          for c in cs}
HEAD_STUFF = [CH[c] for c in 'nNyYThbSsqk']


def head_grid(outfit, face='normal'):
    head = HEADS[outfit]
    rows = head['rows'] + ['.' * head['face_x'] + r for r in FACES[face]]
    w = max(len(r) for r in rows)
    g = np.full((len(rows), w), BG)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.':
                g[y, x] = CH[ch]
    return g


def paste_head(fr):
    """Swap the frame's downsampled head for the drawn one, lined up where it matches best."""
    idx = fr['idx']
    hg = head_grid(fr['f']['outfit'], FACE_OF.get(fr['f']['name'], 'normal'))
    hh, hw = hg.shape
    grp = np.array([GROUPS.get(c, '-') for c in CHARS] + ['.'])
    on = idx != BG
    ys, xs = np.nonzero(on)
    top = ys.min()
    band = on & (np.arange(idx.shape[0])[:, None] < top + 14)
    cx = np.nonzero(band)[1].mean()
    H, W = idx.shape
    hy, hx = np.nonzero(hg != BG)
    hgrp = grp[hg[hy, hx]]
    best = None
    for dy in range(top - 6, top + 13):
        for dx in range(int(cx - hw / 2) - 8, int(cx - hw / 2) + 9):
            y2, x2 = hy + dy, hx + dx
            ok = (y2 >= 0) & (y2 < H) & (x2 >= 0) & (x2 < W)
            t = np.full(len(hy), BG)
            t[ok] = idx[y2[ok], x2[ok]]
            tg = grp[t]
            score = (tg == hgrp).sum() - 0.5 * ((t != BG) & (tg != hgrp)).sum() - 0.7 * (t == BG).sum()
            if best is None or score > best[0]:
                best = (score, dy, dx)
    _, dy, dx = best
    # clear his old head and draw the new one. Where his hands are up by his head (carrying
    # on it), only what's under the new head goes, so the hands stay.
    y0, y1 = max(dy - 5, 0), min(dy + hh, H)
    x0, x1 = max(dx - 3, 0), min(dx + hw + 3, W)
    region = idx[y0:y1, x0:x1]
    clear = np.isin(region, HEAD_STUFF)
    if fr['f']['name'] in TIGHT:
        mine = np.zeros(idx.shape, bool)
        for y, x in zip(hy, hx):
            if 0 <= y + dy < H and 0 <= x + dx < W:
                mine[y + dy, x + dx] = True
        clear &= ndimage.binary_dilation(mine, PLUS)[y0:y1, x0:x1] | np.isin(region, [CH[c] for c in 'nNyYhbk'])
    region[clear] = BG
    # bits of a tilted old cap or hat brim reach further out
    y0, x0, x1 = max(dy - 8, 0), max(dx - 10, 0), min(dx + hw + 10, W)
    y1 = min(dy + 12, H)
    region = idx[y0:y1, x0:x1]
    region[np.isin(region, [CH[c] for c in 'nNyYh'])] = BG
    crown = idx[y0:min(dy + 8, H), x0:x1]          # up by the crown, straw shadow is old hat too
    crown[np.isin(crown, [CH[c] for c in 'Tbk'])] = BG
    head = np.zeros(idx.shape, bool)
    for y, x in zip(hy, hx):
        if 0 <= y + dy < H and 0 <= x + dx < W:
            idx[y + dy, x + dx] = hg[y, x]
            head[y + dy, x + dx] = True
    fr['headmask'] = head
    # crumbs of the old head left floating
    on = idx != BG
    lab_, n = ndimage.label(on, structure=SQ)
    if n > 1:
        sizes = ndimage.sum(on, lab_, range(1, n + 1))
        for i in range(1, n + 1):
            piece = idx[lab_ == i]
            if i == 1 + int(np.argmax(sizes)) or (fr['f'].get('drops') and (piece == CH['A']).any()):
                continue
            if sizes[i - 1] < 12 or (piece == CH['k']).mean() > 0.6:    # specks, old outline arcs
                idx[lab_ == i] = BG


def paint_hands(fr):
    """Paint mitts where the pumpkin took his hands (or at the frame's HANDS spots); returns
    their mask."""
    f = fr['f']
    idx = fr['idx']
    H, W = idx.shape
    ramp = HAND_RAMP[f['outfit']]
    mask = np.zeros(idx.shape, bool)
    spots = HANDS.get((f['outfit'], f['name']))
    if spots is None and f.get('head') and fr.get('pbox'):
        b = fr['pbox']                      # on his head: a hand low on each side of it
        spots = [(b['left'] - 1, b['bottom'] - 4), (b['right'] - 2, b['bottom'] - 4)]
    spots = spots or []
    fr['hand_spots'] = spots
    for x0, y0 in spots:
        for j, row in enumerate(MITT):
            for i, ch in enumerate(row):
                y, x = y0 + j, x0 + i
                if 0 <= y < H and 0 <= x < W:
                    idx[y, x] = CH[ramp['LMD'.index(ch)]]
                    mask[y, x] = True
    return mask


def outline(idx, strip=True):
    """make_art.py's selective outline. His own dark edge comes off first (it's a pixel thick
    at most at this size, and patchy); then every empty pixel touching him takes the colour
    it touches, darkened toward INK. Returns an RGBA array (art px)."""
    idx = idx.copy()
    if strip:
        on = idx != BG
        edge = (idx == CH['k']) & ndimage.binary_dilation(~on, PLUS)
        # ...unless it's all there is (a dark pixel with nothing of him behind it)
        alone = ~ndimage.binary_dilation(on & ~edge, PLUS)
        idx[edge & ~alone] = BG
    H, W = idx.shape
    rgba = np.zeros((H, W, 4), np.uint8)
    on = idx != BG
    rgba[on, :3] = COLOUR[idx[on]]
    rgba[on, 3] = 255
    P = np.pad(idx, 1, constant_values=BG)
    ink = np.array(INK, float)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):        # make_art.py's order
        nb = P[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]
        put = (rgba[..., 3] == 0) & (nb != BG)
        col = COLOUR[np.where(nb == BG, 0, nb)].astype(float)
        mixed = np.round(col + (ink - col) * OUTLINE).astype(np.uint8)
        rgba[put, :3] = mixed[put]
        rgba[put, 3] = 255
    return rgba


# ── pixel stars for the dizzy frame ──────────────────────────────────────────
STAR = ['..o..', '.oyo.', 'oyYyo', '.oyo.', '..o..']


def stamp_star(rgba, x, y):
    cols = {'o': INK, 'y': (255, 214, 72), 'Y': (255, 248, 200)}
    for j, row in enumerate(STAR):
        for i, ch in enumerate(row):
            yy, xx = y + j, x + i
            if ch != '.' and 0 <= yy < rgba.shape[0] and 0 <= xx < rgba.shape[1]:
                rgba[yy, xx] = cols[ch] + (255,)


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    dump = sys.argv[sys.argv.index('--dump') + 1] if '--dump' in sys.argv else None
    sheets = {}
    for k, s in SHEETS.items():
        img = np.asarray(Image.open(os.path.join(SRC, s['file'])).convert('RGB'))
        sheets[k] = (img, background(img))

    # pass 1: cut, erase pumpkins, match colours, re-grid, clean
    frames = []
    for f in FRAMES:
        img, bg = sheets[f['sheet']]
        c, soft = cut(img, bg, f['box'], f.get('drops'))
        pk = None
        if f.get('hold'):
            soft, pk = erase_pumpkin(c, soft)
        lab_ = labels(c, soft, f['outfit'], f.get('drops'))
        idx, g = regrid(lab_, f.get('pitch', SHEETS[f['sheet']]['pitch']))
        idx = clean(idx, f.get('drops'))
        fr = dict(f=f, idx=idx)
        if pk:
            fr['gone'] = (g.share(pk['erased']) > 0.4) & (idx == BG)
            fr['body'] = g.share(pk['body']) > 0.3
        frames.append(fr)
        print('cut', f['outfit'], f['name'], idx.shape)

    # pass 2: repair where the pumpkins were, hands, face fixes
    for fr in frames:
        f = fr['f']
        if 'gone' in fr:
            if f.get('head'):
                paste_head(fr)        # the cap or hat top was under the pumpkin
            fill_holes(fr)
            drop_loose(fr)
            b = fr['body']
            if b.any() and f['hold'] in ('bottom', 'center'):
                ys, xs = np.nonzero(b)
                fr['pbox'] = dict(top=ys.min(), bottom=ys.max() + 1, left=xs.min(), right=xs.max() + 1)
        if not f.get('head'):
            paste_head(fr)
        for x, y, ch in FACE_FIX.get((f['outfit'], f['name']), []):
            fr['idx'][y, x] = BG if ch == '.' else CH[ch]
        fr['hands'] = paint_hands(fr)
        if dump:
            os.makedirs(dump, exist_ok=True)
            np.savez(os.path.join(dump, f"{f['outfit']}_{f['name']}.npz"), idx=fr['idx'],
                     gone=fr.get('gone', np.zeros(fr['idx'].shape, bool)))

    # anchors: feet at the bottom of the biggest piece, body centre at the overalls
    for fr in frames:
        idx = fr['idx']
        on = idx != BG
        lab_, n = ndimage.label(on, structure=SQ)
        sizes = ndimage.sum(on, lab_, range(1, n + 1))
        ys, xs = np.nonzero(lab_ == (1 + int(np.argmax(sizes))))
        fr['ay'] = ys.max() + 1
        denim = np.isin(idx, [CH['e'], CH['d'], CH['D']])
        dy, dx = np.nonzero(denim)
        fr['ax'] = (dx.mean() + 0.5 if len(dx) else xs.mean() + 0.5) + NUDGE.get((fr['f']['outfit'], fr['f']['name']), 0)

    # derived: dizzy (standing frame + stars over his head)
    for outfit in ('everyday', 'farmer'):
        base = next(fr for fr in frames if fr['f']['outfit'] == outfit and fr['f']['name'] == DIZZY_FROM)
        frames.append(dict(base, f=dict(base['f'], name='dizzy', hold=None), pbox=None,
                           hands=np.zeros(base['idx'].shape, bool), stars=True))

    # outline, and one canvas for every frame with the anchor (feet, body centre) at the same spot
    for fr in frames:
        fr['rgba'] = outline(np.pad(fr['idx'], 1, constant_values=BG))
        fr['ax'] += 1
        fr['ay'] += 1
        h = np.pad(fr['hands'], 1)
        if h.any() and fr['f'].get('hold') in ('bottom', 'center'):
            # his hands alone, outlined all round: drawn by the game over its own pumpkin
            hidx = np.where(h, np.pad(fr['idx'], 1, constant_values=BG), BG)
            fr['front'] = outline(hidx, strip=False)
    ext = [0, 0, 0, 0]  # left, right, up, down (art px from the anchor)
    for fr in frames:
        ys, xs = np.nonzero(fr['rgba'][..., 3])
        ext[0] = max(ext[0], fr['ax'] - xs.min())
        ext[1] = max(ext[1], xs.max() + 1 - fr['ax'])
        ext[2] = max(ext[2], fr['ay'] - ys.min() + (7 if fr.get('stars') else 0))
        ext[3] = max(ext[3], ys.max() + 1 - fr['ay'])
    half = int(np.ceil(max(ext[0], ext[1]))) + 1
    up, down = int(np.ceil(ext[2])) + 1, int(np.ceil(ext[3])) + 1
    CW, CHH, FX, FY = 2 * half, up + down, half, up

    meta = {'scale': SCALE, 'w': CW * SCALE, 'h': CHH * SCALE, 'footX': FX * SCALE, 'footY': FY * SCALE,
            'frames': {}}
    for outfit in ('everyday', 'farmer'):
        os.makedirs(os.path.join(OUT, outfit), exist_ok=True)
    written = []
    for fr in frames:
        f = fr['f']
        ox, oy = int(round(FX - fr['ax'])), int(FY - fr['ay'])

        def place(rgba):
            canvas = np.zeros((CHH, CW, 4), np.uint8)
            ys, xs = np.nonzero(rgba[..., 3])
            canvas[ys + oy, xs + ox] = rgba[ys, xs]
            return canvas

        body = place(fr['rgba'])
        if fr.get('stars'):
            top = int(np.nonzero(body[..., 3])[0].min())
            for sx, sy in ((-11, 0), (-3, -5), (6, -2)):
                stamp_star(body, FX + sx, top + sy)
        key = f"{f['outfit']}/{f['name']}"
        info = {'top': int(FY - np.nonzero(body[..., 3])[0].min()) * SCALE}
        save(body, os.path.join(OUT, f['outfit'], f['name'] + '.png'))
        written.append((key, body))
        if fr.get('pbox'):
            b = fr['pbox']
            px = (b['left'] + b['right']) / 2 + 1 + ox - FX
            py = FY - (b['bottom'] + 1 + oy) if f['hold'] == 'bottom' else FY - ((b['top'] + b['bottom']) / 2 + 1 + oy)
            info['hold'] = {'x': round(float(px) * SCALE, 1), 'y': round(float(py) * SCALE, 1),
                            'w': int(b['right'] - b['left']) * SCALE, 'h': int(b['bottom'] - b['top']) * SCALE,
                            'anchor': f['hold']}
        if fr.get('front') is not None:
            front = place(fr['front'])
            save(front, os.path.join(OUT, f['outfit'], f['name'] + '_front.png'))
            written.append((key + '_front', front))
            info['front'] = True
            # mitt centres, game px from his feet (x forward, y up); the +1 is the outline's padding
            info['hands'] = [[round(float(x + 1 + 1.5 + ox - FX) * SCALE, 1), round(float(FY - (y + 1 + 1 + oy)) * SCALE, 1)]
                             for x, y in fr.get('hand_spots', [])]
        meta['frames'][key] = info
    meta = json.loads(json.dumps(meta, default=int))
    with open(os.path.join(OUT, 'frames.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
        fh.write('\n')
    print('canvas', CW * SCALE, 'x', CHH * SCALE, 'feet at', FX * SCALE, FY * SCALE, '| images', len(written))
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
