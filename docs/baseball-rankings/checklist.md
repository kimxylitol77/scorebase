# 야구 선수 랭킹 (/baseball/rankings) — 체크리스트 (2026-09-20)

요청: "야구도 가능해?" → 실측 후 "시작해 주고"

## 계획
KBO·MLB·NPB 시즌 성적(BaseballPlayerSeasonStats)으로 타자·투수 종합 지수, 연봉(PlayerSalary)으로 가성비, 경기별 로그(Kbo/NpbPlayerGameLog)로 폼을 만든다. 표·순위 변동 스냅샷은 /transfers 것을 재사용.

## 실측
- 2026 시즌 성적: KBO 554(타 273·투 280) · MLB 1,652(타 733·투 0 — 수집 잡이 투수 split 을 못 받음) · NPB 731(타 731·투 378)
- 연봉↔성적 이름 매칭: KBO 468 · MLB 1,164 / NPB 연봉 없음
- 최근 30일 경기 로그: KBO 타자 248·투수 187 / NPB 타자 358·투수 229 / MLB 없음

## 작업
- [x] lib src/lib/sports/baseball/player-rankings.ts — 시즌 성적 로드(6h 캐시)·타자/투수 종합·가성비·폼 계산 + 테스트 5건
- [x] /baseball/rankings?league=&view=&role= 페이지(표 내장) + 순위 변동 스냅샷(list bb:{리그}:{뷰}:{역할})
- [x] 진입: /baseball 허브 카드(5개 바로가기), 페이지 상단 연봉 랭킹·축구 랭킹 칩
- [x] tsc·eslint·test, dev 실렌더 12조합(KBO 타자 124·투수 142·가성비 112/104·폼 105/61 · MLB 타자 362·가성비 333 · NPB 타자 122·투수 173·폼 127/19)
- [ ] 커밋·배포·프로덕션 검증, 메모리
- 실측 함정: NPB 로그 이름이 성만 있어 팀+성 유일 매칭(98→더 많이), NPB 시즌 stats 의 games 가 일부 1 로 잘못 적재된 행 존재(수집 쪽 확인 필요)
- 범위 밖: MLB 투수(수집 잡 수정 필요), 상승률(연봉 이력 1시즌), 트로피·계약·유망주(재료 없음)
