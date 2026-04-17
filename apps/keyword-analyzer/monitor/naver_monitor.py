#!/usr/bin/env python3
"""
네이버 검색 첫 페이지 노출 모니터링 (Selenium)
이레한의원 전용 — 다질환 지원 버전

- 키워드는 `../keywords/*.json`에서 읽음
- 결과는 `../data/latest.json`, `../data/history.json`, `../data/runs/YYYY-MM-DD-HHMM.json`에 저장
- 이 JSON들을 그대로 읽어 웹 대시보드(index.html)가 화면에 표시
"""

import sys
import os
import json
import time
import random
import glob
from datetime import datetime
from urllib.parse import quote


def install(pkg, import_name=None):
    try:
        __import__(import_name or pkg)
    except ImportError:
        print(f'  {pkg} 설치 중...')
        os.system(f'"{sys.executable}" -m pip install {pkg} --quiet')

print('필요 패키지 확인 중...')
install('selenium')
install('webdriver-manager', 'webdriver_manager')

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KEYWORDS_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'keywords'))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'data'))
RUNS_DIR = os.path.join(DATA_DIR, 'runs')
LATEST_PATH = os.path.join(DATA_DIR, 'latest.json')
HISTORY_PATH = os.path.join(DATA_DIR, 'history.json')
HISTORY_MAX = 120  # 최근 120회 (월/금 기준 약 1년)

# 이레한의원 콘텐츠 식별자
BLOG_IDS = ['dlfpomd', 'dlfpomd2', 'xkjbaeakds']
WEBSITE_DOMAINS = ['irea.co.kr', 'ireaomd.co.kr']
YOUTUBE_IDS = ['ireakmd', '@ireakmd']
BRAND_TEXT = '이레한의원'


def load_keyword_sets():
    """keywords/*.json 전부 로드. 각 파일은 질환별 키워드 세트."""
    files = sorted(glob.glob(os.path.join(KEYWORDS_DIR, '*.json')))
    if not files:
        print(f'  키워드 파일이 없습니다: {KEYWORDS_DIR}')
        sys.exit(1)

    sets = []
    for fp in files:
        with open(fp, 'r', encoding='utf-8') as f:
            data = json.load(f)
        slug = os.path.splitext(os.path.basename(fp))[0]
        data['slug'] = slug
        sets.append(data)
        total = sum(len(v) for v in data['categories'].values())
        print(f'  [{data["disease"]}] {total}개 ({slug}.json)')
    return sets


def create_driver(headless=False):
    print('  Chrome 드라이버 설정 중...')
    options = Options()
    if headless:
        options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--lang=ko-KR')
    options.add_argument(
        'user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
    options.add_experimental_option('excludeSwitches', ['enable-automation'])
    options.add_experimental_option('useAutomationExtension', False)

    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
    except Exception:
        driver = webdriver.Chrome(options=options)

    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
        'source': 'Object.defineProperty(navigator, "webdriver", {get: () => undefined})'
    })
    return driver


