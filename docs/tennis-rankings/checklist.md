# 테니스 랭킹·선수 페이지 체크리스트 (Phase 1)

범위: ESPN 무료로 가능한 최대치 — ATP·WTA 랭킹 + 선수 상세. DB 수집 없음(정적 사전 + 페이지 fetch).
경쟁사(Flashscore 한국어) 대비 차별점 = **선수 한글명**.

## 1. 선수 한글명 사전
- [x] scripts/build-tennis-player-names.ts — ATP·WTA top150(300명) 위키 ko langlink → 미확보분 Haiku 음역
- [x] data/tennis-player-names.json 산출 (기존 nba/mlb 정적 사전 패턴)
- [ ] weekly-static-refresh cron 에 편입 (랭킹 변동 → 신규 선수 자동 보강)

## 2. 랭킹 페이지
- [x] src/lib/sports/espn-tennis.ts — 랭킹 fetch(캐시) + 한글명 매핑 + 국가명 한글(fifa-rankings 재사용)
- [x] /rankings/tennis — ATP·WTA 탭, 순위·한글명·국기·포인트·등락(+2/-1), 150명
- [x] metadata (JSON-LD 는 후속) (검색 유입: "ATP 랭킹", "테니스 세계랭킹")

## 3. 선수 상세
- [x] /rankings/tennis/[id] — 프로필(한글명·국적·나이·신장·주손·데뷔) + 시즌 성적(승패·타이틀·상금) + 현재 랭킹
- [x] 랭킹 행 클릭 → 상세 진입

## 4. 연결·검증
- [x] /scores 테니스 탭 → 랭킹 배너/링크 (UFC 랭킹 배너 패턴)
- [ ] 헤더 nav 또는 /rankings 허브에 노출
- [ ] tsc → 배포 → production 검증

비범위: 포인트 라이브(15-40)·매치 상세·H2H·드로우 → TheSports 유료 인가 필요(Phase 2, PV 수요 검증 후)
