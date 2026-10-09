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

const bind = require('./bind')
const styler = require('../styler')
const styleValidator = require('../styler/lib/validator')
const OHOS_THEME_PROP_GROUPS = require('../theme/ohosStyles')
const path = require('path')
const projectPath = process.env.aceModuleRoot || process.cwd()
const transContent = require('./content')

const REG_TAG_DATA_ATTR = /^data-\w+/
const REG_EVENT = /([^(]*)\((.+)\)/
const REG_DATA_BINDING = /{{{(.+?)}}}|{{(.+?)}}/
const { DEVICE_LEVEL, PLATFORM } = require('../../lib/lite/lite-enum')
const { richCommonTag, richNativeTag } = require('./rich_component_map')
const { liteCommonTag, liteNativeTag } = require('./lite_component_map')
const { cardCommonTag, cardNativeTag } = require('./card_component_map')

const card = process.env.DEVICE_LEVEL === DEVICE_LEVEL.CARD
const nativeTag = process.env.DEVICE_LEVEL === DEVICE_LEVEL.LITE ? liteNativeTag :
  card ? cardNativeTag: richNativeTag
const commonTag = process.env.DEVICE_LEVEL === DEVICE_LEVEL.LITE ? liteCommonTag :
  card ? cardCommonTag: richCommonTag

const tagSelfClosing = []
const tagWithoutRoot = []
const tagWithoutChild = []
const tagWithTextContent = []
const tagWithAll = []
const tagWithPath = []
const aliasTagMap = {}
const attrTagMap = {}
const funcAttrTagMap = {}
const defaultAttrTagMap = {}
const requireAttrTagMap = {}
const enumAttrTagMap = {}
const rootAttrTagMap = {}
const parentsTagMap = {}
const childrenTagMap = {}
const unSupportedChildren = {}
const eventsTagMap = {}
let elementNames = {}

/**
 * prepare criteria for
 * checking tag and attribute
 *
 * @type {{Object}}
 */
;(function initRules() {
  for (const tag of Object.keys(nativeTag)) {
    // tag with selfClosing attribute
    if (nativeTag[tag].selfClosing) {
      tagSelfClosing.push(tag)
    }

    // tag can not be root
    if (nativeTag[tag].excludeRoot) {
      tagWithoutRoot.push(tag)
    }

    // tag can not have children
    if (nativeTag[tag].atomic) {
      tagWithoutChild.push(tag)
    }

    // tag support text content
    if (nativeTag[tag].textContent) {
      tagWithTextContent.push(tag)
    }

    // store all tags
    tagWithAll.push(tag)

    // tags with other name
    if (nativeTag[tag].alias && nativeTag[tag].alias.length) {
      for (const alia of nativeTag[tag].alias) {
        aliasTagMap[alia] = tag
      }
    }

    // store private and common attr
    const attrTagSet = {}

    if (nativeTag[tag].uattrs) {
      Object.assign(attrTagSet, nativeTag[tag].uattrs, {})
    } else {
      Object.assign(attrTagSet, nativeTag[tag].attrs, commonTag.attrs)
    }

    attrTagMap[tag] = attrTagSet
    const checkFuncSet = {}
    const attrDefaultSet = {}
    const attrRequireArr = []
    const attrEnumSet = {}
    const rootNoAttr = []

    for (const attr of Object.keys(attrTagSet)) {
      if (attrTagSet[attr].checkFunc) {
        checkFuncSet[attr] = attrTagSet[attr].checkFunc
      }

      if (attrTagSet[attr].def) {
        attrDefaultSet[attr] = attrTagSet[attr].def
      }

      if (attrTagSet[attr].required) {
        attrRequireArr.push(attr)
      }

      if (attrTagSet[attr].enum && attrTagSet[attr].enum.length > 0) {
        attrEnumSet[attr] = attrTagSet[attr].enum
        attrDefaultSet[attr] = attrTagSet[attr].enum[0]
      }

      if (attrTagSet[attr].excludeRoot) {
        rootNoAttr.push(attr)
      }

      if (attrTagSet[attr].checkPath) {
        tagWithPath.push(attr)
      }
    }

    funcAttrTagMap[tag] = checkFuncSet
    defaultAttrTagMap[tag] = attrDefaultSet
    requireAttrTagMap[tag] = attrRequireArr
    enumAttrTagMap[tag] = attrEnumSet
    rootAttrTagMap[tag] = rootNoAttr

    if (nativeTag[tag].parents) {
      parentsTagMap[tag] = nativeTag[tag].parents.concat(commonTag.parents)
    }

    if (nativeTag[tag].children) {
      childrenTagMap[tag] = nativeTag[tag].children.concat(commonTag.children)
    }

    if (nativeTag[tag].unSupportedChildren) {
      unSupportedChildren[tag] = nativeTag[tag].unSupportedChildren.concat(commonTag.unSupportedChildren)
    }

    if (nativeTag[tag].uevents) {
      eventsTagMap[tag] = nativeTag[tag].uevents.concat(nativeTag[tag].events)
    } else {
      eventsTagMap[tag] = [].concat(commonTag.events).concat(nativeTag[tag].events)
    }
  }
})()

/**
 * verify the validity of tag
 *
 * @param {Object} domNode
 * @param {Object} out
 */
function validateTagName(domNode, out, relativePath) {
  const tagName = domNode.tagName
  const children = domNode.childNodes || []
  const nodeLoc = domNode.sourceCodeLocation ? {
    line: domNode.sourceCodeLocation.startLine,
    col: domNode.sourceCodeLocation.endLine
  } : {}
  const depends = out.deps
  const jsonTemplate = out.jsonTemplate
  const log = out.log
  const oneChildNode = ['dialog', 'popup', 'badge', 'list-item']
  const logType = process.env.DEVICE_LEVEL === DEVICE_LEVEL.LITE ? 'ERROR' : 'WARNING'
  let pos = domNode.__location || domNode.sourceCodeLocation ? {
    line: domNode.sourceCodeLocation.startLine,
    col: domNode.sourceCodeLocation.endLine
  } : {}
  const elementNamesInFile = elementNames[relativePath] || []

  // validate tag
  if (!tagWithAll.includes(tagName) && tagName !== 'img' && !elementNamesInFile.includes(tagName)) {
    log.push({
      line: nodeLoc.line || 1,
      column: nodeLoc.col || 1,
      reason: logType + ': The `' + tagName + '` tag is not supported.',
    })
  }

  // validate dialog tag
  if (process.env.DEVICE_LEVEL === DEVICE_LEVEL.RICH && oneChildNode.includes(tagName)) {
    checkOneChild(tagName, children, pos, log)
  }

  // preprocess attribute
  if (!depends[tagName] && typeof tagName === 'string') {
    depends.push(tagName)
  }
  const domNodeAttrs = domNode.attrs || []
  const domNodeAttrName = []
  for (const attr of domNodeAttrs) {
    domNodeAttrName.push(attr.name.toLowerCase())
  }
  setDebugLine(jsonTemplate, relativePath, nodeLoc.line)

  validateAliasTagMap(tagName, jsonTemplate, nodeLoc, log)
  validateTagWithoutRoot(domNode, tagName, domNodeAttrName, nodeLoc, log)
  validateName(tagName, children, nodeLoc, log)
  validateForAttr(tagName, domNodeAttrs, domNodeAttrName, nodeLoc, log)
  validatorLite(tagName, domNodeAttrs, domNodeAttrName, log, nodeLoc)
}

function validateName(tagName, children, nodeLoc, log) {
  validateAtomicTag(tagName, children, nodeLoc, log)
  validateTagWithAll(tagName, children, nodeLoc, log)
}

function validateForAttr(tagName, domNodeAttrs, domNodeAttrName, nodeLoc, log) {
  validateAttrTagMap(tagName, domNodeAttrName, nodeLoc, log)
  validateDefaultAttrTagMap(tagName, domNodeAttrs, domNodeAttrName, nodeLoc, log)
  validateRequireAttrTagMap(tagName, domNodeAttrName, nodeLoc, log)
  validateEnumAttrTagMap(tagName, domNodeAttrName, domNodeAttrs, nodeLoc, log)
  validateFuncAttrTagMap(tagName, domNodeAttrName, domNodeAttrs, nodeLoc, log)
  validateEventsTagMap(tagName, domNodeAttrName, nodeLoc, log)
}

/**
 * verify the dialog tag
 *
 * @param {String} tagName
 * @param {Array} children
 * @param {Object} nodeLoc
 * @param {Array} log
 */
function checkOneChild(name, children, pos, log) {
  const oneChild = children.filter((child) => {
      return child && child.nodeName !== '#text' && child.nodeName !== '#comment'
  })
  if (oneChild.length > 1) {
    log.push({
      line: pos.line || 1,
      column: pos.col || 1,
      reason: 'ERROR: The `' + name + '` tag can have only one child node.'
    })
  }
}

/**
 * whether it can be root
 * or be the root, check the
 * attr can not have
 *
 * @param {Object} domNode
 * @param {String} tagName
 * @param {Object} domNodeAttrName
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateTagWithoutRoot(domNode, tagName, domNodeAttrName, nodeLoc, log) {
  if (domNode._isroot) {
    if (tagWithoutRoot.indexOf(tagName) !== -1) {
      log.push({
        line: nodeLoc.line || 1,
        column: nodeLoc.col || 1,
        reason: 'ERROR: component `' + tagName + '` can not as root component.',
      })
    }
    if (rootAttrTagMap[tagName]) {
      rootAttrTagMap.forEach(function(attrName) {
        if (domNodeAttrName[attrName]) {
          log.push({
            line: nodeLoc.line || 1,
            column: nodeLoc.col || 1,
            reason: 'ERROR: root node `' + tagName + '` can not use attr `' + attrName + '`',
          })
        }
      })
    }
  }
}

/**
 * whether tag can have alias name
 *
 * @param {String} tagName
 * @param {Object} result
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateAliasTagMap(tagName, result, nodeLoc, log) {
  if (aliasTagMap[tagName]) {
    if (tagName !== 'img') {
      log.push({
        line: nodeLoc.line || 1,
        column: nodeLoc.col || 1,
        reason: 'NOTE: tag name `' + tagName + '` is automatically changed to `' + aliasTagMap[tagName] + '`',
      })
    }
    tagName = aliasTagMap[tagName]
  }
  result.type = tagName
}

/**
 * whether tag can have children
 * how many text child the tag have
 *
 * @param {String} tagName
 * @param {Object} children
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateAtomicTag(tagName, children, nodeLoc, log) {
  if (tagWithoutChild.indexOf(tagName) >= 0 && children.length > 0 && !isSupportedSelfClosing(tagName)) {
    if (tagWithTextContent.indexOf(tagName) < 0) {
      children.every(
          function(child) {
            return child.nodeName === '#text' || child.nodeName === '#comment' ||
            log.push({
              line: nodeLoc.Line || 1,
              column: nodeLoc.Col || 1,
              reason: 'ERROR: tag `' + tagName + '` should just have one text node only',
            })
          },
      )
    } else {
      children.every(
          function(child) {
            return child.nodeName === '#text' || child.nodeName === '#comment' ||
            log.push({
              line: nodeLoc.Line || 1,
              column: nodeLoc.Col || 1,
              reason: 'ERROR: tag `' + tagName + '` should not have children',
            })
          },
      )
    }
  }
}

/**
 * verify the tag whether
 * support its attr
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrName
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateAttrTagMap(tagName, domNodeAttrName, nodeLoc, log) {
  if (tagName === 'img') {
    tagName = 'image'
  }
  if (attrTagMap[tagName]) {
    domNodeAttrName.forEach(function(attrKey) {
      if (attrKey === 'stroke-width') {
        attrKey = 'strokeWidth'
      } else if (attrKey === 'fill-opacity') {
        attrKey = 'fillOpacity'
      } else if (attrKey === 'stroke-dasharray') {
        attrKey = 'strokeDasharray'
      } else if (attrKey === 'stroke-dashoffset') {
        attrKey = 'strokeDashoffset'
      } else if (attrKey === 'stroke-linecap') {
        attrKey = 'strokeLinecap'
      } else if (attrKey === 'fill-rule') {
        attrKey = 'fillRule'
      } else if (attrKey === 'stroke-linejoin') {
        attrKey = 'strokeLinejoin'
      } else if (attrKey === 'stroke-miterlimit') {
        attrKey = 'strokeMiterlimit'
      } else if (attrKey === 'font-size') {
        attrKey = 'fontSize'
      } else if (attrKey === 'stroke-opacity') {
        attrKey = 'strokeOpacity'
      }
      if (!attrKey.match(EVENT_START_REGEXP) && !(attrKey in attrTagMap[tagName])) {
        if (attrKey in commonTag.attrs) {
          log.push({
            line: nodeLoc.line || 1,
            column: nodeLoc.col || 1,
            reason: 'WARNING: tag `' + tagName + '` not support attr `' + attrKey + '`',
          })
        } else if (!validateDataAttr(attrKey)) {
          log.push({
            line: nodeLoc.line || 1,
            column: nodeLoc.col || 1,
            reason: 'WARNING: tag `' + tagName + '` use customize attr `' + attrKey + '`',
          })
        }
      }
    })
  }
}

/**
 * validate the default attr can be
 * supported by the tag
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrs
 * @param {Object} domNodeAttrName
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateDefaultAttrTagMap(tagName, domNodeAttrs, domNodeAttrName, nodeLoc, log) {
  if (defaultAttrTagMap[tagName]) {
    Object.keys(defaultAttrTagMap[tagName]).forEach(function(attrKey) {
      const n = domNodeAttrName.indexOf(attrKey)
      if (n >= 0 && domNodeAttrs[n].value === '') {
        domNodeAttrs[n].value = defaultAttrTagMap[tagName][attrKey]
        if (attrKey !== 'else') {
          log.push({
            line: nodeLoc.line || 1,
            column: nodeLoc.col || 1,
            reason: 'WARNING: tag `' + tagName + '` attr `' + attrKey + '`' + 'is null',
          })
        }
      }
    })
  }
}

/**
 * validate whether the required tag
 * included in the tag
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrName
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateRequireAttrTagMap(tagName, domNodeAttrName, nodeLoc, log) {
  if (requireAttrTagMap[tagName]) {
    requireAttrTagMap[tagName].forEach(function(attrKey) {
      if (domNodeAttrName.indexOf(attrKey) < 0) {
        log.push({
          line: nodeLoc.line || 1,
          column: nodeLoc.col || 1,
          reason: 'ERROR: tag `' + tagName + '` not define attr `' + attrKey + '`',
        })
      }
    })
  }
}

/**
 * validate whether the tag include
 * illegal enum attr
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrName
 * @param {Object} nodeAttrs
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateEnumAttrTagMap(tagName, domNodeAttrName, domNodeAttrs, nodeLoc, log) {
  if (enumAttrTagMap[tagName]) {
    Object.keys(enumAttrTagMap[tagName]).forEach(function(attrKey) {
      const index = domNodeAttrName.indexOf(attrKey)
      if (index >= 0) {
        const v = domNodeAttrs[index].value.trim()
        if (!REG_DATA_BINDING.test(v)) {
          const attrValueEnum = enumAttrTagMap[tagName][attrKey]
          if (attrValueEnum.indexOf(v) < 0) {
            domNodeAttrs[index].value = attrValueEnum[0]
            log.push({
              line: nodeLoc.line || 1,
              column: nodeLoc.col || 1,
              reason: 'ERROR: tag `' + tagName + '` attr `' + attrKey + '` value `' + v + '` is illegal',
            })
          }
        }
      }
    })
  }
}

/**
 * verify the validity of func
 * attr of the tag
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrName
 * @param {Object} domNodeAttrs
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateFuncAttrTagMap(tagName, domNodeAttrName, domNodeAttrs, nodeLoc, log) {
  if (funcAttrTagMap[tagName]) {
    Object.keys(funcAttrTagMap[tagName]).forEach(function(attrKey) {
      const n = domNodeAttrName.indexOf(attrKey)
      if (n >= 0) {
        const v = domNodeAttrs[n].value
        if (!REG_DATA_BINDING.test(v)) {
          const func = funcAttrTagMap[tagName][attrKey]
          const validator = styleValidator.validateFuncMap[func]
          if (typeof validator == 'function') {
            const res = validator(v)
            if (res && res.reason) {
              domNodeAttrs[n].value = res.value
              const rea = res.reason(attrKey, v, res.value)
              log.push({
                line: nodeLoc.line || 1,
                column: nodeLoc.col || 1,
                reason: rea,
              })
            }
          }
        }
      }
    })
  }
}

/**
 * verify the validity of event
 * attr in this tag
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrName
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateEventsTagMap(tagName, domNodeAttrName, nodeLoc, log) {
  if (eventsTagMap[tagName]) {
    const eventArray = eventsTagMap[tagName]
    domNodeAttrName.forEach(function(attrKey) {
      if (attrKey.match(EVENT_START_REGEXP)) {
        const tempName = attrKey.replace(EVENT_START_REGEXP, '')
        const eventName = (tempName.match(TOUCH_CAPTURE_EVENT_REGEXP) && process.env.DEVICE_LEVEL === DEVICE_LEVEL.RICH &&
          process.env.PLATFORM_VERSION === PLATFORM.VERSION6) ? tempName : tempName.replace(EVENT_END_REGEXP, '')
        if (eventArray.indexOf(eventName.toLowerCase()) < 0) {
          log.push({
            line: nodeLoc.line || 1,
            column: nodeLoc.col || 1,
            reason: 'WARNING: tag `' + tagName + '` not support event `' + eventName + '`',
          })
        }
      }
    })
  }
}

/**
 * verify validity of tag children
 * verify the children is validity
 *
 * @param {String} tagName
 * @param {Object} children
 * @param {Object} nodeLoc
 * @param {Object} log
 */
function validateTagWithAll(tagName, children, nodeLoc, log) {
  if (tagWithAll.indexOf(tagName) >= 0 && children.length > 0) {
    const childrenArray = childrenTagMap[tagName]
    const unSupportedChildrenArray = unSupportedChildren[tagName]
    const isTabs = tagName === 'tabs'
    let tabContentCount = void 0
    let tabBarCount = void 0
    if (isTabs) {
      tabBarCount = 0
      tabContentCount = 0
    }
    children.forEach(function(child) {
      if (tagWithAll.indexOf(child.nodeName) >= 0) {
        const t = parentsTagMap[child.nodeNames]
        if ((t && t.indexOf(tagName) < 0) || (childrenArray && childrenArray.indexOf(child.nodeName) < 0) ||
          (unSupportedChildrenArray && unSupportedChildrenArray.indexOf(child.nodeName) >= 0)) {
          log.push({
            line: nodeLoc.line || 1,
            column: nodeLoc.col || 1,
            reason: 'ERROR: tag `' + tagName + '` not support child tag `' + child.nodeName + '`',
          })
          if (isTabs) {
            let count = 0
            if (child.nodeName === 'tab-content') {
              count = ++tabContentCount
            }
            if (child.nodeName === 'tab-bar') {
              count = ++tabBarCount
            }
            if (count > 1) {
              log.push({
                line: nodeLoc.line || 1,
                column: nodeLoc.col || 1,
                reason: 'ERROR: tag  `tabs` child tag `' + child.nodeName + '` support at most one',
              })
            }
          }
        }
      }
    })
  }
}

/**
 * validate attr of lite device
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrs
 * @param {Object} domNodeAttrName
 * @param {Object} log
 * @param {Object} nodeLoc
 */
function validatorLite(tagName, domNodeAttrs, domNodeAttrName, log, nodeLoc) {
  if (process.env.DEVICE_LEVEL === DEVICE_LEVEL.LITE) {
    inputLite(tagName, domNodeAttrs, domNodeAttrName, log, nodeLoc)

    // in lite device, not support writing `if` and `for` in the same component
    if (ismatchIfAndFor(domNodeAttrName)) {
      log.push({
        line: nodeLoc.line || 1,
        column: nodeLoc.col || 1,
        reason: 'ERROR: in tag `' + tagName + '` not support writing `if` and `for` in the same component',
      })
    }
    // in lite device, class selector does not support data binding
    classLite(tagName, domNodeAttrs, log, nodeLoc)
  }
}

/**
 * validate the type when
 * event change
 *
 * @param {String} tagName
 * @param {Object} domNodeAttrs
 * @param {Object} domNodeAttrName
 * @param {Object} log
 * @param {Object} nodeLoc
 */
function inputLite(tagName, domNodeAttrs, domNodeAttrName, log, nodeLoc) {
  let typeValue
  if (tagName=== 'input') {
    domNodeAttrs.map(function(item) {
      if (item.name === 'type') {
        typeValue = item.value
      }
    })
    if (isMatchChange(typeValue, domNodeAttrName)) {
      log.push({
        line: nodeLoc.line || 1,
        column: nodeLoc.col || 1,
        reason: 'ERROR: tag `' + tagName + '` not support event `change` when the type is not checkbox and radio',
      })
    }
  }
}

function isMatchChange(typeValue, nodeAttrName) {
  return !['checkbox', 'password', 'radio', 'text'].includes(typeValue) && (nodeAttrName.includes('onchange') || nodeAttrName.includes('@change'))
}

function ismatchIfAndFor(nodeAttrName) {
  return nodeAttrName.includes('if') && nodeAttrName.includes('for')
}

function classLite(tagName, domNodeAttrs, log, nodeLoc) {
  // in lite device, class selector does not support data binding
  domNodeAttrs.map(function(item) {
    if (item.name === 'class' && bind.containExp(item.value)) {
      log.push({
        line: nodeLoc.line || 1,
        column: nodeLoc.col || 1,
        reason: 'ERROR: in tag `' + tagName + '` class selector does not support data binding.',
      })
    }
  })
}

/**
 * parse class for tag
 *
 * @param {String} classNames
 * @param {Object} out
 */
function validateClass(classNames, out, nodeLoc, relativePath) {
  classNames = classNames.trim()
  setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line, classNames)
  if (bind.containExp(classNames)) {
    out.jsonTemplate.classList = eval(bind.transExpForList(classNames))
  } else {
    out.jsonTemplate.classList = classNames.split(/\s+/)
  }
}

