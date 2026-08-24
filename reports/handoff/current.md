# 인계 — 선수 페이지 갭 메우기 + 개막 주간 결함 정리 (2026-08-21~22)

## 한 줄 상태

**전부 main 반영·배포 완료. 미커밋 없음** (`data/pages-inventory.json` 은 다른 세션 자동생성분, 손대지 않음).
DB 직접 작업(Team row 병합 4건·af 매핑 13건·한글명 잠금 6건)은 배포와 무관하게 이미 반영됐다.

> ⚠ **push 사고가 있었다 — 원인까지 고쳤다(`5f02a65`).** 커밋 5건이 "push 성공"으로 보고됐는데
> 실제로는 안 올라가 있었다. 원인 = 판정을 `git push ... | tail` 로 했는데 파이프라인의 exit code 는
> tail 것이라 거부가 성공으로 읽힌다. 진범은 `.claude/skills/scorebase-deploy/SKILL.md` 5단계에
> 그 축약이 박혀 있던 것.
> → exit code 판정 + fetch/rebase 재시도 3회 + `rev-list --count` 0 확인으로 교체.
> **`rebase.autoStash=true` 필수** — 고친 절차를 실제로 돌려보니 다른 잡이 갱신한
> `data/pages-inventory.json`(unstaged) 하나 때문에 rebase 가 시작조차 못 하고 거부됐는데,
> 그게 진짜 충돌과 구분 없이 보고됐다. 봇용 `git-push-lib.sh` 는 처음부터 무결이었다.
> 메모리 `push-success-misreport` 에 기록.
>
> **전수 확인까지 끝냈다(`cce9add3`).** 같은 결함이 push 밖에도 있었다.
> ① deploy 스킬 2단계 `npx tsc --noEmit | head -20` — 타입 에러가 있어도 exit 0.
> ② Vultr `season-id-refresh.sh` 단발 push — 유일한 미보호. ⚠ **실행 실체는 repo 가 아니라
>   `/home/ubuntu/scorebase-worker/src/` 사본**(systemd timer)이라 scp 까지 해야 반영된다.
> ③ 맥미니 `weekly-player-names.sh` — 단발 push + `pipefail` 누락(미버전관리라 repo grep 에 안 잡힘).
> 맥미니 봇은 이제 6종 전부 pipefail·lib 적용. 오탐이었던 것 = `daily-football-player-names.sh`·
> `daily-official-korean.sh`(주석의 "push 없음" 문구가 grep 에 걸린 것, 실제로 push 안 함).
>
> **마무리(`9fa130d`).** `weekly-player-names.sh` 를 repo 로 편입했다 — 맥미니에만 있던 미버전관리
> 파일이라 초기화되면 수정이 사라지고, repo grep 에도 안 잡혀 단발 push 가 오래 남아 있었다.
> 맥미니에서 tracked 전환·동작 확인 완료. hermes `/repair` 봇은 commit·push 권한만 있고 판정
> 방법이 없어 프롬프트에 규칙을 넣었다(`hermes-core.js`·`hermes-telegram-bot.js` **두 사본**,
> 프롬프트가 상수라 launchd 재시작 668→28085 까지 확인).
>
> 이어서 맥미니 전용 봇 2종(`daily-football-player-names.sh`·`daily-official-korean.sh`)도 편입(`4d15b9f`).
> 이어 `nightly-report.sh` 까지 편입(`294a9c8`) — 알맹이 `morning-brief.js` 는 이미 tracked 였고
> 래퍼만 빠져 있었다(사용자 관할 브리핑 봇 4종과는 별개, ai-brief-lib 의존 없음).
> **이제 `mac-mini-worker/` 는 전부 버전관리된다.** 남은 untracked 3개는 상태·토큰 파일
> (`threads-token.json` 등)이고 셋 다 gitignore 확인 — 편입 대상이 아니다.
> 편입 시 주석 정정 필요 — untracked 일 땐 reset 이 보존했지만 tracked 는 origin 으로 되돌린다.

