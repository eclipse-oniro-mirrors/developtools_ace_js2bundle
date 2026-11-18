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
const TerserPlugin = require('terser-webpack-plugin');

const SnapshotPlugin = require('../../lib/lite/lite-snapshot-plugin');
const SNAPSHOT_BIN = path.resolve(__dirname, '../../bin/jerry-snapshot');
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
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dbgfeat-lite-'));
  const configPath = require.resolve('../../webpack.lite.config.js');
  delete require.cache[configPath];
  const factory = require(configPath);
  const config = factory(Object.assign({
    aceModuleRoot: FIXTURE,
    aceModuleBuild: output,
  }, envOverrides));
  const hasSnapshotPlugin = config.plugins.some((p) => p instanceof SnapshotPlugin);
  const minimizer = config.optimization && config.optimization.minimizer;
  const hasTerserMinimizer = Array.isArray(minimizer) &&
    minimizer.some((m) => m instanceof TerserPlugin);
  const minimizerJson = Array.isArray(minimizer)
    ? JSON.stringify(minimizer, (k, v) => (typeof v === 'function' ? 'fn' : v))
    : undefined;
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      Object.keys(procEnv || {}).forEach((k) => delete process.env[k]);
      if (err) return void reject(err);
      if (stats.hasErrors()) return void reject(new Error(stats.toJson().errors.join('\n')));
      setTimeout(() => resolve({ output, hasSnapshotPlugin, hasTerserMinimizer, minimizerJson, mode: config.mode }), 500);
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

describe('debug-features (lite)', function() {
  this.timeout(300000);
  const outputs = [];
  let defaultOutput;
  let defaultInventory;

  function buildAndTrack(envOverrides, procEnv) {
    return build(envOverrides, procEnv).then((result) => {
      outputs.push(result.output);
      return result;
    });
  }

  before(function() {
    return buildAndTrack({}).then((result) => {
      defaultOutput = result.output;
      defaultInventory = collect(result.output);
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

  it('AC-2.4 baseline: debug default keeps maps in main output and mounts no snapshot plugin', function() {
    const maps = listByExt(defaultInventory, '.js.map');
    expect(maps.length).to.be.greaterThan(0);
    maps.forEach((m) => expect(m.startsWith('_releaseMap')).to.equal(false));
    return buildAndTrack({ buildMode: 'debug' }).then((result) => {
      expect(result.hasSnapshotPlugin).to.equal(false);
      expect(result.hasTerserMinimizer).to.equal(false);
    });
  });

  it('AC-1.3: debug+minify mounts the same SnapshotPlugin as release branch and mangles js like hapMode release', function() {
    return buildAndTrack({ buildMode: 'debug' }, { minify: 'true' }).then((result) => {
      expect(result.hasSnapshotPlugin).to.equal(true);
      expect(result.mode).to.equal('development');
      expect(result.hasTerserMinimizer).to.equal(true);
      expect(result.minimizerJson).to.include('"compress":false');
      expect(result.minimizerJson).to.include('"mangle":true');
      const inv = collect(result.output);
      expect(JSON.stringify(inv)).to.not.equal(JSON.stringify(defaultInventory));
      const pageJs = listByExt(inv, '.js').filter((f) => f.includes('pages'));
      expect(pageJs.length).to.be.greaterThan(0);
      pageJs.forEach((f) => {
        const js = readOut(result.output, f);
        expect(js.startsWith('(function(){')).to.equal(true);
        expect(js.length).to.be.lessThan(readOut(defaultOutput, f).length);
      });
      if (!fs.existsSync(SNAPSHOT_BIN)) {
        console.warn('[skip note] bin/jerry-snapshot not present; .bc artifact check deferred to release chain');
        return;
      }
      expect(listByExt(inv, '.bc').length).to.be.greaterThan(0);
    });
  });

  it('AC-1.4: debug+minify with existing hapMode keeps hapMode terser options and adds snapshot once', function() {
    return buildAndTrack({ buildMode: 'debug' }, { hapMode: 'true', minify: 'true' })
      .then((result) => {
        expect(result.hasSnapshotPlugin).to.equal(true);
        expect(result.hasTerserMinimizer).to.equal(true);
        expect(result.mode).to.equal('development');
        return buildAndTrack({ buildMode: 'debug' }, { hapMode: 'true' });
      })
      .then((hapModeOnly) => {
        return buildAndTrack({ buildMode: 'debug' }, { hapMode: 'true', minify: 'true' })
          .then((withMinify) => {
            expect(withMinify.minimizerJson).to.equal(hapModeOnly.minimizerJson);
          });
      });
  });

  it('AC-1.2: debug+minify invalid value falls back to default behavior', function() {
    return buildAndTrack({ buildMode: 'debug' }, { minify: 'yes' }).then((result) => {
      expect(result.hasSnapshotPlugin).to.equal(false);
      expect(JSON.stringify(collect(result.output))).to.equal(JSON.stringify(defaultInventory));
    });
  });

  it('AC-2.1/2.2: debug+modifySourceMap redirects maps to _releaseMap only', function() {
    return buildAndTrack({ buildMode: 'debug' }, { modifySourceMap: 'true' }).then((result) => {
      expect(result.hasSnapshotPlugin).to.equal(false);
      const inv = collect(result.output);
      const maps = listByExt(inv, '.js.map');
      expect(maps.length).to.be.greaterThan(0);
      maps.forEach((m) => expect(m.startsWith('_releaseMap')).to.equal(true));
    });
  });

  it('AC-3.1: release ignores both params (identical artifacts)', function() {
    return buildAndTrack({ buildMode: 'release' }).then((releaseResult) => {
      const invRelease = collect(releaseResult.output);
      return buildAndTrack({ buildMode: 'release' }, { minify: 'true', modifySourceMap: 'true' })
        .then((withParamsResult) => {
          expect(JSON.stringify(collect(withParamsResult.output))).to.equal(JSON.stringify(invRelease));
        });
    });
  });
});
