# 헤르메스 뉴스데스크 (글감 편집장 v1) — 체크리스트

## 0. 준비
- [x] 영상 분석 — 메인봇 먼저, 봇은 하나씩, SOUL.md 로 정체성, cron 으로 반복, 마지막은 사람 검토
- [x] 뉴스 병목 실측 (14일 수집·발행·스킵 사유, 36h storyKey 클러스터)
- [x] 헤르메스 구조 확인 — 프로필 `~/.hermes/profiles/<id>/`, cron·scripts 는 프로필별, `-p` 플래그
- [x] plan / checklist / context-notes 작성

## 1. 재료 스크립트 (scorebase)
- [x] `scripts/newsdesk-material.mjs` — 36h storyKey 클러스터 조회 (읽기 전용) (27f381e)
- [x] 노이즈 제거 — score≥2 AND (score≥4 OR 매체≥2)
- [x] 클러스터 팀명 → `Team(name, league)` 매칭 → 최근 5경기(대회명)·다음 경기 (Elo 는 전부 1500 이라 제외, 순위는 v2)
- [x] 출력 JSON 크기 상한 — 스토리 8·팀 3 (약 13KB)
- [x] 로컬 실행 검증 — 스토리 8, 팀 매칭 대조 완료 (`env -i` 깨끗한 환경 래퍼 경로 포함)

## 2. 헤르메스 프로필
- [x] `hermes profile create newsdesk --clone --description ...`
- [x] `profiles/newsdesk/SOUL.md` — 글감 편집장 규칙 (원본은 SOUL.md.bak.default)
- [x] 위험 도구 끄기 — terminal · code_execution · computer_use · browser · file · cronjob · delegation, **cli 와 cron 플랫폼 둘 다**
- [x] `profiles/newsdesk/scripts/material.sh` — scorebase 스크립트 호출 래퍼
- [x] 수동 1회 실행 → 제안서 3건, 재료 대조 불일치 0건 (81초)

## 3. 예약 작업
- [x] `newsdesk cron create ... --script material.sh --continuity --deliver local` (id 9aa2b5a55603) → 사용자 결정으로 `0 7 * * *`(+07 = KST 09시)
- [x] 게이트웨이 기동 — 사용자 승인, default 에 `gateway.multiplex_profiles: true` + `hermes gateway install --start-now --start-on-login` (launchd `ai.hermes.gateway`), newsdesk 는 멀티플렉서가 서비스
- [x] `cron run` 으로 즉시 1회 → completed, 결과 `profiles/newsdesk/cron/output/9aa2b5a55603/2026-09-13_12-24-36.md`
- [ ] 텔레그램 연동 후 deliver 를 telegram 으로 변경 (사용자 `hermes gateway setup` 선행)

## 4. 운영 관찰 (2주)
- [ ] 첫 3회 제안서 — 재료 대조 결과 context-notes 에 기록 (2/3 완료 — 수동 1, cron 1)
- [ ] 모델 결정 (무료 muse-spark 유지 / Kimi)
- [ ] 2주 후 성공 기준 판정 → v2(초안) 진행 여부 결정
