const statusEl = document.getElementById("status");
const gsBanner = document.getElementById("gsBanner");
const gsBannerText = document.getElementById("gsBannerText");
const showInFinderBtn = document.getElementById("showInFinderBtn");

let gsOk = false;
let busy = false;
let mode = "home";

/** @type {string} path of the most recently successfully created output file, "" if none yet */
let lastOutputPath = "";

/** @type {string} */
let oddFile = "";
/** @type {string} */
let evenFile = "";
/** @type {string} */
let duplexFolder = "";

/** @type {string} */
let compressFile = "";
/** @type {string} */
let compressFolder = "";

/** @type {string[]} */
let imageFiles = [];
/** @type {string} */
let imagesFolder = "";

/** @type {string[]} */
let mergeFiles = [];
/** @type {string} */
let mergeFolder = "";

/** @type {string} */
let arrangeFile = "";
/** @type {string} */
let arrangeFolder = "";
/** @type {number[]} 1-based source page numbers in current order */
let arrangePages = [];

/** @type {string} */
let orientFile = "";
/** @type {string} */
let orientFolder = "";
/** @type {{ page: number, degrees: number }[]} */
let orientPages = [];

/** @type {string} */
let reverseFile = "";
/** @type {string} */
let reverseFolder = "";

const modeHints = {
  home: "Choose a tool to get started.",
  duplex: "Select odd and even scan PDFs to interleave.",
  compress: "Select a PDF and a quality preset to compress.",
  arrange: "Open a PDF, reorder or delete pages, then export.",
  orient: "Select a PDF and a rotation to change orientation.",
  reverse: "Select a PDF to reverse its page order.",
  images: "Select images in page order, then create a PDF.",
  merge: "Select two or more PDFs to merge in order.",
};

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function joinPath(dir, name) {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const base = dir.endsWith("/") || dir.endsWith("\\") ? dir.slice(0, -1) : dir;
  return `${base}${sep}${name}`;
}

function normalizeFilename(name) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}

function basename(filePath) {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function dirname(filePath) {
  const trimmed =
    filePath.endsWith("/") || filePath.endsWith("\\") ? filePath.slice(0, -1) : filePath;
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx === -1) return "";
  if (idx === 0) return trimmed.slice(0, 1);
  return trimmed.slice(0, idx);
}

/**
 * Prefills an output folder + filename pair from a just-picked input file,
 * but only while each field is still blank. The filename is deduplicated
 * against the resolved output folder's contents via `suggestOutputName`.
 *
 * @param {string} file - the picked input file whose folder is the candidate default
 * @param {{ outDirId: string, outNameId: string, defaultBaseName: string, applyFolder: (dir: string) => void }} opts
 */
async function prefillOutputDefaults(file, { outDirId, outNameId, defaultBaseName, applyFolder }) {
  const outDirEl = document.getElementById(outDirId);
  const outNameEl = document.getElementById(outNameId);

  if (!outDirEl.value.trim()) {
    const dir = dirname(file);
    outDirEl.value = dir;
    applyFolder(dir);
  }

  if (!outNameEl.value.trim()) {
    const targetFolder = outDirEl.value.trim();
    let suggested = defaultBaseName;
    try {
      suggested = await window.duplexApi.suggestOutputName({
        folder: targetFolder,
        baseName: defaultBaseName,
      });
    } catch {
      // If the dedup lookup fails for any reason, fall back to the plain default name.
    }
    // Re-check: the user may have typed a filename while the IPC call was in flight.
    if (!outNameEl.value.trim()) {
      outNameEl.value = suggested;
    }
  }
}

/**
 * Records the most recent successful output and reveals the shared
 * "Show in Finder" button, replacing whichever earlier output it pointed to.
 *
 * @param {string} outputPath
 */
function revealOutput(outputPath) {
  lastOutputPath = outputPath;
  showInFinderBtn.hidden = false;
  showInFinderBtn.disabled = false;
}

showInFinderBtn.addEventListener("click", () => {
  if (!lastOutputPath) return;
  window.duplexApi.showItemInFolder(lastOutputPath);
});

