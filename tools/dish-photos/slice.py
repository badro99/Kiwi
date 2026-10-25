import json, sys, os
import numpy as np
from PIL import Image
from collections import deque
D = os.environ['DISH_WORK']
sheets = json.load(open(os.path.join(D, os.environ.get('SHEETS','sheets.json'))))
out = os.path.join(D, 'out'); os.makedirs(out, exist_ok=True)
SIZE = int(os.environ.get('SIZE', 160))
report = []
for s, items in sheets.items():
    p = os.path.join(D, s + '.png')
    if not os.path.exists(p): report.append(f'{s}: missing'); continue
    im = Image.open(p).convert('RGBA'); A = np.array(im)[:, :, 3]
    small = A[::4, ::4] > 40
    # dilate 3 cells so a dish's loose garnish joins its dish
    m = small.copy()
    for _ in range(int(os.environ.get('DIL', 1))):
        d = m.copy(); d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]; m = d
    h, w = m.shape; lab = np.zeros((h, w), int); comps = []
    for y in range(h):
        for x in range(w):
            if m[y, x] and not lab[y, x]:
                q = deque([(y, x)]); lab[y, x] = len(comps) + 1; y0 = y1 = y; x0 = x1 = x; area = 0
                while q:
                    cy, cx = q.popleft(); area += 1
                    y0 = min(y0, cy); y1 = max(y1, cy); x0 = min(x0, cx); x1 = max(x1, cx)
                    for ny, nx in ((cy+1,cx),(cy-1,cx),(cy,cx+1),(cy,cx-1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = lab[cy, cx]; q.append((ny, nx))
                comps.append((area, len(comps)+1, slice(max(0,y0*4-2), min(A.shape[0],(y1+1)*4+2)), slice(max(0,x0*4-2), min(A.shape[1],(x1+1)*4+2))))
    comps.sort(key=lambda c: -c[0])
    boxes = [(c[2], c[3], c[1]) for c in comps[:9]]
    # order by row (centre y in thirds) then x
    H, W = A.shape
    def key(b):
        cy = (b[0].start + b[0].stop) / 2; cx = (b[1].start + b[1].stop) / 2
        return (int(cy // (H / 3)), cx)
    boxes.sort(key=key)
    if len(boxes) != 9: report.append(f'{s}: found {len(boxes)} objects')
    for (name, _), b in zip(items, boxes):
        own = np.kron((lab == b[2]).astype(np.uint8), np.ones((4, 4), np.uint8))[:A.shape[0], :A.shape[1]]
        arr = np.array(im); arr[:, :, 3] = (arr[:, :, 3] * own).astype(np.uint8)
        crop = Image.fromarray(arr).crop((b[1].start, b[0].start, b[1].stop, b[0].stop))
        w, h = crop.size; side = int(max(w, h) * 1.08)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(crop, ((side - w) // 2, (side - h) // 2))
        sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
        sq.save(os.path.join(out, name + '.png'))
        report.append(f'{s} {name}: {w}x{h}')
print('\n'.join(report))
