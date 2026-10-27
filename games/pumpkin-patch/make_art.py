"""Pixel-art generator for Ansel's Pumpkin Patch.

Every sprite is drawn as a real low-resolution pixel grid (one "art pixel" per
array cell), given a dark selective outline and stepped shading to match the
chunky style of the Ansel sprites, then upscaled 4x with nearest-neighbour so
the pixels stay crisp.

Run:  python3 games/pumpkin-patch/make_art.py   (needs Pillow)
Writes PNGs into games/pumpkin-patch/art/.
"""
import math
import zlib
import os
import random

from PIL import Image

S = 4  # game pixels per art pixel
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "art")
os.makedirs(OUT, exist_ok=True)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
INK = (43, 24, 16)  # Ansel-style dark brown outline


def hx(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3)) + (255,)


def bayer(x, y):
    return (BAYER[y % 4][x % 4] + 0.5) / 16.0


def save(img, name, scale=S):
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(os.path.join(OUT, name))
    print("wrote", name, img.size)


def outline(img, strength=0.62, diag=False):
    """Selective outline: each new edge pixel is a darkened version of the
    sprite colour it touches, pulled toward the shared ink colour."""
    w, h = img.size
    src = img.load()
    out = img.copy()
    o = out.load()
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diag:
        nb += [(1, 1), (-1, -1), (1, -1), (-1, 1)]
    for y in range(h):
        for x in range(w):
            if src[x, y][3] != 0:
                continue
            for dx, dy in nb:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] > 0:
                    c = src[nx, ny]
                    o[x, y] = mix(c, INK + (255,), strength)
                    break
    return out


def from_rows(rows, colours):
    h = len(rows)
    w = max(len(r) for r in rows)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colours:
                p[x, y] = colours[ch]
    return img


# ─────────────────────────────────────────────────────────────── pumpkins ──
PUMPKIN_PALETTES = {
    # dark2, dark1, base, light, highlight
    "orange": ["#7a2e0e", "#b8480f", "#e4701a", "#f79a3a", "#ffd08a"],
    "deep":   ["#6a250b", "#a03a0b", "#cf5612", "#ec822a", "#ffbf75"],
    "white":  ["#7f7a70", "#ada79a", "#ddd6c6", "#f3eee2", "#ffffff"],
    "green":  ["#1f3a1a", "#335a26", "#4c7a38", "#6f9c4c", "#acd07d"],
    "gold":   ["#7c4d0c", "#bb7712", "#e9a128", "#fac255", "#fff0a6"],
    "golden": ["#8a5f08", "#c99212", "#f2c230", "#ffe066", "#fffbe0"],
    "unripe": ["#2a4a1c", "#3f6a26", "#5f8f34", "#86b24a", "#c2dc8a"],
}
STEM = ["#3d3214", "#5f4f20", "#86733a"]


def pumpkin(w, h, pal, lobes=5, seed=1, stripes=False, warts=False, curl=True):
    rnd = random.Random(seed)
    pal = [hx(c) for c in PUMPKIN_PALETTES[pal]]
    top, pad = 6, 2
    W, H = w + pad * 2, h + top + pad
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    p = img.load()
    cx, cy = (W - 1) / 2, top + (h - 1) / 2
    a, b = w / 2, h / 2
    L = (-0.55, -0.62, 0.56)
    for y in range(H):
        for x in range(W):
            nx, ny = (x - cx) / a, (y - cy) / b
            u = (nx + 1) / 2 * lobes
            frac = u - math.floor(u)
            bulge = math.sin(math.pi * frac)
            r = abs(nx) ** 2.4 + abs(ny) ** 2.2
            limit = 1.0
            if abs(ny) > 0.55:
                limit -= 0.10 * (1 - bulge)
            if ny < 0:
                limit -= 0.22 * math.exp(-(nx / 0.22) ** 2) * (-ny) ** 2
            if r > limit:
                continue
            nz = math.sqrt(max(0.0, 1 - min(1, nx * nx * 0.8 + ny * ny * 0.9)))
            lam = L[0] * nx + L[1] * ny + L[2] * nz
            lam -= 0.42 * (1 - bulge) ** 2.2
            lam += (bayer(x, y) - 0.5) * 0.16
            if lam < -0.12:
                t = 0
            elif lam < 0.18:
                t = 1
            elif lam < 0.52:
                t = 2
            elif lam < 0.78:
                t = 3
            else:
                t = 4
            c = pal[t]
            if stripes and bulge > 0.78 and t >= 1:
                c = mix(c, hx("#e6dca6"), 0.55)
            p[x, y] = c
    if warts:
        for _ in range(int(w * h / 26)):
            x, y = rnd.randrange(W), rnd.randrange(H)
            if p[x, y][3] and rnd.random() < 0.9:
                p[x, y] = pal[4] if rnd.random() < 0.5 else pal[3]
    # stem
    sw = max(2, round(w / 9))
    sx = int(cx - sw / 2 + 1)
    for i in range(top + 2):
        y = top + 1 - i
        lean = 1 if i > top * 0.55 else 0
        for k in range(sw):
            col = hx(STEM[2]) if k == 0 else hx(STEM[1])
            if i == top + 1:
                col = hx(STEM[0])
            if 0 <= y < H:
                p[sx + k + lean, y] = col
    if curl:
        # curly green tendril beside the stem
        gx = sx + sw + 1
        for (dx, dy) in [(0, 3), (1, 2), (2, 2), (3, 3), (3, 4), (2, 5)]:
            x, y = gx + dx, top - 3 + dy
            if 0 <= x < W and 0 <= y < H and p[x, y][3] == 0:
                p[x, y] = hx("#5c8c32")
    return outline(img, 0.6)


PUMPKINS = [
    # name, w, h, palette, lobes, extras
    ("pumpkin_orange_m", 20, 15, "orange", 5, {}),
    ("pumpkin_orange_l", 26, 18, "orange", 6, {}),
    ("pumpkin_deep_xl", 32, 21, "deep", 7, {}),
    ("pumpkin_white_m", 19, 14, "white", 5, {}),
    ("pumpkin_green_m", 18, 15, "green", 5, {"stripes": True}),
    ("pumpkin_warty_s", 15, 12, "green", 4, {"warts": True}),
    ("pumpkin_gold_s", 14, 11, "gold", 4, {}),
    ("pumpkin_orange_s", 15, 11, "orange", 4, {}),
]

