# 设计文档 — Debug模式支持Release特性

## 一、设计概述

### 1.1 设计目标

在Debug编译模式下，通过Hvigor传入参数来启用部分Release特性，用于运动表上调测Release的hap包。

1. **minify参数**：启用代码压缩和混淆
2. **sourcemap参数**：删除编译产物中的sourcemap文件

### 1.2 约束条件

- 仅在Debug模式下生效
- Release模式保持原有行为
- **参数名称为 PlaceHolder（minify、sourcemap），最终命名由后续 SDD 流程确定**
- 不新增Runtime API
- 不修改IDE/语法检查工具

---

## 二、架构设计

### 2.1 模块定位

```
ace_js2bundle/
└── ace-loader/
    ├── webpack.rich.config.js            ← 富设备模式配置（主要）
    ├── webpack.lite.config.js            ← 轻量设备模式配置
    ├── lib/
    │   ├── util.js                       ← 工具函数
    │   └── ...
    └── main.product.js                   ← 入口辅助函数
```

**架构特点：**
- 基于 **Webpack** 构建系统（非自定义编译器）
- 支持两种设备模式：rich（富设备）和 lite（轻量设备）
- 通过 Webpack 配置工厂函数 `module.exports = (env) => {...}` 接收参数
- 代码压缩通过 `optimization.minimize` + `TerserPlugin` 实现
- SourceMap 通过 `devtool` 和 `output.sourceMapFilename` 控制

### 2.2 处理流程

#### 整体流程

```
                    ┌────────────────────────────────┐
                    │   Hvigor 传入 env 参数          │
                    │   minify: true/false/undefined  │
                    │   sourcemap: true/false/undefined│
                    └─────────────────┬──────────────┘
                                      │
                    ┌─────────────────▼──────────────┐
                    │   Webpack Config Factory       │
                    │   module.exports(env)           │
                    └─────────────────┬──────────────┘
                                      │
                    ┌─────────────────▼──────────────┐
                    │   setConfigs(env)              │
                    │   处理 buildMode 等基础参数     │
                    └─────────────────┬──────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│  minify = true    │    │  sourcemap = true │    │  其它情况          │
│  optimization.    │    │  devtool = false  │    │  保持原样          │
│  minimize = true  │    │  删除 .js.map     │    │  Debug 默认行为    │
└───────────────────┘    └───────────────────┘    └───────────────────┘
```

#### minify参数流程（富设备模式）

**文件：** `webpack.rich.config.js`

```javascript
module.exports = (env) => {
  setConfigs(env);

  // 新增：处理自定义参数
  const enableMinify = env.minify === true;
  const isDebug = process.env.buildMode === 'debug';

  if (isDebug && enableMinify) {
    config.mode = 'production';
    Object.assign(config.optimization, {
      minimize: true,
      minimizer: [new TerserPlugin({
        terserOptions: {
          compress: {
            defaults: false,
            dead_code: true,
            collapse_vars: true,
            unused: true,
            drop_debugger: true,
            if_return: true,
            reduce_vars: true,
            join_vars: false,
            sequences: 0,
          },
          format: {
            semicolons: false,
            beautify: true,
            braces: true,
            indent_level: 2,
          },
        },
      })],
    });
  }
  // ... 现有 release 逻辑保持不变
}
```

#### sourcemap参数流程

**文件：** `webpack.rich.config.js` 和 `webpack.lite.config.js`

```javascript
if (isDebug && env.sourcemap === true) {
  config.devtool = false;  // 不生成 sourcemap
}
```

---

## 三、详细设计

### 3.1 参数接收设计

#### 3.1.1 参数定义

```typescript
// env 参数扩展（通过 Hvigor 传入）
// ⚠️ 注意：minify 和 sourcemap 为 PlaceHolder，最终命名由 SDD 流程确定
interface WebpackEnv {
  // ... 现有字段
  buildMode?: 'debug' | 'release';
  sourceMap?: 'none' | string;
  minify?: boolean;      // PLACEHOLDER: 待定
  sourcemap?: boolean;   // PLACEHOLDER: 待定
}
```

#### 3.1.2 接收位置

在 Webpack 配置工厂函数中接收 `env` 参数：

**webpack.rich.config.js：**
```javascript
module.exports = (env) => {
  setConfigs(env);  // 处理现有参数

  // 新增：接收自定义参数
  const isDebug = process.env.buildMode === 'debug';
  const enableMinify = env.minify === true;
  const disableSourcemap = env.sourcemap === true;

  // 后续逻辑...
}
```

### 3.2 minify参数实现

#### 3.2.1 富设备模式实现

**文件：** `webpack.rich.config.js`

**现有 Release 模式逻辑（第 424-458 行）：**
```javascript
if (env.buildMode === 'release') {
  config.mode = 'production';
  Object.assign(config.optimization, {
    minimize: true,
    minimizer: [new TerserPlugin({...})],
  });
}
```

**新增 Debug 模式逻辑：**
```javascript
// ⚠️ 注意：minify 为 PLACEHOLDER，最终命名由 SDD 流程确定
const isDebug = process.env.buildMode === 'debug';
const enableMinify = env.minify === true;

if (isDebug && enableMinify) {
  // 复用 Release 模式的相同配置
  config.mode = 'production';
  Object.assign(config.optimization, {
    minimize: true,
    minimizer: [new TerserPlugin({
      terserOptions: {
        compress: {
          defaults: false,
          dead_code: true,
          collapse_vars: true,
          unused: true,
          drop_debugger: true,
          if_return: true,
          reduce_vars: true,
          join_vars: false,
          sequences: 0,
        },
        format: {
          semicolons: false,
          beautify: true,
          braces: true,
          indent_level: 2,
        },
      },
    })],
  });
}
```

