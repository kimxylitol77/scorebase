# 골프 한국 선수 시즌 트래커 체크리스트 (Phase 1)

방향: ESPN 골프엔 세계랭킹·선수통계가 없음 → 대신 **시즌 대회 전체 리더보드**로
한국 선수 성적을 자체 집계. 경쟁사(글로벌 라이브스코어)·네이버가 안 하는 한국 특화 각도.

## 1. 데이터 빌드 (정적 JSON)
- [ ] scripts/build-golf-korea-season.ts — PGA·LPGA ?dates=YYYY 훑어 한국 선수 집계
      (출전·우승·top10·최고순위·최근성적) + 선수 한글명(위키→Haiku)
- [ ] data/golf-korea-season.json 산출
- [x] 갱신 — mac-mini weekly-static-refresh 편입(⑯, 일요일 05:00 KST). 대회 종료가 KST 월요일이라 최대 6일 지연 가능 → 더 빨라야 하면 별도 daily cron

## 2. 페이지
- [ ] /golf/korea — 한국 선수 시즌 성적 (LPGA·PGA 탭, 우승·top10 정렬)
- [ ] 선수 행: 한글명·출전·우승·top10·최고순위·최근 대회 성적
- [ ] metadata (검색: "LPGA 한국 선수", "PGA 한국 선수 성적")

## 3. 연결
- [ ] /scores 골프 탭 → 트래커 배너
- [ ] /baseball·/soccer 처럼 골프 허브가 없으므로 배너+Footer 로 진입 확보
- [ ] tsc → 배포 → production 검증

## 성능 주의
- ?dates=2026 응답이 **LPGA 10.7MB / 2.4초** → 페이지에서 직접 fetch 금지.
  반드시 빌드 스크립트로 집계해 정적 JSON 으로 서빙.

비범위: 세계랭킹(OWGR 소스 없음)·선수 통계(ESPN 미제공)·대회 아카이브