def check_first_page(driver, keyword):
    """네이버 첫 페이지의 실제 검색 결과 영역(#main_pack) 안의 링크만 확인."""
    url = f'https://search.naver.com/search.naver?where=nexearch&query={quote(keyword)}'
    result = {
        'keyword': keyword,
        'checked': True,
        'blog': False,
        'website': False,
        'youtube': False,
        'image': False,
        'any_exposed': False,
        'found_where': [],
        'found_urls': [],
    }

    try:
        driver.get(url)
        time.sleep(3)

        for y in (1/3, 2/3, 1):
            driver.execute_script(f"window.scrollTo(0, document.body.scrollHeight * {y});")
            time.sleep(0.9)
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(0.4)

        result_links = []
        try:
            for a in driver.find_elements(By.CSS_SELECTOR, '#main_pack a[href]'):
                try:
                    href = (a.get_attribute('href') or '').lower()
                    text = (a.text or '').strip()
                    if href and 'http' in href:
                        result_links.append((href, text))
                except Exception:
                    pass
        except Exception:
            pass

        for sel in [
            '.api_subject_bx a[href]', '.view_wrap a[href]', '.blog_wrap a[href]',
            '.web_wrap a[href]', '.news_area a[href]', '.video_wrap a[href]',
            '.image_area a[href]', '.sp_kinfo a[href]', '.lst_view a[href]',
            '.total_wrap a[href]',
        ]:
            try:
                for a in driver.find_elements(By.CSS_SELECTOR, sel):
                    try:
                        href = (a.get_attribute('href') or '').lower()
                        text = (a.text or '').strip()
                        if href and 'http' in href:
                            result_links.append((href, text))
                    except Exception:
                        pass
            except Exception:
                pass

        seen, unique_links = set(), []
        for href, text in result_links:
            if href not in seen:
                seen.add(href)
                unique_links.append((href, text))

        for bid in BLOG_IDS:
            for href, _ in unique_links:
                if (f'blog.naver.com/{bid}' in href
                        or f'in.naver.com/{bid}' in href
                        or f'm.blog.naver.com/{bid}' in href):
                    result['blog'] = True
                    result['found_where'].append(f'블로그({bid})')
                    result['found_urls'].append(href)
                    break

        for domain in WEBSITE_DOMAINS:
            for href, _ in unique_links:
                if domain in href:
                    result['website'] = True
                    result['found_where'].append(f'홈페이지({domain})')
                    result['found_urls'].append(href)
                    break

        for yt in YOUTUBE_IDS:
            for href, _ in unique_links:
                if yt in href:
                    result['youtube'] = True
                    result['found_where'].append(f'유튜브({yt})')
                    result['found_urls'].append(href)
                    break

        if not (result['blog'] or result['website'] or result['youtube']):
            for href, text in unique_links:
                if BRAND_TEXT in text:
                    result['website'] = True
                    result['found_where'].append(f'{BRAND_TEXT}(텍스트)')
                    result['found_urls'].append(href)
                    break

        try:
            for a in driver.find_elements(By.CSS_SELECTOR,
                    '#main_pack .image_area a[href], #main_pack .img_group a[href]'):
                href = (a.get_attribute('href') or '').lower()
                text = (a.get_attribute('title') or a.text or '').lower()
                blob = href + ' ' + text
                if (any(d in blob for d in WEBSITE_DOMAINS)
                        or any(b in blob for b in BLOG_IDS)
                        or BRAND_TEXT in blob):
                    result['image'] = True
                    result['found_where'].append('이미지')
                    break
        except Exception:
            pass

        result['any_exposed'] = (result['blog'] or result['website']
                                 or result['youtube'] or result['image'])
        result['found_urls'] = list(dict.fromkeys(result['found_urls']))[:5]
        return result

    except Exception as e:
        result['checked'] = False
        result['error'] = str(e)
        return result


def monitor_disease(driver, keyword_set):
    """한 질환의 모든 우선순위 × 키워드를 돌며 결과 리스트 반환."""
    label = keyword_set['disease']
    results = []
    for priority, kws in keyword_set['categories'].items():
        print(f'  [{label} · {priority}] {len(kws)}개')
        print('  ' + '-' * 58)
        for i, kw in enumerate(kws, 1):
            r = check_first_page(driver, kw)
            r['priority'] = priority
            r['disease'] = label
            results.append(r)

            if r.get('any_exposed'):
                where = ', '.join(r['found_where'])
                print(f'  [{i:3d}/{len(kws)}] {kw}\n           => O  {where}')
            elif r.get('checked'):
                print(f'  [{i:3d}/{len(kws)}] {kw}\n           => X')
            else:
                print(f'  [{i:3d}/{len(kws)}] {kw}\n           => !  오류')
            time.sleep(random.uniform(2.0, 3.5))
        print()
    return results


