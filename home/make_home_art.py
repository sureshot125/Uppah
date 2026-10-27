"""Pixel art for the Uppah home page (index.html at the repo root).

Everything here is composed from the games' own pixel art, nothing is drawn as
vector shapes:
  - card_runner.png   the zoo from the runner, with Ansel, a ballball and Hoppah
  - card_pumpkin.png  Ansel's Pumpkin Patch: the barn, the silo, a tower on the bale
  - card_lumber.png   coming soon: a lumber pile at the edge of the patch, locked
  - card_leaves.png   coming soon: leaf piles under the autumn trees, locked
  - sky.png           the patch's night-to-dusk sky, for the page background
  - path.png          a strip of the patch's dirt path that tiles sideways
  - ansel_run.png     the runner's six run frames side by side (for a CSS walk cycle)

Run:  python3 home/make_home_art.py   (needs Pillow; reads games/pumpkin-patch/art
and assets/, so run games/pumpkin-patch/make_art.py first if that art changed)
"""
import os
import sys

from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PP = os.path.join(ROOT, "games", "pumpkin-patch")
sys.path.insert(0, PP)
import make_art as M  # noqa: E402  (pixel helpers: hx, INK, from_rows, outline, plank)

OUT = os.path.join(ROOT, "home", "art")
os.makedirs(OUT, exist_ok=True)
THUMB = (480, 300)  # card pictures: 2 screen px per patch art pixel


def art(name):
    return Image.open(os.path.join(PP, "art", name)).convert("RGBA")


def shared(name):
    return Image.open(os.path.join(ROOT, "assets", name)).convert("RGBA")


def save(img, name):
    img.save(os.path.join(OUT, name), optimize=True)
    print("wrote", name, img.size)


def patch_scene(box):
    """The patch's background and fence layer, cropped to box (world px, 4 per art px)."""
    bg = art("background.png")
    bg.alpha_composite(art("foreground.png"))
    return bg.crop(box)


def pumpkin_at(scene, key, x, bottom, box):
    """Paste a pumpkin sprite whose body sits on `bottom` (world px), like the game does."""
    spec = {"pumpkin_deep_xl": (32, 21), "pumpkin_orange_l": (26, 18), "pumpkin_orange_m": (20, 15),
            "pumpkin_white_m": (19, 14), "pumpkin_gold_s": (14, 11), "pumpkin_green_m": (18, 15),
            "pumpkin_orange_s": (15, 11), "pumpkin_warty_s": (15, 12)}[key]
    img = art(key + ".png")
    bh = (spec[1] + 1) * 4
    oy = img.height * (24 + 2 * spec[1]) / ((spec[1] + 8) * 4)  # the game's origin: body centre
    cy = bottom - bh / 2
    scene.alpha_composite(img, (int(x - box[0] - img.width / 2), int(cy - box[1] - oy)))
    return bh