## 오늘 배포한 것

### 선수 페이지 (buildup 대조 결과)
- **경기별 세부 스탯** — af `/fixtures/players` 응답에서 shots·keyPasses·tackles 등을 파서가 버리고 있었다. 추가 호출 0건으로 복구. `PlayerMatchLog` 컬럼 11개 + 백필(출전 행의 97.7%).
- 출전기록 시즌·대회 필터 / 시즌별 평점 추이 토글 / 공격P·90 / 선수 카드 이미지 공유(`/api/og/soccer-player`).
- **주급은 소스가 막혔다** — Capology 가 Cloudflare 로 전 경로 403. 2026-07-15 스냅샷에서 동결. 화면에 "2026.07 기준" 표기 + `wage-freshness` 감시. 우회는 하지 않았다.

### 예상 라인업 (사용자 제보 3건)
- **브리지 오염 2차까지** — 유령 쌍둥이 브리지가 `externalId` 만 비교해 남의 팀 선수단을 끌어왔다. 1차(source 쌍 비교)로 부족했고, `TeamSourceId` 소스 오라벨(호펜하임이 af id 를 `espn:` 으로 달고 있음) 때문에 **이름 게이트**가 필요했다. 전 리그 468팀 불일치 0.
- **포지션 배치** — ts 라인업의 x/y 좌표를 버리고 대분류(G/D/M/F)만 투표해 좌우가 뒤집혔다. **최빈 라인**으로 집계(평균은 로테이션 선수를 중간값으로 뭉갠다).
- **여름 영입 누락** — 감쇠 r 0.8→0.6 · `prevXis` 를 재료 3경기 미만일 때만 · 재료 가드 2→1경기.

### 개막 주간 결함
- **승격팀** — 팀 전력 섹션이 통째로 사라지던 것(한쪽만 승격팀이어도), 팀 페이지 폼·홈원정 결손. 리그 기준 조회를 팀 기준으로 폴백.
- **예측 페이지** — 리그 예정 20경기가 전부 45/24/31. Elo 를 시즌 창으로 계산해 개막 직후 전 팀이 1500 이 됐다. Elo 만 전체 매치로 분리.
- 부상 명단 한글화 + PC 레이아웃(브레이크포인트 의존 제거).

### Team row 중복 (하루 4건)
| 팀 | 판정 근거 |
|---|---|
| 레스터 3 row | sourceId **2홉 체인** |
| 이집트 Bank El Ahly | 두 소스 **참가팀 명단** (ts 20팀엔 Bank El Ahly, af 20팀엔 National Bank) |
| 우루과이 Club Nacional·Juventud | 같은 리그 **동명** |
| 칠레 U.Catolica·콜롬비아 Junior | **경기 상대**로 실체 확인 → ts 매핑만 오염(에콰도르·온두라스)이라 제거 후 병합 |

**근거가 매번 달라 단일 지표로는 못 잡는다.** 상세 = 메모리 `team-row-duplicate-detection`.

### 감시 신설 (health-check)
`club-xi-quality`(wrong-squad·coords·stale) · `match-log-detail` · `leaderboard-season` · `team-dup` · `wage-freshness`.
자가치유는 재실행으로 실제 복구되는 축만 등록(club-xi stale/coords, leaderboard-season).

## 남은 것

