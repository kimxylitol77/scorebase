# 헤르메스 뉴스데스크 (글감 편집장 v1) — 체크리스트

## 0. 준비
- [x] 영상 분석 — 메인봇 먼저, 봇은 하나씩, SOUL.md 로 정체성, cron 으로 반복, 마지막은 사람 검토
- [x] 뉴스 병목 실측 (14일 수집·발행·스킵 사유, 36h storyKey 클러스터)
- [x] 헤르메스 구조 확인 — 프로필 `~/.hermes/profiles/<id>/`, cron·scripts 는 프로필별, `-p` 플래그
- [x] plan / checklist / context-notes 작성

## 1. 재료 스크립트 (scorebase)
- [ ] `scripts/newsdesk-material.mjs` — 36h storyKey 클러스터 조회 (읽기 전용)
- [ ] 노이즈 제거 — score<3·단일 기사·굿즈/통계 페이지류 제외
- [ ] 클러스터 팀명 → `Team(name, league)` 매칭 → 순위·Elo·최근 경기 붙이기
- [ ] 출력 JSON 크기 상한 (프롬프트 폭주 방지)
- [ ] 로컬 실행 검증 — 실제 출력에 큰 이슈 3개 이상, 팀 매칭 결과 눈으로 대조

## 2. 헤르메스 프로필
- [ ] `hermes profile create newsdesk --clone --description ...`
- [ ] `profiles/newsdesk/SOUL.md` — 글감 편집장 규칙 (한국어, 저작권·사실 가드레일, 출력 형식)
- [ ] 위험 도구 끄기 — terminal · code_execution · computer_use · browser (재료는 스크립트가 줌)
- [ ] `profiles/newsdesk/scripts/material.sh` — scorebase 스크립트 호출 래퍼
- [ ] 수동 1회 실행 → 제안서 품질·사실 대조

## 3. 예약 작업
- [ ] `hermes -p newsdesk cron create "0 9 * * *" ... --script material.sh --continuity --deliver local`
- [ ] `cron run` 으로 즉시 1회 → `cron runs` 로 성공 확인
- [ ] 텔레그램 연동 후 deliver 를 telegram 으로 변경 (사용자 `hermes gateway setup` 선행)

## 4. 운영 관찰 (2주)
- [ ] 첫 3회 제안서 — 재료 대조 결과 context-notes 에 기록
- [ ] 모델 결정 (무료 muse-spark 유지 / Kimi)
- [ ] 2주 후 성공 기준 판정 → v2(초안) 진행 여부 결정