def card_pumpkin():
    box = (420, 1560, 1380, 2160)  # 960 x 600 world px around the bale
    s = patch_scene(box)
    sil = art("silo_pumpkin.png")
    s.alpha_composite(sil, (736 - box[0] - sil.width // 2, 1600 - box[1] - sil.height))
    hay = art("haybale.png")
    ground, hay_top, x = 2080, 1992, 960
    s.alpha_composite(art("shadow.png").resize((184, 24), Image.NEAREST), (x - box[0] - 92, ground - box[1] - 10))
    s.alpha_composite(hay, (x - box[0] - hay.width // 2, ground + 4 - box[1] - hay.height))
    top = hay_top
    for k in ("pumpkin_deep_xl", "pumpkin_orange_l", "pumpkin_white_m", "pumpkin_gold_s"):
        top -= pumpkin_at(s, k, x, top, box)
    pumpkin_at(s, "pumpkin_orange_m", 1230, ground, box)
    pumpkin_at(s, "pumpkin_green_m", 560, ground, box)
    # Ansel, standing (his hero frame), feet on the path
    a = Image.open(os.path.join(PP, "art", "ansel", "everyday", "pick_1.png")).convert("RGBA")
    s.alpha_composite(art("shadow.png"), (735 - box[0] - 68, ground - box[1] - 8))
    s.alpha_composite(a, (735 - box[0] - 129, ground - box[1] - 285))
    return s.resize(THUMB, Image.BOX)


def card_runner():
    bg = shared("Background.png")             # 822 x 947, the zoo
    crop = bg.crop((0, 300, 822, 814))        # the animals, the fence, the path
    s = crop.resize(THUMB, Image.LANCZOS)
    k = THUMB[0] / 822
    ground = int((770 - 300) * k)             # the path in the crop
    def put(img, h, cx, bottom):
        w = round(img.width * h / img.height)
        im = img.resize((w, h), Image.LANCZOS)
        s.alpha_composite(im, (int(cx - w / 2), int(bottom - h)))
    put(shared("hoppah_standing.png"), 62, 360, ground + 4)
    put(shared("BallBall.png"), 34, 300, ground - 30)
    put(shared("BallBall.png"), 34, 420, ground - 64)
    put(shared("Ansel Running frames/frame_03.png"), 150, 180, ground + 10)
    return s


def padlock():
    rows = [
        "....kkkkk....",
        "...kSSSSSk...",
        "..kSkkkkkSk..",
        "..kSk...kSk..",
        "..kSk...kSk..",
        ".kkkkkkkkkkk.",
        ".kHGGGGGGGgk.",
        ".kGGGkkkGGgk.",
        ".kGGGkkkGGgk.",
        ".kGGGGkGGGgk.",
        ".kGGGGkGGGgk.",
        ".kgggggggggk.",
        ".kkkkkkkkkkk.",
    ]
    return M.from_rows(rows, {"k": M.INK + (255,), "S": M.hx("#b9bec8"), "H": M.hx("#fff3b0"),
                              "G": M.hx("#f2b632"), "g": M.hx("#b97c1c")})


def log_end():
    rows = [
        "..kkk..",
        ".kLLLk.",
        "kLlllLk",
        "kLlklLk",
        "kLlllLk",
        ".kLLLk.",
        "..kkk..",
    ]
    return M.from_rows(rows, {"k": M.INK + (255,), "L": M.hx("#8a5a2c"), "l": M.hx("#e0b27a")})


def locked(scene):
    """Coming soon: the scene at dusk, washed out, with a padlock in the middle."""
    s = ImageEnhance.Color(scene).enhance(0.45)
    s = ImageEnhance.Brightness(s).enhance(0.55)
    lock = padlock()
    lock = lock.resize((lock.width * 8, lock.height * 8), Image.NEAREST)
    s.alpha_composite(lock, ((s.width - lock.width) // 2, (s.height - lock.height) // 2 - 6))
    return s


def card_lumber():
    box = (960, 1560, 1920, 2160)  # 960 x 600 world px: trees, fence, vines, path
    s = patch_scene(box).resize(THUMB, Image.BOX)
    # a lumber pile at 2 px per art pixel: a stack of planks and a pyramid of logs
    pile = Image.new("RGBA", (150, 56), (0, 0, 0, 0))
    for i, y in enumerate([49, 43, 37, 31, 25, 19]):
        pile.alpha_composite(M.plank(66, 6, seed=3 + i), (2 + (i % 2) * 4, y))
    for row, n in enumerate([5, 4, 3, 2, 1]):
        for j in range(n):
            pile.alpha_composite(log_end(), (88 + j * 7 + row * 3, 49 - row * 6))
    pile = pile.resize((pile.width * 2, pile.height * 2), Image.NEAREST)
    s.alpha_composite(pile, (90, THUMB[1] - pile.height - 2))
    return locked(s)


def card_leaves():
    box = (1100, 1560, 2060, 2160)
    bg = patch_scene((1100, 1560, 1920, 2160))
    wide = Image.new("RGBA", (960, 600))
    wide.alpha_composite(bg, (0, 0))
    wide.alpha_composite(bg.crop((0, 0, 140, 600)).transpose(Image.FLIP_LEFT_RIGHT), (820, 0))
    s = wide.resize(THUMB, Image.BOX)
    for name, x in (("leafpile_b.png", 40), ("leafpile_a.png", 250), ("leafpile_b.png", 360)):
        p = art(name)
        p = p.resize((p.width // 2 * 3 // 2 * 2 // 2, p.height // 2 * 3 // 2 * 2 // 2), Image.NEAREST)
        s.alpha_composite(p, (x, THUMB[1] - p.height - 4))
    leaves = art("leaves.png")
    for i, (x, y) in enumerate([(120, 60), (210, 110), (330, 50), (400, 140), (60, 150), (250, 30)]):
        lf = leaves.crop((28 * (i % 8), 0, 28 * (i % 8) + 28, 28))
        s.alpha_composite(lf, (x, y))
    return locked(s)


def sky():
    """The patch's sky, night at the top to dusk at the horizon, at 1 px per art pixel."""
    bg = art("background.png").crop((0, 0, 1920, 1460))
    return bg.resize((bg.width // 4, bg.height // 4), Image.NEAREST)


def path_strip():
    """The dirt path (with its grass edge), 1 px per art pixel, to repeat sideways."""
    bg = art("background.png").crop((480, 2064, 1440, 2160))
    return bg.resize((bg.width // 4, bg.height // 4), Image.NEAREST)


def ansel_run():
    frames = [shared(f"Ansel Running frames/frame_0{i}.png") for i in range(1, 7)]
    w, h = 84, 124  # a third of the 252 x 370 frames
    sheet = Image.new("RGBA", (w * 6, h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f.resize((w, h), Image.LANCZOS), (i * w, 0))
    return sheet


def main():
    save(card_runner(), "card_runner.png")
    save(card_pumpkin(), "card_pumpkin.png")
    save(card_lumber(), "card_lumber.png")
    save(card_leaves(), "card_leaves.png")
    save(sky(), "sky.png")
    save(path_strip(), "path.png")
    save(ansel_run(), "ansel_run.png")


if __name__ == "__main__":
    main()