1. **`TeamSourceId` 소스 오라벨** — 호펜하임이 af id 를 `espn:` 으로 다는 유형. 브리지는 이름 게이트로 막았지만 데이터는 그대로라, 소스 id 로 팀을 찾는 다른 코드가 같은 함정을 밟을 수 있다. 기존 건(라리가 잔존 49건)과 같은 유형.
2. **같은 경기, 두 화면 다른 확률** — 예측 페이지는 Elo 만, 매치 상세는 시장 블렌드. 풀럼vs첼시가 한쪽은 풀럼 우세, 한쪽은 첼시 우세로 나온다.
3. **승격팀 폴백 불가 293팀** — FA컵 212·DFB포칼 13 등 컵 아마추어 클럽과 미수집 하위 리그. 고칠 문제가 아니다.
4. **`일리오팅 마타조`** — 음역 오류(← Eliot). ko 위키·overrides 어디에도 근거가 없어 표기를 만들지 않았다.
5. **EGYPT_PL `Modern Sport FC`·`ZED FC`** — af 20팀 명단에 아직 없어 매핑 대상 아님. af 가 따라오면 자동으로 붙는다.

## 함정 (다음 세션이 밟기 쉬운 것)

- **push 판정** — 위 경고 참조. `tail -1 | grep rejected` 금지.
- **`team-id-mapping.json` 은 2칸 들여쓰기** — 1칸으로 쓰면 27,570줄 diff (locks 파일과 다르다).
- **브라우저 스크린샷이 빈 화면** — 백그라운드 탭은 뷰포트가 0×0 이다. `innerWidth` 를 먼저 찍어볼 것.
- **다른 세션과 같은 파일을 고칠 수 있다** — 오늘 `league-leaderboard.ts` 통계 탭 수정이 정면 충돌했고, 상대 쪽이 더 정교해(`staleSeason` 분리) 내 커밋을 skip 했다. rebase 충돌이 나면 **어느 쪽이 나은지 먼저 읽을 것.**

## 라이브 중계 유령 이벤트 (2026-08-22, `9b42a3b`)

킥오프 6분 지난 입스위치vs선덜랜드 라이브에 **90+3분·0:3 + 독일계 선수 골·교체**가 떴다.
DB 는 내내 0:0·incidents 0 으로 정상 — 오염은 폴링 API 쪽이었다.

**원인 2겹.**
1. `/api/live/match/[gameId]` 의 af 폴백이 gameId(=`Match.externalId` 560544)를 af fixture id 로
   넘겼다. EPL 은 externalId 가 football-data 대역이고 진짜 af id 는 `raw.fixture.id`(1557370).
   af 에 560544 가 실재해서(2019 독일 U19) 그 경기가 통째로 실려왔다.
2. `soccer-events` 의 side 가 `홈이 아니면 away` — 남의 팀 이벤트가 전부 원정팀으로 둔갑해
   화면에선 모두 "선덜랜드"로 보였다.

**해결.** raw 가 af 형식이면 fixture·home·away id 를 **함께** 읽는다(팀 externalId 도 af 가
아니라서 fixture 만 고치면 팀 대조가 어긋난다 — 입스위치 349/af 57, 선덜랜드 71/af 746).
+ 응답에 우리 두 팀이 없으면 통째 폐기하는 안전망(추가 호출 0).

**배포 후 실측.** 560544·560546 이벤트 0(af 원본도 0으로 일치) · 560545 는 ts 경로로
'올라 에이나' 정상 표시.

⚠ **다음 세션이 알아야 할 것.**
- 6자리 externalId 는 EPL 428·MLS 391·LALIGA 380·SERIE_A 380·LIGUE_1 306·BUNDESLIGA 306 건.
  **EPL 만의 문제가 아니다.** id 출처가 섞여 있을 뿐 중복 매치는 아니었다(560544 한 건).
- 진단은 프로덕션 HTML 로 하면 안 된다(5초 폴링이라 서버 렌더에 안 보인다).
  `/api/live/match/{id}` 의 **`live.soccerEvents`** 키를 볼 것 — `events` 로 짐작하면 0건으로 오판한다.

### 전수 결과 (`c5070ce` · `e334d74`)

오염은 5경로였다 — 라이브 이벤트 · AI 예측 · 라운드 라벨 · 양 팀 시즌 통계 · 배당.
`af-match-ref.ts` 를 단일 창구로 만들고 전부 교체. **폴백은 두지 않았다**(3000건 실측 —
raw 에 af fixture 없는 34건이 전부 EPL 560xxx 라, 폴백 동작 = 오염과 동일).