function setBusy(next) {
  busy = next;
  document.querySelectorAll(".feature-card, .back-link, #homeBtn").forEach((el) => {
    el.disabled = busy;
  });
  document.querySelectorAll("#orientList .btn-icon").forEach((el) => {
    el.disabled = busy;
  });
  updateActionButtons();
}

function updateActionButtons() {
  const duplexBtn = document.getElementById("duplexBtn");
  const compressBtn = document.getElementById("compressBtn");
  const imagesBtn = document.getElementById("imagesBtn");
  const imagesClear = document.getElementById("imagesClear");
  const mergeBtn = document.getElementById("mergeBtn");
  const mergeClear = document.getElementById("mergeClear");
  const arrangeBtn = document.getElementById("arrangeBtn");
  const orientBtn = document.getElementById("orientBtn");
  const reverseBtn = document.getElementById("reverseBtn");

  duplexBtn.disabled =
    busy ||
    !gsOk ||
    !oddFile ||
    !evenFile ||
    !normalizeFilename(document.getElementById("duplexOutName").value) ||
    !duplexFolder;

  compressBtn.disabled =
    busy ||
    !gsOk ||
    !compressFile ||
    !normalizeFilename(document.getElementById("compressOutName").value) ||
    !compressFolder;

  imagesBtn.disabled =
    busy ||
    !gsOk ||
    imageFiles.length === 0 ||
    !normalizeFilename(document.getElementById("imagesOutName").value) ||
    !imagesFolder;

  imagesClear.disabled = busy || imageFiles.length === 0;

  mergeBtn.disabled =
    busy ||
    !gsOk ||
    mergeFiles.length < 2 ||
    !normalizeFilename(document.getElementById("mergeOutName").value) ||
    !mergeFolder;

  mergeClear.disabled = busy || mergeFiles.length === 0;

  arrangeBtn.disabled =
    busy ||
    !gsOk ||
    !arrangeFile ||
    arrangePages.length === 0 ||
    !normalizeFilename(document.getElementById("arrangeOutName").value) ||
    !arrangeFolder;

  const orientMode = getOrientMode();
  const orientReady =
    orientMode === "all"
      ? getOrientAngle() != null
      : orientPages.length > 0;
  orientBtn.disabled =
    busy ||
    !gsOk ||
    !orientFile ||
    !orientReady ||
    !normalizeFilename(document.getElementById("orientOutName").value) ||
    !orientFolder;

  reverseBtn.disabled =
    busy ||
    !gsOk ||
    !reverseFile ||
    !normalizeFilename(document.getElementById("reverseOutName").value) ||
    !reverseFolder;
}

function getOrientMode() {
  const el = document.querySelector('input[name="orientMode"]:checked');
  return el && el.value === "page" ? "page" : "all";
}

function getOrientAngle() {
  const el = document.querySelector('input[name="orientAngle"]:checked');
  if (!el) return null;
  const n = Number(el.value);
  return n === 90 || n === 180 || n === 270 ? n : null;
}

function applyOrientModeUi() {
  const isAll = getOrientMode() === "all";
  document.getElementById("orientAllPages").hidden = !isAll;
  document.getElementById("orientPerPage").hidden = isAll;
}

function applyOrientCompressUi() {
  const on = document.getElementById("orientCompress").checked;
  const field = document.getElementById("orientQualityField");
  const select = document.getElementById("orientQuality");
  field.hidden = !on;
  select.disabled = !on;
}

async function prefillOrientDefaults(file) {
  const base = basename(file).replace(/\.pdf$/i, "");
  await prefillOutputDefaults(file, {
    outDirId: "orientOutDir",
    outNameId: "orientOutName",
    defaultBaseName: `${base}-rotated.pdf`,
    applyFolder: (dir) => {
      orientFolder = dir;
    },
  });
}

function applyReverseCompressUi() {
  const on = document.getElementById("reverseCompress").checked;
  const field = document.getElementById("reverseQualityField");
  const select = document.getElementById("reverseQuality");
  field.hidden = !on;
  select.disabled = !on;
}

