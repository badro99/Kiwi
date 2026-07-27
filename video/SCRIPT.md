# Kiwi — 3:00 demo film · voiceover script

Timings are the real scene boundaries from `film.html` (the `SCENES` table). The
master is rendered silent, so you record over it and mux the result in.

Word counts are sized for **~150 words per minute** — a measured pace, not a
rush. Every section below is deliberately a little short of its slot. The gaps
are the point: the product is on screen doing the talking, and a demo video that
never breathes is exhausting to watch.

**B** = Badr-Eddin (market, money, the close) · **Z** = Zakariae (what we built,
how it works). Split it however you like — but do split it. YC is partly
assessing whether you two work as a pair.

---

### 0:00 – 0:11 · Cold open

> **B:** We're Kiwi, from Tangier. Walk into any shop here at closing time and
> you find the same three things: a notebook, a cash box, and a card terminal.

### 0:11 – 0:24 · The gap

> **Z:** Square doesn't sell here. Toast doesn't either. What does reach Morocco
> is priced for Europe and doesn't work in Arabic. So the terminal takes cards —
> and the stock, the staff, the margins all stay in the notebook.

### 0:24 – 0:30 · Title card

> **Z:** So we built the whole operating system for the shop. One app, fifteen
> different trades.

> **On "fifteen":** counted from the code, not estimated. `assets/pos-dispatch.js`
> registers 14 métiers on PINs 0002–0015, plus the restaurant the demo runs on.
> There is also a non-PIN-routed `pos-mobile.js` and a "pressing" entry outside
> the registry — if you count either as a trade you sell, set `CONFIG.trades` to
> 16 in `film.html`, change this line, and re-render. Worth getting right: the
> demo lock screen prints the PIN range, so it is countable on camera.

### 0:30 – 1:02 · The montage — one line per trade, 4 s each

Let each line land, then stop. The screens carry this section.

| In | Line |
|---|---|
| 0:30 | **Z:** A bakery sells bread by the unit, at a counter. |
| 0:34 | **Z:** A pharmacy splits every receipt between the patient and their insurance. |
| 0:38 | **Z:** A boutique tracks caftans by size and variant. |
| 0:42 | **Z:** A salon runs a walk-in queue and an appointment book at the same time. |
| 0:46 | **Z:** A gym checks its members in by badge. |
| 0:50 | **Z:** A florist composes a bouquet, stem by stem. |
| 0:54 | **Z:** A riad checks guests into rooms. |
| 0:58 | **Z:** A grocery scans barcodes. |

### 1:02 – 1:08 · The grid

> **Z:** Same codebase, same account, one close at the end of the night.

### 1:08 – 1:34 · Four surfaces, one system

> **B:** And it's one system, not four products. The register on the counter.
> The waiter's phone in the dining room. A QR code on the table, so the customer
> orders without anyone coming over. And the owner's dashboard.
>
> *(beat)*
>
> **B:** A sale rung on the register is on the owner's phone the same second —
> and the kitchen already has the ticket.

### 1:34 – 1:56 · The parts nobody wants to build

> **Z:** Then the parts nobody wants to build. Moroccan internet drops, so the
> till keeps working offline and reconciles when it comes back. We wrote the
> printer bridge ourselves — thermal receipts, kitchen tickets, the cash drawer.
> And all of it works in Arabic, right to left, on every screen.

### 1:56 – 2:18 · Ask the business a question

> **Z:** The owner can just ask. It answers from their own numbers, and it shows
> you which figures it used, so you can check it. When it doesn't actually know,
> it says so instead of guessing. And it runs locally — the data never leaves
> the device.

### 2:18 – 2:34 · Price

> **B:** A hundred and ninety-nine dirhams a month. About twenty dollars. It
> runs on the hardware they already own, on as many devices as they want, with
> no commitment — and support over WhatsApp, in Darija.

### 2:34 – 2:46 · Traction  ⚠️ REPLACE THIS

> **B:** *[Your real number goes here.]*

This is the weakest slot in the film and the one YC reads hardest. The on-screen
text defaults to a true statement about scope, but a real number beats it by a
mile. Pick whichever of these is true and say it plainly:

- *"We're live in N shops in Tangier today, all paying."*
- *"We're at X dirhams a month across N stores, and we launched in June."*
- *"Fourteen merchants are running their whole day on it right now."*

To change what's on screen, edit `CONFIG.traction` at the top of
`video/film.html` and re-render. Do not inflate it — a modest true number
survives the interview and an impressive vague one does not.

### 2:46 – 3:00 · Close

> **B:** Point of sale is the wedge. Once we run the merchant's whole day, we
> take the payments too — and payments in Morocco is still one processor and a
> lot of cash.

---

## Recording notes

- **Record in one continuous take per person**, then cut to the timings. Reading
  section by section makes every section sound like a fresh start.
- **Don't match the timings exactly.** Land slightly early and let the picture
  run. Silence over a working product reads as confidence.
- **Say the numbers slowly.** 199, twenty dollars, fifteen — these are the words
  a partner writes down.
- **Accents are fine and you should not flatten them.** Speak a little slower
  than feels natural and articulate the consonants.
- Record somewhere soft — a room with curtains and a bed beats any office.
  Phone voice memo at arm's length is genuinely fine.

## Muxing your voiceover onto the master

Put your recording at `video/vo.m4a` (or .wav / .mp3), then:

```bash
ffmpeg -i video/out/kiwi-demo-3min.mp4 -i video/vo.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest video/out/kiwi-demo-3min-vo.mp4
```

`-c:v copy` means the picture is not re-encoded, so this runs in about a second
and loses no quality.

If you want music under the voice, mix it into your audio file first — keep the
bed around -22 LUFS so it sits well under speech.

## Re-rendering after an edit

```bash
node video/render.mjs --url "http://localhost:4178/video/film.html" --out video/out/kiwi-demo-3min.mp4 --duration 180 --fps 30 --crf 18
```

Serve the repo first (the `kiwi-static` launch config, port 4178). To preview in
a normal browser without rendering anything, open
`http://localhost:4178/video/film.html?play`.
