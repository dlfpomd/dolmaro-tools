# 자가면역 트렌드 스캐너

자가면역질환 관련 YouTube 트렌드를 **ViewStats 알고리즘**으로 실시간 분석하는 대시보드.

## 핵심 알고리즘

- **Outlier Score** = 영상 조회수 ÷ 채널 최근 10개 영상 평균 조회수
- **View Velocity** = 조회수 ÷ 업로드 후 경과 시간 (시간당)
- **Niche-aware Threshold** = 자가면역질환 전용 카테고리별 한+영 키워드 병행 검색

## 주요 기능

- 18개 자가면역질환 카테고리 (쇼그렌/구강작열감/류마티스/루푸스 등)
- Outlier Score 기준 트렌드 영상 자동 정렬 (50x+ 바이럴, 10x+ 주목)
- 채널 분석 (구독자, 전체 평균, 최근 10개 평균)
- 영상 수집 + 채널 저장 (CSV 내보내기)
- PWA — 홈화면 설치 가능, 오프라인 지원

## 사용법

1. [Google Cloud Console](https://console.cloud.google.com/) → YouTube Data API v3 활성화
2. API 키 발급 (AIza...로 시작)
3. 앱에서 **API 설정** 탭 → 키 입력 → 저장
4. 좌측 카테고리 클릭 → 트렌드 영상 자동 분석

## 개발 실행

```bash
cd autoimmune-trend-scanner
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```

## 기술 스택

- Vanilla HTML/CSS/JS (프레임워크 없음)
- YouTube Data API v3
- Service Worker (오프라인 캐싱)
- localStorage (API 키, 수집, 저장 채널)
