# developtools_ace-js2bundle

## 介绍
提供类Web范式的语法编译转换、语法验证，丰富友好的语法报错提示。

## Install Dependencies under the ace-loader dir.

npm install

## Build built-in sample for Rich devices under the ace-loader dir.

npm run rich

## Build built-in sample for Lite devices under the ace-loader dir.

npm run lite

## How to build custom ace project

Windows:
Step 1. set aceModuleRoot=path/to/your/ace/project
Step 2. set aceModuleBuild=path/to/your/jsbundle/build
Step 3. node ./node_modules/webpack/bin/webpack.js --config webpack.rich.config.js

Linux:
Step 1. export aceModuleRoot=path/to/your/ace/project
Step 2. export aceModuleBuild=path/to/your/jsbundle/build
Step 3. node ./node_modules/webpack/bin/webpack.js --config webpack.rich.config.js
