'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * Loads one or more .gs files (paths relative to the repo root) into a
 * single vm context pre-populated with `globals` (stubs for whichever
 * Apps Script services the loaded files touch at module-load time, e.g.
 * DriveApp.Access), and returns that context so tests can call the
 * functions/vars the files define.
 *
 * .gs files are plain ES5 (CommonJS-free) JavaScript, so they run as-is
 * under Node's vm module without any transpilation.
 */
function loadGasFiles(fileNames, globals) {
  const context = Object.assign({ console }, globals || {});
  vm.createContext(context);

  fileNames.forEach((fileName) => {
    const code = fs.readFileSync(path.join(REPO_ROOT, fileName), 'utf8');
    vm.runInContext(code, context, { filename: fileName });
  });

  return context;
}

module.exports = { loadGasFiles };
