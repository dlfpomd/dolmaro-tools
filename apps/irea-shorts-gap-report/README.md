# 쇼츠 미제작 주제 보고서

본원 홈페이지 공개 글 1,203편과 위성 블로그 공개 글 242편의 제목을 이레한의원 유튜브 쇼츠 160편의 제목과 비교한 기획 자료입니다.

## 생성

```bash
python3 .agent/youtube/shorts-gap-report-20260925/generate_report.py
```

생성 결과는 `shorts-topic-gap-report.html`과 `shorts-topic-gap-data.json`입니다. 질환명과 세부 주제 두 개가 함께 일치하면 `반영`, 질환명만 같으면 `부분 반영`, 같은 주제 조합을 찾지 못하면 `미반영`으로 분류합니다. 제목 기반 자동 분류이므로 촬영 전 원문과 기존 영상 내용을 확인해야 합니다.
