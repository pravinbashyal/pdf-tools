const fs = require("fs");
const os = require("os");
const path = require("path");
const { findGhostscript, runGs, pageCount } = require("./gs");
const { pdfwriteQualityArgs } = require("./pdfSettings");

/**
 * Ghostscript setpagedevice Orientation for clockwise degrees.
 * 0=portrait, 3=landscape (90° CW), 2=upside down, 1=seascape (90° CCW).
 * pdfwrite also auto-rotates from text; callers must pass -dAutoRotatePages=/None
 * or a later merge pass will undo an explicit rotation.
 * @type {Record<number, number>}
 */
const ORIENTATION_CW = {
  0: 0,
  90: 3,
  180: 2,
  270: 1,
};

/**
 * @typedef {object} RotatePagesOptions
 * @property {string} inputPdf
 * @property {string} outputPdf
 * @property {90 | 180 | 270 | number} [angle] clockwise degrees for every page
 * @property {Record<string | number, 0 | 90 | 180 | 270 | number>} [pageRotations]
 *   1-based page → clockwise degrees (0/90/180/270). Unlisted pages stay 0.
 * @property {string} [quality] Compressor preset; omit to skip PDFSETTINGS
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * Rotate a PDF via Ghostscript pdfwrite (whole file or per-page map).
 *
 * @param {RotatePagesOptions} options
 * @returns {Promise<{ outputPdf: string, pageCount: number, quality: string | null }>}
 */
async function rotatePages({
  inputPdf,
  outputPdf,
  angle,
  pageRotations,
  quality,
  onProgress = () => {},
}) {
  const gsCheck = findGhostscript();
  if (!gsCheck.ok) {
    throw new Error(gsCheck.error);
  }
  const gs = gsCheck.path;

  assertIoPaths(inputPdf, outputPdf);

  const hasMap = pageRotations != null;
  const hasAngle = angle != null && angle !== "";
  if (hasMap && hasAngle) {
    throw new Error("Provide either angle (all pages) or pageRotations (per-page), not both.");
  }
  if (!hasMap && !hasAngle) {
    throw new Error("Provide angle (all pages) or pageRotations (per-page).");
  }

  const qualityArgs = pdfwriteQualityArgs(quality);
  const qualityKey = qualityArgs.length ? String(quality).toLowerCase() : null;

  onProgress("Counting pages…");
  const total = await pageCount(gs, inputPdf);
  if (total < 1) {
    throw new Error("PDF has no pages.");
  }

  if (hasMap) {
    const rotations = normalizePageRotations(pageRotations, total);
    await rotatePerPage({
      gs,
      inputPdf,
      outputPdf,
      rotations,
      total,
      qualityArgs,
      onProgress,
    });
  } else {
    const degrees = normalizeDegrees(angle);
    if (degrees == null || degrees === 0) {
      throw new Error("Invalid angle. Use 90, 180, or 270 (clockwise).");
    }
    onProgress(`Rotating all pages ${degrees}° clockwise…`);
    await runGs(gs, [
      "-q",
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sDEVICE=pdfwrite",
      "-dAutoRotatePages=/None",
      ...qualityArgs,
      `-sOutputFile=${outputPdf}`,
      "-c",
      `<</Orientation ${ORIENTATION_CW[degrees]}>> setpagedevice`,
      "-f",
      inputPdf,
    ]);
  }

  if (!fs.existsSync(outputPdf)) {
    throw new Error("Ghostscript finished but the output PDF was not created.");
  }

  onProgress(`Done. Wrote ${total} page${total === 1 ? "" : "s"}.`);
  return { outputPdf, pageCount: total, quality: qualityKey };
}

/**
 * @param {object} opts
 * @param {string} opts.gs
 * @param {string} opts.inputPdf
 * @param {string} opts.outputPdf
 * @param {Map<number, number>} opts.rotations
 * @param {number} opts.total
 * @param {string[]} opts.qualityArgs
 * @param {(msg: string) => void} opts.onProgress
 */
async function rotatePerPage({
  gs,
  inputPdf,
  outputPdf,
  rotations,
  total,
  qualityArgs,
  onProgress,
}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "duplex-rotate-"));
  try {
    /** @type {string[]} */
    const pagePdfs = [];
    for (let page = 1; page <= total; page++) {
      const degrees = rotations.get(page) ?? 0;
      const out = path.join(tmp, `p-${String(page).padStart(4, "0")}.pdf`);
      const args = [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        "-dAutoRotatePages=/None",
        `-dFirstPage=${page}`,
        `-dLastPage=${page}`,
        `-sOutputFile=${out}`,
      ];
      if (degrees !== 0) {
        args.push(
          "-c",
          `<</Orientation ${ORIENTATION_CW[degrees]}>> setpagedevice`,
          "-f"
        );
      }
      args.push(inputPdf);
      await runGs(gs, args);
      pagePdfs.push(out);
      if (page === 1 || page === total || page % 5 === 0) {
        onProgress(`Rotating pages… ${page}/${total}`);
      }
    }

    onProgress("Writing rotated PDF…");
    await runGs(gs, [
      "-q",
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sDEVICE=pdfwrite",
      "-dAutoRotatePages=/None",
      ...qualityArgs,
      `-sOutputFile=${outputPdf}`,
      ...pagePdfs,
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * @param {unknown} value
 * @returns {0 | 90 | 180 | 270 | null}
 */
function normalizeDegrees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  const d = ((Math.round(n) % 360) + 360) % 360;
  if (d !== 0 && d !== 90 && d !== 180 && d !== 270) {
    return null;
  }
  return /** @type {0 | 90 | 180 | 270} */ (d);
}

/**
 * @param {unknown} pageRotations
 * @param {number} total
 * @returns {Map<number, number>}
 */
function normalizePageRotations(pageRotations, total) {
  if (typeof pageRotations !== "object" || pageRotations == null || Array.isArray(pageRotations)) {
    throw new Error("pageRotations must be a map of 1-based page numbers to 0/90/180/270.");
  }

  /** @type {Map<number, number>} */
  const map = new Map();
  for (let i = 1; i <= total; i++) {
    map.set(i, 0);
  }

  for (const [key, raw] of Object.entries(pageRotations)) {
    const page = Number(key);
    if (!Number.isInteger(page) || page < 1 || page > total) {
      throw new Error(
        `Invalid page number ${key}. PDF has ${total} page${total === 1 ? "" : "s"}.`
      );
    }
    const degrees = normalizeDegrees(raw);
    if (degrees == null) {
      throw new Error(
        `Invalid rotation ${raw} for page ${page}. Use 0, 90, 180, or 270.`
      );
    }
    map.set(page, degrees);
  }
  return map;
}

/**
 * @param {string} inputPdf
 * @param {string} outputPdf
 */
function assertIoPaths(inputPdf, outputPdf) {
  if (!inputPdf || !fs.existsSync(inputPdf)) {
    throw new Error("Input PDF not found.");
  }
  if (!outputPdf) {
    throw new Error("Output path is required.");
  }
  const outDir = path.dirname(outputPdf);
  if (!fs.existsSync(outDir)) {
    throw new Error(`Output folder does not exist: ${outDir}`);
  }
  if (path.resolve(inputPdf) === path.resolve(outputPdf)) {
    throw new Error("Output path must be different from the input PDF.");
  }
}

module.exports = {
  rotatePages,
  ORIENTATION_CW,
};