# ─────────────────────────────────────────────────────────────── leaves ──
LEAF_COLS = {
    "red":    ["#7d1f16", "#b8382a", "#e0573d"],
    "orange": ["#8a3c0c", "#d0621a", "#f28c32"],
    "yellow": ["#8c6510", "#d9a428", "#f6d360"],
    "brown":  ["#4f2f16", "#7d4f26", "#a5703c"],
}
MAPLE = [
    "...a...",
    ".a.aa.a",
    ".abbbb.",
    "abbcbbb",
    ".abbbb.",
    "..abb..",
    "...s...",
]
OVAL = [
    "..aa.",
    ".abba",
    "abcb.",
    "abb..",
    "s....",
]


def leaf(shape, col):
    c = LEAF_COLS[col]
    img = from_rows(shape, {"a": hx(c[0]), "b": hx(c[1]), "c": hx(c[2]), "s": hx(c[0])})
    return img


def leaf_pile(w, h, seed):
    rnd = random.Random(seed)
    pad = 2
    W, H = w + pad * 2, h + pad + 3
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    p = img.load()
    cols = [LEAF_COLS[k] for k in ("red", "orange", "yellow", "orange", "red", "brown")]
    base = H - 2
    # mound silhouette with a bumpy top
    heights = []
    for x in range(W):
        nx = (x - (W - 1) / 2) / (w / 2)
        hh = h * max(0.0, 1 - nx * nx) ** 0.7
        hh += rnd.choice([0, 0, 1, -1]) if hh > 1 else 0
        heights.append(hh)
    # paint in 2x2 leaf clumps
    for by in range(0, H, 2):
        for bx in range(0, W, 2):
            c = rnd.choice(cols)
            for dy in range(2):
                for dx in range(2):
                    x, y = bx + dx, by + dy
                    if x >= W or y >= H:
                        continue
                    if base - y < heights[x] and y <= base:
                        depth = (base - y) / max(1, heights[x])
                        shade = 2 if (dx + dy == 0 and depth > 0.4) else (1 if depth > 0.25 else 0)
                        if rnd.random() < 0.12:
                            shade = max(0, shade - 1)
                        p[x, y] = hx(c[shade])
    # loose leaves poking out of the top
    for _ in range(max(3, w // 6)):
        x = rnd.randrange(3, W - 3)
        top = int(base - heights[x])
        c = rnd.choice(cols)
        for (dx, dy, s) in [(0, -1, 1), (1, -1, 2), (0, -2, 2), (-1, 0, 1)]:
            xx, yy = x + dx, top + dy
            if 0 <= xx < W and 0 <= yy < H:
                p[xx, yy] = hx(c[s])
    return outline(img, 0.6)


# ──────────────────────────────────────────────────────────── props ──
def hay_bale(w=40, h=22):
    rnd = random.Random(7)
    img = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    p = img.load()
    straw = [hx("#8a6a1e"), hx("#b8902e"), hx("#dcb44a"), hx("#f0d27a")]
    topface = 6
    streak = [rnd.choice([1, 2, 2, 3]) for _ in range(w)]
    for y in range(1, h + 1):
        for x in range(1, w + 1):
            # rounded corners
            if (x in (1, w) and y in (1, h)):
                continue
            if y <= topface:
                t = 3 if (x + y * 3 + rnd.randrange(3)) % 5 else 2
            else:
                t = streak[x - 1]
                if rnd.random() < 0.18:
                    t = max(0, t - 1)
                if y > h - 3:
                    t = max(0, t - 1)
            if y == topface + 1:
                t = 1
            p[x, y] = straw[t]
    # twine bands
    for bx in (int(w * 0.28), int(w * 0.72)):
        for y in range(1, h + 1):
            if p[bx, y][3]:
                p[bx, y] = hx("#6e3b1c")
                if y > topface:
                    p[bx + 1, y] = hx("#9a5a2a")
    return outline(img, 0.6)


def plank(w=46, h=6, seed=3):
    """Wooden board. Not used by Pumpkin Patch; kept for a future lumber/building minigame."""
    rnd = random.Random(seed)
    img = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    p = img.load()
    wood = [hx("#6e4322"), hx("#94602f"), hx("#b97f45"), hx("#d6a066")]
    grain_rows = {y: rnd.random() for y in range(1, h + 1)}
    for y in range(1, h + 1):
        for x in range(1, w + 1):
            t = 2
            if y == 1:
                t = 3
            elif y == h:
                t = 1
            elif math.sin(x * 0.35 + grain_rows[y] * 6) > 0.86:
                t = 1
            if x in (1, w):
                t = 1
            p[x, y] = wood[t]
    # knot
    kx = rnd.randrange(10, w - 10)
    for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1)]:
        p[kx + dx, 2 + dy] = wood[0]
    # nail heads
    for nx in (3, w - 2):
        p[nx, 3] = hx("#8c8f96")
        p[nx, 2] = hx("#c7cbd2")
    return outline(img, 0.6)


def bubble():
    """9-slice speech bubble body (white, rounded, pixel outline)."""
    rows = [
        "..kkkkkkkkkkkk..",
        ".kwwwwwwwwwwwwk.",
        "kwwwwwwwwwwwwwwk",
        "kwwwwwwwwwwwwwwk",
        "kwwwwwwwwwwwwwwk",
        "kwwwwwwwwwwwwwwk",
        "kwwwwwwwwwwwwwwk",
        "kwwwwwwwwwwwwwwk",
        "kwwwwwwwwwwwwwwk",
        "kssssssssssssssk",
        ".kssssssssssssk.",
        "..kkkkkkkkkkkk..",
    ]
    return from_rows(rows, {"k": INK + (255,), "w": hx("#fffaf0"), "s": hx("#e8dccb")})


def bubble_tail():
    rows = [
        "kssssk",
        ".kssk.",
        ".ksk..",
        "..k...",
    ]
    return from_rows(rows, {"k": INK + (255,), "s": hx("#e8dccb")})


def wood_panel():
    """9-slice wooden sign for the HUD."""
    rnd = random.Random(11)
    w, h = 18, 16
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p = img.load()
    wood = [hx("#5e381b"), hx("#8a5a2c"), hx("#ad7640"), hx("#c99456")]
    for y in range(h):
        for x in range(w):
            if (x in (0, w - 1) and y in (0, h - 1)):
                continue
            if x in (0, w - 1) or y in (0, h - 1):
                p[x, y] = INK + (255,)
                continue
            t = 2
            if y in (1,):
                t = 3
            if y == h - 2 or x == w - 2:
                t = 1
            if y == 8:
                t = 1
            if t == 2 and rnd.random() < 0.08:
                t = 1
            p[x, y] = wood[t]
    for (x, y) in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]:
        p[x, y] = hx("#c7cbd2")
    return img


