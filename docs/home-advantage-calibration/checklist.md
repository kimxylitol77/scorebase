# 홈 어드밴티지 재보정 — 체크리스트

- [x] 현행 경로 파악 — `win-probability.ts` / `elo.ts` 두 상수, 소비처 전수
- [x] 이미 존재하는 보정층 확인 (`home-calibration.ts` Platt, `league-prior.ts`)
- [x] 표본 확인 (MLB 3066 · NHL 1495 · NBA 1397 · KBO 810 · NPB 625 · LMB 620 · WNBA 264 · CPBL 143)
- [x] 운영 경로 그대로 재현하는 walk-forward 백테스트 스크립트 작성
      (`scripts/_backtest-home-advantage.ts` — Elo → leaguePrior → 선발/골리 → 시장 → Platt)
- [x] 스크립트가 현행 값(HA 100)에서 운영 실측 적중률과 일치하는지 sanity check
- [x] HA 후보 스캔 (100 / 60 / 40 / 20 / 0) × 리그별 accuracy · Brier · logloss
- [x] Platt 재적합(refit) 시나리오 동시 측정 — 이중보정 여부 판정
- [x] `elo.ts` HA 동시 변경 시나리오 측정 (레이팅 갱신 기대값)
- [x] Strong Pick 임계 영향 확인 (확률 스케일 변동 → strong-pick.ts 재산정 필요 여부)
- [x] 결론 정리 + 사용자 판단 요청
- [x] 채택안 코드 반영 — Platt 계수는 재적합하지 않기로 (실측상 이득 없음)
- [x] `npx tsc --noEmit` 통과
- [x] 커밋 (bc9d876)
