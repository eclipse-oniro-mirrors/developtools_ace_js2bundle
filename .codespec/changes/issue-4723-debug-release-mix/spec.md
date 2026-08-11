# 规格文档 — Debug模式支持Release特性

## 一、元数据

| 字段 | 内容 |
|------|------|
| 规格ID | SPEC-debug-release-mix-001 |
| 规格名称 | Debug模式支持Release特性规格 |
| CodeSpec ID | issue-4723-debug-release-mix |
| 关联 Issue | https://gitcode.com/openharmony/developtools_ace_js2bundle/issues/4723 |
| 目标模块 | `developtools/ace_js2bundle/ace-loader/` |
| 规格状态 | Draft |
| 创建日期 | 2026-08-11 |

---

## 二、用户故事

### 2.1 故事描述（minify参数）

**作为** 运动表开发者

**想要** 在Debug模式下启用代码压缩和混淆

**以便** 在设备上调试接近Release特性的hap包

### 2.2 故事描述（sourcemap参数）

**作为** 运动表开发者

**想要** 在Debug模式下去掉sourcemap文件

**以便** 减小包体积，模拟Release环境

---

## 三、验收标准

### AC-1.1: Debug模式下minify参数为true时启用代码压缩

**优先级：** P0

**描述：** 在Debug模式下，当Hvigor传入minify参数为true时，启用代码压缩和混淆。

**Given** 编译环境为Debug模式
```json
{
  "buildMode": "debug"
}
```

**And** Hvigor传入`minify`参数为true
```javascript
{
  minify: true
}
```

**When** 执行编译
```bash
hvigorw --mode module -p product=default --minify=true
```

**Then** Webpack optimization.minimize 被设置为 true
**And** TerserPlugin 被启用
**And** 编译产物被压缩和混淆
**And** 使用与Release模式完全相同的Terser配置

**验证方法：**
1. 检查编译产物，确认代码被压缩
2. 验证 TerserPlugin 配置与 Release 模式一致

---

### AC-1.2: minify参数不生效时保持原有Debug行为

**优先级：** P0

**描述：** 当minify参数未传入或传入false/undefined时，保持Debug模式原有行为。

**Given** 编译环境为Debug模式
```json
{
  "buildMode": "debug"
}
```

**And** Hvigor未传入`minify`参数或传入false/undefined
```javascript
{
  // minify 未定义
}
```

**When** 执行编译

**Then** optimization.minimize 保持默认值
**And** TerserPlugin 不被额外启用
**And** 编译产物保持Debug格式

**验证方法：**
1. 检查编译产物，确认代码格式正常
2. 验证没有启用额外的压缩逻辑

---

### AC-2.1: Debug模式下sourcemap参数为true时不生成sourcemap

**优先级：** P0

**描述：** 在Debug模式下，当Hvigor传入sourcemap参数为true时，不生成sourcemap文件。

**Given** 编译环境为Debug模式
```json
{
  "buildMode": "debug"
}
```

**And** Hvigor传入`sourcemap`参数为true
```javascript
{
  sourcemap: true
}
```

**When** 执行编译

**Then** Webpack devtool 被设置为 false
**And** 编译产物中不包含.js.map文件
**And** 最终输出不包含sourcemap文件

**验证方法：**
1. 检查编译输出目录，确认没有.js.map文件
2. 验证 devtool 配置为 false

---

### AC-2.2: sourcemap参数不生效时保持原有Debug行为

**优先级：** P0

**描述：** 当sourcemap参数未传入或传入false/undefined时，保持Debug模式原有sourcemap生成行为。

**Given** 编译环境为Debug模式
```json
{
  "buildMode": "debug"
}
```

**And** Hvigor未传入`sourcemap`参数或传入false/undefined
```javascript
{
  // sourcemap 未定义
}
```

**When** 执行编译

**Then** devtool 保持默认值（nosources-source-map）
**And** 编译产物中的.js.map文件被生成（如果有）
**And** sourcemap正常生成

**验证方法：**
1. 检查编译产物，确认有 sourcemap 相关文件
2. 验证 devtool 配置保持默认

---

### AC-3.1: Release模式下两个参数不影响原有行为

**优先级：** P0

**描述：** 在Release模式下，无论Hvigor传入什么参数值，编译行为与Release模式原有行为完全一致。

**Given** 编译环境为Release模式
```json
{
  "buildMode": "release"
}
```

**And** Hvigor传入任意`minify`和`sourcemap`参数值
```javascript
{
  minify: false,
  sourcemap: false
}
```

**When** 执行编译

