# 링크 건전성 감시 — 체크리스트

> 새 봇을 만들지 않는다. 기존 health-check 프레임워크(매일 06:30 KST Vercel cron)에
> 체크 함수를 얹는다. 이유는 context-notes 의 "왜 새 봇을 안 만드나".

## 1. 링크 판정 단일 출처

- [x] `src/lib/links/leaderboard-link.ts` 신설 — `leaderPlayerHref`
- [x] `LeagueLeaderBoard.tsx` 가 이 함수를 사용
- [x] 검증: 리팩터 전후 SSR 링크 수 동일 (예측·순위표 K리그/EPL/KBO/NHL)

## 2. 체크 함수

- [x] `src/lib/health-checks/link-health.ts` 신설
- [x] `player_link_missing` — 화면과 **같은 함수**로 href 를 계산해 null 인 행 집계
- [x] `player_link_dead` — `/transfers` 대상 ts id 중 `TheSportsPlayer` 부재 (확정 404)
- [x] `team_logo_missing` — 최근 활성 팀의 `logoUrl == null` 비율
- [x] 행 0개 / 표본 미달 리그는 검사 제외 (비시즌 오탐 차단)
- [x] 기준선 대비 신규만 HIGH/MED, 기존 결손은 LOW (텔레그램 스팸 차단)
- [ ] ~~`team_link_missing`~~ — **철회**. 사유는 context-notes "철회한 검사"

## 3. 등록

- [x] `CHECKS` 배열에 `link-health` 추가
- [x] cron route 주석·요약 문구의 체크 개수 17 → 19 갱신

## 4. 검증

- [x] `npx tsc --noEmit` 통과
- [x] 실행 시간 82.3s → 12s (동시 실행 8, 순위표 조회 제거)
- [x] 현재 상태 실행 → 18건 발견, 전부 실재 결손 (앞서 만든 리그별 링크 표와 일치)
- [x] **회귀 테스트** — `league-leaderboard.ts` 를 수정 전으로 되돌리자 K리그1 포함
      5건이 신규 알림으로 발화. 되돌리기 전에는 텔레그램 대상 0건
- [x] 기준선 동작 — 최초 실행(이력 0)은 전부 LOW, 변화 없으면 알림 0건

## 5. 마무리

- [x] 커밋 + push
- [ ] 첫 06:30 실행 결과 확인 (`/admin/health`)

## 범위 밖 (사용자와 합의)

- 링크 해석 전면 단일 출처화 — 선수 19개 파일, 팀 35개 파일.
  이번엔 리더보드 판정만 뺐다(감시가 화면과 같은 판정을 써야 해서 필수였음)
- af 폴백 실제 HTTP 404 표본 검사 — `route-guardian` 이 이미 404 를 돌고 있어 중복

## 6. 백로그 18개 리그 처리 (완료)

- [x] 진단 — 원인은 af 매핑 부재가 아니라 (1) 링크 화이트리스트가 좁음 (2) 시즌 폴백 없음
- [x] `src/lib/players/soccer-player-page.ts` 신설 — 축구 지원 리그 목록 단일화
      (페이지 metadata·페이지 본문·링크 판정 세 군데 복붙 제거)
- [x] 축구 선수 페이지에 직전 시즌 폴백 추가
- [x] 리더보드 화이트리스트를 페이지 지원 목록에 맞춤
- [x] 검증: 같은 표본 72건 재측정 → 47/72(65%) → **72/72(100%)**
- [x] 검증: link-health 재실행 → 18건 → **0건**
- [x] 검증: 회귀 없음 (K리그·EPL 은 /transfers, KBO·NHL 은 /players 그대로,
      J1 0 → 35개 · CSL 0 → 37개 링크 신설)
- [x] api-football 추가 비용 없음 — 폴백은 첫 시즌이 빌 때만 2차 호출

> `build-ts-af-player-map` 재실행(~1,100콜)은 **하지 않았다.** 원인이 매핑이 아니었다.
