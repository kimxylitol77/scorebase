# 인계 — 2026-08-16 (일) 워크트리 sharp-lumiere-6cc0ad

## 상태

**전부 완료·배포·운영 반영 확인됨. 진행 중인 작업 없음.** 워킹트리 clean,
main 푸시 완료(마지막 d9fbaef). 이 파일은 다음 세션이 맥락만 잡으면 되고,
새 작업을 시작하면 삭제할 것.

브랜치 `claude/team-name-windows-mac-rendering-c59b6a`, 모든 커밋 `HEAD:main` 으로 푸시.

## 이번 세션에서 한 일 (5건)

### 1. 윈도우에서만 팀명이 깨져 보이던 문제 (`/odds?sport=betman`)

- **진단**: 데이터·유니코드·폰트 전부 정상. 원인은 **CSS `display:grid` 하나만 적용 안 됨**.
  같은 `@layer utilities > @media(min-width:40rem)` 블록의 다른 sm: 규칙은 먹는데
  `display:grid` 만 빠지는 상태를 브라우저에서 주입 재현해 사용자 스크린샷과 1:1 일치 확정.
  원인 계층은 사용자 윈도우의 확장프로그램/보안모듈 추정(원격 확정 불가).
- **수정**: `sm:grid sm:grid-cols-[1fr_auto_1fr]` → `sm:flex-row` + `flex-1`/`shrink-0` 등가 치환.
- **파급**: 메모리 [[windows-display-grid-dropout]] 등재 → **다른 세션이 이 발견을 받아
  예상 라인업에도 같은 치환 적용(main c295fd4)**. 브레이크포인트 display 토글은 사이트 규칙상 지양.

### 2. `/other` 기타 종목 허브에 일정 추가

- 하키·배구·e스포츠·UFC 카드 아래 **다가오는 일정 섹션**(향후 7일, KST 날짜별 그룹).
- 행 레이아웃은 `/leagues/[league]?view=fixtures`(LeagueFixtures 폴백 경로)와 동일.
- 진행 중 경기는 LIVE + 실시간 스코어, revalidate 3600 → 600.
- 상세 링크 규칙은 `/scores` 와 통일(e스포츠 `/live/lol`, UFC `/live/ufc/{id}`, 나머지 범용).
  ⚠️ 초기 구현에서 LOL 링크 404 냈다가 이 규칙으로 교정 — **링크는 만들면 실제 호출로 검증**.
- 카드에 `#schedule-{sport}` 앵커 점프 칩("다가오는 일정 ↓"). 일정 없는 종목은 칩·섹션 자동 숨김.

### 3. V-리그 남녀 2025-26 최종 순위 (`/standings/V_LEAGUE`, `V_LEAGUE_W`)

- ts season/list 에서 시즌 uuid 발굴(남 `k82redhoz9nqepz` / 여 `dn1m1nh3ve0qoep`),
  season/table/detail 최종 표를 `TheSportsStandingsCache` 에 **수동 적재**.
- KOVO 14팀 Team+TeamSourceId 시드(externalId=tsId — 10월 collector 가 재사용).
- `volleyball-table.ts` 수정: stale 캐시(4h+)여도 계산 폴백이 비면 마지막 공식 표 유지
  (비시즌 리그가 "수집 중"으로 비는 것 방지).
- **덤으로 잡은 버그**: src 배구 팀 매핑에 VNL_W 18팀 누락(7/11 워커만 갱신) → 동기화.

### 4. KBL·WKBL 순위표 개통 (`/standings/KBL`, `WKBL`)

- 원래 `STANDINGS_VALID` 미등록으로 **404** 였음 → 전용 렌더(승률·승차) 신설.
- **KBL 함정**: 오프시즌엔 `/league/rank/team` 이 빈 배열 `[]` 로 리셋 →
  `season/list` 에서 glkey 얻어 `/league/rank/{glkey}` 폴백.
  **시즌별 응답은 필드명이 다름**(현재 `tcode/win/loss/tname` ↔ 시즌별 `teamCode/TWin/TLoss/teamName1`).
