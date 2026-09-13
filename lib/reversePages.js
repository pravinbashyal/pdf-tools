const fs = require("fs");
const os = require("os");
const path = require("path");
const { arrangePages, inspectPdf } = require("./arrangePages");
const { compressPdf } = require("./compress");
const { pdfwriteQualityArgs } = require("./pdfSettings");

/**
 * @typedef {object} ReversePagesOptions
 * @property {string} inputPdf
 * @property {string} outputPdf
 * @property {string} [quality] Compressor preset; omit to skip PDFSETTINGS
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * Write a PDF with pages in reverse order, optionally compressing with a
 * Compressor quality preset in the same user-facing run.
 *
 * @param {ReversePagesOptions} options
 * @returns {Promise<{ outputPdf: string, pageCount: number, quality: string | null }>}
 */
async function reversePages({
  inputPdf,
  outputPdf,
  quality,
  onProgress = () => {},
}) {
  const qualityArgs = pdfwriteQualityArgs(quality);
  const qualityKey = qualityArgs.length ? String(quality).toLowerCase() : null;

  const { pageCount: total } = await inspectPdf(inputPdf);
  const pageOrder = [];
  for (let n = total; n >= 1; n--) {
    pageOrder.push(n);
  }

  if (!qualityKey) {
    const result = await arrangePages({
      inputPdf,
      pageOrder,
      outputPdf,
      onProgress,
    });
    return { outputPdf: result.outputPdf, pageCount: result.pageCount, quality: null };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "duplex-reverse-"));
  try {
    const tmpOut = path.join(tmp, "reversed.pdf");
    onProgress("Reversing page order…");
    await arrangePages({
      inputPdf,
      pageOrder,
      outputPdf: tmpOut,
      onProgress,
    });
    const compressed = await compressPdf({
      inputPdf: tmpOut,
      outputPdf,
      quality: qualityKey,
      onProgress,
    });
    return {
      outputPdf: compressed.outputPdf,
      pageCount: total,
      quality: compressed.quality,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  reversePages,
};
