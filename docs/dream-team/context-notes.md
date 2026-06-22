# 드림팀 게임 — 컨텍스트 노트

작업 중 내린 결정과 근거. 계속 덧붙인다.

## 핵심 원칙
시장가치 = 예산(비용), OVR = 전력(성능) 완전 분리. 가성비 발굴(몸값 싸고 OVR 높은 선수)이 재미의 핵심. 사용자가 직접 강조.

## 결정 기록 (2026-06-22 설계)
- 선수 풀: 빅5 현역·출전 900분+·몸값 보유 = 1,565명. 근거 = 데이터 신뢰도(18리그 전체는 하위 리그 OVR·몸값 부정확).
- 예산: 티어별 €15M(아마추어)~€300M(월드클래스). €300M 최상위 하드코어. 근거 = 가성비 발굴 압박 극대화(사용자 선택).
- OVR: 포지션 가중 + 포지션 내 퍼센타일 50-99. 수비/GK는 팀평균몸값=팀강함 보정. 근거 = 태클·선방 카운팅 스탯은 약팀 선수 과대평가(검증 시 약팀 풀백·약팀 GK가 1위, 보정 후 누노 멘데스·쿠르투아 정상화).
- 선수 육성: 나이 기반 잠재력(18-21 +8~10/22-25 +4~5/26-29 +2/30+ 0). 데이터 OVR = 시작점·상한. 근거 = "음바페가 80에서 시작" 어색함 회피, 데이터 신뢰성 유지.
- 진행: 티어 승급제(처음부터 핵심). 포인트=이적 자금. 구단성장+선수육성+티어승급 3축.
- 상대: AI 봇 5팀 먼저(콜드스타트 회피) → 유저 비동기 대전 + 리더보드. MVP = 풀 패키지.
- 시뮬: 기존 calcWinProbability(eloHome, eloAway, league) 순수함수 재사용(win-probability.ts:81). 팀 OVR → Elo(빅5 1400-1900) 매핑. 새 엔진 안 만듦.
- UI: 로즈 프리미엄 톤(design-system-light-dark 레시피).

## 기술 환경
- worktree(.claude/worktrees/inspiring-davinci-db10ab)는 메인 repo 하위 → node module resolution이 메인 repo node_modules를 찾음.
- 스크립트 실행: `/Users/kimss/scorebase/node_modules/.bin/tsx --env-file=/Users/kimss/scorebase/.env.local <스크립트>` (cwd=worktree라 data 상대경로 동작).
- data/player-season-stats.json: 3,777명 18리그. 필드 lg/season/team/pos(G·D·M·F·A)/minutes/goals/assists/shots/sot/keyPasses/passAcc/tackles/interceptions/saves.
- PlayerMarketValue: id/currentValue(€)/age/league/history.
- 포지션 코드 거침(윙어가 M으로 분류) → 빌더 슬롯 매핑에 player-overrides의 W/ST 라벨 보정 필요.

## OVR 산정 상세 (검증된 v2 + 출전 가중)
- per90 cap: goals 0.8, assists 0.6, keyPasses 3.0, tackles 4.5, interceptions 2.5, shots 3.5, sot 1.5, saves 4.0
- 가중 FW: goals .34 / sot .16 / assists .14 / keyPasses .14 / shots .10 / passAcc .12
- 가중 MF: keyPasses .24 / passAcc .20 / assists .18 / tackles .14 / goals .12 / interceptions .12
- 가중 DF: tackles .30 / interceptions .28 / passAcc .22 / keyPasses .10 / goals .10 → ×0.55 + 팀강함×0.45
- GK: saves_raw×0.35 + 팀강함×0.65
- 팀강함 = 팀 평균 몸값 퍼센타일(0-100)
- 출전 가중: shrinkage raw×w + 포지션평균×(1-w), w=min(1, minutes/2000) — 적게 뛴 선수를 평균쪽으로 끌어 백업 과대평가 완화

## 대전 엔진 (검증됨 2026-06-22)
- 팀 OVR→Elo: 1000 + avgOVR×10 (OVR차 10 ≈ Elo 100 ≈ 승률 약 64:36)
- 시뮬: calcWinProbability EPL 양방향 평균(내가홈/봇이홈 평균 → 홈 어드밴티지 상쇄) + 포아송 스코어(λ = 1.35×10^(eloDiff/400×0.5))
- 예측-결과 무승부 정합 24~25% 확인. 전력차 반영·난이도 곡선·현실 스코어(평균 1.4-1.3) OK
- 봇: bots.ts 티어별 고정 avgOvr (아마추어 56~72)
- WORLD_CUP 프로파일은 무승부 0.21로 높아 탈락 → EPL 양방향 채택