#### 3.2.2 轻量设备模式实现

**文件：** `webpack.lite.config.js`

**现有逻辑（第 229-240 行）：**
```javascript
if (process.env.hapMode && process.env.hapMode === 'true') {
  webpackConfig.optimization = {
    minimize: true,
    minimizer: [new TerserPlugin({...})],
  };
}
```

**新增 Debug 模式逻辑：**
```javascript
const isDebug = process.env.buildMode === 'debug';
const enableMinify = env.minify === true;

if (isDebug && enableMinify) {
  webpackConfig.optimization = {
    minimize: true,
    minimizer: [new TerserPlugin({
      terserOptions: {
        compress: false,
        mangle: true,
      },
    })],
  };
}
```

#### 3.2.3 条件判断

启用代码压缩的条件：
1. `buildMode === 'debug'` **AND**
2. `minify === true`

**重要：** minify=true 时，必须使用与 Release 模式完全相同的 Terser 配置。

### 3.3 sourcemap参数实现

#### 3.3.1 富设备模式实现

**文件：** `webpack.rich.config.js`

**现有逻辑（第 421-423 行）：**
```javascript
if (env.sourceMap === 'none') {
  config.devtool = false
}
```

**新增 Debug 模式逻辑：**
```javascript
// ⚠️ 注意：sourcemap 为 PLACEHOLDER，最终命名由 SDD 流程确定
const isDebug = process.env.buildMode === 'debug';
const disableSourcemap = env.sourcemap === true;

if (isDebug && disableSourcemap) {
  config.devtool = false;  // 不生成 sourcemap
}
```

#### 3.3.2 轻量设备模式实现

**文件：** `webpack.lite.config.js`

**现有逻辑（第 255-257 行）：**
```javascript
if (env.sourceMap === 'none') {
  webpackConfig.devtool = false
}
```

**新增 Debug 模式逻辑：**
```javascript
const isDebug = process.env.buildMode === 'debug';
const disableSourcemap = env.sourcemap === true;

if (isDebug && disableSourcemap) {
  webpackConfig.devtool = false;
}
```

#### 3.3.3 删除已生成的 sourcemap 文件

由于 Webpack 的 `devtool = false` 会在编译过程中阻止 sourcemap 生成，因此不需要额外的删除逻辑。这与 ace_ets2bundle 的实现不同（后者需要显式删除已生成的文件）。

---

## 四、实现决策记录

### D-001: 参数生效条件

**决策：** 仅在Debug模式下生效

**理由：**
- Debug模式是该特性的目标场景
- Release模式保持原样，避免影响现有行为

**取舍：**
- 不支持在 Release 模式下覆盖默认行为
- 实现更简洁，降低冲突风险

### D-002: minify参数与Release模式行为保持一致

**决策：** minify参数启用时，必须使用与Release模式完全相同的Terser配置

**理由：**
- 确保Debug+minify的产物与Release产物一致
- 复用现有的 TerserPlugin 配置
- 避免两套不同的minify行为导致的差异

**实现方式：**
- 富设备模式：复制 Release 模式的 TerserPlugin 配置（第 428-449 行）
- 轻量设备模式：复制 hapMode 模式的 TerserPlugin 配置（第 232-238 行）

### D-003: sourcemap参数语义

**决策：** `sourcemap: true` = 不生成 sourcemap

**理由：**
- 按需求描述实现
- 与现有 `sourceMap: 'none'` 参数保持一致

**取舍：**
- 命名需要Hvigor配合调整
- 或在Hvigor层面做语义转换

### D-004: Webpack 原生能力优先

**决策：** 使用 Webpack 原生配置而非后处理删除

**理由：**
- Webpack 的 `devtool: false` 会在编译过程中阻止 sourcemap 生成
- 比后处理删除更高效
- 不需要额外的文件系统操作

**与 ace_ets2bundle 的差异：**
- ace_ets2bundle：需要显式删除已生成的 .js.map 文件
- ace_js2bundle：通过 `devtool: false` 阻止生成，无需删除

---

## 五、测试策略

### 5.1 单元测试

| 测试用例 | 场景 | 预期输出 |
|----------|------|----------|
| minify启用（rich） | Debug+rich+minify=true | Terser启用，代码压缩 |
| minify启用（lite） | Debug+lite+minify=true | Terser启用，代码压缩 |
| minify不启用 | Debug+minify=undefined | 保持原样 |
| sourcemap禁用 | Debug+sourcemap=true | devtool=false，无.map |
| sourcemap保留 | Debug+sourcemap=undefined | devtool=nosources-source-map |
| Release模式 | Release+任意参数值 | 保持原样 |

### 5.2 集成测试

1. **编译流程测试**：验证完整的 Webpack 编译流程
2. **产物验证**：检查编译产物是否符合预期
3. **回归测试**：确保不影响现有 Debug 和 Release 行为

---

## 六、性能影响

- **时间复杂度**：无新增复杂度，仅条件判断
- **空间复杂度**：无额外内存占用
- **影响范围**：仅 Debug 模式

---

## 七、安全与合规

- 不涉及用户数据处理
- 不涉及网络安全
- 不涉及权限控制
- 纯构建流程调整

---

## 八、参考资料

| 资源 | 说明 |
|------|------|
| `ace-loader/webpack.rich.config.js` | 富设备模式 Webpack 配置 |
| `ace-loader/webpack.lite.config.js` | 轻量设备模式 Webpack 配置 |
| `ace-loader/main.product.js` | 入口辅助函数 |
| `ace-loader/lib/util.js` | 工具函数 |
| Webpack TerserPlugin | https://webpack.js.org/plugins/terser-webpack-plugin/ |
| Webpack devtool | https://webpack.js.org/configuration/devtool/ |