async function prefillReverseDefaults(file) {
  const base = basename(file).replace(/\.pdf$/i, "");
  await prefillOutputDefaults(file, {
    outDirId: "reverseOutDir",
    outNameId: "reverseOutName",
    defaultBaseName: `${base}-reversed.pdf`,
    applyFolder: (dir) => {
      reverseFolder = dir;
    },
  });
}

function switchMode(next) {
  if (busy || next === mode) return;
  mode = next;

  document.querySelectorAll(".panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== mode;
  });

  if (!busy) {
    setStatus(gsOk ? modeHints[mode] || "Ready." : "Ghostscript is required for all tools.");
  }
}

async function initGhostscript() {
  const result = await window.duplexApi.checkGhostscript();
  if (result.ok) {
    gsOk = true;
    gsBanner.hidden = true;
    setStatus(`Ghostscript ready (${result.path}). ${modeHints[mode]}`);
  } else {
    gsOk = false;
    gsBanner.hidden = false;
    gsBannerText.textContent = result.error;
    setStatus(result.error, "error");
  }
  updateActionButtons();
}

function renderFileList(listId, files, { onMove, onRemove }) {
  const list = document.getElementById(listId);
  list.innerHTML = "";
  files.forEach((file, i) => {
    const li = document.createElement("li");

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = String(i + 1);

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = basename(file);
    name.title = file;

    const actions = document.createElement("div");
    actions.className = "page-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn-icon";
    up.textContent = "↑";
    up.title = "Move up";
    up.disabled = busy || i === 0;
    up.addEventListener("click", () => onMove(i, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn-icon";
    down.textContent = "↓";
    down.title = "Move down";
    down.disabled = busy || i === files.length - 1;
    down.addEventListener("click", () => onMove(i, 1));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-icon danger";
    remove.textContent = "Delete";
    remove.title = "Remove from selection";
    remove.disabled = busy;
    remove.addEventListener("click", () => onRemove(i));

    actions.append(up, down, remove);
    li.append(idx, name, actions);
    list.appendChild(li);
  });
}

function renderArrangeList() {
  const list = document.getElementById("arrangeList");
  const empty = document.getElementById("arrangeEmpty");
  list.innerHTML = "";

  if (arrangePages.length === 0) {
    empty.hidden = Boolean(arrangeFile);
    empty.textContent = arrangeFile
      ? "All pages removed. Open the PDF again or keep at least one page."
      : "Open a PDF to list its pages.";
    updateActionButtons();
    return;
  }

  empty.hidden = true;

  arrangePages.forEach((srcPage, i) => {
    const li = document.createElement("li");

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = String(i + 1);

    const label = document.createElement("span");
    label.className = "page-label";
    label.textContent = `Page ${srcPage}`;

    const actions = document.createElement("div");
    actions.className = "page-actions";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "btn-icon";
    up.textContent = "↑";
    up.title = "Move up";
    up.disabled = busy || i === 0;
    up.addEventListener("click", () => moveArrangePage(i, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.className = "btn-icon";
    down.textContent = "↓";
    down.title = "Move down";
    down.disabled = busy || i === arrangePages.length - 1;
    down.addEventListener("click", () => moveArrangePage(i, 1));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-icon danger";
    del.textContent = "Delete";
    del.title = "Remove from export";
    del.disabled = busy;
    del.addEventListener("click", () => {
      arrangePages.splice(i, 1);
      renderArrangeList();
    });

    actions.append(up, down, del);
    li.append(idx, label, actions);
    list.appendChild(li);
  });

  updateActionButtons();
}

function moveArrangePage(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= arrangePages.length) return;
  const tmp = arrangePages[index];
  arrangePages[index] = arrangePages[next];
  arrangePages[next] = tmp;
  renderArrangeList();
}

document.getElementById("homeBtn").addEventListener("click", () => switchMode("home"));

document.querySelectorAll("[data-open-mode]").forEach((el) => {
  el.addEventListener("click", () => switchMode(el.dataset.openMode));
});

// Duplex
document.getElementById("oddPick").addEventListener("click", async () => {
  const file = await window.duplexApi.pickPdf();
  if (!file) return;
  oddFile = file;
  document.getElementById("oddPath").value = file;
  await prefillOutputDefaults(file, {
    outDirId: "duplexOutDir",
    outNameId: "duplexOutName",
    defaultBaseName: "combined.pdf",
    applyFolder: (dir) => {
      duplexFolder = dir;
    },
  });
  updateActionButtons();
});

document.getElementById("evenPick").addEventListener("click", async () => {
  const file = await window.duplexApi.pickPdf();
  if (!file) return;
  evenFile = file;
  document.getElementById("evenPath").value = file;
  await prefillOutputDefaults(file, {
    outDirId: "duplexOutDir",
    outNameId: "duplexOutName",
    defaultBaseName: "combined.pdf",
    applyFolder: (dir) => {
      duplexFolder = dir;
    },
  });
  updateActionButtons();
});

document.getElementById("duplexFolderPick").addEventListener("click", async () => {
  const folder = await window.duplexApi.pickFolder();
  if (!folder) return;
  duplexFolder = folder;
  document.getElementById("duplexOutDir").value = folder;
  updateActionButtons();
});

document.getElementById("duplexOutName").addEventListener("input", updateActionButtons);

document.getElementById("form-duplex").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !gsOk) return;

  const filename = normalizeFilename(document.getElementById("duplexOutName").value);
  if (!oddFile || !evenFile || !filename || !duplexFolder) {
    setStatus("Please choose both PDFs, a filename, and an output folder.", "error");
    return;
  }

  const outputPdf = joinPath(duplexFolder, filename);
  setBusy(true);
  setStatus("Starting…", "busy");

  try {
    const result = await window.duplexApi.combine({
      oddPdf: oddFile,
      evenPdf: evenFile,
      outputPdf,
      reverseEven: document.getElementById("reverseEven").checked,
    });

    if (result.ok) {
      setStatus(
        `Success: ${result.totalPages} pages written to ${result.outputPdf}`,
        "ok"
      );
      revealOutput(result.outputPdf);
      document.getElementById("duplexOutName").value = "";
      await prefillOutputDefaults(oddFile, {
        outDirId: "duplexOutDir",
        outNameId: "duplexOutName",
        defaultBaseName: "combined.pdf",
        applyFolder: (dir) => {
          duplexFolder = dir;
        },
      });
    } else {
      setStatus(result.error || "Combine failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

// Compress
document.getElementById("compressPick").addEventListener("click", async () => {
  const file = await window.duplexApi.pickPdf();
  if (!file) return;
  compressFile = file;
  document.getElementById("compressPath").value = file;
  const base = basename(file).replace(/\.pdf$/i, "");
  await prefillOutputDefaults(file, {
    outDirId: "compressOutDir",
    outNameId: "compressOutName",
    defaultBaseName: `${base}-compressed.pdf`,
    applyFolder: (dir) => {
      compressFolder = dir;
    },
  });
  updateActionButtons();
});

document.getElementById("compressFolderPick").addEventListener("click", async () => {
  const folder = await window.duplexApi.pickFolder();
  if (!folder) return;
  compressFolder = folder;
  document.getElementById("compressOutDir").value = folder;
  updateActionButtons();
});

document.getElementById("compressOutName").addEventListener("input", updateActionButtons);

document.getElementById("form-compress").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !gsOk) return;

  const filename = normalizeFilename(document.getElementById("compressOutName").value);
  if (!compressFile || !filename || !compressFolder) {
    setStatus("Please choose a PDF, a filename, and an output folder.", "error");
    return;
  }

  const outputPdf = joinPath(compressFolder, filename);
  setBusy(true);
  setStatus("Starting…", "busy");

  try {
    const result = await window.duplexApi.compress({
      inputPdf: compressFile,
      outputPdf,
      quality: document.getElementById("compressQuality").value,
    });

    if (result.ok) {
      const inMb = (result.inputBytes / (1024 * 1024)).toFixed(2);
      const outMb = (result.outputBytes / (1024 * 1024)).toFixed(2);
      setStatus(
        `Success: ${inMb} MB → ${outMb} MB (${result.quality}) · ${result.outputPdf}`,
        "ok"
      );
      revealOutput(result.outputPdf);
      document.getElementById("compressOutName").value = "";
      const base = basename(compressFile).replace(/\.pdf$/i, "");
      await prefillOutputDefaults(compressFile, {
        outDirId: "compressOutDir",
        outNameId: "compressOutName",
        defaultBaseName: `${base}-compressed.pdf`,
        applyFolder: (dir) => {
          compressFolder = dir;
        },
      });
    } else {
      setStatus(result.error || "Compress failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

// Images → PDF
function renderImagesList() {
  renderFileList("imagesList", imageFiles, { onMove: moveImageFile, onRemove: removeImageFile });
}

function moveImageFile(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= imageFiles.length) return;
  const tmp = imageFiles[index];
  imageFiles[index] = imageFiles[next];
  imageFiles[next] = tmp;
  renderImagesList();
}

function removeImageFile(index) {
  imageFiles.splice(index, 1);
  renderImagesList();
  updateActionButtons();
}

document.getElementById("imagesPick").addEventListener("click", async () => {
  const files = await window.duplexApi.pickImages();
  if (!files || files.length === 0) return;
  imageFiles = imageFiles.concat(files);
  renderImagesList();
  await prefillOutputDefaults(files[0], {
    outDirId: "imagesOutDir",
    outNameId: "imagesOutName",
    defaultBaseName: "images.pdf",
    applyFolder: (dir) => {
      imagesFolder = dir;
    },
  });
  updateActionButtons();
});

document.getElementById("imagesClear").addEventListener("click", () => {
  imageFiles = [];
  renderImagesList();
  updateActionButtons();
});

document.getElementById("imagesFolderPick").addEventListener("click", async () => {
  const folder = await window.duplexApi.pickFolder();
  if (!folder) return;
  imagesFolder = folder;
  document.getElementById("imagesOutDir").value = folder;
  updateActionButtons();
});

document.getElementById("imagesOutName").addEventListener("input", updateActionButtons);

document.getElementById("form-images").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !gsOk) return;

  const filename = normalizeFilename(document.getElementById("imagesOutName").value);
  if (imageFiles.length === 0 || !filename || !imagesFolder) {
    setStatus("Please choose images, a filename, and an output folder.", "error");
    return;
  }

  const outputPdf = joinPath(imagesFolder, filename);
  setBusy(true);
  setStatus("Starting…", "busy");

  try {
    const result = await window.duplexApi.imagesToPdf({
      imagePaths: imageFiles,
      outputPdf,
    });

    if (result.ok) {
      setStatus(
        `Success: ${result.pageCount} page${result.pageCount === 1 ? "" : "s"} → ${result.outputPdf}`,
        "ok"
      );
      revealOutput(result.outputPdf);
      document.getElementById("imagesOutName").value = "";
      await prefillOutputDefaults(imageFiles[0], {
        outDirId: "imagesOutDir",
        outNameId: "imagesOutName",
        defaultBaseName: "images.pdf",
        applyFolder: (dir) => {
          imagesFolder = dir;
        },
      });
    } else {
      setStatus(result.error || "Images to PDF failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

// PDF combiner
function renderMergeList() {
  renderFileList("mergeList", mergeFiles, { onMove: moveMergeFile, onRemove: removeMergeFile });
}

function moveMergeFile(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= mergeFiles.length) return;
  const tmp = mergeFiles[index];
  mergeFiles[index] = mergeFiles[next];
  mergeFiles[next] = tmp;
  renderMergeList();
}

function removeMergeFile(index) {
  mergeFiles.splice(index, 1);
  renderMergeList();
  updateActionButtons();
}

document.getElementById("mergePick").addEventListener("click", async () => {
  const files = await window.duplexApi.pickPdfs();
  if (!files || files.length === 0) return;
  mergeFiles = mergeFiles.concat(files);
  renderMergeList();
  await prefillOutputDefaults(files[0], {
    outDirId: "mergeOutDir",
    outNameId: "mergeOutName",
    defaultBaseName: "merged.pdf",
    applyFolder: (dir) => {
      mergeFolder = dir;
    },
  });
  updateActionButtons();
});

document.getElementById("mergeClear").addEventListener("click", () => {
  mergeFiles = [];
  renderMergeList();
  updateActionButtons();
});

document.getElementById("mergeFolderPick").addEventListener("click", async () => {
  const folder = await window.duplexApi.pickFolder();
  if (!folder) return;
  mergeFolder = folder;
  document.getElementById("mergeOutDir").value = folder;
  updateActionButtons();
});

document.getElementById("mergeOutName").addEventListener("input", updateActionButtons);

document.getElementById("form-merge").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !gsOk) return;

  const filename = normalizeFilename(document.getElementById("mergeOutName").value);
  if (mergeFiles.length < 2 || !filename || !mergeFolder) {
    setStatus("Please choose at least two PDFs, a filename, and an output folder.", "error");
    return;
  }

  const outputPdf = joinPath(mergeFolder, filename);
  setBusy(true);
  setStatus("Starting…", "busy");

  try {
    const result = await window.duplexApi.mergePdfs({
      pdfPaths: mergeFiles,
      outputPdf,
    });

    if (result.ok) {
      setStatus(
        `Success: combined ${result.fileCount} PDFs → ${result.outputPdf}`,
        "ok"
      );
      revealOutput(result.outputPdf);
      document.getElementById("mergeOutName").value = "";
      await prefillOutputDefaults(mergeFiles[0], {
        outDirId: "mergeOutDir",
        outNameId: "mergeOutName",
        defaultBaseName: "merged.pdf",
        applyFolder: (dir) => {
          mergeFolder = dir;
        },
      });
    } else {
      setStatus(result.error || "Merge failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

// Pages arranger
document.getElementById("arrangePick").addEventListener("click", async () => {
  const file = await window.duplexApi.pickPdf();
  if (!file) return;

  setBusy(true);
  setStatus("Reading page count…", "busy");

  try {
    const result = await window.duplexApi.inspectPdf(file);
    if (!result.ok) {
      setStatus(result.error || "Could not read PDF.", "error");
      return;
    }

    arrangeFile = file;
    document.getElementById("arrangePath").value = file;
    arrangePages = Array.from({ length: result.pageCount }, (_, i) => i + 1);

    const base = basename(file).replace(/\.pdf$/i, "");
    await prefillOutputDefaults(file, {
      outDirId: "arrangeOutDir",
      outNameId: "arrangeOutName",
      defaultBaseName: `${base}-arranged.pdf`,
      applyFolder: (dir) => {
        arrangeFolder = dir;
      },
    });

    renderArrangeList();
    setStatus(`Loaded ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}.`, "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

document.getElementById("arrangeFolderPick").addEventListener("click", async () => {
  const folder = await window.duplexApi.pickFolder();
  if (!folder) return;
  arrangeFolder = folder;
  document.getElementById("arrangeOutDir").value = folder;
  updateActionButtons();
});

document.getElementById("arrangeOutName").addEventListener("input", updateActionButtons);

document.getElementById("form-arrange").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !gsOk) return;

  const filename = normalizeFilename(document.getElementById("arrangeOutName").value);
  if (!arrangeFile || arrangePages.length === 0 || !filename || !arrangeFolder) {
    setStatus("Please choose a PDF, keep at least one page, a filename, and a folder.", "error");
    return;
  }

  const outputPdf = joinPath(arrangeFolder, filename);
  setBusy(true);
  setStatus("Starting…", "busy");

  try {
    const result = await window.duplexApi.arrangePages({
      inputPdf: arrangeFile,
      pageOrder: arrangePages.slice(),
      outputPdf,
    });

    if (result.ok) {
      setStatus(
        `Success: ${result.pageCount} page${result.pageCount === 1 ? "" : "s"} → ${result.outputPdf}`,
        "ok"
      );
      revealOutput(result.outputPdf);
      document.getElementById("arrangeOutName").value = "";
      const base = basename(arrangeFile).replace(/\.pdf$/i, "");
      await prefillOutputDefaults(arrangeFile, {
        outDirId: "arrangeOutDir",
        outNameId: "arrangeOutName",
        defaultBaseName: `${base}-arranged.pdf`,
        applyFolder: (dir) => {
          arrangeFolder = dir;
        },
      });
    } else {
      setStatus(result.error || "Arrange failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

// Change orientation
function renderOrientList() {
  const list = document.getElementById("orientList");
  const empty = document.getElementById("orientEmpty");
  list.innerHTML = "";

  if (orientPages.length === 0) {
    empty.hidden = false;
    empty.textContent = "Open a PDF to list its pages.";
    updateActionButtons();
    return;
  }

  empty.hidden = true;

  orientPages.forEach((item, i) => {
    const li = document.createElement("li");

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = String(item.page);

    const label = document.createElement("span");
    label.className = "page-label";
    label.textContent = `Page ${item.page}`;

    const angle = document.createElement("span");
    angle.className = "page-angle";
    angle.textContent = `${item.degrees}°`;

    const actions = document.createElement("div");
    actions.className = "page-actions";

    const ccw = document.createElement("button");
    ccw.type = "button";
    ccw.className = "btn-icon";
    ccw.textContent = "90° CCW";
    ccw.title = "Rotate 90° counter-clockwise";
    ccw.disabled = busy;
    ccw.addEventListener("click", () => stepOrientPage(i, -90));

    const cw = document.createElement("button");
    cw.type = "button";
    cw.className = "btn-icon";
    cw.textContent = "90° CW";
    cw.title = "Rotate 90° clockwise";
    cw.disabled = busy;
    cw.addEventListener("click", () => stepOrientPage(i, 90));

    actions.append(ccw, cw);
    li.append(idx, label, angle, actions);
    list.appendChild(li);
  });

  updateActionButtons();
}

function stepOrientPage(index, delta) {
  const item = orientPages[index];
  item.degrees = (((item.degrees + delta) % 360) + 360) % 360;
  renderOrientList();
}

function setOrientPagesFromCount(pageCount) {
  orientPages = Array.from({ length: pageCount }, (_, i) => ({
    page: i + 1,
    degrees: 0,
  }));
}

async function inspectOrientFile(file) {
  const result = await window.duplexApi.inspectPdf(file);
  if (!result.ok) {
    return { ok: false, error: result.error || "Could not read PDF." };
  }
  return { ok: true, pageCount: result.pageCount };
}

document.querySelectorAll('input[name="orientMode"]').forEach((el) => {
  el.addEventListener("change", async () => {
    applyOrientModeUi();
    updateActionButtons();
    if (getOrientMode() !== "page" || !orientFile || orientPages.length > 0) {
      return;
    }

    setBusy(true);
    setStatus("Reading page count…", "busy");
    try {
      const result = await inspectOrientFile(orientFile);
      if (!result.ok) {
        orientPages = [];
        renderOrientList();
        setStatus(result.error, "error");
        return;
      }
      setOrientPagesFromCount(result.pageCount);
      renderOrientList();
      setStatus(
        `Loaded ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}.`,
        "ok"
      );
    } catch (err) {
      orientPages = [];
      renderOrientList();
      setStatus(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  });
});

document.querySelectorAll('input[name="orientAngle"]').forEach((el) => {
  el.addEventListener("change", updateActionButtons);
});

document.getElementById("orientCompress").addEventListener("change", () => {
  applyOrientCompressUi();
});

document.getElementById("orientPick").addEventListener("click", async () => {
  const file = await window.duplexApi.pickPdf();
  if (!file) return;

  if (getOrientMode() === "page") {
    setBusy(true);
    setStatus("Reading page count…", "busy");
    try {
      const result = await inspectOrientFile(file);
      if (!result.ok) {
        setStatus(result.error, "error");
        return;
      }

      orientFile = file;
      document.getElementById("orientPath").value = file;
      setOrientPagesFromCount(result.pageCount);
      await prefillOrientDefaults(file);
      renderOrientList();
      setStatus(
        `Loaded ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}.`,
        "ok"
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
    return;
  }

  orientFile = file;
  document.getElementById("orientPath").value = file;
  orientPages = [];
  renderOrientList();
  await prefillOrientDefaults(file);
  updateActionButtons();
});

document.getElementById("orientFolderPick").addEventListener("click", async () => {
  const folder = await window.duplexApi.pickFolder();
  if (!folder) return;
  orientFolder = folder;
  document.getElementById("orientOutDir").value = folder;
  updateActionButtons();
});

document.getElementById("orientOutName").addEventListener("input", updateActionButtons);

document.getElementById("form-orient").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !gsOk) return;

  const filename = normalizeFilename(document.getElementById("orientOutName").value);
  const modeNow = getOrientMode();
  const angle = getOrientAngle();
  if (
    !orientFile ||
    !filename ||
    !orientFolder ||
    (modeNow === "all" && angle == null) ||
    (modeNow === "page" && orientPages.length === 0)
  ) {
    setStatus("Please choose a PDF, a rotation, a filename, and an output folder.", "error");
    return;
  }

  const outputPdf = joinPath(orientFolder, filename);
  /** @type {{ inputPdf: string, outputPdf: string, angle?: number, pageRotations?: Record<string, number>, quality?: string }} */
  const options = {
    inputPdf: orientFile,
    outputPdf,
  };
  if (modeNow === "all") {
    options.angle = angle;
  } else {
    const pageRotations = {};
    orientPages.forEach((item) => {
      pageRotations[String(item.page)] = item.degrees;
    });
    options.pageRotations = pageRotations;
  }
  if (document.getElementById("orientCompress").checked) {
    options.quality = document.getElementById("orientQuality").value;
  }

  setBusy(true);
  setStatus("Starting…", "busy");

  try {
    const result = await window.duplexApi.rotatePages(options);

    if (result.ok) {
      const qualityNote = result.quality ? ` (${result.quality})` : "";
      setStatus(
        `Success: rotated ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}${qualityNote} → ${result.outputPdf}`,
        "ok"
      );
      revealOutput(result.outputPdf);
      document.getElementById("orientOutName").value = "";
      await prefillOrientDefaults(orientFile);
    } else {
      setStatus(result.error || "Rotate failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

// Reverse page order
document.getElementById("reverseCompress").addEventListener("change", () => {
  applyReverseCompressUi();
});

document.getElementById("reversePick").addEventListener("click", async () => {
  const file = await window.duplexApi.pickPdf();
  if (!file) return;
  reverseFile = file;
  document.getElementById("reversePath").value = file;
  await prefillReverseDefaults(file);
  updateActionButtons();
});

document.getElementById("reverseFolderPick").addEventListener("click", async () => {
  const folder = await window.duplexApi.pickFolder();
  if (!folder) return;
  reverseFolder = folder;
  document.getElementById("reverseOutDir").value = folder;
  updateActionButtons();
});

document.getElementById("reverseOutName").addEventListener("input", updateActionButtons);

document.getElementById("form-reverse").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !gsOk) return;

  const filename = normalizeFilename(document.getElementById("reverseOutName").value);
  if (!reverseFile || !filename || !reverseFolder) {
    setStatus("Please choose a PDF, a filename, and an output folder.", "error");
    return;
  }

  const outputPdf = joinPath(reverseFolder, filename);
  /** @type {{ inputPdf: string, outputPdf: string, quality?: string }} */
  const options = {
    inputPdf: reverseFile,
    outputPdf,
  };
  if (document.getElementById("reverseCompress").checked) {
    options.quality = document.getElementById("reverseQuality").value;
  }

  setBusy(true);
  setStatus("Starting…", "busy");

  try {
    const result = await window.duplexApi.reversePages(options);

    if (result.ok) {
      const qualityNote = result.quality ? ` (${result.quality})` : "";
      setStatus(
        `Success: reversed ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}${qualityNote} → ${result.outputPdf}`,
        "ok"
      );
      revealOutput(result.outputPdf);
      document.getElementById("reverseOutName").value = "";
      await prefillReverseDefaults(reverseFile);
    } else {
      setStatus(result.error || "Reverse failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

applyOrientModeUi();
applyOrientCompressUi();
applyReverseCompressUi();

const unsubscribeProgress = window.duplexApi.onProgress((message) => {
  if (busy) setStatus(message, "busy");
});

window.addEventListener("beforeunload", () => {
  unsubscribeProgress();
});

initGhostscript();
