// electron-builder config. Signing and notarization are driven purely by environment secrets; with none set,
// the mac build is ad-hoc signed (scripts/adhoc-sign.cjs) and the Windows build is unsigned.
const haveMacCert = !!(process.env.CSC_LINK || process.env.CSC_NAME);
const haveNotary = !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);
module.exports = {
  appId: 'org.gtabedstuy.fantribute',
  productName: 'GTA Bed-Stuy',
  copyright: 'Non-commercial fan tribute. Not affiliated with Rockstar Games or Take-Two.',
  directories: { output: 'release', buildResources: 'build' },
  files: ['out/**/*', 'package.json'],
  extraResources: [{ from: 'web', to: 'web' }],
  afterSign: 'scripts/adhoc-sign.cjs',
  mac: {
    category: 'public.app-category.games',
    target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }],
    icon: 'build/icon.png',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    ...(haveMacCert ? {} : { identity: null }),
    notarize: haveMacCert && haveNotary,
  },
  dmg: { title: 'GTA Bed-Stuy' },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }],
    icon: 'build/icon.png',
  },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false, artifactName: 'GTA-Bed-Stuy-Setup-${version}-win-${arch}.${ext}' },
  portable: { artifactName: 'GTA-Bed-Stuy-Portable-${version}-win-${arch}.${ext}' },
  artifactName: 'GTA-Bed-Stuy-${version}-mac-${arch}.${ext}',
};
