---
id: issue-4723-debug-release-mix
type: feature
title: "Debug模式支持Release特性"
spec_schema: ohos-sdd/v1
profile: arkui/toolchain
subprofiles: [compiler/build]
target_release:
  id: TBD
  status: ready
complexity: standard
lineage: new
status: specify
owner: TBD
source_issue: "https://gitcode.com/openharmony/developtools_ace_js2bundle/issues/4723"
created_at: 2026-08-11
updated_at: 2026-08-11
related: []
related_tasks: []
related_decisions: []
code_refs:
  - "developtools/ace_js2bundle/ace-loader/webpack.rich.config.js"
  - "developtools/ace_js2bundle/ace-loader/webpack.lite.config.js"
  - "developtools/ace_js2bundle/ace-loader/main.product.js"
commits: []
---

# Manifest — Debug模式支持Release特性

## 需求标识

| 字段 | 内容 |
|------|------|
| 需求ID | REQ-xx-xx-xx-04 |
| 需求名称 | Debug模式支持Release特性 |
| func_id | TBD |
| feat_id | TBD |
| CodeSpec ID | issue-4723-debug-release-mix |
| 关联 Issue | https://gitcode.com/openharmony/developtools_ace_js2bundle/issues/4723 |

## 功能域路径

```text
ArkUI工具链 (Level1) > JSBundle构建流程 (Level2) > 条件编译特性 (Level3)
```

## 长期规格路径

| 资产 | 路径 |
|------|------|
| 长期 spec | `specs/debug-release-mix/spec.md` |
| 长期 design | `specs/debug-release-mix/design.md` |
| SpecTest feature | 构建配置验证 |

## 阶段状态

| 阶段 | 状态 | 产物 |
|------|------|------|
| 定义 (Stage 1) | Approved | proposal.md |
| 规格说明 (Stage 2) | In Progress | design.md, spec.md |
| 设计 (Stage 3) | Pending | - |
| 计划 (Stage 4) | Pending | - |
| 发布闭环 (Stage 5) | Pending | - |

### 核心结论

- 本需求属于 `developtools/ace_js2bundle/ace-loader/` Webpack构建配置增强
- 复杂度为标准级别，单仓特性
- 在Debug模式下支持部分Release特性（代码压缩、禁用sourcemap）
- 基于Webpack配置实现，不涉及Runtime API变更

## baseline_approval

| 字段 | 内容 |
|------|------|
| approved | true |
| approver | 用户 |
| evidence | 需求范围已明确，6个验收标准已定义，5个澄清问题已解决 |
| date | 2026-08-11 |
