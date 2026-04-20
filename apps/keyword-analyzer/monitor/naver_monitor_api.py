#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
네이버 키워드 노출 모니터링 — Naver Open API 버전
이레한의원 전용 / 다질환 지원

- 키워드: `../keywords/*.json`에서 로드 (Selenium 버전과 동일)
- 출력: `../data/latest.json`, `history.json`, `runs/YYYY-MM-DD-HHMM.json`
  (스키마 100% 호환 — 대시보드 수정 없이 즉시 반영)
- 인증: 같은 폴더의 .env 파일 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)

측정 범위:
  - 블로그 (blog.json)      : dlfpomd / dlfpomd2 / xkjbaeakds 확인
  - 웹문서 (webkr.json)     : irea.co.kr / ireaomd.co.kr 확인
  - 유튜브 / 이미지          : Naver Open API 미지원 (Selenium 버전에서만)

Selenium 버전과의 차이를 명시하기 위해 payload에 `source: "naver_open_api"`,
`measurement_scope: ["blog","website"]` 필드를 추가합니다.
"""

import sys
import os
import json
import time
import glob
from datetime import datetime
from urllib.parse import quote
import urllib.request
import urllib.error

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def _install(pkg, import_name=None):
    try:
        __import__(import_name or pkg)
    except ImportError:
        print(f'  {pkg} 설치 중...')
        os.system(f'"{sys.executable}" -m pip install {pkg} --quiet')


print('필요 패키지 확인 중...')
_install('python-dotenv', 'dotenv')

from dotenv import load_dotenv


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KEYWORDS_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'keywords'))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'data'))
RUNS_DIR = os.path.join(DATA_DIR, 'runs')
LATEST_PATH = os.path.join(DATA_DIR, 'latest.json')
HISTORY_PATH = os.path.join(DATA_DIR, 'history.json')
HISTORY_MAX = 120

# ---- 자격증명 ----
load_dotenv(os.path.join(SCRIPT_DIR, '.env'))
CLIENT_ID = os.environ.get('NAVER_CLIENT_ID', '').strip()
CLIENT_SECRET = os.environ.get('NAVER_CLIENT_SECRET', '').strip()

if not CLIENT_ID or not CLIENT_SECRET:
    print('!! .env 파일을 찾을 수 없습니다.')
    print(f'   기대 경로: {os.path.join(SCRIPT_DIR, ".env")}')
    print('   파일 내용 예시:')
    print('     NAVER_CLIENT_ID=xxxx')
    print('     NAVER_CLIENT_SECRET=yyyy')
    sys.exit(1)

# ---- 이레한의원 소유 식별자 ----
BLOG_IDS = ['dlfpomd', 'dlfpomd2', 'xkjbaeakds']
WEBSITE_DOMAINS = ['irea.co.kr', 'ireaomd.co.kr']

# ---- API 설정 ----
# display=15: Selenium 버전의 "첫 페이지 노출"과 의미적으로 비슷해지도록
# 상위 15개만 확인. display=100으로 하면 "상위 100위 안에 있음"이 되어
# 노출률이 비현실적으로 높게(>90%) 나옵니다. 기존 Selenium 결과와 비교
# 가능한 수치를 얻으려면 15~20 수준이 적절.
API_DISPLAY = 15
API_DELAY_SEC = 0.1        # 호출 간 짧은 지연 (초당 상한 회피)
API_TIMEOUT = 15
SOURCE_TAG = 'naver_open_api'
MEASUREMENT_SCOPE = ['blog', 'website']


def load_keyword_sets():
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


def call_naver(endpoint, query):
    """endpoint: 'blog' | 'webkr' | 'news'"""
    url = (f'https://openapi.naver.com/v1/search/{endpoint}.json'
           f'?query={quote(query)}&display={API_DISPLAY}&start=1')
    req = urllib.request.Request(url)
    req.add_header('X-Naver-Client-Id', CLIENT_ID)
    req.add_header('X-Naver-Client-Secret', CLIENT_SECRET)
    try:
        with urllib.request.urlopen(req, timeout=API_TIMEOUT) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore')
        return {'_error': f'HTTP {e.code}: {body[:200]}'}
    except Exception as e:
        return {'_error': str(e)}


def check_keyword(keyword):
    """한 키워드에 대해 블로그/웹문서 결과 확인."""
    result = {
        'keyword': keyword,
        'checked': True,
        'blog': False,
        'website': False,
        'youtube': False,   # API에서는 측정 불가 → 항상 False
        'image': False,     # API에서는 측정 불가 → 항상 False
        'any_exposed': False,
        'found_where': [],
        'found_urls': [],
    }

    err = []

    # 블로그 검색
    blog_data = call_naver('blog', keyword)
    if '_error' in blog_data:
        err.append(f'blog: {blog_data["_error"]}')
    else:
        for idx, item in enumerate(blog_data.get('items', []), 1):
            link = (item.get('link') or '').lower()
            bloggerlink = (item.get('bloggerlink') or '').lower()
            blob = link + ' ' + bloggerlink
            for bid in BLOG_IDS:
                if bid in blob:
                    if not result['blog']:
                        result['blog'] = True
                        result['found_where'].append(f'블로그#{idx}({bid})')
                    result['found_urls'].append(link or bloggerlink)
                    break
            if result['blog']:
                break

    time.sleep(API_DELAY_SEC)

    # 웹문서 검색
    web_data = call_naver('webkr', keyword)
    if '_error' in web_data:
        err.append(f'webkr: {web_data["_error"]}')
    else:
        for idx, item in enumerate(web_data.get('items', []), 1):
            link = (item.get('link') or '').lower()
            for dom in WEBSITE_DOMAINS:
                if dom in link:
                    if not result['website']:
                        result['website'] = True
                        result['found_where'].append(f'홈페이지#{idx}({dom})')
                    result['found_urls'].append(link)
                    break
            if result['website']:
                break

    time.sleep(API_DELAY_SEC)

    result['any_exposed'] = result['blog'] or result['website']
    result['found_urls'] = list(dict.fromkeys(result['found_urls']))[:5]

    if err and not result['any_exposed']:
        result['checked'] = False
        result['error'] = ' | '.join(err)

    return result


def monitor_disease(keyword_set):
    label = keyword_set['disease']
    results = []
    for priority, kws in keyword_set['categories'].items():
        print(f'  [{label} · {priority}] {len(kws)}개')
        print('  ' + '-' * 58)
        for i, kw in enumerate(kws, 1):
            r = check_keyword(kw)
            r['priority'] = priority
            r['disease'] = label
            results.append(r)

            if r.get('any_exposed'):
                where = ', '.join(r['found_where'])
                print(f'  [{i:3d}/{len(kws)}] {kw}\n           => O  {where}')
            elif r.get('checked'):
                print(f'  [{i:3d}/{len(kws)}] {kw}\n           => X')
            else:
                err = (r.get('error') or '')[:80]
                print(f'  [{i:3d}/{len(kws)}] {kw}\n           => !  {err}')
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
        'measurement_scope': MEASUREMENT_SCOPE,
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
        'source': SOURCE_TAG,
        'measurement_scope': MEASUREMENT_SCOPE,
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
        'source': SOURCE_TAG,
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
    print('  네이버 키워드 노출 모니터링 (Naver Open API)')
    print('  이레한의원')
    print('=' * 62)
    started_at = datetime.now().astimezone()
    print(f'  시작: {started_at.strftime("%Y-%m-%d %H:%M:%S %z")}')
    print(f'  Client ID: {CLIENT_ID[:8]}...')
    print(f'  측정 범위: {", ".join(MEASUREMENT_SCOPE)} (유튜브·이미지 미측정)')
    print()

    keyword_sets = load_keyword_sets()
    print()

    all_by_disease = {}
    try:
        for kset in keyword_sets:
            all_by_disease[kset['disease']] = monitor_disease(kset)
    except Exception as e:
        print(f'\n  오류: {e}')

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

    if '--no-pause' not in sys.argv and sys.stdin.isatty():
        try:
            input('\n  Enter를 누르면 종료...')
        except EOFError:
            pass


if __name__ == '__main__':
    main()
