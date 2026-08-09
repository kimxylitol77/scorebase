# KBO 경기별 선수 로그 — 컨텍스트 노트 (결정과 근거)

## 소스 실측 (2026-08-09)

- koreabaseball 인덱스: 투수 10팀 4.6s(275명) · 타자 3.6s(293명). Daily 선수당 ~150ms.
- 투수 Daily 15컬럼(날짜·상대·구분·결과·경기ERA·TBF·IP·H·HR·BB·(HBP)·SO·R·ER·누적ERA),
  타자 Daily 18컬럼. 기존 fetchKboPitcherDaily/fetchKboHitterDaily 파서 재사용.
- Daily.aspx 는 ddlYear 드롭다운 보유 — GET viewstate → POST `__EVENTTARGET=...ddlYear` 로
  과거 시즌 조회 가능(2019 이전도 옵션 존재). 인덱스 함수도 season 파라미터 지원(ddlSeason).
- TheSportsMatchCache: KBO FINISHED 796 중 cache 286, players 보유 265. 월별로 5월 30/45,
  6월 123/124, 7월 102/106 — poller 가동 이후만. 소급 불가(detail_live 는 라이브 전용) → 탈락.

## 설계 결정

- **테이블 하나에 투수/타자 통합** — role("P"|"B") 구분. h·hr·bb·so·r 은 role 에 따라
  의미가 다름(투수=피안타/피홈런/실점). 전용 컬럼: 투수 roleDetail·result·ip·tbf·er·gameEra·cumEra,
  타자 pa·ab·d2b·d3b·rbi·sb·gameAvg·cumAvg.
- **멱등 id**: `kbo:{role}:{kboId}:{season}:{MM.DD}:{seq}` — seq 는 같은 날짜 행의 등장 순번
  (더블헤더 대응). Daily 표는 시간순 고정이라 seq 안정적.
- **insert-only** (createMany skipDuplicates) — PlayerMatchLog 전례. 경기 기록은 확정값이라
  갱신 불필요. KBO 기록 정정은 드묾 — 필요 시 해당 행 삭제 후 재수집.
- **날짜**: "03.28" + season → DATE. KBO 시즌은 연내 종결(3~11월)이라 연도 경계 없음.
- **name/team 은 인덱스 스냅샷** — 과거 시즌 인덱스는 그 시즌 소속팀을 줌(이적 반영).
- 일일 cron 은 전날 KBO FINISHED 매치가 없으면 조기 종료(월요일 등 휴식일 절약).
- 현 시즌 일일 수집도 시즌 전체를 다시 훑음(멱등이라 안전) — "어제 나온 선수만" 은
  박스스코어 없이 알 수 없어 오히려 복잡.
- cron 자리: 20:30 UTC = 05:30 KST (경기 종료 후 밤새 koreabaseball 반영 뒤, 06:00 collect 앞).
- 표면: 현 시즌 = 기존 라이브 스크래핑 유지(신선도), 과거 시즌 = DB. 시즌 경계는
  kbo-official 의 SEASON_DEFAULT(현재 연도)와 동일 규칙.

## 함정 기록

- 워크트리에 .env.local 없음 → 메인 repo 에서 복사해 씀(gitignore 라 커밋 안 됨).
- Daily 파서는 "tds.length===15/18 인 행만" 조건으로 합계 th 행을 걸러냄 — POST 응답도 동일 구조.
- 타자 Daily 의 bb=c[13]·so=c[15] (사이에 HBP 등 낌) — 컬럼 위치 파서 그대로 재사용할 것.
- 과거 시즌 백필 비용 추정: 시즌당 GET+POST 2요청/선수 × ~600명 — 실행 후 실측치 기록할 것.
- **테이블 생성 절차**: CREATE TABLE IF NOT EXISTS 는 신규 객체라 락 위험 없음
  (prod-ddl-lock-incident 의 ALTER 주의사항과는 다른 케이스). tsx 인라인 실행.
