/**
 * HTML 문자열에서 클릭 가능한 요소와 입력 요소를 추출하여 JSON으로 반환
 * 
 * 주의: selector는 document.querySelector()로 정확히 찾을 수 있어야 하며,
 * 스포트라이트/위치 이동 기능이 작동해야 함
 */

/**
 * 요소의 안정적인 CSS 선택자 생성
 * 우선순위: id > data 속성 > aria-label > class (고유한 것) > tag + text
 */
function generateSelector(element) {
  // 1. id가 있으면 가장 안정적
  if (element.id) {
    return `#${element.id}`;
  }

  // 2. data 속성 (data-testid, data-id 등)
  for (const attr of element.attributes || []) {
    if (attr.name.startsWith('data-')) {
      const value = attr.value.replace(/"/g, '\\"');
      return `[${attr.name}="${value}"]`;
    }
  }

  // 3. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const escaped = ariaLabel.replace(/"/g, '\\"');
    return `[aria-label="${escaped}"]`;
  }

  // 4. name 속성 (input, select 등)
  const name = element.getAttribute('name');
  if (name) {
    const escaped = name.replace(/"/g, '\\"');
    return `${element.tagName.toLowerCase()}[name="${escaped}"]`;
  }

  // 5. type 속성 (input)
  const type = element.getAttribute('type');
  if (type && element.tagName === 'INPUT') {
    return `input[type="${type}"]`;
  }

  // 6. placeholder (input, textarea)
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    const escaped = placeholder.replace(/"/g, '\\"');
    return `${element.tagName.toLowerCase()}[placeholder="${escaped}"]`;
  }

  // 7. title 속성
  const title = element.getAttribute('title');
  if (title) {
    const escaped = title.replace(/"/g, '\\"');
    return `[title="${escaped}"]`;
  }

  // 8. role 속성
  const role = element.getAttribute('role');
  if (role) {
    return `[role="${role}"]`;
  }

  // 9. class (고유한 단일 클래스만)
  const className = element.className;
  if (className && typeof className === 'string') {
    const classes = className.trim().split(/\s+/).filter(c => c);
    if (classes.length === 1 && !classes[0].includes(' ')) {
      return `.${classes[0]}`;
    }
  }

  // 10. tag + text 조합 (마지막 수단, 덜 안정적)
  const text = getElementText(element);
  if (text && text.length < 50) {
    // text가 너무 길면 사용하지 않음
    return null; // text 기반 선택자는 불안정할 수 있음
  }

  // 11. 최후의 수단: tag만
  return element.tagName.toLowerCase();
}

/**
 * 요소의 텍스트 추출 (내부 텍스트만, 자식 요소 제외)
 */
function getElementText(element) {
  if (!element) return '';
  
  // input, textarea 등은 value 또는 placeholder
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return element.value || element.placeholder || '';
  }
  
  // select는 선택된 옵션의 텍스트
  if (element.tagName === 'SELECT') {
    const selected = element.options[element.selectedIndex];
    return selected ? selected.text : '';
  }
  
  // 일반 요소는 직접 텍스트만 (자식 요소 제외)
  let text = '';
  for (const node of element.childNodes || []) {
    if (node.nodeType === 3) { // TEXT_NODE
      text += node.textContent || '';
    }
  }
  return text.trim();
}

/**
 * 요소가 클릭 가능한지 확인
 */
function isClickable(element) {
  if (!element) return false;
  
  const tag = element.tagName.toLowerCase();
  
  // 1. button 태그
  if (tag === 'button') return true;
  
  // 2. a 태그 (href가 있거나 클릭 가능)
  if (tag === 'a') {
    const href = element.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('javascript:')) return true;
    if (element.onclick || element.getAttribute('onclick')) return true;
    return true; // a 태그는 기본적으로 클릭 가능
  }
  
  // 3. role="button"
  if (element.getAttribute('role') === 'button') return true;
  
  // 4. input[type="submit"], input[type="button"]
  if (tag === 'input') {
    const type = element.getAttribute('type');
    if (type === 'submit' || type === 'button' || type === 'image') return true;
  }
  
  // 5. data 속성이 있는 요소 (클릭 가능할 가능성)
  for (const attr of element.attributes || []) {
    if (attr.name.startsWith('data-')) {
      // data-testid, data-id 등이 있으면 클릭 가능할 가능성
      return true;
    }
  }
  
  // 6. aria-label이 있는 요소 (접근성 버튼)
  if (element.getAttribute('aria-label')) {
    // 추가 확인: 클릭 이벤트가 있거나 특정 클래스
    if (element.onclick || element.getAttribute('onclick')) return true;
    if (element.style.cursor === 'pointer') return true;
  }
  
  // 7. mat-button (Angular Material)
  if (element.className && element.className.includes('mat-button')) return true;
  
  // 8. 특정 클래스 패턴 (예: btn, button 등)
  const className = element.className;
  if (className && typeof className === 'string') {
    const lower = className.toLowerCase();
    if (lower.includes('btn') || lower.includes('button') || lower.includes('click')) {
      return true;
    }
  }
  
  return false;
}

