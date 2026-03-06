/**
 * 접근성 트리(AX tree) 필터 + slim 변환 (save_axtree.py와 동일한 역할)
 * 사용자 탭에서 CDP로 가져온 노드를 AI용 최소 필드만 남김.
 */

// W3C ARIA 1.2 §5.3.2 Widget Roles + RootWebArea
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'tab', 'tabpanel', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'scrollbar',
  'option', 'treeitem', 'gridcell', 'progressbar', 'separator',
  'combobox', 'listbox', 'menu', 'menubar', 'tablist', 'radiogroup', 'tree', 'treegrid', 'grid',
  'RootWebArea',
]);

// 부모 컨텍스트로 채택할 역할 (이름이 있으면 세그먼트로 포함)
const CONTEXT_CONTAINER_ROLES = new Set([
  'RootWebArea', 'main', 'navigation', 'banner', 'contentinfo', 'region', 'form',
  'section', 'group', 'list', 'listitem', 'row', 'rowgroup', 'tabpanel', 'tablist', 'heading',
]);
// 레이블 텍스트로 수집할 역할 (같은 행/그룹 안의 StaticText 등)
const LABEL_TEXT_ROLES = new Set(['statictext', 'text']);
const CONTEXT_JOIN = ' > ';
const MAX_CONTEXT_SEGMENTS = 8;
const MAX_CONTEXT_LEN = 300;

function getRoleValue(node) {
  const role = node?.role;
  if (!role || typeof role !== 'object') return null;
  return role.value ?? null;
}

function getPropertyValue(node, propName) {
  const props = node.properties;
  if (!Array.isArray(props)) return undefined;
  const p = props.find((x) => x && x.name === propName);
  if (!p?.value || typeof p.value !== 'object') return undefined;
  return p.value.value;
}

function getNameValue(node) {
  const name = node?.name;
  if (!name || typeof name !== 'object') return '';
  return (name.value ?? '') || '';
}

/**
 * @param {object} node - AX node
 * @returns {boolean} aria-label/aria-labelledby로 name이 생성된 경우 true
 */
function hasStrongAriaNameSource(node) {
  const sources = node?.name?.sources;
  if (!Array.isArray(sources)) return false;
  return sources.some((s) => {
    if (!s || typeof s !== 'object') return false;
    const attr = s.attribute;
    if (attr !== 'aria-label' && attr !== 'aria-labelledby') return false;
    return s.type === 'attribute' || s.type === 'relatedElement';
  });
}

/**
 * @param {string} startNodeId
 * @param {Record<string, object>} idToNode
 * @param {number} [maxDepth]
 * @param {number} [maxNodes]
 * @returns {string} 하위에서 발견된 heading name (없으면 '')
 */
