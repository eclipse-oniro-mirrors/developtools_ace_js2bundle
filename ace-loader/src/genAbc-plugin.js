/*
 * Copyright (c) 2021 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const process = require('process');
const os = require('os');

const forward = '(global.___mainEntry___ = function (globalObjects) {' + '\n' +
              '  var define = globalObjects.define;' + '\n' +
              '  var require = globalObjects.require;' + '\n' +
              '  var bootstrap = globalObjects.bootstrap;' + '\n' +
              '  var register = globalObjects.register;' + '\n' +
              '  var render = globalObjects.render;' + '\n' +
              '  var $app_define$ = globalObjects.$app_define$;' + '\n' +
              '  var $app_bootstrap$ = globalObjects.$app_bootstrap$;' + '\n' +
              '  var $app_require$ = globalObjects.$app_require$;' + '\n' +
              '  var history = globalObjects.history;' + '\n' +
              '  var Image = globalObjects.Image;' + '\n' +
              '  var OffscreenCanvas = globalObjects.OffscreenCanvas;' + '\n' +
              '  (function(global) {' + '\n' +
              '    "use strict";' + '\n';
const last = '\n' + '})(this.__appProto__);' + '\n' + '})';
const genAbcScript = 'gen-abc.js';
const NODE_MODULES = 'node_modules';
const SUCCESS = 0;
const FAIL = 1;
const red = '\u001b[31m';
const reset = '\u001b[39m';
const WINDOWS = 'Windows_NT';
const LINUX = 'Linux';
const MAC = 'Darwin';
let output;
let isWin = false;
let isMac = false;
let isDebug = false;
let arkDir;
let nodeJs;
let intermediateJsBundle = [];
let workerFile = null;

class GenAbcPlugin {
  constructor(output_, arkDir_, nodeJs_, workerFile_, isDebug_) {
    output = output_;
    arkDir = arkDir_;
    nodeJs = nodeJs_;
    isDebug = isDebug_;
    workerFile = workerFile_;
  }
  apply(compiler) {
    if (fs.existsSync(path.resolve(arkDir, 'build-win'))) {
      isWin = true;
    } else if (fs.existsSync(path.resolve(arkDir, 'build-mac'))) {
      isMac = true;
    } else if (!fs.existsSync(path.resolve(arkDir, 'build'))) {
      return;
    }

    if (!checkNodeModules()) {
      process.exitCode = FAIL;
      return;
    }

    compiler.hooks.emit.tap('GenAbcPlugin', (compilation) => {
      const assets = compilation.assets;
      const keys = Object.keys(assets);
      keys.forEach(key => {
        // choice *.js
        if (output && path.extname(key) === '.js') {
          let newContent = assets[key].source();
          if (checkWorksFile(key, workerFile) && key !== 'commons.js' && key !== 'vendors.js') {
            newContent = forward + newContent + last;
          }
          if (key === 'commons.js' || key === 'vendors.js' || !checkWorksFile(key, workerFile)) {
            newContent = `\n\n\n\n\n\n\n\n\n\n\n\n\n\n` + newContent;
          }
          const keyPath = key.replace(/\.js$/, ".temp.js");
          writeFileSync(newContent, path.resolve(output, keyPath), true);
        } else if (output && path.extname(key) === '.json' &&
          process.env.DEVICE_LEVEL === 'card' && process.env.configOutput && !checkI18n(key)) {
          writeFileSync(assets[key].source(), path.resolve(output, key), false);
        }
      })
    });
    compiler.hooks.afterEmit.tap('GenAbcPluginMultiThread', () => {
      if (intermediateJsBundle.length === 0) {
        return;
      }
      invokeWorkerToGenAbc();
    });
  }
}

function checkI18n(key) {
  const outI18nPath = path.resolve(process.env.configOutput, key);
  const projectI18nPath = outI18nPath.replace(output, process.env.projectPath);
  if (projectI18nPath.indexOf(
    path.resolve(__dirname, process.env.projectPath, 'i18n')) > -1) {
    return true;
  }
  return false;
}

function checkWorksFile(assetPath, workerFile) {
  if (workerFile === null) {
    if (assetPath.search("./workers/") !== 0) {
      return true;
    } else {
      return false;
    }
  } else {
    for (const key in workerFile) {
      let keyExt = key + '.js';
      if (keyExt === assetPath) {
        return false;
      }
    }
  }

  return true;
}

function toUnixPath(data) {
  if (/^win/.test(require('os').platform())) {
    const fileTmps= data.split(path.sep);
    const newData = path.posix.join(...fileTmps);
    return newData;
  }
  return data;
}

function writeFileSync(inputString, output, isToBin) {
    validateFilePathLength(output);
    const parent = path.join(output, '..');
    if (!(fs.existsSync(parent) && fs.statSync(parent).isDirectory())) {
        mkDir(parent);
    }
    fs.writeFileSync(output, inputString);
    if (!isToBin) {
      return;
    }
    if (fs.existsSync(output)) {
      output = toUnixPath(output);
      let fileSize = fs.statSync(output).size;
      intermediateJsBundle.push({path: output, size: fileSize});
    } else {
      console.debug(red, `ETS:ERROR Failed to convert file ${input} to abc,  output is lost`, reset);
      process.exitCode = FAIL;
    }
}

function mkDir(path_) {
    const parent = path.join(path_, '..');
    if (!(fs.existsSync(parent) && !fs.statSync(parent).isFile())) {
        mkDir(parent);
    }
    fs.mkdirSync(path_);
}

function getSmallestSizeGroup(groupSize) {
  let groupSizeArray = Array.from(groupSize);
  groupSizeArray.sort(function(g1, g2) {
    return g1[1] - g2[1]; // sort by size
  });
  return groupSizeArray[0][0];
}

function splitJsBundlesBySize(bundleArray, groupNumber) {
  let result = [];
  if (bundleArray.length < groupNumber) {
    result.push(bundleArray);
    return result;
  }

  bundleArray.sort(function(f1, f2) {
    return f2.size - f1.size;
  });
  let groupFileSize = new Map();
  for (let i = 0; i < groupNumber; ++i) {
    result.push([]);
    groupFileSize.set(i, 0);
  }

  let index = 0;
  while(index < bundleArray.length) {
    let smallestGroup = getSmallestSizeGroup(groupFileSize);
    result[smallestGroup].push(bundleArray[index]);
    let sizeUpdate = groupFileSize.get(smallestGroup) + bundleArray[index].size;
    groupFileSize.set(smallestGroup, sizeUpdate);
    index++;
  }
  return result;
}

function invokeWorkerToGenAbc() {
  let param = '';
  if (isDebug) {
    param += ' --debug';
  }

  let js2abc = path.join(arkDir, 'build', 'src', 'index.js');
  if (isWin) {
    js2abc = path.join(arkDir, 'build-win', 'src', 'index.js');
  } else if (isMac) {
    js2abc = path.join(arkDir, 'build-mac', 'src', 'index.js');
  }
  validateFilePathLength(js2abc);

  const maxWorkerNumber = 3;
  const splitedBundles = splitJsBundlesBySize(intermediateJsBundle, maxWorkerNumber);
  const workerNumber = maxWorkerNumber < splitedBundles.length ? maxWorkerNumber : splitedBundles.length;
  const cmdPrefix = `${nodeJs} --expose-gc "${js2abc}" ${param} `;

  const clusterNewApiVersion = 16;
  const currentNodeVersion = parseInt(process.version.split('.')[0]);
  const useNewApi = currentNodeVersion >= clusterNewApiVersion ? true : false;

  if ((useNewApi && cluster.isPrimary) || (!useNewApi && cluster.isMaster)) {
    if (useNewApi) {
      cluster.setupPrimary({
        exec: path.resolve(__dirname, genAbcScript)
      });
    } else {
      cluster.setupMaster({
        exec: path.resolve(__dirname, genAbcScript)
      });
    }

    for (let i = 0; i < workerNumber; ++i) {
      let workerData = {
        "inputs": JSON.stringify(splitedBundles[i]),
        "cmd": cmdPrefix
      }
      cluster.fork(workerData);
    }

    cluster.on('exit', (worker, code, signal) => {
      if (code == FAIL || process.exitCode ===  FAIL) {
        process.exitCode = FAIL;
        return;
      }
    });

    process.on('exit', (code) => {
      intermediateJsBundle.forEach((item) => {
        let input = item.path;
        if (fs.existsSync(input)) {
          fs.unlinkSync(input);
        }
      })
    });
  }
}

module.exports = {
  GenAbcPlugin: GenAbcPlugin,
  checkWorksFile: checkWorksFile
}

function checkNodeModules() {
  let arkEntryPath = path.join(arkDir, 'build');
  if (isWin) {
    arkEntryPath = path.join(arkDir, 'build-win');
  } else if (isMac) {
    arkEntryPath = path.join(arkDir, 'build-mac');
  }
  let nodeModulesPath = path.join(arkEntryPath, NODE_MODULES);
  validateFilePathLength(nodeModulesPath);
  if (!(fs.existsSync(nodeModulesPath) && fs.statSync(nodeModulesPath).isDirectory())) {
    console.error(red, `ERROR: node_modules for ark compiler not found.
      Please make sure switch to non-root user before runing "npm install" for safity requirements and try re-run "npm install" under ${arkEntryPath}`, reset);
    return false;
  }

  return true;
}

export function isWindows() {
  return os.type() === WINDOWS;
}

export function isLinux() {
  return os.type() === LINUX;
}

export function isMacOs() {
  return os.type() === MAC;
}

export function maxFilePathLength() {
  if (isWindows()) {
    return 259;
  } else if (isLinux()) {
    return 4095;
  } else if (isMacOs()) {
    return 1016;
  } else {
    return -1;
  }
}

export function validateFilePathLength(filePath) {
  if (maxFilePathLength() < 0) {
    console.error("Unknown OS platform");
    process.exitCode = FAIL;
    return false;
  } else if (filePath.length > 0 && filePath.length <= maxFilePathLength()) {
    return true;
  } else if (filePath.length > maxFilePathLength()) {
    console.error("The length of path exceeds the maximum length: " + maxFilePathLength());
    process.exitCode = FAIL;
    return false;
  } else {
    console.error("Validate file path failed");
    process.exitCode = FAIL;
    return false;
  }
}