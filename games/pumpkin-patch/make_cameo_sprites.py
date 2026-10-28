"""Gigi and Hoppah for the patch, from the Uppah runner's art (assets/).

The runner art is pixel art drawn big and soft: each art pixel is a blurry block (about 6 px
for Gigi, 15 for Hoppah) that isn't quite on a grid. Shrunk in the patch, its pixels came out
uneven and its soft edges fringed. This finds each image's own pixel grid, takes one clean colour
per art pixel (from the middle of its block) with hard-edged transparency, and draws it at the
patch's scale: Gigi at 3 game px per art pixel like Ansel, Hoppah at 4 like the patch. Nothing
is redrawn by hand.

Writes art/gigi_1..8.png, art/hoppah_stand.png, art/hoppah_jump.png and art/cameos.json (each
sprite's origin: where its feet were in the runner art).

    python3 make_cameo_sprites.py
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "..", "assets")
OUT = os.path.join(HERE, "art")


def load(path):
    return np.asarray(Image.open(path).convert("RGBA")).astype(float)


def edge_energy(a, axis):
    """How much the colour changes across each column (axis=1) or row (axis=0) boundary."""
    rgb = a[..., :3] * (a[..., 3:4] / 255.0)
    d = np.abs(np.diff(rgb, axis=axis)).sum(axis=2)
    return d.sum(axis=0 if axis == 1 else 1)


def find_grid(energy, lo, hi):
    """The pitch and phase whose block edges carry the most colour change."""
    n, mean = len(energy), energy.mean()
    best = (0, lo, 0)
    for p in np.arange(lo, hi + 1e-9, 0.02):
        for f in np.arange(0, p, 0.25):
            at = np.round(np.arange(f, n, p)).astype(int)
            at = at[at < n]
            score = energy[at].mean() / mean
            if score > best[0]:
                best = (score, p, f)
    return best[1], best[2]


def outside(solid):
    """The empty art pixels reachable from the edge of the picture (not holes inside it)."""
    rows, cols = solid.shape
    seen = np.zeros_like(solid)
    todo = [(j, i) for j in range(rows) for i in (0, cols - 1)] + [(j, i) for i in range(cols) for j in (0, rows - 1)]
    while todo:
        j, i = todo.pop()
        if 0 <= j < rows and 0 <= i < cols and not seen[j, i] and not solid[j, i]:
            seen[j, i] = True
            todo += [(j + 1, i), (j - 1, i), (j, i + 1), (j, i - 1)]
    return seen


def clean_cutout(out):
    """The runner art was cut out of a white background, which left pale grey along its outside
    edge and took white bits inside with it (Gigi's teeth). Drop the first, fill the second."""
    rgb = out[..., :3].astype(int)
    pale = (rgb.min(axis=2) > 150) & (rgb.max(axis=2) - rgb.min(axis=2) < 45)
    for _ in range(2):
        solid = out[..., 3] > 0
        o = outside(solid)
        edge = np.zeros_like(solid)
        edge[1:, :] |= o[:-1, :]
        edge[:-1, :] |= o[1:, :]
        edge[:, 1:] |= o[:, :-1]
        edge[:, :-1] |= o[:, 1:]
        out[solid & edge & pale] = 0
    holes = ~(out[..., 3] > 0) & ~outside(out[..., 3] > 0)
    out[holes] = (240, 236, 226, 255)


def regrid(a, p, fx, fy, px, foot, solid_alpha=160, share=0.6, inset=0.25):
    """One colour per art pixel, scaled to px game px each. An art pixel is solid when at least
    share of the middle of its block (inset from each side) has at least solid_alpha. foot (x, y)
    in the source becomes the sprite's origin."""
    h, w = a.shape[:2]
    x0, y0 = fx - p * np.ceil(fx / p), fy - p * np.ceil(fy / p)
    cols, rows = int(np.ceil((w - x0) / p)), int(np.ceil((h - y0) / p))
    out = np.zeros((rows, cols, 4), np.uint8)
    for j in range(rows):
        for i in range(cols):
            # the middle of the block: its edges are where the blur is
            l, r = x0 + (i + inset) * p, x0 + (i + 1 - inset) * p
            t, b = y0 + (j + inset) * p, y0 + (j + 1 - inset) * p
            cell = a[max(0, int(round(t))):max(0, int(round(b))), max(0, int(round(l))):max(0, int(round(r)))]
            if not cell.size:
                continue
            solid = cell[..., 3] >= solid_alpha
            if solid.mean() < share:
                continue
            out[j, i, :3] = np.median(cell[solid][:, :3], axis=0).round()
            out[j, i, 3] = 255
    clean_cutout(out)
    img = Image.fromarray(out, "RGBA").resize((cols * px, rows * px), Image.NEAREST)
    origin = ((foot[0] - x0) / (cols * p), (foot[1] - y0) / (rows * p))
    return img, origin


def main():
    meta = {}

    # Gigi: one grid for all eight frames (they share a canvas), drawn at 3 px like Ansel
    names = [os.path.join(ASSETS, "Gigi Running frames", f"frame_0{i}.png") for i in range(1, 9)]
    frames = [load(n) for n in names]
    p, fx = find_grid(sum(edge_energy(f, 1) for f in frames), 5, 7)
    _, fy = find_grid(sum(edge_energy(f, 0) for f in frames), p, p)
    for i, a in enumerate(frames, 1):
        img, origin = regrid(a, p, fx, fy, 3, (a.shape[1] / 2, a.shape[0] - 37))
        img.save(os.path.join(OUT, f"gigi_{i}.png"))
        meta[f"gigi_{i}"] = [round(origin[0], 4), round(origin[1], 4)]
    print(f"gigi: pitch {p:.2f}, {img.size[0]}x{img.size[1]}")

    # Hoppah: each picture its own grid, drawn at 4 px like the patch. His fur is see-through
    # in places and his outline soft, so a fainter block still counts.
    for key, name in (("hoppah_stand", "hoppah_standing.png"), ("hoppah_jump", "hoppah_jumping.png")):
        a = load(os.path.join(ASSETS, name))
        p, fx = find_grid(edge_energy(a, 1), 12, 18)
        _, fy = find_grid(edge_energy(a, 0), p, p)
        img, origin = regrid(a, p, fx, fy, 4, (a.shape[1] / 2, 305), solid_alpha=60, share=0.3, inset=0.3)
        img.save(os.path.join(OUT, key + ".png"))
        meta[key] = [round(origin[0], 4), round(origin[1], 4)]
        print(f"{key}: pitch {p:.2f}, {img.size[0]}x{img.size[1]}")

    with open(os.path.join(OUT, "cameos.json"), "w") as f:
        json.dump(meta, f, indent=1)


if __name__ == "__main__":
    main()
