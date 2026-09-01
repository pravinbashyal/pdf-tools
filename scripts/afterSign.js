'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

/**
 * electron-builder `afterSign` hook.
 *
 * This project ships unsigned (`identity: null` — no Apple Developer
 * account, see openspec/changes/open-source-homebrew-release/design.md).
 * Because `identity: null` also skips electron-builder's own signing
 * step, the packaged `.app` is left carrying Electron's original
 * upstream ad-hoc signature, which only covers Electron's pristine
 * resources. electron-builder's packaging step renames the bundle and
 * rewrites `Info.plist` (productName, appId, extendInfo, icon, etc.)
 * *after* that signature was applied, so the signature no longer
 * matches the bundle's actual contents. The result is a corrupted,
 * not merely absent, signature: `codesign --verify --deep --strict`
 * and `spctl -a --type execute` both fail with "code has no resources
 * but signature indicates they must be present", which breaks
 * launching the app entirely (this is stricter than plain
 * "unidentified developer").
 *
 * Fix: re-sign the final bundle ad-hoc (`--sign -`) after all
 * packaging/customization is done, so the seal matches the final
 * contents. This does NOT add real code signing/notarization — no
 * signing identity or certificate is used or required.
 */
exports.default = async function afterSign(context) {
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  execFileSync(
    'codesign',
    ['--deep', '--force', '--sign', '-', appPath],
    { stdio: 'inherit' }
  );
};
