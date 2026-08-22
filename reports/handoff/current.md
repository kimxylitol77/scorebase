# 인계 — /scores UX 1순위 묶음 (2026-08-22)

## 상태
워크트리 `busy-varahamihira-5a4628`(브랜치 `claude/scorebase-live-score-redesign-c99fb3`) 에 **로컬 커밋 5건, 미푸시**.
사용자가 접속량 많아 잠시 중단 요청 → dev 서버 내림. 운영 영향 0.

## 한 것 (커밋 f2041a3 ~ 3cfb074)
1. 배당 셀 라벨(승/무/패·O/U 2.5)·N곳 평균·갱신시각·6h 지연·오프닝 대비 ▲▼
2. 예측/L/R → 분석/라인업/리뷰 + aria, 정보 칸 84px(경계 +36px)
3. 사이드바 즐겨찾기·인기·오늘 경기 많은 리그·국가별 접힘 + 검색 (`useFavoriteLeagues` 신설)
4. 푸터 면책 문구 교체 + 19세 + 1336
5. 핵심 변수 시즌 승률 퍼센트

## 남은 것
- 경기 상세(`/live/{league}/{id}`) 에서 "시즌 승률 xx.x%" 와 푸터 새 문구 실렌더 확인 (curl 000 으로 미완)
- main 에 fetch+rebase 후 push (deploy-verify-notes: ff 가정 금지)
- 배포 후 운영 /scores 에서 배당 ▲▼·"지연" 이 과하게 찍히지 않는지 (임계 6h·2%)

상세는 `reports/plans/scores-ux-tier1/context-notes.md`.
