const fs = require("fs");
const os = require("os");
const path = require("path");
const { findGhostscript, runGs, pageCount } = require("./gs");

/**
 * @typedef {object} ArrangePagesOptions
 * @property {string} inputPdf
 * @property {number[]} pageOrder 1-based page numbers in desired export order
 * @property {string} outputPdf
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * Read page count for a PDF (for the arranger UI).
 * @param {string} pdfPath
 * @returns {Promise<{ pageCount: number }>}
 */
async function inspectPdf(pdfPath) {
  const gsCheck = findGhostscript();
  if (!gsCheck.ok) {
    throw new Error(gsCheck.error);
  }
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    throw new Error("PDF not found.");
  }
  const count = await pageCount(gsCheck.path, pdfPath);
  if (count < 1) {
    throw new Error("PDF has no pages.");
  }
  return { pageCount: count };
}

/**
 * Export a PDF with pages in a custom order (and optional deletions).
 * Extracts each kept page, then merges with Ghostscript pdfwrite.
 *
 * @param {ArrangePagesOptions} options
 * @returns {Promise<{ outputPdf: string, pageCount: number }>}
 */
async function arrangePages({
  inputPdf,
  pageOrder,
  outputPdf,
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
  if (!Array.isArray(pageOrder) || pageOrder.length === 0) {
    throw new Error("Keep at least one page to export.");
  }

  const outDir = path.dirname(outputPdf);
  if (!fs.existsSync(outDir)) {
    throw new Error(`Output folder does not exist: ${outDir}`);
  }
  if (path.resolve(inputPdf) === path.resolve(outputPdf)) {
    throw new Error("Output path must be different from the input PDF.");
  }

  onProgress("Counting pages…");
  const total = await pageCount(gs, inputPdf);
  if (total < 1) {
    throw new Error("PDF has no pages.");
  }

  const seen = new Set();
  for (const n of pageOrder) {
    const page = Number(n);
    if (!Number.isInteger(page) || page < 1 || page > total) {
      throw new Error(
        `Invalid page number ${n}. PDF has ${total} page${total === 1 ? "" : "s"}.`
      );
    }
    if (seen.has(page)) {
      throw new Error(`Page ${page} appears more than once in the order.`);
    }
    seen.add(page);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "duplex-arrange-"));

  try {
    /** @type {string[]} */
    const pagePdfs = [];
    for (let i = 0; i < pageOrder.length; i++) {
      const page = Number(pageOrder[i]);
      const out = path.join(tmp, `p-${String(i).padStart(4, "0")}.pdf`);
      await runGs(gs, [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        `-dFirstPage=${page}`,
        `-dLastPage=${page}`,
        `-sOutputFile=${out}`,
        inputPdf,
      ]);
      pagePdfs.push(out);
      if (i === 0 || i === pageOrder.length - 1 || (i + 1) % 5 === 0) {
        onProgress(`Extracting pages… ${i + 1}/${pageOrder.length}`);
      }
    }

    onProgress("Writing rearranged PDF…");
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

module.exports = {
  inspectPdf,
  arrangePages,
};
