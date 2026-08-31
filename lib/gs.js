const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CANDIDATE_PATHS = [
  "/opt/homebrew/bin/gs",
  "/usr/local/bin/gs",
  "/usr/bin/gs",
];

/**
 * Resolve Ghostscript binary: PATH first, then common install locations.
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
function findGhostscript() {
  const pathEnv = process.env.PATH || "";
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);

  for (const dir of dirs) {
    const candidate = path.join(dir, "gs");
    if (isExecutable(candidate)) {
      return { ok: true, path: candidate };
    }
  }

  for (const candidate of CANDIDATE_PATHS) {
    if (isExecutable(candidate)) {
      return { ok: true, path: candidate };
    }
  }

  return {
    ok: false,
    error:
      "Ghostscript (gs) was not found. Install it with Homebrew: brew install ghostscript. Checked PATH and common locations (/opt/homebrew/bin/gs, /usr/local/bin/gs).",
  };
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Run a command and collect stdout/stderr.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function run(cmd, args) {
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
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * @param {string} gsPath
 * @param {string[]} args
 */
async function runGs(gsPath, args) {
  const result = await run(gsPath, args);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      detail
        ? `Ghostscript failed (exit ${result.code}): ${detail}`
        : `Ghostscript failed with exit code ${result.code}.`
    );
  }
  return result;
}

/**
 * PDF page count via Ghostscript (same approach as combine-duplex-scan.sh).
 * @param {string} gsPath
 * @param {string} pdfPath
 * @returns {Promise<number>}
 */
async function pageCount(gsPath, pdfPath) {
  // Escape for PostScript string: backslash and parens
  const escaped = pdfPath.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const result = await run(gsPath, [
    "-q",
    "-dNODISPLAY",
    "-dNOSAFER",
    "-c",
    `(${escaped}) (r) file runpdfbegin pdfpagecount = quit`,
  ]);
  if (result.code !== 0) {
    throw new Error(
      `Could not read page count from ${path.basename(pdfPath)}: ${(result.stderr || result.stdout).trim()}`
    );
  }
  const match = result.stdout.trim().match(/(\d+)/);
  if (!match) {
    throw new Error(`Could not read page counts from the PDFs (${path.basename(pdfPath)}).`);
  }
  return parseInt(match[1], 10);
}

module.exports = {
  findGhostscript,
  runGs,
  pageCount,
};
