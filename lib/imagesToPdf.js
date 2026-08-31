const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findGhostscript, runGs } = require("./gs");

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

/** Formats Ghostscript can usually ingest directly as pdfwrite inputs. */
const GS_DIRECT = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff"]);

/**
 * @typedef {object} ImagesToPdfOptions
 * @property {string[]} imagePaths
 * @property {string} outputPdf
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * Convert ordered images into a single PDF.
 * Uses Ghostscript where possible; HEIC/WebP (and other stubborn formats)
 * are converted to JPEG via macOS `sips` first.
 *
 * @param {ImagesToPdfOptions} options
 * @returns {Promise<{ outputPdf: string, pageCount: number }>}
 */
async function imagesToPdf({ imagePaths, outputPdf, onProgress = () => {} }) {
  const gsCheck = findGhostscript();
  if (!gsCheck.ok) {
    throw new Error(gsCheck.error);
  }
  const gs = gsCheck.path;

  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    throw new Error("Select at least one image.");
  }
  if (!outputPdf) {
    throw new Error("Output path is required.");
  }

  const outDir = path.dirname(outputPdf);
  if (!fs.existsSync(outDir)) {
    throw new Error(`Output folder does not exist: ${outDir}`);
  }

  for (const img of imagePaths) {
    if (!img || !fs.existsSync(img)) {
      throw new Error(`Image not found: ${img || "(empty)"}`);
    }
    const ext = path.extname(img).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported image type (${ext || "unknown"}): ${path.basename(img)}`
      );
    }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "duplex-images-"));
  /** @type {string[]} */
  const prepared = [];

  try {
    for (let i = 0; i < imagePaths.length; i++) {
      const src = imagePaths[i];
      const ext = path.extname(src).toLowerCase();
      onProgress(`Preparing ${i + 1}/${imagePaths.length}: ${path.basename(src)}`);

      if (GS_DIRECT.has(ext)) {
        prepared.push(src);
        continue;
      }

      // HEIC / WebP / HEIF → JPEG via sips, then Ghostscript
      const jpgOut = path.join(tmp, `img-${String(i).padStart(4, "0")}.jpg`);
      await runSipsToJpeg(src, jpgOut);
      prepared.push(jpgOut);
    }

    onProgress(`Building PDF (${prepared.length} page${prepared.length === 1 ? "" : "s"})…`);

    /** @type {string[]} */
    const pagePdfs = [];
    for (let i = 0; i < prepared.length; i++) {
      const pagePdf = path.join(tmp, `page-${String(i).padStart(4, "0")}.pdf`);
      await imageFileToPdfPage(gs, prepared[i], pagePdf);
      pagePdfs.push(pagePdf);
      if (i === 0 || i === prepared.length - 1 || (i + 1) % 5 === 0) {
        onProgress(`Converting images… ${i + 1}/${prepared.length}`);
      }
    }

    onProgress("Merging pages…");
    await runGs(gs, [
      "-q",
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${outputPdf}`,
      ...pagePdfs,
    ]);

    if (!fs.existsSync(outputPdf)) {
      throw new Error("Ghostscript finished but the output PDF was not created.");
    }

    onProgress(`Done. Wrote ${pagePdfs.length} page${pagePdfs.length === 1 ? "" : "s"}.`);
    return { outputPdf, pageCount: pagePdfs.length };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Convert a single raster image to a one-page PDF.
 * Tries Ghostscript pdfwrite first; falls back to macOS sips.
 * @param {string} gsPath
 * @param {string} imagePath
 * @param {string} outPdf
 */
async function imageFileToPdfPage(gsPath, imagePath, outPdf) {
  try {
    await runGs(gsPath, [
      "-q",
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sDEVICE=pdfwrite",
      "-dPDFSETTINGS=/prepress",
      `-sOutputFile=${outPdf}`,
      imagePath,
    ]);
    if (fs.existsSync(outPdf) && fs.statSync(outPdf).size > 0) {
      return;
    }
  } catch {
    // Fall through to sips.
  }

  await runSipsToPdf(imagePath, outPdf);
  if (!fs.existsSync(outPdf) || fs.statSync(outPdf).size === 0) {
    throw new Error(
      `Could not convert ${path.basename(imagePath)} to PDF. For HEIC/WebP ensure macOS sips supports the format.`
    );
  }
}

/**
 * @param {string} input
 * @param {string} outputJpg
 */
function runSipsToJpeg(input, outputJpg) {
  return runCmd("sips", ["-s", "format", "jpeg", input, "--out", outputJpg]).then(
    (result) => {
      if (result.code !== 0 || !fs.existsSync(outputJpg)) {
        const detail = (result.stderr || result.stdout || "").trim();
        throw new Error(
          `Could not convert ${path.basename(input)} via sips${detail ? `: ${detail}` : "."} HEIC/WebP need a recent macOS.`
        );
      }
    }
  );
}

/**
 * @param {string} input
 * @param {string} outputPdf
 */
function runSipsToPdf(input, outputPdf) {
  return runCmd("sips", ["-s", "format", "pdf", input, "--out", outputPdf]).then(
    (result) => {
      if (result.code !== 0 || !fs.existsSync(outputPdf)) {
        const detail = (result.stderr || result.stdout || "").trim();
        throw new Error(
          `sips could not make a PDF from ${path.basename(input)}${detail ? `: ${detail}` : "."}`
        );
      }
    }
  );
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      reject(
        new Error(
          err && /** @type {{ code?: string }} */ (err).code === "ENOENT"
            ? `Command not found: ${cmd}`
            : err instanceof Error
              ? err.message
              : String(err)
        )
      );
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

module.exports = {
  imagesToPdf,
  IMAGE_EXTENSIONS,
};
