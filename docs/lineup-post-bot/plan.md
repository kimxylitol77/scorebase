# 확정 라인업 자동 발행 봇 — 계획

## 무엇을

킥오프 전후 TheSports 공식 확정 라인업(confirmed=1)이 캐시에 도착하면, 두 팀 선발 XI 를
/lineup 전술판 versus 보드로 조립해 자유게시판(FREE, soccer)에 분석팀 계정으로 자동 발행한다.

## 왜

- "라인업 떴다"는 킥오프 직전 검색·커뮤니티 수요가 큰 콘텐츠.
- 이전 시도(이적 데일리의 웹 검색 예상 XI)는 환각·세부 포지션 부재로 제거됨.
  이번엔 TheSports 확정 데이터(포메이션+선수별 x/y 좌표) 그대로 → LLM 0, 창작 0, 100% 팩트.

## 데이터 흐름 (전부 기존 파이프 재사용)

1. Vultr `football-poller` 가 예정·LIVE 매치 lineup/detail 을 수집 → `TheSportsMatchCache.lineup` (이미 운영 중)
2. 신규 cron(10분)이 대상 리그의 임박 매치 중 confirmed=1 라인업을 감지
3. TS x/y 좌표 → 전술판 좌표 변환 → `encodeBoard` versus 보드
4. `Post{category:FREE, sport:soccer, matchId, lineupCode}` 발행 — 글 상세가 OG 이미지로 렌더

## 핵심 결정

- 대상 리그: WORLD_CUP + 5대리그 + UCL/UEL + K_LEAGUE_1 (사용자 확정. 마이너 도배 방지)
- 발행 계정: 분석팀(manager@scorebase.internal) — transfer-daily 와 동일
- 중복 가드: Post.matchId + 제목 prefix "[라인업]" 존재 검사
- LLM 호출 0 — 본문도 결정론(포메이션·선발 명단·주장·부상 결장)
- 킬스위치: LINEUP_POST_DISABLED=1 (기본 ON — LLM 비용 없어 opt-out 방식)
- pid 는 TheSports 선수 id 그대로 — OG 렌더러가 TheSportsPlayer 테이블에서 이름·사진 해석.
  테이블에 없는 선수만 커스텀 이름(한글) 폴백.

## 검증 계획

1. 단계: 좌표 변환 → 검증: 최근 FINISHED 매치로 dry-run, OG 이미지 눈으로 확인(두 팀 겹침·방향)
2. 단계: 발행 로직 → 검증: dry-run 출력의 제목·본문·중복 가드
3. 단계: 배포 → 검증: tsc 0 에러, cron 첫 실행 결과 확인
