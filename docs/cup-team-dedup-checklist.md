# 컵↔자국 중복 Team row 정리 — 체크리스트

대상: 같은 ts 팀에 우리 Team row 가 둘 이상(자국 리그 + 컵 네임스페이스)인 209 그룹.
목표: 한 tsId = 한 ourId 로 정리해 대항전 매치 매핑·시즌 ACTIVE 승격의 병목을 없앤다.

## 진단·설계

- [x] 스킬 금지 조항("컵 row 를 정규 리그 row 와 합치지 말 것")과 현재 코드 정책 대조
      → `collect-fa-cup.ts:seedTeamMappings` 가 이미 "컵 행은 canonical 아님 — 도메스틱 우선" 을 씀. 스킬 쪽이 낡음.
- [x] 매핑 소비 경로 확인 (`standings-helper` 는 ourLeague 별 Map, `thesports-matches` 는 tsId→ourId 가 유일할 때만 폴백)
- [x] 이름 정규화만으로는 판정 불가 확인 (Barcelona ↔ Barcelona SC(ECU) 가 "같은 이름"으로 통과)
- [x] TheSports 원본(`team/additional/list`)으로 국가·이름 대조하는 판정기 작성
- [x] 안전 점검 — 병합 후 self-match 0 · 같은 (날짜,상대) 중복 매치 0 · Elo 전부 1500(영향 없음)
- [x] 부가 참조 조사 — TeamSeasonStatArchive 62 · CoachTenureArchive 22 · InjurySnapshot 0 · 팬 0
- [x] 표시 필드 손실 조사 — 로고 0건 · 한글명 28건(승계 로직 추가로 방어)
- [x] 영구 스크립트 작성 `scripts/dedup-cup-domestic-teams.mjs` (dry-run 기본, `--cup`, `--apply`)

## 적용 (컵 단위로 끊어서)

- [x] UEL (35그룹) — dry-run → apply → 잔여 확인
- [x] UCL (31)
- [x] UECL (30)
- [x] COPA_SUD (30)
- [x] COPA_LIB (26)
- [x] AFC_CL (23)
- [x] AFC_CL_TWO (16)
- [x] 교차 그룹 (AFC_CL+AFC_CL_TWO 2 · UEL+UECL 1)

## 사후

- [ ] BLOCK 14건 개별 판정 (표기차 병합 3건 / tsId 오매핑 수정 11건)
- [x] `npm run verify:football-season -- --league UCL` 등으로 매핑률 재측정 → UCL 7% · UEL 16% · UECL 15% (dedup 만으로는 변하지 않음 — 예상대로)
- [x] 95% 넘는 대회 없음 → ACTIVE 승격 보류 (컵 네임스페이스 entry 백필이 선행돼야 함)
- [ ] tsc + 커밋 + push (컵 단위 커밋)
- [x] 임시 스크립트 `scripts/_*-tmp.mjs` 삭제
- [ ] 메모리 `cup-domestic-duplicate-team-rows` 갱신

## 검증 기준

- 병합 후 `Match.homeTeamId/awayTeamId` 가 삭제된 id 를 가리키는 행 0
- `team-id-mapping.json` 에서 tsId 당 ourId 가 2개 이상인 그룹이 처리한 컵만큼 감소
- 컵 매치 카드가 팀명·로고·한글명을 그대로 렌더
