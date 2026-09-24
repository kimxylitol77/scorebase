# 영어판 LoL 팀명 — 순위 3종·사전 오역 (2026-09-24)

## 계기와 충돌
"`/en` LoL 선수 페이지 경기 탭 상대팀이 한국어" 로 시작했는데, **작업 중 다른 세션이
같은 선수 탭 고침을 main 에 먼저 올렸다**(`d496125e` — `data/lol-teams.json`·`lol-teams.ts`·`opponentEn`).
중복을 버리고 main 의 구현 위에, 그 세션이 안 본 나머지를 얹었다.

## 전수 조사에서 더 나온 것 (선수 탭 말고)
영어판에서 LoL 팀명이 나오는 화면을 전부 훑었다. 선수 탭 외 4건이 더 있었다.

| 화면 | 원인 | 처리 |
|---|---|---|
| `/en/standings/LEC`·`/LCS` | `LolSimpleStandings` 가 순위 JSON 의 한글 `name` 을 그대로 렌더 | `lolTeamNameEn(t.teamId)` 경유 |
| `/en/standings/LPL` | 위와 같음(그룹 중첩) | 같음 |
| `/en/standings/EWC` | `EwcStandings` 는 `toEnglishTeamName` 을 이미 쓰는데 **사전에 5팀이 없었다** | `TEAM_NAME_EN` 보충 |
| `/en/teams/609377` · `/en/scores` | **오역** `"카르민 코프": "Kapfenberger SV"` | Karmine Corp 로 교정 |

## 오역 — 이름 키 사전의 위험
`src/lib/i18n/en.ts:483`(당시)에 `"카르민 코프": "Kapfenberger SV"` 가 있었다.
Karmine Corp(프랑스 LoL) ↔ Kapfenberger SV(오스트리아 축구)로 **완전히 다른 팀**이다.
커밋 `d920e889` 에서 LoL 블록 밖 꼬리에 붙었고, `/en/teams/609377` 제목과
`/en/scores` 카드(9/20 기준 8회)에 그대로 나가고 있었다.

교훈 — **이름 키 사전에 값을 손으로 넣지 말 것.** 이번 보충 6건은 전부
ts `/v1/lol/team/list` 의 공식 영문명을 그대로 옮겼다(징동 게이밍=JD Gaming·GAM e스포츠=GAM Esports·
팀 시크릿=Team Secret·딥 크로스 게이밍=Deep Cross Gaming·푸리아=FURIA Esports).
EWC 만 이름 키를 쓰는 이유는 `EwcStandings` 가 ts id 가 아니라 `Team.name` 으로 도는 탓이다.

## 빌더 확장 — LPL 은 경기 기록이 없다
main 의 `build-lol-teams.ts` 는 `Match.lolGames` 등장 팀만 담아 36팀이었다.
**LPL 은 lolGames 를 수집하지 않아** 순위표 팀이 통째로 빠졌다(영어판 LPL 순위에 한글 13건).
순위 JSON 4종(LCK/LEC/LCS/LPL)도 같은 ts 팀 id 를 쓰므로 거기서도 긁게 했다 → 36 → **45팀**.
LPL 만 `groups[].standings[]` 로 한 겹 더 들어간다.

## 함정
- **en-mirror `--write` 가 형제 파일을 새로 만든다.** `/standings/[league]` 를 빌드하면
  `en/hockey/HockeyTsStandingsTable.tsx` 가 새로 생기고 `standings/page.tsx`·`leaderboard-categories.ts` 가
  재생성된다 → 대상만 남기고 되돌릴 것. (`docs/lol-career/context-notes.md` 4차와 같은 함정)
- **preReplace 에 한글 리터럴을 넣지 말 것.** LPL 그룹명("그룹 A/B")을 `.replace("그룹","Group")` 로
  고치려 했더니 빌더가 그 리터럴을 "미번역"으로 잡아 6/7 이 됐다 → 보류.
- **워크트리 dev 홈(`/`) 열지 말 것.** Neon 연결 풀(29)을 한 번에 소진한다.
  `preview_start` 가 시드 탭으로 홈을 여니 바로 닫아야 한다.
- 워크트리엔 `.env.local` 이 없다 → 본체에서 심링크.

## 남긴 것 (별건)
1. **`/en/standings/LOL` 전체 미번역** — 영어판 컴포넌트가 없어 한국어 `@/components/LolStandings` 를
   그대로 렌더한다(`src/app/en/standings/[league]/page.tsx:239`). 탭·표머리·안내문까지 전부 한국어라
   팀명만의 문제가 아니라 **컴포넌트 미러 신규 생성** 건. LEC/LCS/LPL/EWC 는 en 컴포넌트가 있어 해당 없음.
2. **`/en/standings/LPL` 그룹명 "그룹 A/B"** — 런타임 데이터라 사전으론 못 잡고, preReplace 로 하면
   생성 파일에 한글 리터럴이 남는다(위 함정). 빌더에서 영문 그룹명을 같이 저장하는 쪽이 맞다.
3. **LEC/LCS Team row 중복** — 같은 팀이 영문명·숫자 externalId row(608696~)와
   한글명·ts id externalId row(609375~)로 둘 다 있다. 화면은 멀쩡하지만 dedup 대상.
4. 선수 실명 `Lee Min-hyeong (이민형)` — ts `real_name` 원본(영문+한글 병기). 오류 아님.
