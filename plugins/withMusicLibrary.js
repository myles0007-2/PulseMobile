// Config plugin that injects the MPMediaLibrary native module into the iOS build.
// Uses a single pure-ObjC file — no Swift, no bridging header changes needed.

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

function withMusicLibraryFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const appDir = path.join(cfg.modRequest.projectRoot, 'ios', cfg.modRequest.projectName);
      fs.mkdirSync(appDir, { recursive: true });
      fs.copyFileSync(
        path.join(cfg.modRequest.projectRoot, 'plugins', 'MusicLibraryModule.m'),
        path.join(appDir, 'MusicLibraryModule.m')
      );
      return cfg;
    },
  ]);
}

function withMusicLibraryXcode(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const groupKey = xcodeProject.findPBXGroupKey({ name: projectName });
    if (!groupKey) return cfg;

    const filePath = `${projectName}/MusicLibraryModule.m`;
    if (!xcodeProject.hasFile(filePath)) {
      xcodeProject.addSourceFile(filePath, { lastKnownFileType: 'sourcecode.c.objc' }, groupKey);
    }
    return cfg;
  });
}

module.exports = function withMusicLibrary(config) {
  config = withMusicLibraryFiles(config);
  config = withMusicLibraryXcode(config);
  return config;
};
