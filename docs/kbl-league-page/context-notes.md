# KBL 리그 페이지 — 컨텍스트 노트

## 데이터 소스 결정 — KBL 공식 사이트의 공개 API
kbl.or.kr 는 SPA 라 HTML 파싱이 안 되고, 페이지가 부르는 `kbl-api.sports2i.com` 이 인증 없이 열린다(Origin/Referer 만).
TheSports basketball 은 프로필·팀만 있고 통계 권한이 없어([[nba-player-profile-thesports]]) KBL 은 공식 API 가 유일한 통계 출처다.
`api.kbl.or.kr`(순위표용) 은 Channel·TeamCode 등 헤더가 더 필요하고 대부분 500 — 순위표 외엔 쓰지 않는다.

## 시즌 코드
season/list 기준 2025-26 = 47, **2026-27 = 49** (48 아님). sports2i `Common/recent-seasons?seriesCd=1` 은 개막 전엔 47 을 준다 →
"현재 시즌"은 recent-seasons 값을 쓰고, 개막 후 바뀌는지 10월 초 확인할 것. 경기별 경로의 두 번째 세그먼트(47/**48**/pid)는 실측으로 의미를 가린다.

## 선수 id 체계
`playerNo`(6자리) — LeagueLeader.externalId 도 이미 이 값(fetch-kr-league-leaders). 선수 페이지는 `/players/{playerNo}?league=KBL`.
사진은 kbl.or.kr 정적 경로라 별도 수집 없이 URL 조립.

## 런타임 fetch vs 정적 json
목록·프로필(170명)은 주간 json(로스터·메타·SEO 용, Vercel 에서 API 호출 0). 시즌 평균·시즌별·경기별은 시즌 중 매일 바뀌므로
페이지 렌더 때 fetch + unstable_cache(1h). 공식 API 가 IP 화이트리스트가 없어 Vercel 에서 직접 호출 가능(순위표가 이미 그렇게 쓴다).

## 경기별 경로의 두 번째 세그먼트
`categories/game/{season}/{X}/{pid}` — X=01(정규시즌 gameCode)로 33경기, X=47 이면 D리그까지 합쳐 48KB. 정규시즌만 쓰므로 01 고정.

## 리더보드 시즌 라벨
recent-seasons 가 개막 전엔 직전 시즌(47)을 주므로 runKbl 은 지난 시즌 행을 멱등 갱신할 뿐이다. 개막 후 49 로 바뀌면 자동으로 2026-27 행이 생기고
loadLeagueLeaderboard 는 최신 시즌만 보여준다. `currentSeasonLabel("KBL")` 은 ts 축구 맵 기반이라 null → stale 판정 없음(의도한 대로 지난 시즌이 그대로 보임).

## 팀명
DB Team.name 은 ts 영문이고 일부는 옛 구단명("Wonju Dongbu Promy"). 화면 표기는 team-names RAW_BY_LEAGUE.KBL 이 정본, 선수 사전엔 공식 API 의 짧은 한글명("원주 DB")을 따로 둔다.

## WKBL — 같은 틀, 다른 소스
wkbl.or.kr 는 ASP 서버 렌더라 HTML 파싱(cheerio). 탭 데이터는 `/player/ajax/ajax_detail_{sumUp|personal}.asp` POST(season_gu·player_no·active_yn).
`ajax_detail_season` 은 season_gu 를 무시하고 최근 시즌만 준다(045 로 보내도 046 결과). 경기별 기록은 사이트에 없어 탭을 두지 않았다.
UA 문자열에 "bot" 이 있으면 403 — 일반 브라우저 UA 로 부른다. 현재 시즌 코드는 메인 nav `scheduleb1.asp?season_gu=NNN` 최댓값(047 = 2026-27, 1979+code).
부문별 순위 표엔 이름·팀만 있어 리더보드 externalId 는 선수 사전 이름 매칭으로 채운다.

## V-리그 — KOVO user-api 가 가장 깔끔하다
kovo.co.kr SPA 가 부르는 `user-api.kovo.co.kr` 은 JSON 이고 인증이 없다. 선수 상세는 구단 서브도메인(vixtorm.kovo.co.kr 등)에서 렌더되지만 API 는 공통.
경기별 기록 endpoint 는 없다(season-records 가 경기구분별 시즌 합계까지). 현재 시즌 `/main/game/season` 은 개막 전에도 새 코드(023)를 주므로 순위 API 가 비면 직전 시즌으로 폴백.
페퍼저축은행(2007)은 2026-27 로스터 0명, SOOP(2008)이 광주 연고로 등장 — 같은 프랜차이즈로 보고 Team row 를 이어 썼다(지난 시즌 순위표에 SOOP 이름이 붙는 건 감수).
2025-26 남자부 우승은 위키에 없어 KOVO 개막 보도(디펜딩 챔피언 대한항공)로 확정, 2019-20·2021-22 는 출처 미확인이라 비웠다.
