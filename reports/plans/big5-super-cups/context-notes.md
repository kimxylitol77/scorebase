# 빅5 슈퍼컵 온보딩 — 컨텍스트 노트

## 왜 지금인가

2026-08-21 빌드업(경쟁사) 리그 대조 중, 우리가 커버하는 슈퍼컵이 `PORTUGAL_SUPER_CUP`
하나뿐이라는 걸 발견했다. 빅5 슈퍼컵이 통째로 비어 있다. 앞서 FA 커뮤니티 실드
(8/16 아스날 3-0 맨시티)가 열렸는데 우리 DB 에 0건인 것도 같은 이유였다.

## 결정 1 — 소스는 ts 단독. af 는 안 쓴다.

근거.
- Vultr `football-match-collector.js` 는 `league-id-mapping.json` 을 tsId 로 역매핑해
  매치를 만든다(`compToCode`). **tsSeasonId 없이 tsId 만으로도 수집된다.**
  즉 JSON 한 줄이 수집의 실질 스위치다.
- 기존 컵들이 `TS_COVERED_EXCEPTIONS` 에 들어가 af 수집을 유지하는 이유는
  **라운드 라벨** 때문이다 — af 는 `fixture.league.round` 로 "Round of 16" 을 주지만
  ts 는 컵에 `round_num=0` 만 준다. 슈퍼컵은 1~3경기 단발이라 라운드 개념이 없다.
- af 리그 id 를 모른다. 추측 금지(`feedback-no-fact-guessing`)이고, 확인하려면 af 쿼터를
  쓴다(`af-quota-extras-incident`). 필요도 없는 값을 위해 쿼터를 쓰지 않는다.

따라서 `api-football-pro.ts`·`index.ts`(af collector)·`fetch-af-odds.ts` 는 건드리지 않는다.
PORTUGAL_SUPER_CUP 은 af id 550 이 있지만 그건 7m 대조 일괄 추가 때 딸려온 것이고,
실제 매치 생성은 ts 컬렉터가 하고 있다.

## 결정 2 — 이탈리아는 "EA SPORTS FC Supercup" 이다

ts 경쟁대회 사전에서 `Italian TIM Cup`(`z318q66h4yqo9jd`)이 이름상 후보로 보였지만,
실제 매치를 열어보니 **2016년 프리시즌 3파전**(AC Milan·Celta·Sassuolo)이었다. 죽은 대회다.

진짜 수페르코파 이탈리아나는 `e4wyrn4h4kq86pv` "EA SPORTS FC Supercup" — 이름에 Italy 가
없어 이름 검색으로는 안 잡힌다. **`country_id` 로 찾았다**(이탈리아 = `49vjxm8ghgr6odg`).
2023-24 부터 EA Sports 가 타이틀 스폰서라 공식 명칭이 그렇다. 실측 매치로 확정 —
2025-12 나폴리·밀란·볼로냐·인테르 4강, 결승 나폴리 2-0 볼로냐.

교훈. **ts 대회를 이름으로 찾지 마라. `country_id` + `type` 으로 좁히고 실제 매치로 확정하라.**
원본 덤프는 `data/thesports-translations/base/comp_page*.json` (2,610건, country_id·type 포함).
`_competition-mapping.json` 은 id/en/ko 만 있어 이 판별을 못 한다.

## 결정 3 — 대회명 확정 방법

`/v1/football/competition/additional/list?uuid=` 가 `name`·`short_name`·`type`·`country_id`
·`cur_season_id` 를 준다. **`cur_season_id` 가 시즌 uuid 를 손으로 안 찾아도 되게 해준다.**
검증: 이 방법으로 얻은 PORTUGAL_SUPER_CUP 의 cur_season 이 우리 저장값과 정확히 일치했다.

⚠ `/v1/football/competition/list` 는 권한 없음. `season/list` 의 `competition_id` 파라미터는
무시된다(uuid 로만 조회 가능). 그래서 위 additional/list 가 유일하게 쓸 만한 경로다.

## 결정 4 — 코드 네이밍은 원어

컵은 원어가 지배적 관례다(COPA_DEL_REY·COPPA_ITALIA·DFB_POKAL·COUPE_DE_FRANCE·
EMPEROR_CUP·LEVAIN_CUP). PORTUGAL_SUPER_CUP 만 국가+SUPER_CUP 인데 이건 7m 일괄
추가 때의 예외다. 새로 넣는 5개는 원어를 따른다.

한글 표시명은 국가 접두를 붙인다 — 리그 목록에서 스캔이 되게("스페인 수페르코파").

## 함정 메모

- `ALL_LEAGUES`(sport-leagues.ts)가 화면 노출의 단일 기준이다. 여기 빠지면 데이터는 다
  도는데 404·예측 0 이 된다(`league-onboarding-offboarding-residue`).
- `ALL_LEAGUES` 는 `types.ts` 가 아니라 `sport-leagues.ts` export 다. 잘못 import 하면
  tsx 가 런타임 타입검사를 안 해서 빈 Set 이 되고 전 리그가 "미등록"으로 보인다(8/21 한 번 속았다).
- 새 대회는 **Vultr 컬렉터에 JSON scp + restart** 가 필수다. 저장소만 고치면 워커는 계속
  옛 사본을 본다(`league-expansion-7m-audit`).
- 매치 백필은 `backfill:cup-teams --season` 을 쓴다(8/21 신설). payload 에 스코어를 반드시
  실어야 한다 — 안 그러면 종료 경기가 `null : null` 로 들어간다(같은 날 364건 실측).


## 함정 추가 (실행 중 발견) — 리그 페이지 게이트가 두 개다

체크리스트가 `src/app/leagues/[league]/page.tsx` 를 통째로 빠뜨렸다. 온보딩 후 5개 페이지가
200 을 주는데 **"순위 데이터를 수집 중입니다" 빈 화면**이었다. 게이트가 두 겹이다.

1. `VALID_LEAGUES` — 없으면 ALL_LEAGUES 폴백으로 넘어가 **순위표만 그린다**.
   녹아웃 컵은 순위표가 없으니 통째로 빈 화면.
2. `CUP_LEAGUES` — 여기 없으면 `VALID_LEAGUES` 에 넣어도 **일정 탭이 안 생긴다**.
   글 목록만 뜨고 매치가 안 보인다(1단계만 고쳤을 때 실렌더로 확인).

둘 다 파일 안에 "ALL_LEAGUES 폴백으로 넘어가면 컵에 없는 순위표만 그려 빈 화면이 된다"는
경고 주석이 이미 달려 있었다. **컵을 새로 올릴 때는 이 파일의 두 목록을 반드시 같이 본다.**

전수 스캔 결과 컵인데 `VALID_LEAGUES` 에 없는 대회가 13개였다. 이번에 슈퍼컵 6개
(빅5 + 기존 PORTUGAL_SUPER_CUP — 등록이 빠져 빈 화면이던 걸 실렌더로 확인)를 넣었다.
**남은 7개는 손대지 않았다** — CLUB_FRIENDLY·INTL_FRIENDLY 는 매치 수가 많고 역대 우승
개념이 없어 의도적 제외로 보이고, AFCON·CONCACAF_GOLD·LEAGUES_CUP·UEFA_WCL·CANADA_CHAMP
는 조별리그가 있어 순위표가 의미 있을 수 있다. 사용자 판단이 필요한 건이라 보고만 한다.

**교훈. 200 응답은 검증이 아니다.** 이번 세션에서 두 번 같은 실수를 했다(리더보드 오염 때는
순위표만 보고 "화면 정상"이라 단정). 실렌더로 본문을 읽어야 한다.
