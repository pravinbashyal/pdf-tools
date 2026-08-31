const fs = require("fs");
const os = require("os");
const path = require("path");
const { findGhostscript, runGs, pageCount } = require("./gs");

/**
 * @typedef {object} CombineOptions
 * @property {string} oddPdf
 * @property {string} evenPdf
 * @property {string} outputPdf
 * @property {boolean} reverseEven
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * Combine odd + even page scans into one interleaved PDF (Ghostscript).
 * Same workflow as scripts/combine-duplex-scan.sh.
 *
 * Note: Ghostscript 10.07+ rejects -sPageList=reverse ("Must be increasing
 * order"), so reverse is done by extracting even pages from last to first.
 *
 * @param {CombineOptions} options
 * @returns {Promise<{ outputPdf: string, oddCount: number, evenCount: number, totalPages: number }>}
 */
async function combineDuplex({
  oddPdf,
  evenPdf,
  outputPdf,
  reverseEven,
  onProgress = () => {},
}) {
  const gsCheck = findGhostscript();
  if (!gsCheck.ok) {
    throw new Error(gsCheck.error);
  }
  const gs = gsCheck.path;

  if (!oddPdf || !fs.existsSync(oddPdf)) {
    throw new Error("Odd-pages PDF not found.");
  }
  if (!evenPdf || !fs.existsSync(evenPdf)) {
    throw new Error("Even-pages PDF not found.");
  }
  if (!outputPdf) {
    throw new Error("Output path is required.");
  }

  const outDir = path.dirname(outputPdf);
  if (!fs.existsSync(outDir)) {
    throw new Error(`Output folder does not exist: ${outDir}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "duplex-combiner-"));

  try {
    onProgress("Counting pages…");
    const oddN = await pageCount(gs, oddPdf);
    const evenN = await pageCount(gs, evenPdf);

    if (oddN < 1) {
      throw new Error("Odd-pages PDF has no pages.");
    }
    if (evenN > oddN || evenN < oddN - 1) {
      throw new Error(
        `Page counts look wrong (odd=${oddN}, even=${evenN}). Even should equal odd, or be one less.`
      );
    }

    onProgress(`Odd: ${oddN} · Even: ${evenN}`);

    onProgress("Extracting odd pages…");
    for (let i = 1; i <= oddN; i++) {
      const out = path.join(tmp, `o-${String(i).padStart(4, "0")}.pdf`);
      await runGs(gs, [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        `-dFirstPage=${i}`,
        `-dLastPage=${i}`,
        `-sOutputFile=${out}`,
        oddPdf,
      ]);
      if (i === 1 || i === oddN || i % 5 === 0) {
        onProgress(`Extracting odd pages… ${i}/${oddN}`);
      }
    }

    if (evenN > 0) {
      const label = reverseEven
        ? "Extracting even pages (reversed)…"
        : "Extracting even pages…";
      onProgress(label);
      for (let i = 1; i <= evenN; i++) {
        // When reversing, pull source pages from last → first into e-0001…
        const srcPage = reverseEven ? evenN - i + 1 : i;
        const out = path.join(tmp, `e-${String(i).padStart(4, "0")}.pdf`);
        await runGs(gs, [
          "-q",
          "-dNOPAUSE",
          "-dBATCH",
          "-dSAFER",
          "-sDEVICE=pdfwrite",
          `-dFirstPage=${srcPage}`,
          `-dLastPage=${srcPage}`,
          `-sOutputFile=${out}`,
          evenPdf,
        ]);
        if (i === 1 || i === evenN || i % 5 === 0) {
          onProgress(`${label} ${i}/${evenN}`);
        }
      }
    }

    const mergeList = [];
    for (let i = 1; i <= oddN; i++) {
      mergeList.push(path.join(tmp, `o-${String(i).padStart(4, "0")}.pdf`));
      if (i <= evenN) {
        mergeList.push(path.join(tmp, `e-${String(i).padStart(4, "0")}.pdf`));
      }
    }

    onProgress("Merging interleaved PDF…");
    await runGs(gs, [
      "-q",
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${outputPdf}`,
      ...mergeList,
    ]);

    const totalPages = oddN + evenN;
    onProgress(`Done. Wrote ${totalPages} pages.`);

    return {
      outputPdf,
      oddCount: oddN,
      evenCount: evenN,
      totalPages,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  combineDuplex,
  findGhostscript,
};
