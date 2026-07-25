// 운영 봇 단일 레지스트리 (단일 진실).
//
// 이전엔 봇별 예상 주기가 두 곳에 따로 박혀 드리프트했음:
//   - src/app/admin/health/page.tsx 의 BOT_META (대시보드 "봇 N/M 다운" 카드 출처)
//   - src/app/api/cron/bot-heartbeat-check/route.ts 의 BOT_INTERVAL_MS (텔레그램 알림)
// 한쪽에만 등록된 봇(route-guardian / lightsail-baseball-player-names)이 다른쪽에선
// fallback 임계로 매일 false "다운" 떴음. → 여기 한 곳만 고치면 양쪽 반영되도록 통합.
//
// 새 봇 추가 / 주기 변경 시 이 파일만 수정. ko/role 은 대시보드 표시용, intervalMs 는 양쪽 공용.
// 판정: 마지막 ping age 가 intervalMs × 2 초과면 "지연", × 4 초과면 "다운".

export type BotMeta = { ko: string; intervalMs: number; role: string };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const BOT_REGISTRY: Record<string, BotMeta> = {
  "mac-mini-match-narrator": {
    ko: "AI 라이브 코멘터리",
    intervalMs: 5 * MIN,
    role: "Ollama/Haiku 매치 진행 박스 생성",
  },
  "mac-mini-endpoint-monitor": {
    ko: "엔드포인트 헬스 체크",
    intervalMs: 5 * MIN,
    role: "5개 핵심 페이지 응답 감시",
  },
  "mac-mini-live-scores-watcher": {
    ko: "라이브 스코어 감시",
    intervalMs: 1 * MIN,
    role: "1분 주기 라이브 데이터 sanity check",
  },
  "mac-mini-live-scores": {
    ko: "라이브 스코어 감시",
    intervalMs: 1 * MIN,
    role: "1분 주기 라이브 데이터 sanity check",
  },
  "mac-mini-data-quality": {
    ko: "데이터 품질",
    intervalMs: 15 * MIN,
    role: "LIVE 점수 null + TBD 팀명 감시",
  },
  "mac-mini-data-sanity": {
    ko: "데이터 정합성 감시",
    intervalMs: 3 * MIN,
    role: "score drift/이닝/순위 등 정합성 점검 (3분 주기)",
  },
  "mac-mini-api-quota": {
    ko: "API 한도 감시",
    intervalMs: 30 * MIN,
    role: "4개 외부 API 사용량 알림",
  },
  "mac-mini-preview-coverage": {
    ko: "PREVIEW 커버리지",
    intervalMs: 30 * MIN,
    role: "PREVIEW 누락 + 야구 투수 확정 분기",
  },
  "mac-mini-threads-poster": {
    ko: "Threads 자동 발행",
    intervalMs: 30 * MIN,
    role: "오늘 경기 카드 + 신규 블로그 Threads 발행",
  },
  // 아래는 주기가 길어(시간/일/주) fallback(30분) 임계로 false 다운 떴던/뜰 봇 — 실제 주기로 등록.
  "mac-mini-football-incidents": {
    ko: "축구 인시던트 백필",
    intervalMs: 4 * HOUR,
    role: "종료 매치 골/카드 incidents 사후 백필 (4시간 주기)",
  },
  "mac-mini-stale-ts-verify": {
    ko: "ts 매치 stale 검증",
    intervalMs: 4 * HOUR,
    role: "TheSports ts- SCHEDULED 매치 diary verify (4시간 주기, 고정 IP)",
  },
  "lightsail-football-transfers": {
    ko: "이적시장 증분 수집",
    intervalMs: 6 * HOUR,
    role: "TheSports transfer/list 증분 → FootballTransfer (KST 00·06·12·18)",
  },
  "lightsail-football-market-values": {
    ko: "선수 몸값 증분 수집",
    intervalMs: 1 * DAY,
    role: "TheSports player/market/list 증분 → PlayerMarketValue (매일 KST 09:00)",
  },
  "mac-mini-route-guardian": {
    ko: "라우트 가디언",
    intervalMs: 1 * DAY,
    role: "sitemap 전수 + 홈 BFS 크롤로 404/soft 404/5xx 감시 (하루 1회)",
  },
  "mac-mini-daily-official-korean": {
    ko: "공식 한글명 일일 적용",
    intervalMs: 1 * DAY,
    role: "TheSports 공식 한국어명(type=5) → 축구 선수 nameKo (매일 03:30)",
  },
  "mac-mini-nightly-report": {
    ko: "야간 운영 리포트",
    intervalMs: 1 * DAY,
    role: "일일 운영 요약 리포트 (매일 07:00)",
  },
  "mac-mini-code-diagnostics": {
    ko: "코드 진단",
    intervalMs: 1 * DAY,
    role: "repo 정적 진단 (매일 21:00)",
  },
  "mac-mini-daily-football-player-names": {
    ko: "축구 선수명 일일 보강",
    intervalMs: 1 * DAY,
    role: "라인업 신규 축구 선수 한글명 보강 (매일 04:10)",
  },
  "lightsail-baseball-player-names": {
    ko: "야구 선수명 사전 보강",
    intervalMs: 12 * HOUR,
    role: "Lightsail 야구 선수 한글명 보강 (KST 03·23시 하루 2회)",
  },
  "mac-mini-weekly-player-names": {
    ko: "주간 선수명 사전 보강",
    intervalMs: 7 * DAY,
    role: "네이버 → MLB 선수명 사전 자동 PR",
  },
  "vultr-db-backup": {
    ko: "DB 일일 백업",
    intervalMs: 1 * DAY,
    // 2026-07-10 맥미니→Vultr 이관 — 집 회선 저하로 12시간 걸리던 덤프가 Vultr(AWS 아님, 서울 DC)에선 39초.
    role: "Neon pg_dump → Vultr(64.176.230.240) /root/scorebase-backup 30일 보존 (매일 04:30 KST)",
  },
  "mac-mini-daily-golf-korea": {
    ko: "골프 한국선수 시즌 집계",
    intervalMs: 1 * DAY,
    role: "PGA·LPGA 시즌 리더보드 → 한국 선수 우승·톱10 재집계 + data push (매일 09:00)",
  },
  "mac-mini-daily-dup-cleanup": {
    ko: "중복 매치 일일 정리",
    intervalMs: 1 * DAY,
    role: "ts 이중저장 Match 중복(종료·참조0) SAFE 자동 삭제 — collect 가드 사각 보완 (매일 10:30)",
  },
  "mac-mini-weekly-static-refresh": {
    ko: "정적 데이터 주간 갱신",
    intervalMs: 7 * DAY,
    role: "스쿼드·감독·국기·포지션 빌더 일괄 + data/*.json 자동 push (일 05:00)",
  },
  "mac-mini-synthetic-monitor": {
    ko: "합성 페이지 검증",
    intervalMs: 1 * HOUR,
    role: "핵심 6페이지 SSR 마커 검증 — 빈 화면/섹션 소실 감지 (1시간)",
  },
};

// bot-heartbeat-check(텔레그램)용 — intervalMs 만 추출.
export const BOT_INTERVAL_MS: Record<string, number> = Object.fromEntries(
  Object.entries(BOT_REGISTRY).map(([name, m]) => [name, m.intervalMs]),
);
