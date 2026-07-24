# F1 챔피언십 페이지 — 컨텍스트 노트

## 실측 (2026-07-24)

### 되는 것 — core API standings 가 핵심
- `sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/{YEAR}/types/2/standings`
  → items 2개: **[0]=Driver(22행), [1]=constructor(11행)**
- 드라이버 stats: `championshipPts` · `wins` · `behind`(선두와 격차) · `dnf` · `currentWeek`
- 컨스트럭터 stats: `points` · `wins` · `poles` · `rank` · `starts` · `topFinish`
- 드라이버 `athlete.$ref` → displayName·flag(국적)·dateOfBirth·birthPlace,
  **`vehicles[0]` 에 team·number(차번호)·manufacturer·engine·tire** (F1 은 팀 정보가 핵심이라 중요)
- 레이스 일정·결과: `site.api…/racing/f1/scoreboard?dates=YYYY` (2026 시즌 24전, 완료 12)

### 안 되는 것
- `site.api…/racing/f1/standings` = fullViewLink 뿐(빈 껍데기), `/rankings` 404
- 드라이버 개인 시즌 통계(폴·패스틀랩 등 세부)는 standings stats 범위 밖

### 구조 함정
- 컨스트럭터 행에는 team/athlete 이 없고 **`manufacturer.$ref`** 만 있다 → 별도 fetch 로 팀명 해석.
- 드라이버 국적은 `citizenship` 이 undefined 인 경우가 많아 **`flag.alt`** 를 써야 한다(골프와 동일).
- `behind` 는 선두와의 점수차. 1위는 "0".

## 방향 결정
- **한국 드라이버가 없다** → 골프식 "한국 선수 앵글" 불가. 테니스처럼 **챔피언십 순위 + 한글명**이 차별점
  (Flashscore 한국어판도 F1 순위는 제공하나, 우리는 드라이버·팀명 한글 + 팀별 색상으로 가독성 승부).
- 한글명은 위키 ko langlink → 미확보분 Haiku (테니스와 동일 패턴) [[espn-only-sports-tennis-golf-f1]].
- 데이터가 가벼워(22+11행) 정적 JSON 빌드 불필요 → 페이지에서 unstable_cache 로 직접 fetch.
  (골프는 10.7MB 라 빌드 필요했지만 F1 은 다름)