def summarize(results):
    checked = [r for r in results if r.get('checked')]
    exposed = [r for r in checked if r.get('any_exposed')]
    by_priority = {}
    for r in checked:
        p = r.get('priority', '?')
        bucket = by_priority.setdefault(p, {'total': 0, 'exposed': 0})
        bucket['total'] += 1
        if r.get('any_exposed'):
            bucket['exposed'] += 1
    by_channel = {'blog': 0, 'website': 0, 'youtube': 0, 'image': 0}
    for r in exposed:
        for k in by_channel:
            if r.get(k):
                by_channel[k] += 1
    return {
        'total': len(results),
        'checked': len(checked),
        'exposed': len(exposed),
        'not_exposed': len(checked) - len(exposed),
        'exposure_rate': (len(exposed) / len(checked)) if checked else 0.0,
        'by_priority': by_priority,
        'by_channel': by_channel,
    }


def save_outputs(all_by_disease, keyword_sets, started_at, finished_at):
    os.makedirs(RUNS_DIR, exist_ok=True)

    diseases = {}
    for kset in keyword_sets:
        label = kset['disease']
        results = all_by_disease.get(label, [])
        diseases[label] = {
            'slug': kset['slug'],
            'label': kset.get('label', label),
            'color': kset.get('color', '#475569'),
            'summary': summarize(results),
            'results': results,
        }

    payload = {
        'version': 1,
        'started_at': started_at.isoformat(timespec='seconds'),
        'finished_at': finished_at.isoformat(timespec='seconds'),
        'diseases': diseases,
    }

    with open(LATEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f'  저장: {LATEST_PATH}')

    run_name = started_at.strftime('%Y-%m-%d-%H%M') + '.json'
    run_path = os.path.join(RUNS_DIR, run_name)
    with open(run_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f'  스냅샷: {run_path}')

    history = []
    if os.path.exists(HISTORY_PATH):
        try:
            with open(HISTORY_PATH, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except Exception:
            history = []

    entry = {
        'date': started_at.isoformat(timespec='seconds'),
        'diseases': {
            label: {
                'total': d['summary']['total'],
                'exposed': d['summary']['exposed'],
                'rate': d['summary']['exposure_rate'],
            }
            for label, d in diseases.items()
        },
    }
    history.append(entry)
    history = history[-HISTORY_MAX:]
    with open(HISTORY_PATH, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f'  추이: {HISTORY_PATH} (총 {len(history)}회)')


def main():
    print()
    print('=' * 62)
    print('  네이버 첫 페이지 노출 모니터링 (다질환)')
    print('  이레한의원')
    print('=' * 62)
    started_at = datetime.now().astimezone()
    print(f'  시작: {started_at.strftime("%Y-%m-%d %H:%M:%S %z")}')
    print()

    headless = '--headless' in sys.argv
    keyword_sets = load_keyword_sets()
    print()

    driver = None
    all_by_disease = {}
    try:
        driver = create_driver(headless=headless)
        print('  Chrome 준비 완료!\n')
        for kset in keyword_sets:
            all_by_disease[kset['disease']] = monitor_disease(driver, kset)
    except Exception as e:
        print(f'\n  오류: {e}')
    finally:
        if driver:
            driver.quit()

    finished_at = datetime.now().astimezone()
    print('=' * 62)
    for kset in keyword_sets:
        s = summarize(all_by_disease.get(kset['disease'], []))
        print(f'  [{kset["disease"]}] 검사 {s["checked"]} / 노출 {s["exposed"]} '
              f'({s["exposure_rate"]*100:.1f}%)')
    print('=' * 62)

    try:
        save_outputs(all_by_disease, keyword_sets, started_at, finished_at)
    except Exception as e:
        print(f'\n  저장 실패: {e}')

    print(f'\n  종료: {finished_at.strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'  소요: {(finished_at - started_at).total_seconds()/60:.1f}분')
    if '--no-pause' not in sys.argv:
        input('\n  Enter를 누르면 종료...')


if __name__ == '__main__':
    main()
