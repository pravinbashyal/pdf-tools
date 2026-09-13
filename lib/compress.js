const fs = require("fs");
const path = require("path");
const { findGhostscript, runGs } = require("./gs");
const {
  QUALITY_PRESETS,
  resolveQualityPreset,
  pdfwriteQualityArgs,
} = require("./pdfSettings");

/**
 * @typedef {object} CompressOptions
 * @property {string} inputPdf
 * @property {string} outputPdf
 * @property {keyof typeof QUALITY_PRESETS | string} [quality]
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * Compress a PDF with Ghostscript pdfwrite + PDFSETTINGS preset.
 * @param {CompressOptions} options
 * @returns {Promise<{ outputPdf: string, quality: string, inputBytes: number, outputBytes: number }>}
 */
async function compressPdf({
  inputPdf,
  outputPdf,
  quality = "ebook",
  onProgress = () => {},
}) {
  const gsCheck = findGhostscript();
  if (!gsCheck.ok) {
    throw new Error(gsCheck.error);
  }
  const gs = gsCheck.path;

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

  const { key, preset } = resolveQualityPreset(quality);

  if (path.resolve(inputPdf) === path.resolve(outputPdf)) {
    throw new Error("Output path must be different from the input PDF.");
  }

  const inputBytes = fs.statSync(inputPdf).size;
  onProgress(`Compressing with ${preset}…`);

  await runGs(gs, [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=pdfwrite",
    ...pdfwriteQualityArgs(key),
    `-sOutputFile=${outputPdf}`,
    inputPdf,
  ]);

  if (!fs.existsSync(outputPdf)) {
    throw new Error("Ghostscript finished but the output PDF was not created.");
  }

  const outputBytes = fs.statSync(outputPdf).size;
  let sizeNote = "";
  if (inputBytes > 0) {
    const delta = Math.round((100 * (inputBytes - outputBytes)) / inputBytes);
    if (delta > 0) sizeNote = ` (${delta}% smaller)`;
    else if (delta < 0) sizeNote = ` (${Math.abs(delta)}% larger)`;
    else sizeNote = " (same size)";
  }
  onProgress(
    `Done. ${formatBytes(inputBytes)} → ${formatBytes(outputBytes)}${sizeNote}.`
  );

  return {
    outputPdf,
    quality: key,
    inputBytes,
    outputBytes,
  };
}

/**
 * @param {number} n
 */
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

module.exports = {
  compressPdf,
  QUALITY_PRESETS,
  resolveQualityPreset,
};
