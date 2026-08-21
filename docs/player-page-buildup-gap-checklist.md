# 선수 페이지 buildup 갭 메우기 — 체크리스트

> 대상: `/transfers/[id]` (축구 선수 통합 페이지). 근거 = 2026-08-21 buildup `/players/855·636` 실측 대조.

## 1. 경기별 세부 스탯 (af 응답을 이미 받고 버리던 것)

- [x] `AfFixturePlayerStat` 에 슈팅·패스·태클·경합·드리블 필드 추가
- [x] `parseFixturePlayers` 파싱 확장 (신규 af 호출 0건)
- [x] `PlayerMatchLog` 스키마 컬럼 추가 (nullable Int — 기존 행 보존)
- [x] prod DDL — 장기 트랜잭션 확인 → `lock_timeout 3s` → ALTER
- [x] `collect-player-match-logs` 매핑 확장
- [x] page.tsx select 확장 + 국가대표 로그(ts playerStats)도 같은 필드로 변환
- [x] UI — 경기 행에 스탯 칩
- [x] 최근 10일분 증분 실행으로 실적재 확인 (20 fixture 시험 → 398행)

## 2. 출전기록 시즌·대회 필터

- [x] 시즌 라벨 계산을 page → 공용으로 (표시 목록에도 시즌 부여)
- [x] 필터 UI (시즌 pill + 대회 pill) — SSR 전량 렌더 유지(SEO)
- [x] 필터 적용 시 "최근 N경기" 문구·더보기 개수 연동
- [x] 대회 pill 은 해당 선수가 실제 뛴 대회만

## 3. 주급 비빅5 커버리지 — 소스 차단으로 중단

- [x] 각 경로 status 실측 → **전부 403**
- [x] 원인 확정 — Capology 가 Cloudflare 챌린지(`cf-mitigated: challenge`)로 봇을 막았다.
      확장하려던 신규 경로만이 아니라 **기존 5대리그 경로까지 403**.
- [x] 파급 확인 — `data/football-wages.json` 이 **2026-07-15 에서 동결**. 주간 러너 ⑦-e 가
      빈 응답 가드에 걸려 옛 파일을 유지하며 조용히 실패해 왔다.
- [x] 대체 소스 조사 — ts `player/with_stat/list` 응답에 주급 필드 없음(실측). 우리가 가진
      인가 소스로는 대체 불가.
- [x] 차선책 적용 — 화면에 **주급 스냅샷 기준 시점("2026.07 기준") 상시 표기**.
      낡은 값을 현재 주급처럼 읽히게 두지 않는다.
- [ ] (사용자 결정 대기) 유료 주급 소스 도입 여부 / 주급 항목 유지·철회 여부

> Cloudflare 챌린지 우회는 하지 않는다(봇 탐지 우회 금지).

## 4. UI/디자인 점검 (사용자 명시 요구)

- [x] 디자인 시스템 준수 — 라이트 흰카드 ring, 다크 `dark:bg-white/[0.04]` elevated
- [x] 탭·필터 pill = rose 액센트 + `transition-all duration-300 cubic-bezier(0.16,1,0.3,1)`
- [x] 잔존 cyan 링크 정리 (`더보기` summary 가 cyan 이었음)
- [x] 모바일 1열 — 칩이 줄바꿈으로 깨지지 않는지
- [x] 라이트/다크 양쪽 실렌더 확인
- [x] 국기·장식 span `aria-hidden`

## 검증

- [x] `npx tsc --noEmit` 통과
- [x] 로컬 dev 실렌더 — 칸셀루 (칩·필터·라이트/다크·모바일 375px 확인)
- [ ] 배포 후 prod 실렌더 재확인


## 진행 중

- [ ] 매치로그 세부 스탯 전체 백필 (6,289 fixture, af 콜 1건/경기) — 배치 버전으로 실행 중
