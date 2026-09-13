## 1. Shared compress presets + lib backends

- [x] 1.1 Extract or export Compressor’s `QUALITY_PRESETS` (and validation) so Orientation/Reverse can reuse them without duplicating the map; add `lib/rotatePages.js` that rotates a PDF via Ghostscript (`all` angle or per-page 0/90/180/270 map) and optionally applies a quality preset in the same user-facing run; add `lib/reversePages.js` (or a thin wrapper over Arranger’s extract/merge) that writes pages in reverse order with the same optional quality behavior. Verify: `node` scripts against a small multi-page fixture confirm (a) whole-PDF 90° CW changes orientation, (b) per-page map rotates only listed pages and preserves order/count, (c) reverse yields `[n…1]`, (d) with `quality: "ebook"` output uses compression and without quality it does not; invalid quality still errors like Compress.

## 2. Main / preload IPC

- [x] 2.1 Wire `rotate:run` (and inspect reuse or `rotate:inspect` if needed) plus `reverse:run` in `main.js`, progress events consistent with other tools, and expose them on `preload.js` / `duplexApi`. Verify: from renderer DevTools (or a small harness), the new API methods are callable; a dry call with a missing input path returns a clear error without crashing main.

## 3. Orientation UI (dual mode + compress)

- [x] 3.1 Add the Change orientation home card and panel in `index.html` / `styles.css` / `renderer.js`: mode switch (default all-pages), all-pages angle control (90° CW / 90° CCW / 180°), per-page rotate-only list after pick (no Up/Down/Delete), Compress checkbox + quality dropdown (hidden/disabled until checked; default ebook), output defaults (`-rotated.pdf` + folder via existing suggest helpers), busy/disable rules, Show in Finder on success. Verify: `npm start`; open Orientation; confirm default mode; run all-pages rotate; switch to per-page, set mixed rotations, confirm no reorder/delete controls; toggle Compress and confirm quality appears only when checked and ebook is default; confirm blank fields get defaults and Show in Finder works after success.

## 4. Reverse UI + compress

- [x] 4.1 Add the Reverse page order home card and panel with file pick, Compress checkbox + quality dropdown (same behavior as Orientation), output defaults (`-reversed.pdf`), run wiring to `reverse:run`, and Show in Finder on success. Verify: `npm start`; reverse a multi-page PDF and confirm page order; confirm Compress checkbox/quality behavior matches Orientation; confirm defaults and Finder reveal.

## 5. Docs

- [x] 5.1 Update README (or primary usage docs) to mention Change orientation (both modes) and Reverse page order, including the optional Compress + quality presets. Verify: docs name both tools, both Orientation modes, and the shared compress option.