function preprocessSystemResourceReference(styleContent, cssStyle) {
  if (styleContent.length !== 2) {
    return false;
  }
  const key = styleContent[0].trim().replace(/-([a-z])/g, function(s, m) { return m.toUpperCase() })
  let value = styleContent[1].trim()
  let result
  // target format: {{$r("ohos.id_color_background")}} or {{$r('ohos.id_color_background')}}
  let ResourceRefReg = /{{\s*\$r\s*\(\s*(['"]ohos\.(?<resName>\w+)['"])\s*\)\s*}}/
  result = ResourceRefReg.exec(value);
  if (result) {
    const resourceName = result.groups['resName']
    if (resourceName && OHOS_THEME_PROP_GROUPS[resourceName]) {
      cssStyle[key] = "@ohos_id_" + OHOS_THEME_PROP_GROUPS[resourceName]
      return true
    }
  }
  // target format: {{$r("sys.type.id_color_background")}} or {{$r('sys.type.id_color_background')}}
  // The "type" field can be "float", "color", "string" and so on.
  let SysResourceTypeRefReg = /{{\s*\$r\s*\(\s*(['"]sys\.(?<resType>\w+)\.(?<resName>\w+)['"])\s*\)\s*}}/
  result = SysResourceTypeRefReg.exec(value);
  if (result) {
    const resourceName = result.groups['resName']
    const resourceType = result.groups['resType']
    if (resourceName && resourceType && OHOS_THEME_PROP_GROUPS[resourceName]) {
      cssStyle[key] = "@sys." + resourceType + "." + OHOS_THEME_PROP_GROUPS[resourceName]
      return true
    }
  }
  // target format: {{$r("app.type.developer_defined_color")}} or {{$r('app.type.developer_defined_color')}}
  // The "type" field can be "float", "color", "string" and so on.
  let AppResourceTypeRefReg = /{{\s*\$r\s*\(\s*(['"]app\.(?<resType>\w+)\.(?<resName>\w+)['"])\s*\)\s*}}/
  result = AppResourceTypeRefReg.exec(value);
  if (result) {
    const resourceName = result.groups['resName']
    const resourceType = result.groups['resType']
    if (resourceName && resourceType) {
      cssStyle[key] = "@app." + resourceType + "." + resourceName
      return true
    }
  }
  return false
}

function validateItem(key, value, nodeLoc, log) {
  const valuejsonTemplate = styler.validateItem(key, value)
  if (valuejsonTemplate.log) {
    log.push({
      line: nodeLoc.line || 1,
      column: nodeLoc.col || 1,
      reason: valuejsonTemplate.log.reason
    })
  }
  return valuejsonTemplate
}

/**
 * parse style for tag
 *
 * @param {String} css
 * @param {Object} out
 * @param {Object} nodeLoc
 */
function validateStyle(css, out, nodeLoc, relativePath) {
  const log = out.log
  if (css) {
    const cssStyle = {}
    const cssArray = css.split(';')
    processCssArray(css, out, nodeLoc, cssStyle, cssArray, log)
    out.jsonTemplate.style = cssStyle
    setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line)
  } else {
    log.push({
      line: nodeLoc.line || 1,
      column: nodeLoc.col || 1,
      reason: 'WARNING: style attr is null'
    })
  }
}

function processCssArray(css, out, nodeLoc, cssStyle, cssArray, log) {
  for (let i = 0; i < cssArray.length; i++) {
    let styleContent = cssArray[i].trim().split(':')
    if (preprocessSystemResourceReference(styleContent, cssStyle)) {
      continue;
    }
    if (styleContent.length === 2) {
      const key = styleContent[0].trim().replace(/-([a-z])/g, function(s, m) { return m.toUpperCase() })
      let value = bind(styleContent[1].trim(), undefined, true, out, nodeLoc)
      const contentValue = styleContent[1].trim().toString();
      if (contentValue.match(/^linear-gradient/) && contentValue.match(/\(.*\{\{.*\}\}.*\)/)) {
        log.push({
          line: nodeLoc.line || 1,
          column: nodeLoc.col || 1,
          reason: `ERROR: can not bind data for linear-gradient in inline style at ${css}`
        })
      }
      if (key === 'flex' && typeof value === 'string') {
        expandFlex(key, value, cssStyle, nodeLoc, log)
      } else {
        const valuejsonTemplate = validateItem(key, value, nodeLoc, log)
        value = valuejsonTemplate.value
        if (['[object Number]', '[object String]', '[object Function]', '[object Object]', '[object Array]'].includes(
          Object.prototype.toString.call(value))) {
          expandStyle(key, value, valuejsonTemplate, cssStyle, out, nodeLoc, log)
        }
      }
    }
    if (styleContent.length > 2) {
      styleContent[1] = styleContent.slice(1).join(':')
      styleContent = styleContent.slice(0, 2)
      if (REG_DATA_BINDING.test(styleContent[1])) {
        styleContent[0] = styleContent[0].trim().replace(/-([a-z])/g, function(s, m) { return m.toUpperCase() })
        cssStyle[styleContent[0]] = bind(styleContent[1], undefined, true, out, nodeLoc)
      } else {
        // handle special cases like "background-image: url('https://xxx.jpg')"
        const key = styleContent[0].trim().replace(/-([a-z])/g, function(s, m) { return m.toUpperCase() })
        if (key === 'backgroundImage') {
          let value = styleContent[1].trim()
          const valuejsonTemplate = validateItem(key, value, nodeLoc, log)
          cssStyle[key] = valuejsonTemplate.value
        }
      }
    }
  }
}

function expandFlex(key, value, cssStyle, nodeLoc, log) {
  const valueArray = value.split(/\s+/)
  if (valueArray.length === 1) {
    expandFlexOne(key, valueArray, cssStyle, nodeLoc, log)
  } else if (valueArray.length === 2) {
    expandFlexTwo(key, value, valueArray, cssStyle, nodeLoc, log)
  } else if (valueArray.length === 3) {
    expandFlexThree(key, value, valueArray, cssStyle, nodeLoc, log)
  } else {
    log.push({
      line: nodeLoc.line,
      column: nodeLoc.column,
      reason: 'ERROR: Value `' + value + '` of the `' + key + '` attribute is incorrect.',
    })
  }
}


function expandFlexOne(key, valueArray, cssStyle, nodeLoc, log) {
  const array = ['none', 'auto', 'initial']
  if (array.includes(valueArray[0])) {
    cssStyle['flex'] = valueArray[0]
  } else if (styler.getUnit(valueArray[0]) === 'px') {
    cssStyle['flexBasis'] = valueArray[0]
  } else if (styler.getUnit(valueArray[0]) === 'none') {
    cssStyle['flexGrow'] = valueArray[0]
  } else {
    log.push({
      line: nodeLoc.line,
      column: nodeLoc.column,
      reason: 'ERROR: Value `' + valueArray[0] + '` of the `' + key + '` attribute is incorrect.' +
        'It must be a number, a number with unit `' + 'px`' + ', none, auto, or initial.',
    })
  }
}

function expandFlexTwo(key, value, valueArray, cssStyle, nodeLoc, log) {
  if (styler.getUnit(valueArray[0]) === 'none') {
    cssStyle['flexGrow'] = valueArray[0]
    if (styler.getUnit(valueArray[1]) === 'px') {
      cssStyle['flexBasis'] = valueArray[1]
    } else if (styler.getUnit(valueArray[1]) === 'none') {
      cssStyle['flexShrink'] = valueArray[1]
    } else {
      log.push({
        line: nodeLoc.line,
        column: nodeLoc.column,
        reason: 'ERROR: Value `' + value + '` of the `' + key + '` attribute is incorrect. Value `' +
          valueArray[1] + '` must be a number or a number with unit `' + 'px`.',
      })
    }
  } else {
    log.push({
      line: nodeLoc.line,
      column: nodeLoc.column,
      reason: 'ERROR: Value `' + value + '` of the `' + key + '` attribute is incorrect. Value `' +
        valueArray[0] + '` must be a number.',
    })
  }
}

function expandFlexThree(key, value, valueArray, cssStyle, nodeLoc, log) {
  if (styler.getUnit(valueArray[0]) === 'none' && styler.getUnit(valueArray[1]) === 'none' &&
    styler.getUnit(valueArray[2]) === 'px') {
    cssStyle['flexGrow'] = valueArray[0]
    cssStyle['flexShrink'] = valueArray[1]
    cssStyle['flexBasis'] = valueArray[2]
  } else {
    log.push({
      line: nodeLoc.line,
      column: nodeLoc.column,
      reason: 'ERROR: Value `' + value + '` of the `' + key +
        '` attribute is incorrect. It must be in the format of (1, 1, 1px).',
    })
  }
}

function expandStyle(key, value, valuejsonTemplate, cssStyle, out, nodeLoc, log) {
  if (Object.values(styler.util.SPLECIAL_ATTR).includes(key) && typeof value !== 'function') {
    styler.expand(valuejsonTemplate, key, cssStyle)
  } else if (process.env.DEVICE_LEVEL === DEVICE_LEVEL.LITE && key === 'border' && typeof value === 'function') {
    log.push({
      line: nodeLoc.line || 1,
      column: nodeLoc.col || 1,
      reason: 'ERROR: ' + key + ' shorthand inline style does not support data binding.',
    })
  } else if (process.env.DEVICE_LEVEL === DEVICE_LEVEL.LITE && out.jsonTemplate.type === 'list' &&
      key == 'flexDirection' && typeof value === 'function') {
    log.push({
      line: nodeLoc.line || 1,
      column: nodeLoc.col || 1,
      reason: 'ERROR: `list` tag `flex-direction` inline style does not support data binding.',
    })
  } else {
    cssStyle[key] = value
  }
}

/**
 * parse if and else expression
 *
 * @param {String} val
 * @param {Object} out
 * @param {Boolean} flag
 * @param {Object} nodeLoc
 */
function validateIf(val, out, flag, nodeLoc, relativePath) {
  if (!REG_DATA_BINDING.test(val)) {
    if (val.trim() === 'false') {
      val = card ? false : '{{false}}'
    } else if (val.trim() === 'true') {
      val = card ? true : '{{true}}'
    } else {
      const log = out.log
      log.push({
        line: nodeLoc.line || 1,
        column: nodeLoc.col || 1,
        reason: 'ERROR: if value cannot be ' + val + '. The default value is true or false.'
      })
    }
  }
  if (flag) {
    const content = val.replace('{{', '').replace('}}', '')
    val = !card ? '{{!(' + content + ')}}' :
      REG_DATA_BINDING.test(val) ? '!{{' + content + '}}' : '!' + content
  }
  const value = bind(val, undefined, false, out, nodeLoc)
  const show = card && flag && /\$f/.test(value) ? value.substr(3, value.length - 4) : value
  out.jsonTemplate.shown = show
  setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line)
}

/**
 * parse elif and else expression
 *
 * @param {String} val
 * @param {Object} out
 * @param {Boolean} flag
 */
function validateElif(val, out, flag, nodeLoc, relativePath) {
  if (!REG_DATA_BINDING.test(val)) {
    val = card ? val : '{{' + val + '}}'
  }
  if (val) {
    if (flag) {
      const first = val.indexOf('&&')
      const content = !card ?
        '{{!(' + val.substr(2, first - 2) + ')' :
        REG_DATA_BINDING.test(val) ?
        '!{{' + val.substr(2, first - 2) :
        '!' + val.substr(0, first)
      val = content + val.substr(first, val.length)
    }
    const value = bind(val, undefined, false, out, nodeLoc)
    out.jsonTemplate.shown = card && /\$f/.test(value) ? value.substr(3, value.length - 4) : value
    setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line)
  }
}

/**
 *
 * parse for expression
 *
 * @param {String} val
 * @param {Object} out
 * @param {Object} nodeLoc
 */
function validateFor(val, out, nodeLoc, relativePath) {
  const log = out.log
  if (val) {
    if (val.startsWith('{{') && val.endsWith('}}')) {
      val = val.substr(2, val.length - 4)
    }
    let forMatch
    const suffix = val.match(/(?<=in\s)(.*)/)
    const prefix = val.match(/(.*)(?=\s+in\s+)/)
    if (suffix && prefix) {
      const v = prefix[0].match(/\((.*),(.*)\)/)
      forMatch = { exp: bind(('{{' + suffix[0].trim() + '}}'), undefined, false, out, nodeLoc) }
      if (v) {
        forMatch.key = v[1].trim()
        forMatch.value = v[2].trim()
      } else {
        forMatch.value = prefix[0].trim()
      }
    } else {
      forMatch = bind('{{' + val + '}}', undefined, false, out, nodeLoc)
    }
    out.jsonTemplate.repeat = forMatch
    setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line)
  } else {
    log.push({
      line: nodeLoc.line || 1,
      column: nodeLoc.col || 1,
      reason: 'WARNING: for attr is null',
    })
  }
}

/**
 * parse id for tag
 *
 * @param {String} id
 * @param {Object} out
 */
function validateId(id, out, nodeLoc, relativePath) {
  if (id) {
    out.jsonTemplate.id = REG_DATA_BINDING.test(id) ? bind(id, undefined, true, out, nodeLoc) : id
    setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line)
    if (!card) {
      out.jsonTemplate.attr = out.jsonTemplate.attr || {}
      out.jsonTemplate.attr[styler.util.hyphenedToCamelCase('id')] = bind(id, undefined, true, out, nodeLoc)
    }
  }
}

/**
 * parse append for tag
 *
 * @param {String} val
 * @param {Object} out
 */
function validateAppend(val, out, nodeLoc, relativePath) {
  if (val) {
    out.jsonTemplate.append = bind(val, undefined, true, out, nodeLoc)
    setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line)
  }
}

const EVENT_START_REGEXP = /^(on:|on|@|grab:)/;
const EVENT_END_REGEXP = /(\.bubble|\.capture)$/;
const START_CATCH_REGEXP  = /^(grab:)/;
const END_CAPTURE_REGEXP = /(\.capture)$/;
const TOUCH_EVENT_REGEXP = /^(touch)/;
const CLICK_EVENT_REGEXP = /^(click)$/;
const TOUCH_CAPTURE_EVENT_REGEXP = /^(?!touch).*?(\.capture)$/;

/**
 * parse event for tag
 *
 * @param {String} eventName
 * @param {Object} val
 * @param {Object} out
 */
function validateEvent(eventName, val, out, pos, relativePath) {
  const tempName = eventName.replace(EVENT_START_REGEXP, '')
  const name = (tempName.match(TOUCH_CAPTURE_EVENT_REGEXP) && process.env.PLATFORM_VERSION === PLATFORM.VERSION6 &&
    process.env.DEVICE_LEVEL === DEVICE_LEVEL.RICH) ? tempName : tempName.replace(EVENT_END_REGEXP, '')
  if (name && val) {
    if (card && val.match(/(.*)\((.*)\)/)) {
      out.log.push({
        line: pos.line || 1,
        column: pos.col || 1,
        reason: 'ERROR: The event `' + val + '` does not support.'
      })
      return
    }
    if (REG_DATA_BINDING.test(val)) {
      val = bind.removeAllExpFix(val.trim())
    }
    // empty event param e.g. onclick="test()"
    const empty = val.match(/(.*)\(\)$/)
    if (empty) {
      val = empty[1]
    } else {
      const content = val.match(REG_EVENT)
      if (content) {
        const functionName = content[1]
        let paramList = content[2]
        if (paramList) {
          paramList = transContent.parseExpression(paramList, true)
          val = eval('(function (evt) {' + bind('{{' + functionName + '(' + paramList + ',evt)}}',
          false, true, out, pos) + '})')
        }
      }
    }
    distributeEvent(out, eventName, name, val)
    setDebugLine(out.jsonTemplate, relativePath, pos.line)
  }
}

function distributeEvent(out, eventName, name, val) {
  if ((process.env.DEVICE_LEVEL === DEVICE_LEVEL.LITE || TOUCH_EVENT_REGEXP.test(name)) &&
    process.env.PLATFORM_VERSION !== PLATFORM.VERSION3) {
    if (eventName.match(START_CATCH_REGEXP)) {
      if (eventName.match(END_CAPTURE_REGEXP)) {
        out.jsonTemplate.catchCaptureEvents = out.jsonTemplate.catchCaptureEvents || {}
        out.jsonTemplate.catchCaptureEvents[name] = val
      } else {
        out.jsonTemplate.catchBubbleEvents = out.jsonTemplate.catchBubbleEvents || {}
        out.jsonTemplate.catchBubbleEvents[name] = val
      }
    } else if (eventName.match(END_CAPTURE_REGEXP)) {
      out.jsonTemplate.onCaptureEvents = out.jsonTemplate.onCaptureEvents || {}
      out.jsonTemplate.onCaptureEvents[name] = val
    } else {
      out.jsonTemplate.onBubbleEvents = out.jsonTemplate.onBubbleEvents || {}
      out.jsonTemplate.onBubbleEvents[name] = val
    }
  } else if (process.env.DEVICE_LEVEL === DEVICE_LEVEL.RICH && CLICK_EVENT_REGEXP.test(name) &&
  !eventName.match(END_CAPTURE_REGEXP) && process.env.PLATFORM_VERSION === PLATFORM.VERSION6) {
  if (eventName.match(START_CATCH_REGEXP)) {
    out.jsonTemplate.catchBubbleEvents = out.jsonTemplate.catchBubbleEvents || {}
    out.jsonTemplate.catchBubbleEvents[name] = val
  } else {
    out.jsonTemplate.onBubbleEvents = out.jsonTemplate.onBubbleEvents || {}
    out.jsonTemplate.onBubbleEvents[name] = val
  }
} else {
  out.jsonTemplate.events = out.jsonTemplate.events || {}
  out.jsonTemplate.events[name] = val
  }
}

const transArray = [/\\a/g, /\\b/g, /\\f/g, /\\n/g, /\\r/g, /\\t/g,
  /\\v/g, /\\\\/g, /\\'/g, /\\"/g, /\\0/g]
const transReplaceArray = ['\a', '\b', '\f', '\n', '\r', '\t',
    '\v', '\\', '\'', '\"', '\0']

function validateAttr(resourcePath, attrName, attrValue, out, tagName, nodeLoc, relativePath) {
  if (card && attrName === 'tid' && bind.isExp(attrValue)) {
    out.log.push({
      line: nodeLoc.line,
      column: nodeLoc.col,
      reason: `ERROR: The 'tid' does not support the expression.`
    })
  }
  if (attrName === 'value') {
    transArray.forEach((trans, index) => {
      attrValue = attrValue.replace(trans, transReplaceArray[index])
    })
  }
  if (attrName && (typeof attrValue === 'string' || typeof attrValue === 'number') && attrValue) {
    if (attrName === 'value' && tagName === 'text') {
      out.log.push({
        line: nodeLoc.line,
        column: nodeLoc.col,
        reason: 'WARNING: `value` content could be written between <text> and </text>',
      })
    }

    // dealing with <image src = "{{$r('sys.media.sys_background_image')}}"></image>
    let result
    // target format: {{$r('sys.media.sys_background_image')}}
    let SysResourceTypeRefReg = /{{\s*\$r\s*\(\s*(['"]sys\.media\.(?<resName>\w+)['"])\s*\)\s*}}/
    result = SysResourceTypeRefReg.exec(attrValue);
    getAttrValue(result, attrValue, true);
    // target format: {{$r('app.media.customized_background_image')}}
    let AppResourceTypeRefReg = /{{\s*\$r\s*\(\s*(['"]app\.media\.(?<resName>\w+)['"])\s*\)\s*}}/
    result = AppResourceTypeRefReg.exec(attrValue);
    getAttrValue(result, attrValue, false);

    if (tagWithPath.indexOf(attrName) >= 0 && attrValue.match(/^\.\.\/|^\.\//)) {
      if (!resourcePath) {
        return
      }
      if (attrValue.indexOf('./') >= 0) {
        resourcePath = resourcePath.substring(0, resourcePath.lastIndexOf(path.sep) + 1)
        attrValue = path.resolve(resourcePath, attrValue)
      }
      attrValue = attrValue.replace(projectPath, '').replace(/\\/g, '/')
    }
    out.jsonTemplate.attr = out.jsonTemplate.attr || {}
    out.jsonTemplate.attr[attrName.replace(/-([a-z])/g, function (s, m) { return m.toUpperCase() })] =
      bind(attrValue, undefined, true, out, nodeLoc)
    setDebugLine(out.jsonTemplate, relativePath, nodeLoc.line)
  }
}

function getAttrValue(result, attrValue, isSys) {
  if (result && isSys) {
    const resourceName = result.groups['resName']
    if (resourceName && OHOS_THEME_PROP_GROUPS[resourceName]) {
      attrValue = "@sys.media." + OHOS_THEME_PROP_GROUPS[resourceName]
    }
  } else if (result && !isSys) {
    const resourceName = result.groups['resName']
    if (resourceName) {
      attrValue = "@app.media." + resourceName
    }
  }
}

/**
 * parse elif attr
 *
 * @param {Object} preNode
 * @param {String} attrValue
 * @param {Object} hmlAttrs
 * @param {Number} i
 * @param {Object} out
 */
function validateAttrElif(preNode, attrValue, hmlAttrs, i, out, nodeLoc, relativePath) {
  if (preNode && preNode.attrs) {
    for (let j = 0; j < preNode.attrs.length; j++) {
      const prop = preNode.attrs[j]
      const newAttrValue = attrValue.replace('{{', '').replace('}}', '')
      if (prop.name === 'if') {
        const newPropValue = prop.value.replace('{{', '').replace('}}', '')
        attrValue = !card ?
        '{{' + newAttrValue + '&&!(' + newPropValue + ')}}' :
          REG_DATA_BINDING.test(attrValue) ?
          '{{' + newAttrValue + '}}' + '&&!{{' + newPropValue + '}}' :
          newAttrValue + ' && !' + newPropValue
        validateElif(attrValue, out, false, nodeLoc, relativePath)
      }
      if (prop.name === 'elif') {
        const first = prop.value.indexOf('&&')
        const firstPropValue = prop.value.substr(0, first).replace("{{", '')
        const lengthPropValue = prop.value.substr(first, prop.value.length)
        attrValue = !card ?
          '{{' + newAttrValue + '&&!(' + firstPropValue + ')' + lengthPropValue :
          REG_DATA_BINDING.test(attrValue) ?
          '{{' + newAttrValue + '}}' + '&&!{{' + firstPropValue + lengthPropValue :
          newAttrValue + ' && !' + firstPropValue + lengthPropValue
        validateElif(attrValue, out, false, nodeLoc, relativePath)
      }
    }
  }
  hmlAttrs[i].value = attrValue
}

/**
 * parse else attr
 *
 * @param {Object} preNode
 * @param {Object} out
 * @param {Object} nodeLoc
 */
function validateAttrElse(preNode, out, nodeLoc, relativePath) {
  if (preNode && preNode.attrs) {
    for (let j = 0; j < preNode.attrs.length; j++) {
      const prop = preNode.attrs[j]
      if (prop.name === 'if') {
        validateIf(prop.value, out, true, nodeLoc, relativePath)
      }
      if (prop.name === 'elif') {
        validateElif(prop.value, out, true, nodeLoc, relativePath)
      }
    }
  }
}

function parseDataAttr(name, value, out) {
  const childName = name.replace('data-', '')
  out.jsonTemplate.attr = out.jsonTemplate.attr || {}
  out.jsonTemplate.attr.$data = out.jsonTemplate.attr.$data || {}
  out.jsonTemplate.attr.$data[childName] = bind(value, undefined, true, out)
}

function isSupportedSelfClosing(tagName) {
  if (tagName && typeof tagName === 'string') {
    const n = aliasTagMap[tagName]
    if (n) {
      if (nativeTag[n] && tagSelfClosing.indexOf(n) !== -1) {
        return true
      }
    } else {
      if (nativeTag[tagName] && tagSelfClosing.indexOf(tagName) !== -1) {
        return true
      }
    }
  }
  return false
}

function isAtomicTag(tagName) {
  if (tagName && typeof tagName === 'string') {
    const n = aliasTagMap[tagName];
    if (n) {
      if (nativeTag[n] && tagWithoutChild.indexOf(n) !== -1) {
        return true;
      }
    } else {
      if (nativeTag[tagName] && tagWithoutChild.indexOf(tagName) !== -1) {
        return true;
      }
    }
  }
  return false;
}

function validateDataAttr(e) {
  return REG_TAG_DATA_ATTR.test(e)
}

function isReservedTag(tagName) {
  return tagWithAll.indexOf(tagName) !== -1
}

function setDebugLine(jsonTemplate, relativePath, line, className) {
  jsonTemplate.attr = jsonTemplate.attr || {}
  if (process.env.DEVICE_LEVEL === DEVICE_LEVEL.RICH && process.env.buildMode === 'debug') {
    jsonTemplate.attr['debugLine'] =  relativePath + ':' + line
    if (className) {
      jsonTemplate.attr['className'] = className
    }
  }
}

module.exports = {
  validateTagName: validateTagName,
  validateId: validateId,
  validateClass: validateClass,
  validateStyle: validateStyle,
  validateIf: validateIf,
  validateElif: validateElif,
  validateFor: validateFor,
  validateAppend: validateAppend,
  validateEvent: validateEvent,
  validateAttr: validateAttr,
  validateAttrElse: validateAttrElse,
  validateAttrElif: validateAttrElif,
  parseDataAttr: parseDataAttr,

  isReservedTag: isReservedTag,
  isSupportedSelfClosing: isSupportedSelfClosing,
  isAtomicTag: isAtomicTag,
  elementNames: elementNames
}
