// afterSign hook. Without a Developer ID certificate, Apple Silicon refuses unsigned arm64 code, so apply an
// ad-hoc signature. With CSC_LINK set electron-builder signs for real and this hook does nothing.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
exports.default = async function adhoc(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log('ad-hoc signing', app);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
