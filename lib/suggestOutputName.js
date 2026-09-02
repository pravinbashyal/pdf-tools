const path = require("path");
const fs = require("fs");

/**
 * Given a candidate filename and a target folder, returns the first
 * available (non-colliding) filename in that folder: the base name itself
 * if free, otherwise `name (1).ext`, `name (2).ext`, … until an unused name
 * is found. This is a one-shot check against the filesystem at call time,
 * not a live validator.
 *
 * @param {string} folder
 * @param {string} baseName
 * @returns {string}
 */
function suggestOutputName(folder, baseName) {
  const ext = path.extname(baseName);
  const stem = baseName.slice(0, baseName.length - ext.length);

  let candidate = baseName;
  let suffix = 0;
  while (fs.existsSync(path.join(folder, candidate))) {
    suffix += 1;
    candidate = `${stem} (${suffix})${ext}`;
  }
  return candidate;
}

module.exports = { suggestOutputName };
