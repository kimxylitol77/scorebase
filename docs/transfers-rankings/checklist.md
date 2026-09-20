# /transfers 선수 종합 랭킹 확장 — 체크리스트 (2026-09-20)

요청: "우리 랭킹 페이지 강화및 ui 변경 … 선수 종합 랭킹 뭐 또 추가할꺼 없을까?" → 1단계 시작.

## 계획
몸값 하나였던 /transfers 정렬 축을 랭킹 허브로 확장한다. 새 수집 없이 DB 에 있는 경기별 기록(PlayerMatchLog, ts id)·몸값 이력(PlayerMarketValue.history)만으로 세 랭킹을 만들고, 필터바를 "랭킹 / 이적시장" 두 묶음으로 재편한다.

## 1단계
- [x] lib `src/lib/transfers/player-rankings.ts` — 시즌 선수 기록 집계(unstable_cache 6h) + 종합 지수·유망주 지수·상승률 계산(순수 함수)
- [x] 단위 테스트 `player-rankings.test.ts` — 포지션별 가중치·표본 부족 제외·백분위 계산
- [x] PmvRow 에 1년 전 몸값(v1y) 파생 추가, 캐시 키 v2
- [x] /transfers?view=power — 종합 랭킹(지수 바 + 구성요소 + 시즌 성적)
- [x] /transfers?view=prospects — 유망주 U21(age=23 토글)
- [x] /transfers?view=growth — 몸값 상승률(상승률·상승액·하락 서브칩)
- [x] 랭킹 뷰에 리그·포지션 서브필터 (기존 league·pos 파라미터 재사용)
- [x] 필터바 재편 — 랭킹 묶음(몸값·종합·유망주·상승률) / 이적시장 묶음(최신·루머·빅딜·IN/OUT·팀 가치), 몸값 하위에 리그별·팀별·국가별·포지션별
- [x] 몸값 표 행에 이번 시즌 성적(경기·골·도움·평점) 열 추가, 모바일 카드 이름 잘림 완화
- [x] 메타 제목·설명 3종, 히어로 제목·부제
- [x] tsc·eslint·test(296 통과), dev 실렌더(종합 1,116명·유망주 U21 195명·상승률 759명, 모바일 375px 가로 넘침 없음)
- [x] 커밋·배포·프로덕션 검증 (52469aa, view=power·prospects·growth·growth&g=down·power&league&pos 모두 20행)
- [x] 메모리 갱신

## 2단계 (미착수)
- 가성비 선수(몸값 1M 당 G+A), 폼 핫·콜드(최근 5경기 평점 대비), 현역 트로피 랭킹, 계약 만료 예정
