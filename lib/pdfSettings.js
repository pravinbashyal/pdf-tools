/** @type {Record<string, string>} */
const QUALITY_PRESETS = {
  screen: "/screen",
  ebook: "/ebook",
  printer: "/printer",
  prepress: "/prepress",
};

/**
 * Resolve a Compressor quality name to a Ghostscript PDFSETTINGS value.
 * @param {unknown} quality
 * @returns {{ key: string, preset: string }}
 */
function resolveQualityPreset(quality) {
  const key = String(quality).toLowerCase();
  const preset = QUALITY_PRESETS[key];
  if (!preset) {
    throw new Error(
      `Unknown quality "${quality}". Use: screen, ebook, printer, or prepress.`
    );
  }
  return { key, preset };
}

/**
 * Ghostscript pdfwrite args for a quality preset, or [] when quality is omitted.
 * @param {unknown} [quality]
 * @returns {string[]}
 */
function pdfwriteQualityArgs(quality) {
  if (quality == null) {
    return [];
  }
  const { preset } = resolveQualityPreset(quality);
  return [
    "-dCompatibilityLevel=1.4",
    `-dPDFSETTINGS=${preset}`,
    "-dDetectDuplicateImages=true",
    "-dCompressFonts=true",
    "-dSubsetFonts=true",
  ];
}

module.exports = {
  QUALITY_PRESETS,
  resolveQualityPreset,
  pdfwriteQualityArgs,
};