- fetcher 가 `seasonLabel`/`pastSeason` 을 채워 페이지가 라벨을 자동 표시 →
  **10월 개막하면 사람 손 없이 현재 시즌으로 전환**.

### 5. 선수 시즌 리더보드 4개 리그

- `scripts/fetch-kr-league-leaders.ts`(멱등) — KBL/WKBL/V_LEAGUE/V_LEAGUE_W 부문별 TOP5 적재.
- 소스: KBL=api-stats 전선수 평균 1콜 후 로컬 정렬 / WKBL=ajax HTML 파싱 /
  KOVO=user-api `stat/league/player-rank`(**payload 가 배열·`{content:[]}` 두 형태**, `Accept-Language: ko` 필수).
- 배구 카테고리 6종 신설(득점·공격·블로킹·서브·세트·리시브), KBL/WKBL 은 NBA 카테고리 재사용.
- 순위 페이지 접이식 섹션으로 노출, footer 에 "최종 기록 · 공식 출처" 명시.

## 다음 세션이 알아야 할 것

### 10월 V-리그·KBL·WKBL 개막 시 할 일

1. `lightsail-worker/standings-poller.js` 의 `VOLLEYBALL_SEASONS` 에 V_LEAGUE·V_LEAGUE_W 편입
   (새 시즌 diary 매치의 season_id 로).
2. `standings/[league]/page.tsx` 의 `VB_PAST_SEASON_NOTE` 라벨 제거 + `/standings` 허브
   V-리그 카드 subtitle 갱신.
3. 리더보드는 `scripts/fetch-kr-league-leaders.ts` 상단 시즌 코드 3종
   (KBL glkey `S47G01` / WKBL season_gu `046` / KOVO seasonCode `022`) 갱신 후 재실행.
   시즌 중 자동 갱신을 원하면 cron 편입 필요(현재는 최종본 정적).
4. KBL·WKBL 순위는 코드 변경 불필요(자동 전환).

### 배포 검증 시 반드시 알아둘 것 ⚠️

이번 세션 내내 **Bash 의 curl 과 모니터/실브라우저가 서로 다른 Vercel 엣지 노드를 탐**.
`x-vercel-id` 가 `icn1::sin1::` (싱가포르 경유)면 옛 캐시, `icn1::` 직결이면 신규였다.
- Bash curl 결과 하나로 "미반영" 단정 금지 → **실브라우저(mcp Browser)로 교차 확인**.
- 백그라운드 Bash 잡이 조용히 빈 출력으로 죽는 일이 잦았음 → 배포 감시는 **Monitor 도구** 사용.
- **다른 세션과의 배포 경합 실사례**: 내 커밋 배포 성공 후, 다른 세션이 그 직전 시점
  코드로 빌드한 배포가 더 늦게 끝나 프로덕션을 되덮어 KBL 이 잠시 404 로 돌아갔다.
  후속 빌드(내 변경 포함)로 자동 복원됨. **"배포했는데 사라졌다"면 main 최신 커밋의
  빌드 상태부터 확인**(`api.github.com/repos/kimxylitol77/scorebase/commits/{sha}/status`).

### 미결·후보

- 이번 작업 범위 내 미결 없음.
- WKBL 팀 로고는 DB 에 있으나 리더보드 행은 팀명 텍스트만 사용(공식 API 가 팀 로고 URL 미제공).
- UFC 언더카드 파이터는 `MmaFighter.nameKo` 음역이 없어 영문 표기(기존 `/scores` 와 동일 상태).

## 갱신한 메모리

- `windows-display-grid-dropout` (신규) — 진단 경로·사이트 규칙
- `volleyball-setup` — V-리그 표 선노출·10월 할 일·**매핑 두 사본 함정**
- `basketball-hub` — KBL/WKBL 순위 개통·오프시즌 폴백·시즌별 API 필드 상이
- `league-leaderboard-onboarding` — 한국 리그 4종 별도 경로·시즌 코드 위치
