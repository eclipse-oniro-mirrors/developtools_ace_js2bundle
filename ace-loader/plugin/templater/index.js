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

const componentValidator = require('./component_validator')
const parse5 = require('../parse/index')
const path = require('path')
const { DEVICE_LEVEL } = require('../../lib/lite/lite-enum');
const { liteNativeTag } = require('./lite_component_map');
let compileResult
const EVENT_START_REGEXP = /^(on:|on|@|grab:)/
const REGEXP_TEXT = /^#/
const REGEXP_DATA = /^data-/

/**
 * Compile html file into ast object.
 * @param {String} source Hml file content.
 * @param {Function} operate The second number.
 * @param {String} filePath File resource path.
 */
function parse(source, operate, filePath) {
  const relativePath = replaceAll(path.sep, '/', path.relative(
    process.env.aceModuleRoot || process.cwd(), filePath)).replace(path.parse(filePath).ext, '');
  const result = { jsonTemplate: {}, deps: [], log: [] }
  compileResult = result
  const template = hmlParse(source, {
    sourceCodeLocationInfo: true,
    componentValidator,
    compileResult,
  })
  if (checkNullNode(template, operate) || checkRootNode(template, operate, relativePath)) {
    return
  }
  const rootArray = template.childNodes.filter(function(currentValue) {
    return currentValue.nodeName.indexOf('#') === -1
  })
  let rootIndex = 0
  rootArray.forEach((root, index) => {
    if(root.tagName !== 'element') {
      rootIndex = index
    }
  })
  generate(rootArray[rootIndex], filePath, undefined, relativePath)
  filterSvgNestingMustBeClosedErrors(compileResult);
  operate(null, compileResult)
}


/**
 * Use parse5 to get html conversion results.
 * @param {String} code Hml file content.
 * @param {Object} config parse5 parseFragment function config.
 * @return {Object} html conversion results.
 */
function hmlParse(code, config) {
  const res = parse5.parseFragment(code, config)
  return res
}

/**
 * Check if the hml file does not contain nodes.
 * @param {String} template hml conversion results.
 * @return {Boolean} Check result.
 */
function checkNullNode(template, operate) {
  let errorFlag = false
  if (template.childNodes.length === 0) {
    compileResult.log.push({ reason: 'ERROR: parsing hml file failed' })
    operate(null, compileResult)
    errorFlag = true
  }
  return errorFlag
}

/**
 * Check if the root node is legal.
 * @param {String} template hml conversion results.
 * @return {Boolean} Check result.
 */
function checkRootNode(template, operate, relativePath) {
  let errorFlag = false
  const rootArray = template.childNodes.filter(function(currentValue) {
    return currentValue.nodeName.indexOf('#') === -1
  })
  let rootNum = 0
  rootArray.forEach(root => {
    if (root.nodeName !== 'element') {
      rootNum ++
    } else if (root.attrs && root.attrs.length) {
      for (let index = 0; index < root.attrs.length; index++) {
        const element = root.attrs[index];
        if (element.name === 'name') {
          componentValidator.elementNames[relativePath] = componentValidator.elementNames[relativePath] || []
          componentValidator.elementNames[relativePath].push(element.value.toLowerCase())
          break
        }
      }
    }
  })
  if (rootNum !== 1) {
    if (!rootNum) {
      compileResult.log.push({
        reason: 'ERROR: need a legal root node',
        line: 1,
        column: 1,
      })
    }
    if (rootNum > 1) {
      compileResult.log.push({
        reason: 'ERROR: there can only be one root node',
        line: 1,
        column: 1,
      })
    }
    operate(null, compileResult)
    errorFlag = true
  }
  return errorFlag
}
/**
 * Recursively parse every node.
 * @param {Object} node Nodes that need to be resolved.
 * @param {String} filePath File resource path.
 * @param {Object} preNode the previous node.
 */
function generate(node, filePath, preNode, relativePath) {
  componentValidator.validateTagName(node, compileResult, relativePath)
  if (node.attrs && node.attrs.length !== 0) {
    checkNodeAttrs(node, filePath, preNode, relativePath)
  }
  if (node.childNodes && node.childNodes.length !== 0) {
    checkNodeChildren(node, filePath, relativePath)
  }
}

/**
 * Parse node properties.
 * @param {Object} node Nodes that need to be resolved.
 * @param {String} filePath File resource path.
 * @param {Object} preNode the previous node.
 */
