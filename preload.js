const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("duplexApi", {
  checkGhostscript: () => ipcRenderer.invoke("gs:check"),
  pickPdf: () => ipcRenderer.invoke("dialog:openPdf"),
  pickPdfs: () => ipcRenderer.invoke("dialog:openPdfs"),
  pickImages: () => ipcRenderer.invoke("dialog:openImages"),
  pickFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  combine: (options) => ipcRenderer.invoke("combine:run", options),
  compress: (options) => ipcRenderer.invoke("compress:run", options),
  imagesToPdf: (options) => ipcRenderer.invoke("images:run", options),
  mergePdfs: (options) => ipcRenderer.invoke("merge:run", options),
  inspectPdf: (pdfPath) => ipcRenderer.invoke("arrange:inspect", pdfPath),
  arrangePages: (options) => ipcRenderer.invoke("arrange:run", options),
  showItemInFolder: (filePath) => ipcRenderer.invoke("shell:showItem", filePath),
  suggestOutputName: (options) => ipcRenderer.invoke("output:suggestName", options),
  onProgress: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on("job:progress", handler);
    return () => ipcRenderer.removeListener("job:progress", handler);
  },
});
