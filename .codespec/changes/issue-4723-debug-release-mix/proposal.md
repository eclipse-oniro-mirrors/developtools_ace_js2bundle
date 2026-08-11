# 需求文档 — Debug模式支持Release特性

## 一、原始需求

### 基本信息

| 字段 | 内容 |
|------|------|
| 需求ID | REQ-xx-xx-xx-04 |
| 需求名称 | Debug模式支持Release特性 |
| 来源 | 编译器工具链需求 |
| CodeSpec ID | issue-4723-debug-release-mix |
| 关联 Issue | https://gitcode.com/openharmony/developtools_ace_js2bundle/issues/4723 |
| 目标仓 | `developtools/ace_js2bundle` |
| 目标模块 | `compiler/` |
| 优先级 | P1 |
| 状态 | Baselined |

### 原始描述

支持在运动表上调测Release的hap包，需要在Debug编译模式下通过Hvigor传入参数来启用部分Release特性。

⚠️ **注意：** 以下参数名为 PlaceHolder，最终命名由后续 SDD 流程确定

从Hvigor传参（Webpack env）中新增两个参数（字段名待定）：

1. **minify参数（字段名待定）**：
   - 当编译环境为debug模式时，识别minify参数传值为true时：
   - Bundled JS文件开启混淆
   - 编译产物最小化成一行
   - **与Release模式下的minify行为保持一致**，使用相同的Terser配置

2. **sourcemap参数（字段名待定）**：
   - 当编译环境为debug模式时，识别sourcemap参数传值为true时：
   - 去掉编译文件的sourcemap文件（即.js.map文件）
   - **与Release模式下的sourcemap行为保持一致**

### 背景与痛点

| 用户类型 | 当前痛点 | 影响 |
|----------|----------|------|
| 运动表开发者 | 需要在设备上调试Release包，但Debug包体积过大、性能不符 | 调试效率低下 |
| 测试人员 | Release包无法有效调试，Debug包与生产环境差异大 | 问题定位困难 |

### 初始范围

**包含：**

1. **新增Hvigor参数支持**（字段名待定）
   - `minify`参数：控制代码压缩和混淆
   - `sourcemap`参数：控制sourcemap文件生成

2. **Debug模式下的条件行为**
   - 仅在Debug模式 + JSBundle编译模式下生效
   - Release模式保持原有行为，不受这两个参数影响

3. **参数生效范围**
   - minify：触发Terser插件，**使用与Release模式完全相同的配置**
   - sourcemap：删除编译产物中的.js.map文件，**与Release模式行为一致**

**不包含：**

1. ESModule模式支持
2. 属性混淆等字节码混淆调整
3. 新增Runtime API
4. IDE/语法检查工具变更

### 初始假设

| 假设 | 类型 | 验证方式 | 状态 |
|------|------|----------|------|
| 仅在Debug模式下生效 | 需求 | 需求澄清 | 已确认 |
| 仅支持JSBundle模式 | 需求 | 需求澄清 | 已确认 |
| Release模式不受影响 | 需求 | 需求澄清 | 已确认 |
| 参数名待定 | 需求 | 需求澄清 | 已确认 |
| minify不绑定具体混淆策略 | 技术 | 需求澄清 | 已确认 |

---

## 二、澄清记录

### 待澄清问题

| 编号 | 问题 | 为什么需要澄清 | 状态 |
|------|------|----------------|------|
| Q-1 | sourcemap参数语义（true为去掉sourcemap） | 决定参数命名和逻辑 | 已澄清 |
| Q-2 | minify参数的混淆范围 | 决定混淆策略 | 已澄清：由obfuscationOptions控制 |
| Q-3 | 适用编译模式 | 决定实现范围 | 已澄清：仅JSBundle模式 |
| Q-4 | 参数默认值 | 决定参数处理逻辑 | 已澄清：undefined |
| Q-5 | 与现有配置的交互 | 决定生效条件 | 已澄清：条件叠加，仅Debug模式生效 |

### 讨论记录

| 日期 | 参与人 | 讨论主题 | 结论 | 后续动作 |
|------|--------|----------|------|----------|
| 2026-08-11 | - | sourcemap参数语义 | true=去掉sourcemap | 纳入规格 |
| 2026-08-11 | - | minify混淆范围 | 完全自定义，由obfuscationOptions控制 | 纳入规格 |
| 2026-08-11 | - | 适用编译模式 | 仅JSBundle模式 | 纳入规格 |
| 2026-08-11 | - | 参数默认值 | undefined | 纳入规格 |
| 2026-08-11 | - | 与现有配置交互 | 条件叠加，仅Debug模式生效 | 纳入规格 |
| 2026-08-11 | - | 参数名称 | 字段名待定 | 待定 |

### 子系统影响

| 问题 | 回答 | 状态 |
|------|------|------|
| 涉及哪些子系统？ | `developtools/ace_js2bundle/compiler/` | 已确认 |
| 是否跨仓？ | 否 | 已确认 |
| 是否涉及公共 API？ | 否 | 已确认 |
| 是否影响运行时？ | 否 | 已确认 |

### 进入规格阶段条件

- [x] 原始问题和期望结果已记录
- [x] 需求来源和责任人已明确
- [x] 初始范围和不包含项已记录
- [x] 关键假设和待澄清问题已列出
- [x] 技术方案方向已收敛
- [x] 基线已审批

---

## 三、需求基线

### 基线结论