배포 후 실측 — 560551 화면 "풀럼 10% 무 45% 첼시 45% 예상 승자 Chelsea" = af 정답 일치,
라운드 "Regular Season - 1" 정상, 유령 문자열(U19·Magdeburg·Piast·Norwich) 0건.

**재발 방지 3층** — ① 런타임 `afTeamsMatch` 응답 검증 ② `npm run check:af-id` 정적 검사
③ `code-diagnostics.sh` 야간 감시(위반 시 HIGH). 검사는 위반 주입으로 탐지력까지 확인했다.

## 선수 페이지 지난 시즌 증발 (2026-08-23, `5d77057`)

시즌이 26-27 로 넘어가자 음바페 25-26(31경기 25골)이 사라졌다. **DB 아카이브엔 있었다** —
`archive-player-stats` 잡은 잘 돌았는데 `PlayerSeasonStatArchive` 를 **읽는 화면이 없었다.**
저장만 있고 노출이 빠진 위키형 축적.

해법 = `PlayerSeasonSwitch` — 시즌 상세 기록·시즌 성적 상세 두 카드를 시즌 탭으로(현 시즌 +
아카이브). 백분위는 **그 시즌 모집단**으로 계산(25-26 = 450분+ 2,736명).

⚠ 워크트리 `data/player-season-stats.json` 은 생성 시점 사본이라 25-26 이었다(메인은 26-27).
시즌 전환 화면은 메인 JSON 을 복사해 재현할 것 — 안 그러면 탭이 안 떠서 "안 고쳐졌다"로 오판한다.

### 전수 감사 + 성능 (8/24, `e1bf2df`)

현 시즌 JSON 7,873명 전수 — 탭 2개(현재+과거) **1,073명** / 현재만 6,800명 / 아카이브만 0명.
경계 5유형 실렌더 전부 정상: GK · 연단위 리그(카제미루 2026현재+25-26) · 일반 ·
**현시즌 0분 2명은 현재 탭이 빠지고 아카이브가 대표로 나온다**(설계 의도).

- 연단위 리그(2026 라벨 2,700명)의 지난 시즌(2025)은 아카이브 잡 가동 전이라 **원천 부재** —
  탭이 안 뜰 뿐 버그 아님. 내년 롤오버부터 자동으로 쌓인다.
- 성능: 모집단 쿼리가 ISR 마다 2.6s·1.2MB 돌던 것을 `unstable_cache` 24h(시즌별 키)로.
  투영은 크기만 줄임(754KB) — 시간 개선의 실체는 캐시다.
- tsc 가 워크트리에서 heap OOM 으로 죽을 수 있다 — `NODE_OPTIONS=--max-old-space-size=8192`.

### 프로덕션 클릭 전수 검증 (8/24, 완결)

표본 6명(일반·GK·이적 2종·연단위 리그·현시즌 0분)을 프로덕션에서 **실제 탭 클릭**으로
검증 — 전원 DB 아카이브 정답과 일치. 이 기능은 완결이다.

- **이적 선수는 시즌별 소속이 갈린다** — 카제미루: 현재 인터 마이애미 / 과거 탭 맨유
  (34경기·슛 52·골 9). 아카이브가 당시 팀명을 함께 굳혀둔 덕.
- GK 는 과거 시즌에서도 GK 레이아웃(세이브 타일) 유지 — 루프스 세이브 109.
- 현시즌 0분(힘멜만)은 탭 없이 25-26 이 기본 카드로.
- 검증 함정: DOM 의 시즌탭 버튼 정규식은 출전기록 필터 버튼도 잡는다 — 시즌 스위치
  탭만 세려면 "현재" 라벨 동반 여부로 갈라야 한다.