# ─────────────────────────────────────────────────────────── background ──
SILO_X0, SILO_X1, SILO_TOP = 170, 197, 398   # art px; the pumpkin sits on SILO_TOP

MINI_FONT = {
    "A": [".#.", "#.#", "###", "#.#", "#.#"],
    "N": ["#..#", "##.#", "#.##", "#..#", "#..#"],
    "S": ["###", "#..", "###", "..#", "###"],
    "E": ["###", "#..", "##.", "#..", "###"],
    "L": ["#..", "#..", "#..", "#..", "###"],
    "'": ["#", "#", ".", ".", "."],
}


def draw_text(px, text, x, y, col):
    """Tiny 5-px-tall pixel font for signs."""
    for ch in text:
        g = MINI_FONT[ch]
        for gy, row in enumerate(g):
            for gx, c in enumerate(row):
                if c == "#":
                    px[x + gx, y + gy] = col
        x += len(g[0]) + 1


def silo_pumpkin(wink=False):
    """Big grinning jack-o'-lantern for the top of the silo (2 frames: smile, wink)."""
    img = pumpkin(40, 27, "orange", 8, seed=77, curl=True)
    p = img.load()
    W, H = img.size
    cx, cy = W // 2, 6 + 2 + 27 // 2       # body centre (pumpkin(): top pad 6, outline pad)
    dark, deep, glint = hx("#3a1a0c"), hx("#24100a"), hx("#fff3c4")
    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H and p[x, y][3]:
            p[x, y] = c
    # eyes: tall ovals with a glint (the left one winks)
    for ex in (cx - 8, cx + 7):
        if wink and ex < cx:
            for dx in range(-2, 3):
                put(ex + dx, cy - 3 + (1 if abs(dx) == 2 else 0), deep)
            continue
        for dy in range(-3, 3):
            for dx in range(-2, 2):
                if (dx + 0.5) ** 2 / 4 + (dy + 0.5) ** 2 / 9 <= 1:
                    put(ex + dx, cy - 2 + dy, dark)
        put(ex - 1, cy - 4, glint)
    # nose
    for dy in range(3):
        for dx in range(-dy, dy + 1):
            put(cx + dx, cy + 1 + dy, dark)
    # wide smile with two front teeth
    for dx in range(-11, 12):
        y = cy + 6 + round((dx / 11) ** 2 * -3)
        put(cx + dx, y, deep)
        if abs(dx) < 10:
            put(cx + dx, y + 1, dark)
    for tx in (cx - 2, cx + 1):
        put(tx, cy + 6, hx("#f6efe0"))
        put(tx + 1, cy + 6, hx("#f6efe0"))
        put(tx, cy + 7, hx("#e2d6bd"))
        put(tx + 1, cy + 7, hx("#e2d6bd"))
    return img


