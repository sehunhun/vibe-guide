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
 * @returns {object} { role, name, backendDOMNodeId, url?, checked?, selected?, expanded? }
 */
export function slimNode(node) {
  const role = getRoleValue(node) || '';
  const out = {
    role,
    name: getNameValue(node),
    backendDOMNodeId: node.backendDOMNodeId,
  };
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
 * @returns {Array<object>} slim 형태 배열 (role, name, backendDOMNodeId, ...)
 */
export function filterAndSlim(nodes) {
  return filterNodesByRole(nodes).map(slimNode);
}
