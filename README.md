# PDF Tools

Small Electron multi-tool for everyday PDF jobs with Ghostscript (v1.0.0):

1. **Duplex combine** — interleave odd + even ADF scans into one double-sided PDF
2. **Compress** — shrink a PDF (`/screen`, `/ebook`, `/printer`, `/prepress`)
3. **PDF pages arranger** — reorder or remove pages, then export
4. **Images → PDF** — turn ordered images into a single PDF
5. **PDF combiner** — merge multiple PDFs into one (reorder before combining)

## Requirements

- Node.js (for `npm`)
- [Ghostscript](https://www.ghostscript.com/) (`gs`) on your PATH, or at `/opt/homebrew/bin/gs` / `/usr/local/bin/gs`
- On macOS, **Images → PDF** also uses `sips` for HEIC / WebP (and as a fallback)

```bash
brew install ghostscript
```

## Run

```bash
npm install
npm start
```

For slightly more verbose Electron logging:

```bash
npm run dev
```

## Install via Homebrew (macOS)

PDF Tools is distributed via a personal (non-official) Homebrew tap that tracks this project's [GitHub Releases](https://github.com/pravinbashyal/pdf-tools/releases). Ghostscript is installed automatically as a dependency.

```bash
brew tap pravinbashyal/pdf-tools
brew install --cask pdf-tools
```

This installs `PDF Tools.app` into `/Applications`. As with the direct `.dmg` download, the build is unsigned and non-notarized — see [pravinbashyal/homebrew-pdf-tools](https://github.com/pravinbashyal/homebrew-pdf-tools) for details.

To upgrade or remove:

```bash
brew upgrade --cask pdf-tools
# or
brew uninstall --cask pdf-tools
brew untap pravinbashyal/pdf-tools
```

## Package / install (macOS)

Build a `.app` bundle (unsigned; first open may need a Gatekeeper override — see "Unsigned build" below):

```bash
npm install
npm run pack
```

The app lands in `dist/mac-arm64/PDF Tools.app` (or `dist/mac/` on Intel). Copy it into `/Applications` or `~/Applications` so Spotlight can find “PDF Tools”.

### Unsigned build

Tagged releases (see [Releases](https://github.com/pravinbashyal/pdf-tools/releases)) publish a `.dmg` built by CI. This build is **not code-signed or notarized** (no Apple Developer account). If you download the `.dmg` directly and macOS Gatekeeper reports the app is "damaged" or refuses to open it: on macOS 15 (Sequoia) and later, open **System Settings → Privacy & Security**, scroll down to the notice about the blocked app, click **Open Anyway**, and confirm — this is only required once. On older macOS versions, right-click (or Control-click) **PDF Tools.app** and choose **Open** instead. If neither shows an override option (the "move to Trash" variant of the warning), run `xattr -dr com.apple.quarantine "/Applications/PDF Tools.app"` in Terminal instead.

## Usage

### Duplex combine

1. Choose the **odd-pages** PDF and **even-pages** PDF.
2. Leave **Reverse even pages** checked if you flipped the ADF stack (default).
3. Enter an output filename and choose a save folder.
4. Click **Combine PDFs**.

Even page count must equal odd, or be one less (last sheet with no back).

### Compress

1. Choose a PDF.
2. Pick a quality preset (default **ebook**).
3. Enter an output filename and folder (must differ from the input file).
4. Click **Compress PDF**.

### PDF pages arranger

1. Choose a PDF — the app lists its pages.
2. Use **Up** / **Down** to reorder, or **Delete** to drop a page from the export.
3. Enter an output filename and folder (must differ from the input file).
4. Click **Export PDF**.

### Images → PDF

1. Choose one or more images (PNG, JPEG, WebP, TIFF, HEIC). Click **Choose images…** again to add more — newly picked images are appended to the list rather than replacing it.
2. Use each row's **Up** / **Down** controls to reorder, or **Delete** to drop an image from the list. **Clear** (next to **Choose images…**) empties the whole list.
3. Enter an output filename and folder.
4. Click **Create PDF**.

**Note:** HEIC/WebP depend on macOS `sips`. Ghostscript handles JPEG/PNG/TIFF directly when possible.

### PDF combiner

1. Choose two or more PDFs. Click **Choose PDFs…** again to add more — newly picked PDFs are appended to the list rather than replacing it.
2. Use each row's **Up** / **Down** controls to reorder, or **Delete** to drop a PDF from the list. **Clear** (next to **Choose PDFs…**) empties the whole list.
3. Enter an output filename and folder (must differ from every input).
4. Click **Combine PDFs**.

## How it works

- **Duplex:** page counts via Ghostscript, optional reverse of even pages, extract each page, interleave, merge with `pdfwrite`.
- **Compress:** `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/…`.
- **Arrange:** extract each kept page in order, then merge with Ghostscript `pdfwrite`.
- **Images → PDF:** prepare images (sips for HEIC/WebP), convert each to a page PDF, merge with Ghostscript.
- **Merge:** Ghostscript `pdfwrite` with all selected PDFs as inputs.

On Ghostscript 10.07+, `-sPageList=reverse` is rejected, so duplex reverse extracts even pages from last to first instead.
