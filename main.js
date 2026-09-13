const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const { combineDuplex, findGhostscript } = require("./lib/combine");
const { compressPdf } = require("./lib/compress");
const { imagesToPdf } = require("./lib/imagesToPdf");
const { mergePdfs } = require("./lib/mergePdfs");
const { inspectPdf, arrangePages } = require("./lib/arrangePages");
const { rotatePages } = require("./lib/rotatePages");
const { reversePages } = require("./lib/reversePages");
const { suggestOutputName } = require("./lib/suggestOutputName");

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 780,
    minWidth: 560,
    minHeight: 620,
    title: "PDF Tools",
    backgroundColor: "#f3efe6",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} message
 */
function sendProgress(event, message) {
  if (!event.sender.isDestroyed()) {
    event.sender.send("job:progress", message);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("gs:check", () => {
  return findGhostscript();
});

ipcMain.handle("dialog:openPdf", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select PDF",
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("dialog:openPdfs", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select PDFs",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths;
});

ipcMain.handle("dialog:openImages", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select images",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "tif", "tiff", "heic", "heif"],
      },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths;
});

ipcMain.handle("shell:showItem", (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("output:suggestName", (_event, options) => {
  return suggestOutputName(options.folder, options.baseName);
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose output folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("combine:run", async (event, options) => {
  try {
    const result = await combineDuplex({
      oddPdf: options.oddPdf,
      evenPdf: options.evenPdf,
      outputPdf: options.outputPdf,
      reverseEven: Boolean(options.reverseEven),
      onProgress: (message) => sendProgress(event, message),
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("compress:run", async (event, options) => {
  try {
    const result = await compressPdf({
      inputPdf: options.inputPdf,
      outputPdf: options.outputPdf,
      quality: options.quality || "ebook",
      onProgress: (message) => sendProgress(event, message),
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("images:run", async (event, options) => {
  try {
    const result = await imagesToPdf({
      imagePaths: options.imagePaths || [],
      outputPdf: options.outputPdf,
      onProgress: (message) => sendProgress(event, message),
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("merge:run", async (event, options) => {
  try {
    const result = await mergePdfs({
      pdfPaths: options.pdfPaths || [],
      outputPdf: options.outputPdf,
      onProgress: (message) => sendProgress(event, message),
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("arrange:inspect", async (_event, pdfPath) => {
  try {
    const result = await inspectPdf(pdfPath);
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("arrange:run", async (event, options) => {
  try {
    const result = await arrangePages({
      inputPdf: options.inputPdf,
      pageOrder: options.pageOrder || [],
      outputPdf: options.outputPdf,
      onProgress: (message) => sendProgress(event, message),
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("rotate:run", async (event, options) => {
  try {
    const result = await rotatePages({
      inputPdf: options.inputPdf,
      outputPdf: options.outputPdf,
      angle: options.angle,
      pageRotations: options.pageRotations,
      quality: options.quality,
      onProgress: (message) => sendProgress(event, message),
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("reverse:run", async (event, options) => {
  try {
    const result = await reversePages({
      inputPdf: options.inputPdf,
      outputPdf: options.outputPdf,
      quality: options.quality,
      onProgress: (message) => sendProgress(event, message),
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});
