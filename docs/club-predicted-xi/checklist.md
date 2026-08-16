# 클럽 예상 라인업 (5대 리그 + K리그) — 체크리스트

월드컵 예상 XI 파이프라인(build-wc-predicted-xi)을 클럽 리그로 일반화. 계획·결정 근거는 context-notes.md.

- [x] `scripts/build-club-predicted-xi.ts` — 팀별 최근 확정 XI 가중투표 빌더
  - [x] 대상 팀 = 향후 14일 SCHEDULED 매치의 homeTeamId/awayTeamId (리그 라벨 의존 X)
  - [x] ts 캐시 confirmed 라인업, 리그 무관 teamId 기준 최근 75일 → 최신 5경기
  - [x] 가중치 = 최근 감쇠 [3, 2.4, 1.9, 1.5, 1.2] × 대회 계수 (자기 리그 1.0 / 컵 0.75 / 친선 0.5)
  - [x] 프리시즌 보강 — 이번 시즌 리그 경기 0이면 직전 시즌 리그 3경기 w0.8 블렌드 (잔류 게이트 = 스쿼드 파일 ∪ 최근 라인업 로스터)
  - [x] 부상 제외 — 최신 InjurySnapshot(3일 이내), **teamName 정규화 매칭** (teamId 전부 null 실측) + playerTsId·성+이니셜
  - [x] 산출: `data/club-predicted-xi.json` `{ league: { teamId: PredictedXiTeam } }`
  - 검증 완료: 라리가 20/20팀 (전체 94팀), 레알 XI 실명 확인, 데포르티보 부상자(Altimira) 제외 확인
- [x] 라이브 페이지 — WORLD_CUP 분기를 CLUB_XI_LEAGUES 로 확장, teamId 로 매칭
  - [x] 부상 명단 소스 = InjurySnapshot (af 렌더타임 호출 금지 — 쿼터 사고 전례)
  - 검증 완료: dev 실렌더 — 데포르티보 vs 엘체에서 예상 XI + 부상 명단 양팀 3명(무릎·근육 번역 포함)
- [x] 선수별 선발 확률 % 노출 — formation-layout → SoccerLineupSvg confidence 칩 (70%+ 초록 / 45%+ 하늘 / 미만 회색)
- [x] `cron-wc-xi.sh` 에 클럽 빌더 + git add 경로 추가 (메인 체크아웃 직접 수정 — git 미추적 파일)
- [x] tsc 통과 + 실렌더 검증 → commit

## 후속 (이번 범위 밖 — 리서치에서 나온 아이디어)
- [ ] 확정 라인업 도착 후 "AI 예상 N/11 적중" 사후 배지 (예측 자산화 — 아무도 안 함)
- [ ] 매치데이 예상 라인업 SEO 인덱스 페이지 (/lineups/{league} 류 — 한국어 무주공산)
- [ ] InjurySnapshot 수집기의 teamId 백필 (현재 전부 null — 팀명 매칭으로 우회 중)
