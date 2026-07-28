# 해외파 한국 선수 허브 — 컨텍스트 노트

2026-07-28 작업. 결정과 근거를 남긴다.

## 왜 af 스캔인가 (ts 를 안 쓴 이유)

TheSports 가 1순위 소스라 먼저 시도했고, `/v1/football/season/recent/player/stat` 은 리그 시즌 전체 선수 스탯을
**1콜에** 주고 `nationality: "KOR"` 까지 들어 있어 이상적이었다. 그런데 **현재 시즌 uuid 만 받는다** — 2025-26 시즌
uuid 로 부르면 `code=405`. 7월 말이라 유럽 리그 current 시즌은 2026-27 이고 행이 0건이라 지난 시즌 성적을 못 채운다.
(덴마크처럼 이미 개막한 리그만 데이터가 나왔다.)

→ af `/players?league&season=2025` 는 지난 시즌을 그대로 준다. 그래서 af 채택. 대신 20명/페이지 페이징이라
리그당 20~48콜, 전체 **855콜**(실측). 매일 돌릴 성격이 아니라 주간 갱신에 넣었다.

**시즌 개막 후에는 ts 로 갈아탈 수 있다** — 리그당 1콜이면 되므로 800콜이 20여 콜로 줄어든다. 2차 과제.

## 국적 문자열

af `/players` 응답의 `nationality` 는 **"Korea Republic"**. `/countries` 엔드포인트는 같은 나라를 "South-Korea" 로
쓴다. 처음에 "South Korea" 로 필터해서 챔피언십 0명이 나왔다 — 표기 변형을 모두 받도록 `KOREA` Set 으로 처리.

## 한글명 — 어순이 진짜 함정

af 는 `"Jun-Ho Bae"`(이름-성), ts 는 `"Bae Jun-Ho"`(성-이름)로 어순이 달라서 처음엔 토큰을 **정렬**해서 맞췄다.
그랬더니 **홍현석(Hong Hyun-Seok)이 홍석현(Hong Seok-hyun)에 붙었다** — 정렬키가 같아서다. 실제 오매칭 확인.

그리고 ts `nameKo` 자체에 어순이 깨진 값이 있다 — `"Kee-Hee Kim" → "기희 김"`, `"Kang-Hee Lee" → "강희 이"`.
그대로 쓰면 사이트에 "기희 김" 이 뜬다.

그래서 두 겹으로 막았다.
1. **어순 지킨 매칭** — 정렬키 폐기. "성 먼저"/"성 나중" 두 배열만 허용.
2. **성(姓) 검증** — 매칭된 한글명 첫 글자가 로마자 성의 한글과 다르면 버린다. (`SURNAME_KO`, 사전에 없는 성은 통과)

둘 다 실패하면 **영문을 그대로 둔다**. 로마자에서 한글을 지어내지 않는다 — 선수 이름 오표기는 눈에 띄고 신뢰를 깎는다.
사람이 확정한 값은 `data/korea-abroad-names.json` 에 넣고 `--names-only` 로 반영한다(af 재호출 없음).

미확정으로 남은 12명: Seol Young-Woo, Lee Kang-Hee, Kim Ji-Soo, Yoon Do-Yong, Yang Min-Hyeok, Jeong Sang-Bin,
Jeon Jin-Woo, Kim Min-Tae, Kim Kee-Hee, Park Seung-Soo, Lee Geun-Hyeong, Noh Hyeung-jun.
추가로 `Lee Hyun-Ju → "이주현"`(ts 값)은 음절이 뒤집힌 것으로 의심 — 성 검증은 통과해서 자동으로 못 거른다.

## 범위

- **J리그 제외** — 사용자 결정. `LEAGUES` 에 주석으로 남겨 뒀으니 한 줄 해제하면 되살아난다(10명 추가).
- **컵대회 제외** — 리그 통계행만 집계한다. 그래서 이강인이 27경기(빌드업은 컵 포함 44경기)로 나온다. 리그 기준이라고
  페이지에 명시했다.
- **시즌 = 2025-26** — 그래서 여름 이적자는 옛 소속으로 보인다(황인범 페예노르트). 2차 과제.

## 경기 데이터는 이미 있었다

챔피언십 823·SPL 316·터키 315·포르투갈 472·덴마크 89·세르비아 141 등, 빌드업이 커버하는 리그의 매치가 우리 DB 에
전부 있다. af 팀 id → `TeamSourceId(source="api-football")` → `Team` 으로 이어서 다음/최근 경기를 붙였다.
새로 수집한 건 **선수 명단과 시즌 성적뿐**이다.

## 관련

`[[buildup-competitor-deep-analysis]]` — 이 작업의 출발점(빌드업 갭 4종 중 1번).
`[[golf-korea-season-tracker]]` — 같은 "한국 선수 트래커" 패턴.
