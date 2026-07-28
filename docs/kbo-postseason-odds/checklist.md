# KBO 가을야구 확률 컬럼 — 체크리스트

목표. `/standings/KBO` 순위표에 팀별 포스트시즌(5강) 진출 확률 컬럼을 추가한다.
검증 기준. 10개 구단 전부 값이 채워지고, 합이 약 5.0(5팀 진출)이며, `/predictions/KBO` 의 "가을야구(5강) 진출 확률" 막대와 숫자가 일치한다.

- [x] 1. 기존 자산 파악 — `runMonteCarlo().top5` 가 KBO 5강과 일치함을 확인
- [x] 2. 공용 헬퍼 `src/lib/predict/postseason-odds.ts` 작성 → 검증: tsc 통과
- [x] 3. `/predictions/KBO` 가 헬퍼를 쓰도록 교체 (두 페이지 값 일치 보장) → 검증: 기존 섹션 렌더 유지
- [x] 4. `/standings/KBO` 표에 `가을야구` 컬럼 추가 (헤더 + 셀 + 출처 각주) → 검증: 로컬 렌더
- [x] 5. 가드 — finished<20 · scheduled=0(시즌 종료) 이면 컬럼 숨김 → 검증: 조건 코드 확인
- [x] 6. 합계 sanity — 10팀 확률 합 ≈ 5.0 → 실측 4.999
- [x] 7. tsc + lint 통과
- [ ] 8. 커밋

## 남은 것 (별도 작업)

- [ ] NPB — 센트럴·퍼시픽 각 3위. `/standings/NPB` 가 12팀 합산 단일 표라 리그 분리 렌더가 선행돼야 함
- [ ] MLB — 지구 6 + 와일드카드 6, AL/NL 분리. `runMonteCarlo` 에 그룹 입력 추가 필요
