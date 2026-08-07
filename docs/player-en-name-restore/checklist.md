# 체크리스트 — TheSportsPlayer 영문 name 복구

## 1단계 — 로컬 소스 복구 (무료)
- [x] `scripts/backfill-ts-player-en-name.ts` 작성 (dry-run 기본, `--apply`)
- [x] 라인업 캐시 + team-squads.json 수집 → dry-run 샘플 20건 검수 (정상)
- [x] `--apply` 실행 → **1,157건 적용**, 대상 3,349 → 2,192

## 2단계 — TheSports API 복구 (2,192건, 700ms 페이스 ≈ 26분)
- [x] `--fetch` 모드 추가 (uuid 단건, 실패는 건너뛰고 계속)
- [x] 20건 시험 → 20/20 성공, 응답 name 전부 영문 확인
- [x] 전량 실행 → **2,192/2,192 성공, 실패 0** · 남은 대상 0

## 3단계 — 재오염 방지
- [x] `src/lib/players/en-name-source.ts` — squad·라인업에서 id→영문 해석 (공용)
- [x] `apply-thesports-official-korean.ts` createMany 가 영문 name 우선 사용
- [x] `apply-transfers-star-names.ts` 동일 적용 → dry-run 회귀 없음(추가 대상 0)
- [x] `npx tsc --noEmit` 0 에러 (사전에 `npx prisma generate` 필요했음)

## 4단계 — 마무리
- [x] 커밋 · push (4669658 · 12f91a7)
- [x] 최종 검증 — FOOTBALL 41,876행 **전부 영문 name**, 한글 잔여 0 · 빈 값 0 · `name = nameKo` 0

## 결과

작업 전 3,349행이 audit 사각지대였다. 복구 후 `Hj/Kj/Sj/Gj` 스캔 대상이 **60 → 75명**으로 늘었고,
새로 보이게 된 15명 중엔 노출도 높은 선수도 있다 — `Morten Hjulmand`(스포르팅 CP) = "모턴 휼만드",
`Andrew Hjulsager` = "앤드류 흐줄사게르". 덴마크어 hj 도 h 가 묵음이라 둘 다 오기다.

## 다음 후보 (미착수)

- 북유럽 `Hj/Kj/Sj/Gj` 75명 오음역 일괄 정리 — 같은 이름(Hjalte)이 얄테/힐테/발테로 갈리고
  `N. Hjörvarsson → "음욕"` 같은 파괴적 산출물도 있다. locks 등재까지 하면 30분 안팎.
- 복구된 영문으로 ko위키 langlink 대조 재실행. ⚠️ 유명 선수 변경분은 사람이 훑을 것
  (위키 표제어 ≠ 국내 통용, 메모리 `player-name-manual-fix`).
- `backfill-ts-player-en-name.ts` 주기 배선 — 신규 오염이 쌓이는지 보고 판단(지금은 수동으로 충분).
