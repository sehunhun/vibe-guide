"""
HTML에서 상호작용 가능한 요소 추출
백엔드에서 처리하여 프론트엔드의 DOMParser 문제 해결
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional


def generate_selector(element, all_elements=None) -> Optional[str]:
    """
    요소의 안정적인 CSS 선택자 생성
    all_elements: 같은 페이지의 모든 추출된 요소들 (중복 체크용)
    """
    # 1. id가 있으면 가장 안정적
    if element.get('id'):
        selector = f"#{element['id']}"
        if all_elements and not _is_duplicate_selector(selector, element, all_elements):
            return selector
    
    # 2. data 속성 (data-testid, data-id 등)
    for attr, value in element.attrs.items():
        if attr.startswith('data-'):
            escaped_value = value.replace('"', '\\"') if isinstance(value, str) else str(value)
            selector = f'[{attr}="{escaped_value}"]'
            if all_elements and not _is_duplicate_selector(selector, element, all_elements):
                return selector
            elif not all_elements:
                return selector
    
    # 3. aria-label
    if element.get('aria-label'):
        escaped = element['aria-label'].replace('"', '\\"')
        selector = f'[aria-label="{escaped}"]'
        if all_elements and not _is_duplicate_selector(selector, element, all_elements):
            return selector
        elif not all_elements:
            return selector
    
    # 4. name 속성 (input, select 등)
    if element.get('name'):
        escaped = element['name'].replace('"', '\\"')
        selector = f'{element.name}[name="{escaped}"]'
        if all_elements and not _is_duplicate_selector(selector, element, all_elements):
            return selector
        elif not all_elements:
            return selector
    
    # 5. type 속성 (input)
    if element.name == 'input' and element.get('type'):
        selector = f'input[type="{element["type"]}"]'
        if all_elements and not _is_duplicate_selector(selector, element, all_elements):
            return selector
        elif not all_elements:
            return selector
    
    # 6. placeholder (input, textarea)
    if element.get('placeholder'):
        escaped = element['placeholder'].replace('"', '\\"')
        selector = f'{element.name}[placeholder="{escaped}"]'
        if all_elements and not _is_duplicate_selector(selector, element, all_elements):
            return selector
        elif not all_elements:
            return selector
    
    # 7. title 속성
    if element.get('title'):
        escaped = element['title'].replace('"', '\\"')
        selector = f'[title="{escaped}"]'
        if all_elements and not _is_duplicate_selector(selector, element, all_elements):
            return selector
        elif not all_elements:
            return selector
    
    # 8. role 속성
    if element.get('role'):
        selector = f'[role="{element["role"]}"]'
        if all_elements and not _is_duplicate_selector(selector, element, all_elements):
            return selector
        elif not all_elements:
            return selector
    
    # 9. class 조합 (여러 클래스가 있어도 조합해서 사용)
    class_attr = element.get('class', [])
    if class_attr:
        if isinstance(class_attr, list):
            classes = [c for c in class_attr if c and c.strip()]
        else:
            classes = class_attr.strip().split() if class_attr.strip() else []
        
        if classes:
            # 클래스 조합으로 selector 생성
            class_selector = '.'.join([c.replace(' ', '\\ ') for c in classes])
            selector = f'.{class_selector}'
            if all_elements and not _is_duplicate_selector(selector, element, all_elements):
                return selector
            elif not all_elements:
                return selector
            
            # 단일 클래스도 시도
            if len(classes) == 1:
                selector = f'.{classes[0]}'
                if all_elements and not _is_duplicate_selector(selector, element, all_elements):
                    return selector
                elif not all_elements:
                    return selector
    
    # 10. 텍스트 기반 selector (텍스트가 있고 고유한 경우)
    text = get_element_text(element)
    if text and text.strip():
        # 텍스트가 짧고 고유한 경우에만 사용
        if len(text.strip()) < 50:  # 너무 긴 텍스트는 피함
            # text content로 찾기 (하지만 이건 느릴 수 있으므로 최후의 수단)
            pass
    
    # 11. 최후의 수단: tag만 (중복 가능성 높음)
    return element.name


def _is_duplicate_selector(selector: str, current_element, all_elements) -> bool:
    """같은 selector를 가진 다른 요소가 있는지 확인"""
    if not all_elements:
        return False
    
    # BeautifulSoup의 select()를 사용하여 같은 selector로 찾을 수 있는 요소 개수 확인
    # current_element의 부모에서 같은 selector로 찾기
    try:
        parent = current_element.parent
        if parent:
            found = parent.select(selector)
            # current_element를 제외하고 다른 요소가 있으면 중복
            return len([el for el in found if el != current_element]) > 0
    except:
        pass
    
    return False


def get_element_text(element) -> str:
    """요소의 텍스트 추출 (공백 보존)"""
    if not element:
        return ''
    
    # input, textarea 등은 value 또는 placeholder
    if element.name in ['input', 'textarea']:
        return element.get('value', '') or element.get('placeholder', '')
    
    # select는 선택된 옵션의 텍스트
    if element.name == 'select':
        selected = element.find('option', selected=True)
        if selected:
            return selected.get_text(strip=True)
        first_option = element.find('option')
        if first_option:
            return first_option.get_text(strip=True)
        return ''
    
    # 일반 요소는 텍스트 추출 (공백 보존)
    # get_text(separator=' ')를 사용하여 자식 요소 간 공백 추가
    text = element.get_text(separator=' ', strip=True)
    return text


def is_clickable(element) -> bool:
    """요소가 클릭 가능한지 확인"""
    tag = element.name
    
    # 1. button 태그
    if tag == 'button':
        return True
    
    # 2. a 태그
    if tag == 'a':
        href = element.get('href', '')
        if href and href != '#' and not href.startswith('javascript:'):
            return True
        if element.get('onclick'):
            return True
        return True  # a 태그는 기본적으로 클릭 가능
    
    # 3. role="button"
    if element.get('role') == 'button':
        return True
    
    # 4. input[type="submit"], input[type="button"]
    if tag == 'input':
        input_type = element.get('type', '')
        if input_type in ['submit', 'button', 'image']:
            return True
    
    # 5. data 속성이 있는 요소
    for attr in element.attrs:
        if attr.startswith('data-'):
            return True
    
    # 6. aria-label이 있는 요소 (접근성 버튼)
    if element.get('aria-label'):
        if element.get('onclick'):
            return True
    
    # 7. mat-button (Angular Material)
    class_attr = element.get('class', [])
    if isinstance(class_attr, list):
        if any('mat-button' in str(c) for c in class_attr):
            return True
    elif isinstance(class_attr, str) and 'mat-button' in class_attr:
        return True
    
    # 8. 특정 클래스 패턴
    class_str = ' '.join(class_attr) if isinstance(class_attr, list) else str(class_attr)
    class_lower = class_str.lower()
    if any(keyword in class_lower for keyword in ['btn', 'button', 'click']):
        return True
    
    return False


def extract_interactive_elements(html_string: str) -> List[Dict]:
    """
    HTML 문자열에서 인터랙션 가능한 요소만 추출
    
    Returns:
        List[Dict]: [{tag, text, selector, type}, ...]
    """
    if not html_string or not isinstance(html_string, str):
        return []
    
    try:
        soup = BeautifulSoup(html_string, 'lxml')
        if not soup.body:
            return []
        
        # 1. 인터랙션 요소만 한 번에 찾기
        interactive_selectors = [
            'button',
            'a',
            'input',
            'textarea',
            'select',
            '[role="button"]'
        ]
        
        # CSS selector 조합
        selector_str = ', '.join(interactive_selectors)
        found = soup.body.select(selector_str)
        
        elements = []
        seen_ids = set()  # 중복 제거용
        
        # 먼저 모든 요소를 수집한 후 selector 생성 (중복 체크를 위해)
        temp_elements = []
        for el in found:
            # 중복 제거
            el_id = id(el)
            if el_id in seen_ids:
                continue
            seen_ids.add(el_id)
            temp_elements.append(el)
        
        # selector 생성 (중복 체크를 위해 두 단계로 나눔)
        for el in temp_elements:
            # 2. 필요한 속성만 추출
            tag = el.name
            
            # selector 생성 (모든 요소 정보 전달하여 중복 체크)
            selector_str = generate_selector(el, temp_elements)
            if not selector_str:
                continue
            
            # 텍스트 추출
            text = (
                get_element_text(el) or
                el.get('aria-label', '') or
                el.get('title', '') or
                el.get('placeholder', '') or
                el.get('value', '') or
                ''
            )
            
            # 타입 결정
            if tag == 'button' or (tag == 'a' and el.get('href')) or el.get('role') == 'button':
                element_type = 'button'
            elif tag == 'input':
                input_type = el.get('type', 'text')
                if input_type in ['submit', 'button', 'image']:
                    element_type = 'button'
                else:
                    element_type = 'input'
            elif tag == 'textarea':
                element_type = 'textarea'
            elif tag == 'select':
                element_type = 'select'
            elif tag == 'a':
                element_type = 'button'  # 링크도 클릭 가능하므로 button으로 분류
            else:
                element_type = 'button'
            
            # 3. JSON으로 만들기
            elements.append({
                'tag': tag,
                'text': text.strip() or None,
                'selector': selector_str,
                'type': element_type,
            })
        
        return elements
    
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"extract_interactive_elements 오류: {e}")
        return []