**Then** 编译行为与Release模式原有行为完全一致
**And** 两个参数被忽略

**验证方法：**
1. 对比启用参数前后的Release编译产物
2. 确认产物完全一致

---

## 四、规则定义

### 4.1 参数生效规则

| 规则ID | 条件 | 结果 |
|--------|------|------|
| R-M001 | Debug + minify=true | 启用Terser（optimization.minimize=true） |
| R-M002 | Debug + minify未定义/false | 保持默认 |
| R-M003 | Release模式 + minify任意值 | 忽略minify参数 |
| R-S001 | Debug + sourcemap=true | devtool=false，不生成.map |
| R-S002 | Debug + sourcemap未定义/false | devtool保持默认 |
| R-S003 | Release模式 + sourcemap任意值 | 忽略sourcemap参数 |

### 4.2 参数定义规则

| 规则ID | 规则 | 说明 |
|--------|------|------|
| R-P001 | 参数类型 | boolean |
| R-P002 | 参数默认值 | undefined |
| R-P003 | 参数名称 | 待定（当前占位名：minify、sourcemap） |
| R-P004 | 传入方式 | 通过 Webpack env 对象 |

---

## 五、场景库

### 场景1: Debug模式下启用代码压缩（富设备）

**背景：** 开发者需要在富设备上调试接近Release特性的hap包。

**Given:**
```json
// build-profile.json
{
  "buildMode": "debug"
}
```

**When:**
```bash
# Hvigor传入参数
hvigorw --minify=true
```

**Then:**
- Webpack config.mode = 'production'
- optimization.minimize = true
- TerserPlugin 被启用，使用 Release 相同配置
- 编译产物被压缩

**预期配置（webpack.rich.config.js）：**
```javascript
if (process.env.buildMode === 'debug' && env.minify === true) {
  config.mode = 'production';
  config.optimization.minimize = true;
  config.optimization.minimizer = [new TerserPlugin({...})];
}
```

---

### 场景2: Debug模式下禁用sourcemap

**背景：** 开发者需要模拟Release环境，不需要sourcemap文件。

**Given:**
```json
{
  "buildMode": "debug"
}
```

**When:**
```bash
hvigorw --sourcemap=true
```

**Then:**
- config.devtool = false
- 编译过程中不生成 .js.map 文件
- 产物体积减小

**预期配置（webpack.rich.config.js & webpack.lite.config.js）：**
```javascript
if (process.env.buildMode === 'debug' && env.sourcemap === true) {
  config.devtool = false;
}
```

---

### 场景3: 同时启用两个参数

**背景：** 开发者需要同时启用代码压缩和禁用sourcemap，完全模拟Release环境。

**Given:**
```json
{
  "buildMode": "debug"
}
```

**When:**
```bash
hvigorw --minify=true --sourcemap=true
```

**Then:**
- config.mode = 'production'
- optimization.minimize = true
- devtool = false
- 编译产物被压缩，无 sourcemap
- 产物体积显著减小

---

## 六、不涉及项确认

| 项目 | 状态 | 说明 |
|------|------|------|
| Runtime API变更 | ✓ 不涉及 | 不新增或修改运行时API |
| IDE/语法检查工具 | ✓ 不涉及 | 仅影响 Webpack 构建配置 |
| Webpack Loader 修改 | ✓ 不涉及 | 仅修改 Webpack 配置 |
| 自定义插件 | ✓ 不涉及 | 复用现有 TerserPlugin |

---

## 七、API影响分析

### 7.1 新增API

无新增公开API。

### 7.2 Webpack env 参数扩展

⚠️ **注意：** 以下参数名为 PlaceHolder，最终命名由后续 SDD 流程确定

```typescript
interface WebpackEnv {
  // ... 现有字段
  minify?: boolean;      // PLACEHOLDER: 待定
  sourcemap?: boolean;   // PLACEHOLDER: 待定
}
```

### 7.3 不影响的API

- 现有 Webpack 配置结构
- 现有 Webpack 插件
- 现有 Loader 配置

---

## 八、参考资料

| 资源 | 说明 |
|------|------|
| `design.md` | 详细设计文档 |
| `proposal.md` | 需求澄清文档 |
| `ace-loader/webpack.rich.config.js` | 富设备模式 Webpack 配置 |
| `ace-loader/webpack.lite.config.js` | 轻量设备模式 Webpack 配置 |
| `ace-loader/main.product.js` | 入口辅助函数 |
| Webpack Configuration | https://webpack.js.org/configuration/ |
| TerserPlugin | https://webpack.js.org/plugins/terser-webpack-plugin/ |
