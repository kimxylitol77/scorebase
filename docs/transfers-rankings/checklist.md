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

## 2단계 (2026-09-20, "2단계도 해줘")
- [x] lib 확장 — 시즌 집계에 최근 5경기 평점(10분 이상 출전만, 캐시 키 v3), 가성비·폼·트로피·계약 순수 함수 + 테스트 4건(총 10건)
- [x] 빅5 우승 기록 로더(getBig5TrophyWinners, 24h 캐시) + 대회 점수표·한글 대회명
- [x] view=bargain(종합 − 몸값 백분위, 몸값 3M 이상) · form(핫/콜드 `g=cold`) · trophies · contracts(다음 여름 6/30 이전 만료, 몸값 순)
- [x] PlayerRankingTable 4종 칸(가성비 부호값·최근 5경기 평점과 시즌 대비·주요 우승 3개와 점수·만료일과 남은 개월) · 필터바 랭킹 줄 8칩
- [x] 실렌더: 가성비 1위 파스칼 그로스(+75.0) · 폼 핫 1위 야말 8.90 · 콜드 1위 브레토네스 6.01 · 트로피 1위 노이어 138점 33회 · 계약 만료 1위 케인 2027-06-30
- [x] 커밋·배포·프로덕션 검증 (1fc4ccf, 5개 뷰 20행·1위 dev 와 동일)
- 정정 2건: 폼 창에 0~9분 출전 행(1점대 평점)이 들어와 콜드가 오염 → 10분 이상만 · 계약 만료 epoch 가 UTC+8 자정이라 UTC 로 읽으면 6/29 → KST 로 표기

## 3단계 — 순위 변동 화살표 (2026-09-20, "순위변동 화살표 넣어줘")
- [x] prisma `PlayerRankSnapshot`(list·day·playerId unique, league·posCode·score) — db push 로 테이블 생성(신규 테이블이라 락 없음)
- [x] lib `rank-snapshots.ts` — kstToday·writeRankSnapshot(오늘자 있으면 skip)·getRankBaseline(오늘 이전 최근 스냅샷, 1h 캐시)·baselineRankMap(리그·포지션 필터면 재번호)·prevRankOf·prune(14일) + 테스트 3건
- [x] 페이지: 무필터·검색 없음·1페이지 렌더 시 after() 로 오늘자 저장(몸값 전체 포함 13개 목록), 모든 행에 prevRank → RankDelta(▲n·▼n·–·NEW), 부제에 "순위 변동은 {날짜} 스냅샷 대비"
- [x] cron `/api/cron/player-rank-snapshot` 03:40 KST — 목록 URL 12개 self-fetch 로 렌더 유도 + 14일 정리, CRON_REGISTRY 등록
- [x] dev 검증: 종합 렌더 → power 2026-09-20 1,104행 저장 · 가짜 어제 기준선(트로피)으로 ▲n·NEW 렌더 · 라리가 필터에서 ▲548 → ▲27 로 재번호 확인 · 가짜 행 삭제 완료
- 함정 실측: 씨앗을 넣기 전에 렌더한 목록은 기준선 null 이 1h 캐시돼 화살표가 안 뜬다(가성비로 먼저 시도해 헛발)
- [ ] 커밋·배포·프로덕션 검증(오늘자 스냅샷 적재), 메모리 갱신