def giraffe_frame(phase):
    """One frame of a pixel giraffe walking right (pacing gait: same-side legs together)."""
    rnd = random.Random(31)
    Wd, Hd = 56, 88
    img = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
    p = img.load()
    base, line, patch, patch_d, belly = hx("#f2c662"), hx("#f6dc98"), hx("#b9692a"), hx("#94511d"), hx("#f4dfaa")
    leg_lo, hoof = hx("#efdcaa"), hx("#4a2c18")
    foot_y = Hd - 4
    bob = round(math.sin(phase * 2) * 0.6)
    # seeds for the patch pattern
    # big blocky patches on a jittered grid, separated by thin light lines
    seeds = []
    for gy in range(0, Hd + 6, 6):
        for gx in range(-3, Wd + 6, 6):
            seeds.append((gx + (3 if (gy // 6) % 2 else 0) + rnd.uniform(-1.4, 1.4), gy + rnd.uniform(-1.4, 1.4)))
    def patchy(x, y):
        ds = sorted((x - sx) ** 2 + (y - sy) ** 2 for sx, sy in seeds)
        return math.sqrt(ds[1]) - math.sqrt(ds[0]) > 1.0
    mask = {}
    def disc(cx, cy, r, kind):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r and 0 <= x < Wd and 0 <= y < Hd:
                    mask[(x, y)] = kind
    # legs (far pair first, darker), pacing: near legs phase, far legs phase + pi
    hip_y = 60 + bob
    for far, ph in ((True, phase + math.pi), (False, phase)):
        for hx_ in (13, 30):
            hipx = hx_ + (2 if far else 0)
            swing = math.sin(ph) * 4.5
            lift = max(0.0, math.cos(ph)) * 2.2  # the swinging foot comes off the ground
            footx = hipx + swing
            kneex = hipx + swing * 0.55 + (1 if hx_ > 20 else -1)
            for t in range(0, 101):
                tt = t / 100
                if tt < 0.45:
                    x = hipx + (kneex - hipx) * tt / 0.45; y = hip_y + (72 - lift - hip_y) * tt / 0.45
                else:
                    k = (tt - 0.45) / 0.55
                    x = kneex + (footx - kneex) * k; y = 72 - lift + (foot_y - lift - 72 + lift) * k
                for w in range(2):
                    xx, yy = int(round(x)) + w, int(round(y))
                    if 0 <= xx < Wd and 0 <= yy < Hd:
                        mask[(xx, yy)] = "farleg" if far else "leg"
            for w in range(2):
                fx = int(round(footx)) + w
                mask[(fx, int(round(foot_y - lift)))] = "hoof"
                mask[(fx, int(round(foot_y - lift)) - 1)] = "hoof"
    # body: sloping back, higher at the shoulders
    for x in range(8, 36):
        top = 50 - (x - 8) * 0.18 + bob
        for y in range(int(top), int(62 + bob)):
            mask[(x, y)] = "belly" if y > 59 + bob else "body"
    disc(10, 56 + bob, 5, "body")
    disc(33, 53 + bob, 6, "body")
    # tail
    for k in range(10):
        mask[(7 - k // 4, 54 + k + bob)] = "tail"
    mask[(4, 64 + bob)] = mask[(5, 64 + bob)] = mask[(4, 65 + bob)] = "tuft"
    # neck up and forward, head bobbing a little with the stride
    hb = round(math.sin(phase) * 1)
    for i in range(0, 41):
        t = i / 40
        cx = 33 + 12 * t
        cy = 52 + bob - 42 * t + hb * t
        disc(cx, cy, 3.4 - 1.2 * t, "neck")
    hx0, hy0 = 47, 11 + bob + hb
    for y in range(hy0 - 3, hy0 + 3):
        for x in range(hx0 - 3, hx0 + 7):
            if ((x - hx0 - 1.5) / 5.2) ** 2 + ((y - hy0) / 3) ** 2 <= 1:
                mask[(x, y)] = "head"
    for ox in (hx0 - 1, hx0 + 1):          # ossicones
        mask[(ox, hy0 - 4)] = "neck"; mask[(ox, hy0 - 5)] = "neck"; mask[(ox, hy0 - 6)] = "tuft"
    mask[(hx0 - 4, hy0 - 2)] = "head"; mask[(hx0 - 5, hy0 - 2)] = "head"  # ear
    # paint
    for (x, y), kind in mask.items():
        if kind in ("body", "neck"):
            c = patch if patchy(x, y) else line
            if c == patch and (y > 56 + bob or x > 34):
                c = patch_d
        elif kind == "belly":
            c = belly
        elif kind == "head":
            c = base
        elif kind == "leg":
            c = (patch if patchy(x, y) else line) if y < 68 + bob else leg_lo
        elif kind == "farleg":
            c = mix((patch if patchy(x, y) else line) if y < 68 + bob else leg_lo, INK + (255,), 0.25)
        elif kind == "hoof":
            c = hoof
        elif kind == "tail":
            c = patch_d
        else:
            c = hx("#5a3418")
        p[x, y] = c
    # mane along the back of the neck, eye, nostril
    for i in range(0, 34):
        t = i / 40
        x = int(round(33 + 12 * t - (3.4 - 1.2 * t))); y = int(round(52 + bob - 42 * t + hb * t))
        if 0 <= x < Wd and (x, y) in mask:
            p[x, y] = hx("#8a4a1c")
    p[hx0 + 1, hy0 - 1] = INK + (255,)
    p[hx0 + 6, hy0 + 1] = hx("#8a5a2c")
    return outline(img, 0.65)


def background(W=480, H=540, seed=5):
    rnd = random.Random(seed)
    img = Image.new("RGBA", (W, H), hx("#000000"))
    p = img.load()
    GROUND = 520  # art y of the play surface (game y = 2080)

    # sky bands, dithered together
    bands = [
        (0, "#1f2148"), (70, "#262c5c"), (130, "#2f3d74"), (185, "#3d5592"),
        (235, "#5277b4"), (280, "#6f9bd0"), (318, "#94bde2"), (350, "#bcd5e6"),
        (372, "#f2d8b4"), (395, "#f6c89a"),
    ]
    for y in range(H):
        for x in range(W):
            # find band
            for i in range(len(bands) - 1):
                if bands[i][0] <= y < bands[i + 1][0]:
                    y0, c0 = bands[i]
                    y1, c1 = bands[i + 1]
                    break
            else:
                y0, c0 = bands[-1]
                y1, c1 = y0 + 1, c0
            t = (y - y0) / max(1, (y1 - y0))
            # dither only in the last third of each band
            tt = max(0.0, (t - 0.62) / 0.38)
            p[x, y] = hx(c1) if tt > bayer(x, y) else hx(c0)

    # stars
    for _ in range(140):
        x, y = rnd.randrange(W), rnd.randrange(0, 190)
        c = hx("#fff6d8") if rnd.random() < 0.6 else hx("#a9b8ff")
        if y > 150 and rnd.random() < 0.6:
            continue
        p[x, y] = c
        if rnd.random() < 0.12:
            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                if 0 <= x + dx < W and 0 <= y + dy < H:
                    p[x + dx, y + dy] = mix(c, hx("#3d4a8a"), 0.45)

    def disc(cx, cy, r, col_fn):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if 0 <= x < W and 0 <= y < H:
                    d = math.hypot(x - cx, y - cy)
                    if d <= r:
                        c = col_fn(x, y, d)
                        if c:
                            p[x, y] = c

    # moon (top of the world)
    def moon(x, y, d):
        n = ((x - 352) * -0.6 + (y - 40) * -0.6) / 16
        base = hx("#f4ecc8") if n + (bayer(x, y) - 0.5) * 0.3 > -0.35 else hx("#d5c99a")
        return base
    disc(360, 48, 16, moon)
    for cx, cy, r in [(354, 44, 3), (366, 56, 2.2), (364, 40, 1.5), (352, 56, 1.6)]:
        disc(cx, cy, r, lambda x, y, d: hx("#cbbd8a"))

    # low sun
    disc(410, 360, 22, lambda x, y, d: hx("#fbe6ad") if d < 17 else hx("#f6d494"))

    # clouds
    def cloud(cx, cy, scale):
        puffs = [(-14, 2, 7), (-6, -3, 9), (4, -5, 10), (13, -1, 8), (20, 3, 6), (-2, 3, 8), (10, 4, 7)]
        cells = {}
        for dx, dy, r in puffs:
            r *= scale
            for y in range(int(cy + dy * scale - r), int(cy + dy * scale + r + 1)):
                for x in range(int(cx + dx * scale - r), int(cx + dx * scale + r + 1)):
                    if math.hypot(x - (cx + dx * scale), (y - (cy + dy * scale)) * 1.25) <= r:
                        cells[(x, y)] = True
        bottom = max(y for _, y in cells)
        flat = bottom - int(3 * scale)
        for (x, y) in cells:
            if not (0 <= x < W and 0 <= y < H) or y > flat + 2:
                continue
            up_ = (x, y - 1) not in cells
            down = (x, y + 2) not in cells or y > flat - 1
            c = hx("#ffffff") if up_ else (hx("#c9d8f0") if down else hx("#eef3fb"))
            if not up_ and not down and bayer(x, y) < 0.2 and y > cy:
                c = hx("#dbe5f5")
            p[x, y] = c

    for cx, cy, sc in [(60, 250, 1.0), (210, 205, 1.25), (330, 290, 0.9), (440, 225, 1.1),
                       (120, 320, 0.75), (270, 330, 0.7), (40, 150, 0.9), (400, 140, 0.8), (180, 110, 0.7)]:
        cloud(cx, cy, sc)

    # far hills
    for x in range(W):
        hgt = 382 + 10 * math.sin(x * 0.021 + 1.3) + 5 * math.sin(x * 0.067)
        for y in range(int(hgt), 430):
            c = hx("#8e8fbd") if y < hgt + 3 else hx("#7d7fb0")
            if y > hgt + 3 and bayer(x, y) < 0.15:
                c = hx("#8e8fbd")
            p[x, y] = c
    # golden mid fields
    for x in range(W):
        hgt = 404 + 6 * math.sin(x * 0.03 + 0.4) + 3 * math.sin(x * 0.11)
        for y in range(int(hgt), 440):
            band = (y - int(hgt)) // 3 % 2
            c = hx("#d2ae55") if band == 0 else hx("#bf9944")
            if y == int(hgt):
                c = hx("#e7c973")
            p[x, y] = c

    # tree line
    tree_cols = [
        ["#6e1c14", "#a8301f", "#d24a2e", "#ef7a4a"],   # red maple
        ["#7a360b", "#bf5a16", "#e8842a", "#f9b056"],   # orange
        ["#7d5a0e", "#c08e1c", "#e9bb3a", "#fbe07a"],   # yellow
        ["#33421a", "#4f6424", "#6f8434", "#93a64c"],   # olive green
    ]
    trees = []
    x = -6
    while x < W + 10:
        trees.append((x, rnd.choice([0, 0, 1, 1, 2, 2, 3]), rnd.uniform(0.8, 1.25)))
        x += rnd.randint(13, 22)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lp = layer.load()
    for tx, ci, sc in trees:
        cols = [hx(c) for c in tree_cols[ci]]
        base_y = 446
        # trunk
        for y in range(base_y - 16, base_y):
            for k in range(-1, 2):
                if 0 <= tx + k < W:
                    lp[tx + k, y] = hx("#4a2c18") if k < 1 else hx("#33200f")
        puffs = [(0, -26, 10), (-8, -20, 8), (8, -20, 8), (-4, -32, 7), (5, -31, 7), (0, -16, 7)]
        for dx, dy, r in puffs:
            r *= sc
            cx, cy = tx + dx * sc, base_y + dy * sc
            for y in range(int(cy - r), int(cy + r + 1)):
                for xx in range(int(cx - r), int(cx + r + 1)):
                    if 0 <= xx < W and 0 <= y < H:
                        d = math.hypot(xx - cx, y - cy)
                        if d <= r:
                            n = ((xx - cx) * -0.6 + (y - cy) * -0.75) / r
                            n += (bayer(xx, y) - 0.5) * 0.5
                            t = 3 if n > 0.55 else (2 if n > -0.05 else (1 if n > -0.55 else 0))
                            lp[xx, y] = cols[t]
    layer = outline(layer, 0.55)
    img.alpha_composite(layer)
    p = img.load()

    # silo beside the barn (its jack-o'-lantern top is a separate sprite so it can wink)
    silo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sp_ = silo.load()
    sx0, sx1, sy0, sy1 = SILO_X0, SILO_X1, SILO_TOP, 458
    conc = [hx("#7a7360"), hx("#958d78"), hx("#b3ab95"), hx("#cdc6b1"), hx("#ddd7c4")]
    for y in range(sy0, sy1):
        for x in range(sx0, sx1 + 1):
            u = (x - sx0) / (sx1 - sx0)          # 0 = left edge, 1 = right edge
            shade = 0.25 + 0.75 * math.sin(math.pi * min(1, u * 1.15))  # lit from the left
            t = 4 if shade > 0.93 else 3 if shade > 0.72 else 2 if shade > 0.45 else 1
            if (y - sy0) % 6 == 5:
                t = max(0, t - 1)                  # concrete stave rings
            if t >= 2 and bayer(x, y) < 0.06:
                t -= 1
            sp_[x, y] = conc[t]
    # sign band with ANSEL'S on it
    band_y = sy0 + 3
    for y in range(band_y, band_y + 7):
        for x in range(sx0, sx1 + 1):
            sp_[x, y] = hx("#f3eee2") if y not in (band_y, band_y + 6) else hx("#c9c1ad")
    draw_text(sp_, "ANSEL'S", sx0 + 1, band_y + 1, INK + (255,))
    silo = outline(silo, 0.6)
    img.alpha_composite(silo)
    p = img.load()

    # barn
    barn = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bp = barn.load()
    bx0, bx1, by_top, by_eave, by_base = 96, 166, 368, 392, 458
    mid = (bx0 + bx1) / 2
    red = [hx("#6e1b17"), hx("#9c2a22"), hx("#bf3a2c"), hx("#d85a44")]
    for y in range(by_top, by_base):
        for x in range(bx0 - 4, bx1 + 5):
            # gambrel-ish roof outline
            if y < by_eave:
                half = (bx1 - bx0) / 2 + 4
                frac = (y - by_top) / (by_eave - by_top)
                width = half * (0.35 + 0.65 * min(1, frac * 1.6)) if frac < 0.6 else half
                if abs(x - mid) > width:
                    continue
                c = hx("#4a3a36") if (y - by_top) % 3 else hx("#5d4b45")
                if abs(x - mid) > width - 1.5:
                    c = hx("#efe6d6")
                bp[x, y] = c
            else:
                if x < bx0 or x > bx1:
                    continue
                plank_t = 2 if (x - bx0) % 5 else 1
                if x > mid + 18:
                    plank_t -= 1
                bp[x, y] = red[max(0, plank_t)]
    # white trim, doors with X
    for y in range(by_eave, by_base):
        bp[bx0, y] = hx("#efe6d6")
        bp[bx1, y] = hx("#efe6d6")
    dx0, dx1, dy0 = int(mid - 14), int(mid + 14), 412
    door_bottom = 446  # the fence hides everything below this
    dm = int(mid)
    for y in range(dy0, door_bottom + 1):
        for x in range(dx0, dx1 + 1):
            edge = x in (dx0, dx1, dm) or y in (dy0, door_bottom)
            # each door leaf gets its own X brace, corner to corner
            xl, xr = (dx0, dm) if x <= dm else (dm, dx1)
            fx = (x - xl) / (xr - xl)
            fy = (y - dy0) / (door_bottom - dy0)
            tol = 0.75 / (xr - xl)
            diag = abs(fx - fy) <= tol + 0.02 or abs((1 - fx) - fy) <= tol + 0.02
            bp[x, y] = hx("#efe6d6") if (edge or diag) else red[1]
    # hayloft window
    for y in range(396, 406):
        for x in range(int(mid - 6), int(mid + 7)):
            border = y in (396, 405) or x in (int(mid - 6), int(mid + 6))
            bp[x, y] = hx("#efe6d6") if border else hx("#3a1d14")
    barn = outline(barn, 0.6)
    img.alpha_composite(barn)
    p = img.load()

    # field behind fence
    for y in range(440, 470):
        for x in range(W):
            row = (y - 440) // 4
            c = hx("#6b4428") if row % 2 == 0 else hx("#7b5131")
            if (y - 440) % 4 == 0:
                c = hx("#5a3820")
            p[x, y] = c
    # distant pumpkins + vines in that field
    for _ in range(70):
        x, y = rnd.randrange(2, W - 3), rnd.randrange(443, 468)
        for k in range(rnd.randint(3, 7)):
            xx = x + k
            yy = y + int(math.sin(k + x) * 1.2)
            if 0 <= xx < W:
                p[xx, yy] = hx("#4e7a2f") if k % 2 else hx("#6c9a3a")
        if rnd.random() < 0.55:
            pw = rnd.choice([3, 4, 4, 5])
            for dx in range(pw):
                for dy in range(2 if pw < 5 else 3):
                    if 0 <= x + dx < W:
                        p[x + dx, y - dy] = hx("#e4701a") if dy < 1 or dx == 0 else hx("#f79a3a")
            p[x + pw // 2, y - 2 - (1 if pw == 5 else 0)] = hx("#5f4f20")

    # fence
    fence = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fp = fence.load()
    for x in range(W):
        for y in (455, 456, 457, 463, 464, 465):
            fp[x, y] = hx("#b98a52") if y in (455, 463) else hx("#94683a")
    for x0 in range(4, W, 22):
        for y in range(448, 472):
            for k in range(3):
                if 0 <= x0 + k < W:
                    fp[x0 + k, y] = hx("#c99a60") if k == 0 else hx("#9a6c3c")
        fp[x0 + 1, 447] = hx("#c99a60")
    fence = outline(fence, 0.6)
    img.alpha_composite(fence)
    p = img.load()

    front_fence = fence

    # foreground patch: soil rows with vines, then the trodden play path
    for y in range(470, H):
        for x in range(W):
            if y < GROUND - 4:
                row = (y - 470) // 5
                c = hx("#5e3b22") if row % 2 == 0 else hx("#704830")
                if (y - 470) % 5 == 0:
                    c = hx("#4d2f1b")
            else:
                c = hx("#9a6b40") if y < GROUND + 3 else hx("#86592f")
                if bayer(x, y) < 0.08:
                    c = hx("#b07d4c")
                if y > GROUND + 9 and bayer(x + 1, y) < 0.25:
                    c = hx("#74491f")
            p[x, y] = c
    # vines with leaves across the soil rows
    for row_y in range(474, GROUND - 6, 5):
        x = rnd.randrange(-20, 0)
        while x < W:
            length = rnd.randint(18, 40)
            phase = rnd.random() * 6
            for k in range(length):
                xx = x + k
                yy = row_y + int(round(math.sin(k * 0.3 + phase) * 1.5))
                if 0 <= xx < W and 0 <= yy < GROUND - 4:
                    p[xx, yy] = hx("#3f6a27")
                if k % 7 == 3:
                    for dx, dy, c in [(0, -1, "#6c9a3a"), (1, -1, "#86b24a"), (0, -2, "#86b24a"),
                                      (-1, -1, "#4e7a2f"), (1, -2, "#a5c95a")]:
                        if 0 <= xx + dx < W and 0 <= yy + dy < H:
                            p[xx + dx, yy + dy] = hx(c)
            x += length + rnd.randint(4, 14)
    # grass tufts along the path edge
    for x in range(0, W, 1):
        if rnd.random() < 0.55:
            hgt = rnd.choice([1, 2, 2, 3])
            for k in range(hgt):
                p[x, GROUND - 4 - k] = hx("#86b24a") if k == hgt - 1 else hx("#5d8a34")
    # pebbles on the path
    for _ in range(90):
        x, y = rnd.randrange(W), rnd.randrange(GROUND + 2, H - 1)
        p[x, y] = hx("#c2a27a")
        if x + 1 < W:
            p[x + 1, y] = hx("#6e4a2a")
    # scattered fallen leaves on the path
    for _ in range(60):
        x, y = rnd.randrange(W - 2), rnd.randrange(GROUND - 2, H - 1)
        c = LEAF_COLS[rnd.choice(["red", "orange", "yellow", "brown"])]
        p[x, y] = hx(c[1])
        p[x + 1, y] = hx(c[2])
    # front layer: the fence plus the foreground patch, drawn in front of the giraffe
    front = front_fence.copy()
    front.paste(img.crop((0, 470, W, H)), (0, 470))
    return img, front


def leaves_sheet():
    """All leaf sprites in one strip of 7x7 cells (for particle emitters)."""
    sheet = Image.new("RGBA", (7 * 8, 7), (0, 0, 0, 0))
    i = 0
    for col in ("red", "orange", "yellow", "brown"):
        for shape in (MAPLE, OVAL):
            lf = leaf(shape, col)
            ox = i * 7 + (7 - lf.width) // 2
            oy = (7 - lf.height) // 2
            sheet.alpha_composite(lf, (ox, oy))
            i += 1
    return sheet


def arrow():
    rows = [
        "..kkkkk..",
        "..kwwwk..",
        "..kwwwk..",
        "..kwwwk..",
        "kkkwwwkkk",
        ".kwwwwwk.",
        "..kwwwk..",
        "...kwk...",
        "....k....",
    ]
    return from_rows(rows, {"k": INK + (255,), "w": hx("#fff3c4")})


def speaker(on=True):
    rows = [
        "....k....." ,
        "...kwk..k.",
        "kkkwwk.k.k",
        "kwwwwk..k.",
        "kwwwwk.k.k" if on else "kwwwwk.k.k",
        "kkkwwk....",
        "...kwk....",
        "....k.....",
    ]
    if not on:
        rows = [
            "....k.....",
            "...kwk....",
            "kkkwwk.k.k",
            "kwwwwk..k.",
            "kwwwwk.k.k",
            "kkkwwk....",
            "...kwk....",
            "....k.....",
        ]
    else:
        rows = [
            "....k.....",
            "...kwk..k.",
            "kkkwwk.k..",
            "kwwwwk.k.k",
            "kwwwwk.k.k",
            "kkkwwk.k..",
            "...kwk..k.",
            "....k.....",
        ]
    return from_rows(rows, {"k": INK + (255,), "w": hx("#fff3c4")})


def hand():
    """Pixel pointing hand (index finger up) used instead of text hints."""
    rows = [
        "....kk.....",
        "...kssk....",
        "...kssk....",
        "...kssk....",
        "...ksskkk..",
        ".kkksskssk.",
        "ksskssssssk",
        "ksssssssssk",
        "kssssssssdk",
        ".ksssssssdk",
        ".kssssssddk",
        "..ksssssdk.",
        "..kwwwwwwk.",
        "..kwwwwwck.",
        "..kkkkkkkk.",
    ]
    return from_rows(rows, {"k": INK + (255,), "s": hx("#f2c29b"), "d": hx("#d49a74"),
                            "w": hx("#f6f1e7"), "c": hx("#d8cfc0")})


def sparkle():
    rows = [
        "...y...",
        "...y...",
        "..ywy..",
        "yywwwyy",
        "..ywy..",
        "...y...",
        "...y...",
    ]
    return from_rows(rows, {"y": hx("#ffd35a"), "w": hx("#fffbe0")})


def dust():
    rows = [
        ".aaa..",
        "aaaaa.",
        "aaaaab",
        ".abbb.",
    ]
    return from_rows(rows, {"a": hx("#ead8b6"), "b": hx("#c8ab82")})


def shadow(w=34, h=6):
    """Soft contact shadow: a hard-edged pixel ellipse, half transparent."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p = img.load()
    for y in range(h):
        for x in range(w):
            nx = (x + 0.5 - w / 2) / (w / 2)
            ny = (y + 0.5 - h / 2) / (h / 2)
            d = nx * nx + ny * ny
            if d <= 1:
                p[x, y] = INK + (70 if d > 0.55 else 110,)
    return img


def target_ring(w=30, h=8):
    """Landing marker drawn on top of the stack: a bright pixel ring."""
    img = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    p = img.load()
    for y in range(h):
        for x in range(w):
            nx = (x + 0.5 - w / 2) / (w / 2)
            ny = (y + 0.5 - h / 2) / (h / 2)
            d = nx * nx + ny * ny
            if 0.45 < d <= 1:
                p[x + 1, y + 1] = hx("#fff6d0") if ny < 0.2 else hx("#e8d79a")
    return outline(img, 0.85)


# ── growing patch props ─────────────────────────────────────────────────────
def sprout():
    """Seedling with two leaves and a curly tendril (first growth stage)."""
    rows = [
        "..........",
        ".gg....gg.",
        "gGGg..gGGg",
        "gGGGgcgGGg",
        ".gGGgsgGg.",
        "..gg.s.gg.",
        ".....s..c.",
        "....ss.c..",
        "...dsssd..",
    ]
    return outline(from_rows(rows, {"g": hx("#4e7a2f"), "G": hx("#86b24a"), "s": hx("#3f6a27"),
                                    "c": hx("#6c9a3a"), "d": hx("#5e3b22")}), 0.6)


def golden_pumpkin():
    img = pumpkin(22, 16, "golden", 5, seed=99, curl=True)
    p = img.load()
    # a few bright glints so it reads as special
    for (x, y) in [(7, 11), (8, 10), (17, 13), (6, 16)]:
        if p[x, y][3]:
            p[x, y] = hx("#ffffff")
    return img


def watering_can():
    rows = [
        "....kkkk..........",
        "...k....k.........",
        "..k......k........",
        ".kkkkkkkkkk.....kk",
        ".kLLLLLLLMk....kRk",
        ".kLLLLLLMMkk..kRRk",
        ".kLLLLLMMMDkkkRk..",
        ".kLLLLLMMMDDkkk...",
        ".kLLLLMMMMDk......",
        ".kMMMMMMMDDk......",
        ".kkkkkkkkkkk......",
    ]
    return from_rows(rows, {"k": INK + (255,), "L": hx("#b7ccd0"), "M": hx("#8fa6ab"),
                            "D": hx("#6a8086"), "R": hx("#5d8a9a")})


def water_drop():
    rows = [".w.", "wbw", "bBb", ".b."]
    return from_rows(rows, {"w": hx("#d8f2ff"), "b": hx("#6fbfe8"), "B": hx("#3d8fc4")})


def straw_hat():
    rows = [
        "........kkkkkkk.........",
        "......kkYYYYYYYkk.......",
        ".....kYYYYYYYYYYYk......",
        ".....kYYYYYYYYYYMk......",
        ".....kRRRRRRRRRRRk......",
        "..kkkkYYYYYYYYYYMkkkkk..",
        ".kYYYYYYYYYYYYYYYYYYYMk.",
        "kYYYYYYYYYYYYYYYYYYYMMMk",
        ".kkMMMMMMMMMMMMMMMMMMkk.",
        "...kkkkkkkkkkkkkkkkkk...",
    ]
    img = from_rows(rows, {"k": INK + (255,), "Y": hx("#ecc96e"), "M": hx("#c19a45"), "R": hx("#b8322a")})
    # straw weave texture
    p = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if p[x, y][:3] == hx("#ecc96e")[:3] and (x + y * 2) % 5 == 0:
                p[x, y] = hx("#d8b25a")
    return img


# ──────────────────────────────────── challenge HUD: BOOM button, windsock ──
def boom_button():
    """Big red push button on a hazard-striped steel base. Two frames side by side:
    up, and pressed (dome squashed down into its collar)."""
    W, H = 30, 27
    red = [hx("#5e0c0c"), hx("#9a1616"), hx("#d42a22"), hx("#f45a3c"), hx("#ffc2a8")]
    steel = [hx("#2c2c36"), hx("#454552"), hx("#62626f"), hx("#8a8a96"), hx("#b4b4c0")]
    yellow, black = hx("#f2c230"), hx("#2b1810")
    sheet = Image.new("RGBA", (W * 2, H), (0, 0, 0, 0))
    for f in range(2):
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        p = img.load()
        press = 3 if f else 0
        bx0, bx1, by0, by1 = 1, W - 2, 16, H - 2
        # base: steel box with a hazard-stripe band
        for y in range(by0, by1 + 1):
            for x in range(bx0, bx1 + 1):
                if x in (bx0, bx1) and y in (by0, by1):
                    continue
                if y == by0:
                    c = steel[4]
                elif y == by1:
                    c = steel[0]
                elif by0 + 3 <= y <= by0 + 6:
                    c = yellow if ((x + y) // 3) % 2 == 0 else black
                elif x == bx0:
                    c = steel[3]
                elif x == bx1:
                    c = steel[1]
                else:
                    c = steel[2]
                p[x, y] = c
        # dark collar the dome sits in
        cx = W / 2
        for y in range(by0 - 2, by0 + 1):
            for x in range(3, W - 3):
                nx, ny = (x + 0.5 - cx) / 12.0, (y + 0.5 - by0) / 2.6
                if nx * nx + ny * ny <= 1:
                    p[x, y] = steel[0] if y == by0 else steel[1]
        # dome, lit from the top left
        rx, ry = 10.5, 11 - press
        cy = by0 - 1
        for y in range(0, by0):
            for x in range(W):
                nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                if nx * nx + ny * ny > 1 or y > cy:
                    continue
                d = nx * 0.55 + ny * 0.85
                lvl = 3 if d < -0.55 else 2 if d < 0.05 else 1 if d < 0.5 else 0
                if y >= cy - 1:
                    lvl = min(lvl, 1)
                p[x, y] = red[lvl]
        # glint
        gy = int(cy - ry * 0.62)
        for (x, y) in [(int(cx) - 5, gy), (int(cx) - 4, gy), (int(cx) - 6, gy + 1), (int(cx) - 5, gy + 1)]:
            if 0 <= y < H and p[x, y][3]:
                p[x, y] = red[4]
        img = outline(img, 0.75)
        sheet.alpha_composite(img, (W * f, 0))
    return sheet


def windsock():
    """Orange-and-white striped windsock on a tall wooden pole, planted in the field by the
    hay bale. Eight frames side by side: four wind strengths (limp, light, strong, full) x two
    flutter frames. It blows to the right; the game flips it for wind to the left."""
    FW, FH = 34, 72
    wood = [hx("#4a2c14"), hx("#7a4e26"), hx("#a8743c")]
    ring = [hx("#7a7a86"), hx("#c7cbd2")]
    ora = [hx("#a8410e"), hx("#e4701a"), hx("#f79a3a")]
    wht = [hx("#a9a294"), hx("#e8e2d2"), hx("#ffffff")]
    sheet = Image.new("RGBA", (FW * 8, FH), (0, 0, 0, 0))
    for si, ang in enumerate([80, 50, 24, 5]):  # degrees below horizontal
        for fl in range(2):
            img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
            p = img.load()
            # pole: two pixels of weathered wood with a lit edge, a knot or two, a metal cap
            for y in range(3, FH):
                p[1, y] = wood[2] if y % 9 else wood[1]
                p[2, y] = wood[0] if y % 13 == 5 else wood[1]
            p[1, 2], p[2, 2] = ring[1], ring[0]
            ox, oy = 3.5, 5.0  # middle of the sock's mouth, at the top of the pole
            L = 25.0 if si else 21.0
            th = math.radians(ang)
            ax, ay = math.cos(th), math.sin(th)
            nx, ny = -ay, ax
            amp = [0.3, 0.9, 1.2, 0.9][si] * (1 if fl else -1)
            for y in range(FH):
                for x in range(3, FW):
                    dx, dy = x + 0.5 - ox, y + 0.5 - oy
                    t, s = dx * ax + dy * ay, dx * nx + dy * ny
                    if t < 0 or t > L:
                        continue
                    u = t / L
                    s -= amp * math.sin(u * math.pi * 2) * u
                    half = 4.4 - 2.2 * u
                    if abs(s) > half:
                        continue
                    if t < 1.2:
                        pal = ring  # metal hoop at the mouth
                        p[x, y] = pal[1 if s < 0 else 0]
                        continue
                    pal = ora if int(u * 5) % 2 == 0 else wht
                    shade = 2 if s < -half * 0.35 else 0 if s > half * 0.45 else 1
                    p[x, y] = pal[shade]
            img = outline(img, 0.7)
            sheet.alpha_composite(img, (FW * (si * 2 + fl), 0))
    return sheet


def main():
    save(sprout(), "sprout.png")
    save(pumpkin(13, 10, "unripe", 3, seed=5, curl=True), "pumpkin_unripe.png")
    save(golden_pumpkin(), "pumpkin_golden.png")
    save(watering_can(), "watering_can.png")
    save(water_drop(), "drop.png")
    save(straw_hat(), "straw_hat.png")
    save(hand(), "hand.png")
    save(target_ring(), "target.png")
    save(sparkle(), "sparkle.png")
    save(dust(), "dust.png")
    save(shadow(), "shadow.png")
    save(leaves_sheet(), "leaves.png")
    save(speaker(True), "sound_on.png")
    save(speaker(False), "sound_off.png")
    for name, w, h, pal, lobes, extra in PUMPKINS:
        save(pumpkin(w, h, pal, lobes, seed=zlib.crc32(name.encode()), **extra), name + ".png")
    save(pumpkin(9, 7, "orange", 3, curl=False), "icon_pumpkin.png")
    i = 0
    for col in ("red", "orange", "yellow", "brown"):
        save(leaf(MAPLE, col), f"leaf_{i}.png"); i += 1
        save(leaf(OVAL, col), f"leaf_{i}.png"); i += 1
    save(leaf_pile(36, 13, 1), "leafpile_a.png")
    save(leaf_pile(44, 15, 2), "leafpile_b.png")
    save(hay_bale(), "haybale.png")
    save(bubble(), "bubble.png")
    save(bubble_tail(), "bubble_tail.png")
    save(wood_panel(), "panel.png")
    bg, front = background()
    save(bg, "background.png")
    save(front, "foreground.png")
    save(silo_pumpkin(False), "silo_pumpkin.png")
    save(silo_pumpkin(True), "silo_pumpkin_wink.png")
    frames = [giraffe_frame(i * math.pi / 2) for i in range(4)]
    sheet = Image.new("RGBA", (frames[0].width * 4, frames[0].height), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (i * f.width, 0))
    save(sheet, "giraffe.png")
    save(boom_button(), "boom_button.png")
    save(windsock(), "windsock.png")


if __name__ == "__main__":
    main()
