"""Clean slicer output: drop slivers of the neighbouring cell.
Solid shapes (alpha > 40) smaller than 3% of the largest are dropped, then every
pixel more than 3 px from a kept solid shape is cleared (faint fringes)."""
import sys
import numpy as np
from PIL import Image
from collections import deque

def components(mask):
    h, w = mask.shape; lab = np.zeros((h, w), np.int32); n = 0; sizes = [0]
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n; c = 0
                while q:
                    cy, cx = q.popleft(); c += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = n; q.append((ny, nx))
                sizes.append(c)
    return lab, sizes

def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out

for path in sys.argv[1:]:
    a = np.array(Image.open(path).convert('RGBA'))
    lab, sizes = components(a[:, :, 3] > 40)
    big = max(sizes)
    kept = [i for i, s in enumerate(sizes) if i and s >= max(30, 0.03 * big)]
    keep = dilate(np.isin(lab, kept), 3)
    gone = int(((a[:, :, 3] > 0) & ~keep).sum())
    if gone:
        a[~keep] = 0
        Image.fromarray(a).save(path)
        print(path.rsplit('/', 1)[-1], 'cleared', gone, 'px')
