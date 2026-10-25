# Grid-aware slicer: solid components (alpha > T) grouped by their 3x3 cell,
# then grown back by G small pixels to keep the soft edges.
import json, os, numpy as np
from PIL import Image
from collections import deque
# Sheets come from this folder; the generated PNGs and the cut-outs live in
# DISH_WORK, outside the repo.
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.environ.get('DISH_WORK') or HERE
sheets = json.load(open(os.path.join(HERE, os.environ.get('SHEETS', 'sheets.json'))))
out = os.path.join(D, os.environ.get('OUT', 'out')); os.makedirs(out, exist_ok=True)
SIZE = int(os.environ.get('SIZE', 128)); T = int(os.environ.get('T', 160)); G = int(os.environ.get('G', 3))
only = os.environ.get('ONLY', '').split(',') if os.environ.get('ONLY') else None
def label(m):
    h, w = m.shape; lab = np.zeros((h, w), int); n = 0
    for y in range(h):
        for x in range(w):
            if m[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n
                while q:
                    cy, cx = q.popleft()
                    for ny, nx in ((cy+1,cx),(cy-1,cx),(cy,cx+1),(cy,cx-1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
    return lab, n
def grow(m, k):
    for _ in range(k):
        d = m.copy(); d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]; m = d
    return m
for s, items in sheets.items():
    if only and s not in only: continue
    p = os.path.join(D, s + '.png')
    if not os.path.exists(p): print(s, 'missing'); continue
    im = Image.open(p).convert('RGBA'); arr0 = np.array(im); A = arr0[:, :, 3]
    small = A[::4, ::4]; h, w = small.shape
    lab, n = label(small > T)
    # A shape wider or taller than a cell is two dishes kissing: cut it at the
    # thinnest column (or row) near each grid line.
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if not len(ys): continue
        for axis, span, size in ((1, xs, w), (0, ys, h)):
            if span.max() - span.min() <= size * 0.45: continue
            prof = (lab == i).sum(axis=0 if axis == 1 else 1)
            cuts = []
            for line in (size / 3, 2 * size / 3):
                lo, hi = int(line - size * 0.07), int(line + size * 0.07)
                if span.min() < hi and span.max() > lo: cuts.append(lo + int(np.argmin(prof[lo:hi])))
            base = (lab == i)
            for k, c0 in enumerate(cuts):
                c1 = cuts[k + 1] if k + 1 < len(cuts) else 10**6
                sel = base.copy()
                if axis == 1: sel[:, :c0] = False; sel[:, c1:] = False
                else: sel[:c0, :] = False; sel[c1:, :] = False
                n += 1; lab[sel] = n
            break
    cells = [[] for _ in range(9)]
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 6: continue
        r = min(2, int(ys.mean() // (h / 3))); c = min(2, int(xs.mean() // (w / 3)))
        cells[r * 3 + c].append((len(ys), i))
    for idx, (name, _) in enumerate(items):
        comps = sorted(cells[idx], reverse=True)
        if not comps: print(s, name, 'EMPTY CELL'); continue
        keep = [i for a, i in comps if a >= comps[0][0] * 0.04]
        m = grow(np.isin(lab, keep), G) & (small > 0)
        full = np.kron(m.astype(np.uint8), np.ones((4, 4), np.uint8))[:A.shape[0], :A.shape[1]]
        arr = arr0.copy(); arr[:, :, 3] = (A * full).astype(np.uint8)
        ys, xs = np.nonzero(arr[:, :, 3] > 20)
        crop = Image.fromarray(arr).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        cw, ch = crop.size; side = int(max(cw, ch) * 1.08)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(crop, ((side - cw) // 2, (side - ch) // 2))
        sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, name + '.png'))
        if len(keep) > 3 or cw > 1024 * 0.42 or ch > 1024 * 0.42: print(s, name, f'check: {len(keep)} parts {cw}x{ch}')
print('done')
