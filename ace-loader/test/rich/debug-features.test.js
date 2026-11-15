/*
 * Copyright (c) 2026 Huawei Device Co., Ltd.
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

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const chai = require('chai');
const expect = chai.expect;
const webpack = require('webpack');

const FIXTURE = path.resolve(__dirname, 'debug-features');
const ENV_KEYS = ['aceModuleJsonPath', 'aceProfilePath', 'aceManifestPath', 'aceConfigPath',
  'projectPath', 'buildPath', 'cachePath', 'compileMode', 'buildMode', 'isPreview', 'compilerType',
  'hapMode', 'minify', 'modifySourceMap', 'watchMode', 'abilityType', 'DEVICE_LEVEL', 'PLATFORM_VERSION',
  'PLATFORM_VERSION_VERSION', 'aceBuildJson', 'aceModuleRoot', 'aceModuleBuild', 'logLevel',
  'error', 'warning', 'note', 'watchCSSFiles'];

function cleanEnv() {
  ENV_KEYS.forEach((k) => delete process.env[k]);
}

function build(envOverrides, procEnv) {
  cleanEnv();
  Object.keys(procEnv || {}).forEach((k) => {
    process.env[k] = procEnv[k];
  });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dbgfeat-rich-'));
  const configPath = require.resolve('../../webpack.rich.config.js');
  delete require.cache[configPath];
  const factory = require(configPath);
  const config = factory(Object.assign({
    aceModuleRoot: FIXTURE,
    aceModuleBuild: output,
  }, envOverrides));
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      Object.keys(procEnv || {}).forEach((k) => delete process.env[k]);
      if (err) return void reject(err);
      if (stats.hasErrors()) return void reject(new Error(stats.toJson().errors.join('\n')));
      setTimeout(() => resolve(output), 500);
    });
  });
}

function normalize(content, output) {
  return content.toString().split(output).join('<OUTPUT>');
}

function collect(dir) {
  const files = {};
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      const sub = collect(full);
      Object.keys(sub).forEach((rel) => {
        files[path.join(name, rel)] = sub[rel];
      });
    } else {
      files[name] = crypto.createHash('sha256')
        .update(normalize(fs.readFileSync(full), dir)).digest('hex');
    }
  });
  return files;
}

function listByExt(files, ext) {
  return Object.keys(files).filter((f) => f.endsWith(ext)).sort();
}

function readOut(output, rel) {
  return fs.readFileSync(path.join(output, rel), 'utf-8');
}

describe('debug-features (rich)', function() {
  this.timeout(300000);
  const outputs = [];
  let defaultOutput;
  let defaultInventory;

  function buildAndTrack(envOverrides, procEnv) {
    return build(envOverrides, procEnv).then((output) => {
      outputs.push(output);
      return output;
    });
  }

  before(function() {
    return buildAndTrack({}).then((output) => {
      defaultOutput = output;
      defaultInventory = collect(output);
    });
  });

  after(function() {
    outputs.forEach((output) => {
      try {
        fs.rmSync(output, { recursive: true, force: true });
      } catch (e) {
        // ignore temp cleanup failures
      }
    });
  });

  it('AC-1.2/AC-2.4 baseline: debug default keeps maps in main output and sources contain debugger', function() {
    const maps = listByExt(defaultInventory, '.js.map');
    expect(maps.length).to.be.greaterThan(0);
    maps.forEach((m) => expect(m.startsWith('_releaseMap')).to.equal(false));
    const pageJs = listByExt(defaultInventory, '.js').filter((f) => f.includes('pages'));
    expect(pageJs.some((f) => /\bdebugger\b/.test(readOut(defaultOutput, f)))).to.equal(true);
  });

  it('AC-1.1: debug+minify applies release terser (debugger removed, sources changed, map layout untouched)', function() {
    return buildAndTrack({ buildMode: 'debug' }, { minify: 'true' }).then((output) => {
      const inv = collect(output);
      const pageJs = listByExt(inv, '.js').filter((f) => f.includes('pages'));
      expect(pageJs.length).to.be.greaterThan(0);
      pageJs.forEach((f) => expect(/\bdebugger\b/.test(readOut(output, f))).to.equal(false));
      expect(JSON.stringify(inv)).to.not.equal(JSON.stringify(defaultInventory));
      expect(listByExt(inv, '.map')).to.deep.equal(listByExt(defaultInventory, '.map'));
    });
  });

  it('AC-1.2: debug+minify invalid value falls back to default behavior', function() {
    return buildAndTrack({ buildMode: 'debug' }, { minify: 'yes' }).then((output) => {
      expect(JSON.stringify(collect(output))).to.equal(JSON.stringify(defaultInventory));
    });
  });

  it('AC-2.1/2.2/2.3: debug+modifySourceMap redirects maps to _releaseMap only, maps stay valid', function() {
    return buildAndTrack({ buildMode: 'debug' }, { modifySourceMap: 'true' }).then((output) => {
      const inv = collect(output);
      const maps = listByExt(inv, '.js.map');
      expect(maps.length).to.be.greaterThan(0);
      maps.forEach((m) => expect(m.startsWith('_releaseMap')).to.equal(true));
      expect(JSON.parse(readOut(output, maps[0]))).to.have.property('mappings');
    });
  });

  it('AC-3.2: debug+minify+modifySourceMap take effect orthogonally', function() {
    return buildAndTrack({ buildMode: 'debug' }, { minify: 'true', modifySourceMap: 'true' }).then((output) => {
      const inv = collect(output);
      const pageJs = listByExt(inv, '.js').filter((f) => f.includes('pages'));
      pageJs.forEach((f) => expect(/\bdebugger\b/.test(readOut(output, f))).to.equal(false));
      const maps = listByExt(inv, '.js.map');
      expect(maps.length).to.be.greaterThan(0);
      maps.forEach((m) => expect(m.startsWith('_releaseMap')).to.equal(true));
    });
  });

  it('AC-2.3/R-S003: existing sourceMap=none keeps devtool=false behavior', function() {
    return buildAndTrack({ buildMode: 'debug', sourceMap: 'none' }).then((output) => {
      const inv = collect(output);
      expect(listByExt(inv, '.js.map')).to.have.lengthOf(0);
    });
  });

  it('AC-3.1: release ignores both params (identical artifacts)', function() {
    return buildAndTrack({ buildMode: 'release' }).then((releaseOutput) => {
      const invRelease = collect(releaseOutput);
      const releasePageJs = listByExt(invRelease, '.js').filter((f) => f.includes('pages'));
      releasePageJs.forEach((f) => expect(/\bdebugger\b/.test(readOut(releaseOutput, f))).to.equal(false));
      return buildAndTrack({ buildMode: 'release' }, { minify: 'true', modifySourceMap: 'true' })
        .then((withParamsOutput) => {
          expect(JSON.stringify(collect(withParamsOutput))).to.equal(JSON.stringify(invRelease));
        });
    });
  });
});