function findHeadingInDescendants(startNodeId, idToNode, maxDepth = 2, maxNodes = 50) {
  const start = idToNode[startNodeId];
  if (!start) return '';
  const queue = [{ id: startNodeId, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < maxNodes) {
    const { id, depth } = queue.shift();
    const node = idToNode[id];
    visited += 1;
    if (!node) continue;
    const role = getRoleValue(node);
    if (role && role.toLowerCase() === 'heading') {
      const nameVal = (getNameValue(node) || '').trim();
      if (nameVal) return nameVal;
    }
    if (depth >= maxDepth) continue;
    const childIds = node.childIds;
    if (Array.isArray(childIds)) {
      for (const cid of childIds) queue.push({ id: cid, depth: depth + 1 });
    }
  }
  return '';
}

/**
 * 조상에 heading이 없어도, \"근처 제목\"을 찾기 위해 부모의 이전 형제들을 스캔.
 * @param {string} nodeId
 * @param {Record<string, object>} idToNode
 * @param {Record<string, string|null>} parentById
 * @returns {string} nearest heading name (없으면 '')
 */
function findNearestHeadingBySiblingScan(nodeId, idToNode, parentById) {
  let current = nodeId;
  while (current) {
    const parentId = parentById[current] ?? null;
    if (!parentId) return '';
    const parent = idToNode[parentId];
    const siblings = parent?.childIds;
    if (Array.isArray(siblings)) {
      const idx = siblings.indexOf(current);
      if (idx > 0) {
        for (let j = idx - 1; j >= 0; j--) {
          const sibId = siblings[j];
          const sib = idToNode[sibId];
          if (!sib) continue;
          const role = getRoleValue(sib);
          if (role && role.toLowerCase() === 'heading') {
            const nameVal = (getNameValue(sib) || '').trim();
            if (nameVal) return nameVal;
          }
          const nested = findHeadingInDescendants(sibId, idToNode);
          if (nested) return nested;
        }
      }
    }
    current = parentId;
  }
  return '';
}

/**
 * @param {Array<object>} nodes - CDP getFullAXTree nodes
 * @returns {{ idToNode: Record<string, object>, parentById: Record<string, string|null>, childrenById: Record<string, string[]> }}
 */
function buildNodeIndex(nodes) {
  const idToNode = {};
  const parentById = {};
  const childrenById = {};
  if (!Array.isArray(nodes)) return { idToNode, parentById, childrenById };
  for (const n of nodes) {
    const nid = n?.nodeId;
    if (nid == null) continue;
    idToNode[nid] = n;
    parentById[nid] = n.parentId ?? null;
    childrenById[nid] = Array.isArray(n.childIds) ? [...n.childIds] : [];
  }
  return { idToNode, parentById, childrenById };
}

/**
 * @param {object} node - AX node
 * @returns {boolean} 이름이 있는 컨테이너 역할이면 true
 */
function isContextContainer(node) {
  const role = getRoleValue(node);
  const nameVal = (getNameValue(node) || '').trim();
  if (nameVal.length === 0 || nameVal.length > 200) return false;
  if (role && CONTEXT_CONTAINER_ROLES.has(role)) return true;
  return hasStrongAriaNameSource(node);
}

/**
 * @param {object} containerNode - group/listitem/row 등
 * @param {Record<string, object>} idToNode
 * @returns {string[]}
 */
function collectLabelTexts(containerNode, idToNode) {
  const labels = [];
  const childIds = containerNode?.childIds;
  if (!Array.isArray(childIds)) return labels;
  for (const cid of childIds) {
    const child = idToNode[cid];
    if (!child) continue;
    const role = getRoleValue(child);
    if (role && LABEL_TEXT_ROLES.has(role.toLowerCase())) {
      const nameVal = (getNameValue(child) || '').trim();
      if (nameVal) labels.push(nameVal);
    }
  }
  return labels;
}

/**
 * rowLike 라벨이 없을 때, 즉시 부모의 \"이전 형제\"들에서 StaticText/text를 라벨로 채택.
 * @param {string} nodeId
 * @param {string} parentId
 * @param {Record<string, object>} idToNode
 * @param {number} [maxCount]
 * @returns {string[]}
 */
function collectLabelTextsFromPreviousSiblings(nodeId, parentId, idToNode, maxCount = 2) {
  const parent = idToNode[parentId];
  const siblings = parent?.childIds;
  if (!Array.isArray(siblings)) return [];
  const idx = siblings.indexOf(nodeId);
  if (idx <= 0) return [];
  const out = [];
  for (let j = idx - 1; j >= 0 && out.length < maxCount; j--) {
    const sib = idToNode[siblings[j]];
    if (!sib) continue;
    const role = getRoleValue(sib);
    if (!role) continue;
    const r = role.toLowerCase();
    if (r === 'heading') continue;
    if (LABEL_TEXT_ROLES.has(r)) {
      const nameVal = (getNameValue(sib) || '').trim();
      if (nameVal) out.unshift(nameVal);
    }
  }
  return out;
}

/**
 * 부모 체인에서 컨텍스트 세그먼트 수집 + 가장 가까운 group/listitem/row에서 레이블 텍스트 추가.
 * @param {string} nodeId - 대상 노드 id
 * @param {Record<string, object>} idToNode
 * @param {Record<string, string|null>} parentById
 * @returns {string} "Section > Group > Default Key" 형태
 */
function computeContextForNode(nodeId, idToNode, parentById) {
  const segments = [];
  let current = nodeId;
  const ancestorIds = [];
  while (current) {
    ancestorIds.push(current);
    current = parentById[current] ?? null;
  }
  const seenNames = new Set();
  for (let i = ancestorIds.length - 1; i >= 0; i--) {
    const nid = ancestorIds[i];
    if (nid === nodeId) continue;
    const node = idToNode[nid];
    if (!node) continue;
    if (isContextContainer(node)) {
      const nameVal = (getNameValue(node) || '').trim();
      if (nameVal && !seenNames.has(nameVal)) {
        seenNames.add(nameVal);
        segments.push(nameVal);
      }
    }
    if (segments.length >= MAX_CONTEXT_SEGMENTS) break;
  }

  // 조상에 heading이 없더라도, 근처(형제) heading을 컨텍스트에 결합
  if (segments.length < MAX_CONTEXT_SEGMENTS) {
    const nearestHeading = findNearestHeadingBySiblingScan(nodeId, idToNode, parentById);
    if (nearestHeading && !seenNames.has(nearestHeading)) {
      seenNames.add(nearestHeading);
      segments.push(nearestHeading);
    }
  }

  const rowLikeRoles = ['group', 'listitem', 'row'];
  let nearestRowLike = null;
  for (const nid of ancestorIds) {
    if (nid === nodeId) continue;
    const node = idToNode[nid];
    if (!node) continue;
    const role = getRoleValue(node);
    if (role && rowLikeRoles.includes(role.toLowerCase())) {
      nearestRowLike = node;
      break;
    }
  }
  if (nearestRowLike) {
    let labelTexts = collectLabelTexts(nearestRowLike, idToNode);
    if (labelTexts.length === 0) {
      const parentId = parentById[nodeId] ?? null;
      if (parentId) labelTexts = collectLabelTextsFromPreviousSiblings(nodeId, parentId, idToNode);
    }
    for (const lt of labelTexts) {
      if (!seenNames.has(lt) && segments.length < MAX_CONTEXT_SEGMENTS) {
        seenNames.add(lt);
        segments.push(lt);
      }
    }
  }
  let s = segments.join(CONTEXT_JOIN);
  if (s.length > MAX_CONTEXT_LEN) s = s.slice(0, MAX_CONTEXT_LEN - 3) + '...';
  return s;
}

/**
 * @param {Array<object>} nodes - CDP Accessibility.getFullAXTree 의 nodes
 * @returns {Array<object>} ignored=false 이고 role 이 INTERACTIVE_ROLES 인 노드만
 */
export function filterNodesByRole(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter((n) => {
    if (n.ignored === true) return false;
    const role = getRoleValue(n);
    return role && INTERACTIVE_ROLES.has(role);
  });
}

/**
 * @param {object} node - AX 노드 하나
 * @param {string} [context] - 부모 경로 컨텍스트 (예: "SDK Setup > Client Keys (DSN) > Default Key")
 * @returns {object} { role, name, backendDOMNodeId, context?, url?, checked?, selected?, expanded? }
 */
export function slimNode(node, context = '') {
  const role = getRoleValue(node) || '';
  const out = {
    role,
    name: getNameValue(node),
    backendDOMNodeId: node.backendDOMNodeId,
  };
  if (context && String(context).trim()) {
    out.context = String(context).trim();
  }
  if (role === 'link') {
    const url = getPropertyValue(node, 'url');
    if (typeof url === 'string') out.url = url;
  }
  if (['checkbox', 'radio', 'menuitemcheckbox', 'menuitemradio'].includes(role)) {
    const checked = getPropertyValue(node, 'checked');
    if (checked !== undefined) out.checked = checked;
  }
  if (role === 'tab') {
    const selected = getPropertyValue(node, 'selected');
    if (selected !== undefined) out.selected = selected;
  }
  if (['combobox', 'menu', 'menubar', 'tree', 'treeitem', 'grid', 'row', 'rowgroup'].includes(role)) {
    const expanded = getPropertyValue(node, 'expanded');
    if (expanded !== undefined) out.expanded = expanded;
  }
  return out;
}

/**
 * @param {Array<object>} nodes - getFullAXTree 의 nodes
 * @returns {Array<object>} slim 형태 배열 (role, name, backendDOMNodeId, context?, ...)
 */
export function filterAndSlim(nodes) {
  const filtered = filterNodesByRole(nodes);
  const { idToNode, parentById } = buildNodeIndex(nodes);
  return filtered.map((n) => {
    const nodeId = n.nodeId;
    const context = nodeId != null ? computeContextForNode(nodeId, idToNode, parentById) : '';
    return slimNode(n, context);
  });
}
