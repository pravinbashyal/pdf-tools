const statusEl = document.getElementById("status");
const gsBanner = document.getElementById("gsBanner");
const gsBannerText = document.getElementById("gsBannerText");

let gsOk = false;
let busy = false;
let mode = "home";

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

const modeHints = {
  home: "Choose a tool to get started.",
  duplex: "Select odd and even scan PDFs to interleave.",
  compress: "Select a PDF and a quality preset to compress.",
  arrange: "Open a PDF, reorder or delete pages, then export.",
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

function setBusy(next) {
  busy = next;
  document.querySelectorAll(".feature-card, .back-link, #homeBtn").forEach((el) => {
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
  updateActionButtons();
});

document.getElementById("evenPick").addEventListener("click", async () => {
  const file = await window.duplexApi.pickPdf();
  if (!file) return;
  evenFile = file;
  document.getElementById("evenPath").value = file;
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
  const out = document.getElementById("compressOutName");
  if (!out.value.trim()) {
    out.value = `${base}-compressed.pdf`;
  }
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
    const out = document.getElementById("arrangeOutName");
    if (!out.value.trim()) {
      out.value = `${base}-arranged.pdf`;
    }

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
    } else {
      setStatus(result.error || "Arrange failed.", "error");
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    setBusy(false);
  }
});

const unsubscribeProgress = window.duplexApi.onProgress((message) => {
  if (busy) setStatus(message, "busy");
});

window.addEventListener("beforeunload", () => {
  unsubscribeProgress();
});

initGhostscript();