/**
 * HTML 문자열에서 상호작용 가능한 요소 추출
 * @param {string} htmlString - HTML 문자열
 * @returns {Array<{tag: string, text: string, selector: string, type: 'button'|'input'|'textarea'|'select'}>}
 */
export function extractInteractiveElements(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    console.warn('[vibe-guide] extractInteractiveElements: 빈 HTML 문자열');
    return [];
  }

  try {
    // DOMParser가 사용 가능한지 확인 (background 스크립트에서는 없을 수 있음)
    if (typeof DOMParser === 'undefined') {
      console.warn('[vibe-guide] extractInteractiveElements: DOMParser를 사용할 수 없습니다. 빈 배열을 반환합니다.');
      return [];
    }

    // DOMParser로 HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    if (!doc || !doc.body) {
      console.warn('[vibe-guide] extractInteractiveElements: HTML 파싱 실패');
      return [];
    }

    const elements = [];

    // 1. 클릭 가능한 요소들
    const clickableSelectors = [
      'button',
      'a[href]',
      'a[onclick]',
      '[role="button"]',
      'input[type="submit"]',
      'input[type="button"]',
      'input[type="image"]',
      '[data-testid]',
      '[data-id]',
      '[aria-label]',
      '.mat-button',
    ];

    const clickableElements = new Set();
    
    for (const selector of clickableSelectors) {
      try {
        const found = doc.body.querySelectorAll(selector);
        found.forEach(el => {
          if (isClickable(el) && !clickableElements.has(el)) {
            clickableElements.add(el);
          }
        });
      } catch (e) {
        // selector 오류 무시
      }
    }

    // 클릭 가능한 요소 처리
    clickableElements.forEach(element => {
      const selector = generateSelector(element);
      if (!selector) return; // selector를 생성할 수 없으면 스킵

      const text = getElementText(element) || 
                   element.getAttribute('aria-label') ||
                   element.getAttribute('title') ||
                   element.getAttribute('placeholder') ||
                   element.getAttribute('value') ||
                   '';

      elements.push({
        tag: element.tagName.toLowerCase(),
        text: text.trim() || null,
        selector: selector,
        type: 'button',
      });
    });

    // 2. 입력 요소들
    const inputSelectors = ['input', 'textarea', 'select'];
    
    inputSelectors.forEach(tag => {
      try {
        const found = doc.body.querySelectorAll(tag);
        found.forEach(element => {
          // 이미 클릭 가능한 요소로 추가된 경우 스킵 (submit, button 등)
          if (clickableElements.has(element)) return;

          const selector = generateSelector(element);
          if (!selector) return;

          const text = getElementText(element) ||
                      element.getAttribute('placeholder') ||
                      element.getAttribute('aria-label') ||
                      element.getAttribute('title') ||
                      element.getAttribute('name') ||
                      '';

          const type = element.tagName.toLowerCase() === 'input' 
            ? (element.getAttribute('type') || 'text')
            : element.tagName.toLowerCase();

          elements.push({
            tag: element.tagName.toLowerCase(),
            text: text.trim() || null,
            selector: selector,
            type: type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input',
          });
        });
      } catch (e) {
        // selector 오류 무시
      }
    });

    // 중복 제거 (동일한 selector)
    const seen = new Set();
    const unique = [];
    for (const el of elements) {
      const key = el.selector;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(el);
      }
    }

    console.log(`[vibe-guide] extractInteractiveElements: ${unique.length}개 요소 추출됨`);
    return unique;
  } catch (error) {
    console.error('[vibe-guide] extractInteractiveElements 오류:', error);
    console.error('[vibe-guide] 오류 스택:', error.stack);
    return [];
  }
}

/**
 * 추출된 요소들을 JSON 문자열로 포맷팅
 * @param {Array} elements - extractInteractiveElements의 반환값
 * @returns {string} JSON 문자열
 */
export function formatElementsAsJson(elements) {
  return JSON.stringify(elements, null, 2);
}