| 字段 | 内容 |
|------|------|
| 基线状态 | **通过** |
| 基线日期 | 2026-08-11 |
| 复杂度级别 | **标准** |
| 进入规格阶段 | 是 |

### 范围确认

**包含范围（已确认）：**

1. **参数传递**
   - 从Hvigor传递两个参数到projectConfig
   - 参数名称待定（当前占位名：minify、sourcemap）
   - 默认值：undefined

2. **生效条件**
   - 仅在Debug模式 + JSBundle编译模式下生效
   - Release模式保持原有行为

3. **minify参数行为**
   - 值为true时：启用Terser插件进行代码压缩
   - **使用与Release模式完全相同的Terser配置**（通过`initTerserConfig`函数）
   - 不直接控制任何具体的混淆策略，由现有配置系统控制

4. **sourcemap参数行为**
   - 值为true时：删除编译产物中的.js.map文件
   - 值为false或undefined时：保持原有Debug行为

**不包含范围（已确认）：**

1. ESModule模式支持
2. 属性混淆等字节码混淆调整
3. 新增Runtime API
4. IDE/语法检查工具变更

### 验收标准

#### AC-1.1: Debug模式下minify参数为true时启用Terser插件

**优先级：** P0

**Given** 编译环境为Debug模式 + JSBundle编译模式
**And** Hvigor传入`minify`参数为true
**When** 执行编译
**Then** Terser插件被启用
**And** 编译产物被压缩和混淆

#### AC-1.2: minify参数不生效时保持原有Debug行为

**优先级：** P0

**Given** 编译环境为Debug模式 + JSBundle编译模式
**And** Hvigor未传入`minify`参数或传入false/undefined
**When** 执行编译
**Then** Terser插件不被启用
**And** 编译产物保持Debug格式（带空格、可读）

#### AC-2.1: Debug模式下sourcemap参数为true时不生成sourcemap

**优先级：** P0

**Given** 编译环境为Debug模式
**And** Hvigor传入`sourcemap`参数为true
**When** 执行编译
**Then** Webpack devtool 被设置为 false
**And** 编译过程中不生成.js.map文件
**And** 最终输出不包含sourcemap文件

#### AC-2.2: sourcemap参数不生效时保持原有Debug行为

**优先级：** P0

**Given** 编译环境为Debug模式 + JSBundle编译模式
**And** Hvigor未传入`sourcemap`参数或传入false/undefined
**When** 执行编译完成
**Then** 编译产物中的.js.map文件被保留
**And** sourcemap正常生成

#### AC-3.1: Release模式下两个参数不影响原有行为

**优先级：** P0

**Given** 编译环境为Release模式
**And** Hvigor传入任意`minify`和`sourcemap`参数值
**When** 执行编译
**Then** 编译行为与Release模式原有行为完全一致
**And** 两个参数被忽略


### 验收标准概览

| AC编号 | 描述 | 优先级 |
|--------|------|--------|
| AC-1.1 | Debug模式下minify参数为true时启用代码压缩 | P0 |
| AC-1.2 | minify参数不生效时保持原有Debug行为 | P0 |
| AC-2.1 | Debug模式下sourcemap参数为true时不生成sourcemap | P0 |
| AC-2.2 | sourcemap参数不生效时保持原有Debug行为 | P0 |
| AC-3.1 | Release模式下两个参数不影响原有行为 | P0 |

### 实现建议

1. **参数接收**（ace-loader/webpack.rich.config.js & webpack.lite.config.js）：
   - 在 Webpack 配置工厂函数 `module.exports(env)` 中接收 Hvigor 传入的 env 参数
   - 处理 `env.minify` 和 `env.sourcemap` 参数

2. **minify实现**（webpack.rich.config.js）：
   ```javascript
   const isDebug = process.env.buildMode === 'debug';
   if (isDebug && env.minify === true) {
     config.mode = 'production';
     config.optimization.minimize = true;
     config.optimization.minimizer = [new TerserPlugin({...})];
   }
   ```
   - 复用 Release 模式的 TerserPlugin 配置

3. **minify实现**（webpack.lite.config.js）：
   ```javascript
   const isDebug = process.env.buildMode === 'debug';
   if (isDebug && env.minify === true) {
     webpackConfig.optimization = {
       minimize: true,
       minimizer: [new TerserPlugin({...})]
     };
   }
   ```

4. **sourcemap实现**（webpack.rich.config.js & webpack.lite.config.js）：
   ```javascript
   if (isDebug && env.sourcemap === true) {
     config.devtool = false;  // 不生成 sourcemap
   }
   ```

### 风险与依赖

| 风险/依赖 | 影响 | 缓解措施 |
|-----------|------|----------|
| 参数名称未确定 | 实现时机 | 待参数名称确定后实施 |
| 与现有Release模式行为冲突 | 用户感知 | 仅在Debug模式下生效，Release保持原样 |
| sourcemap删除可能影响调试 | 用户体验 | 默认不启用，由用户主动选择 |
| Terser插件配置兼容性 | 构建结果 | 复用现有`obfuscationOptions`配置 |

---

## 四、相关链接

| 资源 | 链接 |
|------|------|
| GitCode Issue | https://gitcode.com/openharmony/developtools_ace_js2bundle/issues/4723 |
| 相关文件 | `ace-loader/webpack.rich.config.js`, `ace-loader/webpack.lite.config.js`, `ace-loader/main.product.js` |
| 参考模式 | Webpack 配置条件编译模式 |