function checkNodeAttrs(node, filePath, preNode, relativePath) {
  const attributes = node.attrs
  const pos = {
    line: node.sourceCodeLocation.startLine,
    col: node.sourceCodeLocation.endLine,
  }
  attributes.forEach((attr, index) => {
    const attrName = attr.name
    const attrValue = attr.value
    switch (attrName) {
      case 'style':
        componentValidator.validateStyle(attrValue, compileResult, pos, relativePath)
        break
      case 'class':
        componentValidator.validateClass(attrValue, compileResult, pos, relativePath)
        break
      case 'id':
        componentValidator.validateId(attrValue, compileResult, pos, relativePath)
        break
      case 'for':
        checkAttrFor(node, attributes, pos);
        componentValidator.validateFor(attrValue, compileResult, pos, relativePath)
        break
      case 'if':
        componentValidator.validateIf(attrValue, compileResult, false, pos, relativePath)
        break
      case 'elif':
        componentValidator.validateAttrElif(preNode, attrValue, attributes, index,
          compileResult, pos, relativePath)
        break
      case 'else':
        componentValidator.validateAttrElse(preNode, compileResult, pos, relativePath)
        break
      case 'append':
        componentValidator.validateAppend(attrValue, compileResult, pos, relativePath)
        break
      default:
        if (EVENT_START_REGEXP.test(attrName)) {
          componentValidator.validateEvent(attrName, attrValue, compileResult, pos, relativePath)
        } else if (REGEXP_DATA.test(attrName)) {
          componentValidator.parseDataAttr(attrName, attrValue, compileResult, pos, relativePath)
        } else {
          componentValidator.validateAttr(
              filePath,
              attrName,
              attrValue,
              compileResult,
              node.tagName,
              pos,
              relativePath
          )
        }
    }
  })
}

function checkAttrFor(node, attributes, pos) {
  if (process.env.DEVICE_LEVEL === 'card') {
    let tidExists = false
    let ifExists = false
    attributes.forEach(element => {
      if(element.name === 'tid') {
        tidExists = true
      }
      if(element.name === 'if' || element.name === 'elif' || element.name === 'else') {
        ifExists = true
      }
    })
    if (!tidExists) {
      compileResult.log.push({
        line: pos.line || 1,
        column: pos.col || 1,
        reason: `WARNING: The 'tid' is recommended here.`,
      })
    }
    if (ifExists) {
      compileResult.log.push({
        line: pos.line || 1,
        column: pos.col || 1,
        reason: `ERROR: The 'for' and 'if' cannot be used in the same node.`,
      })
    }
    let isParentFor = false
    if (node && node.parentNode && node.parentNode.attrs) {
      node.parentNode.attrs.forEach(element => {
        if (element.name === 'for') {
          isParentFor = true
        }
      })
    }
    if (isParentFor) {
      compileResult.log.push({
        line: pos.line || 1,
        column: pos.col || 1,
        reason: `ERROR: The nested 'for' is not supported.`,
      })
    }
  }
}

function replaceAll(find, replace, str) {
  find = find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  return str.replace(new RegExp(find, 'g'), replace);
}

/**
 * Parse node children.
 * @param {Object} node Nodes that need to be resolved.
 * @param {String} filePath File resource path.
 * @param {Object} preNode the previous node.
 */
function checkNodeChildren(node, filePath, relativePath) {
  const children = node.childNodes.filter((child) => {
    return (
      (child.nodeName === '#text' && child.value.trim()) ||
      !REGEXP_TEXT.test(child.nodeName)
    )
  })
  const temp=compileResult.jsonTemplate
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    let preNode
    if (i > 0) {
      preNode = children[i - 1]
    }
    if (!REGEXP_TEXT.test(child.nodeName)) {
      compileResult.jsonTemplate={}
      temp.children=temp.children||[]
      temp.children.push(compileResult.jsonTemplate)
      generate(child, filePath, preNode, relativePath)
    } else {
      const pos = {
        line: child.sourceCodeLocation.startLine,
        col: child.sourceCodeLocation.endLine,
      }
      if (node.nodeName === 'option') {
        componentValidator.validateAttr(filePath, 'content', child.value,
          compileResult, child.tagName, pos, relativePath)
        continue
      }
      componentValidator.validateAttr(filePath, 'value', child.value,
        compileResult, child.tagName, pos, relativePath)
    }
  }
  compileResult.jsonTemplate=temp
}

function filterSvgNestingMustBeClosedErrors(compileResult) {
  if (process.env.DEVICE_LEVEL !== DEVICE_LEVEL.LITE) {
    return;
  }
  if (!compileResult.log || !compileResult.log.length) {
    return;
  }
  const tagsWithChildren = Object.keys(liteNativeTag).filter(function(tag) {
    const def = liteNativeTag[tag];
    return def && Array.isArray(def.children) && def.children.length > 0;
  });
  compileResult.log = compileResult.log.filter(function(item) {
    const match = item.reason && item.reason.match(/tag `(.+)` must be closed/);
    if (!match) {
      return true;
    }
    return !tagsWithChildren.includes(match[1]);
  });
}

module.exports = { parse: parse }

