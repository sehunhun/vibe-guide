"""
HTML에서 상호작용 가능한 요소 추출
백엔드에서 처리하여 프론트엔드의 DOMParser 문제 해결
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional


def generate_selector(element) -> Optional[str]:
    """요소의 안정적인 CSS 선택자 생성"""
    # 1. id가 있으면 가장 안정적
    if element.get('id'):
        return f"#{element['id']}"
    
    # 2. data 속성 (data-testid, data-id 등)
    for attr, value in element.attrs.items():
        if attr.startswith('data-'):
            escaped_value = value.replace('"', '\\"') if isinstance(value, str) else str(value)
            return f'[{attr}="{escaped_value}"]'
    
    # 3. aria-label
    if element.get('aria-label'):
        escaped = element['aria-label'].replace('"', '\\"')
        return f'[aria-label="{escaped}"]'
    
    # 4. name 속성 (input, select 등)
    if element.get('name'):
        escaped = element['name'].replace('"', '\\"')
        return f'{element.name}[name="{escaped}"]'
    
    # 5. type 속성 (input)
    if element.name == 'input' and element.get('type'):
        return f'input[type="{element["type"]}"]'
    
    # 6. placeholder (input, textarea)
    if element.get('placeholder'):
        escaped = element['placeholder'].replace('"', '\\"')
        return f'{element.name}[placeholder="{escaped}"]'
    
    # 7. title 속성
    if element.get('title'):
        escaped = element['title'].replace('"', '\\"')
        return f'[title="{escaped}"]'
    
    # 8. role 속성
    if element.get('role'):
        return f'[role="{element["role"]}"]'
    
    # 9. class (고유한 단일 클래스만)
    class_attr = element.get('class', [])
    if isinstance(class_attr, list) and len(class_attr) == 1:
        return f'.{class_attr[0]}'
    elif isinstance(class_attr, str) and class_attr.strip():
        classes = class_attr.strip().split()
        if len(classes) == 1:
            return f'.{classes[0]}'
    
    # 10. 최후의 수단: tag만
    return element.name


def get_element_text(element) -> str:
    """요소의 텍스트 추출"""
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
    
    # 일반 요소는 직접 텍스트만
    return element.get_text(strip=True)


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
    HTML 문자열에서 클릭 가능한 요소와 입력 요소를 추출
    
    Returns:
        List[Dict]: [{tag, text, selector, type}, ...]
    """
    if not html_string or not isinstance(html_string, str):
        return []
    
    try:
        soup = BeautifulSoup(html_string, 'lxml')
        if not soup.body:
            return []
        
        elements = []
        clickable_elements = set()
        
        # 1. 클릭 가능한 요소들
        clickable_selectors = [
            'button',
            'a[href]',
            '[role="button"]',
            'input[type="submit"]',
            'input[type="button"]',
            'input[type="image"]',
            '[data-testid]',
            '[data-id]',
            '[aria-label]',
            '.mat-button',
        ]
        
        for selector in clickable_selectors:
            try:
                found = soup.body.select(selector)
                for el in found:
                    if is_clickable(el) and id(el) not in clickable_elements:
                        clickable_elements.add(id(el))
                        
                        selector_str = generate_selector(el)
                        if not selector_str:
                            continue
                        
                        text = (
                            get_element_text(el) or
                            el.get('aria-label', '') or
                            el.get('title', '') or
                            el.get('placeholder', '') or
                            el.get('value', '') or
                            ''
                        )
                        
                        elements.append({
                            'tag': el.name,
                            'text': text.strip() or None,
                            'selector': selector_str,
                            'type': 'button',
                        })
            except Exception:
                continue
        
        # 2. 입력 요소들
        input_tags = ['input', 'textarea', 'select']
        for tag in input_tags:
            try:
                found = soup.body.find_all(tag)
                for el in found:
                    # 이미 클릭 가능한 요소로 추가된 경우 스킵
                    if id(el) in clickable_elements:
                        continue
                    
                    selector_str = generate_selector(el)
                    if not selector_str:
                        continue
                    
                    text = (
                        get_element_text(el) or
                        el.get('placeholder', '') or
                        el.get('aria-label', '') or
                        el.get('title', '') or
                        el.get('name', '') or
                        ''
                    )
                    
                    input_type = el.get('type', 'text') if el.name == 'input' else el.name
                    element_type = 'textarea' if input_type == 'textarea' else ('select' if input_type == 'select' else 'input')
                    
                    elements.append({
                        'tag': el.name,
                        'text': text.strip() or None,
                        'selector': selector_str,
                        'type': element_type,
                    })
            except Exception:
                continue
        
        # 중복 제거 (동일한 selector)
        seen = set()
        unique = []
        for el in elements:
            key = el['selector']
            if key not in seen:
                seen.add(key)
                unique.append(el)
        
        return unique
    
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"extract_interactive_elements 오류: {e}")
        return []
