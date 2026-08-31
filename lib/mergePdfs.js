const fs = require("fs");
const path = require("path");
const { findGhostscript, runGs } = require("./gs");

/**
 * @typedef {object} MergePdfsOptions
 * @property {string[]} pdfPaths
 * @property {string} outputPdf
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * Merge multiple PDFs into one (Ghostscript pdfwrite), in selection order.
 *
 * @param {MergePdfsOptions} options
 * @returns {Promise<{ outputPdf: string, fileCount: number }>}
 */
async function mergePdfs({ pdfPaths, outputPdf, onProgress = () => {} }) {
  const gsCheck = findGhostscript();
  if (!gsCheck.ok) {
    throw new Error(gsCheck.error);
  }
  const gs = gsCheck.path;

  if (!Array.isArray(pdfPaths) || pdfPaths.length === 0) {
    throw new Error("Select at least one PDF.");
  }
  if (pdfPaths.length < 2) {
    throw new Error("Select at least two PDFs to combine.");
  }
  if (!outputPdf) {
    throw new Error("Output path is required.");
  }

  const outDir = path.dirname(outputPdf);
  if (!fs.existsSync(outDir)) {
    throw new Error(`Output folder does not exist: ${outDir}`);
  }

  const resolvedOut = path.resolve(outputPdf);
  for (const pdf of pdfPaths) {
    if (!pdf || !fs.existsSync(pdf)) {
      throw new Error(`PDF not found: ${pdf || "(empty)"}`);
    }
    if (path.resolve(pdf) === resolvedOut) {
      throw new Error("Output path must differ from every input PDF.");
    }
  }

  onProgress(`Merging ${pdfPaths.length} PDFs…`);
  await runGs(gs, [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=pdfwrite",
    `-sOutputFile=${outputPdf}`,
    ...pdfPaths,
  ]);

  if (!fs.existsSync(outputPdf)) {
    throw new Error("Ghostscript finished but the output PDF was not created.");
  }

  onProgress(`Done. Combined ${pdfPaths.length} files.`);
  return { outputPdf, fileCount: pdfPaths.length };
}

module.exports = {
  mergePdfs,
};
