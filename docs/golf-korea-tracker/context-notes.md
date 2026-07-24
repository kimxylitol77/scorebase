# 골프 한국 선수 트래커 — 컨텍스트 노트

## 실측 (2026-07-23)

### ESPN 골프 한계 — 테니스와 정반대
- 세계랭킹(OWGR): endpoint 없음 (golf/pga/rankings → 500, golf/rankings → 404)
- 선수 상세: core API 에 프로필만(이름·나이·신장·데뷔·출생지). **statistics·eventLog·ranks 전부 없음**
  → 테니스식 "랭킹 + 선수 통계 페이지" 불가
- 되는 것: scoreboard(리더보드), **?dates=YYYY 로 시즌 전체 대회 + 각 대회 리더보드**

### 대신 한국 선수 데이터가 압도적
- LPGA 는 대회당 한국 선수 17~23명 출전. 최근 8개 대회 연인원 136명·top10 17회
- 2026 시즌 집계: 한국 선수 **54명**(PGA 17 / LPGA 37), 유해란 2승·김효주 2승·김주형 1승
- 글로벌 경쟁사(Flashscore·AiScore)는 국가별 시즌 집계를 안 하고, 네이버는 대회 중계 위주라 공백

## 구현 결정
- **집계 키는 displayName** — 시즌 응답(?dates=)의 athlete 에는 **id 가 없다**(fullName·displayName·shortName·links·flag 만).
  선수 id 는 links 의 playercard href `/id/(\d+)` 에서 추출(54/54 성공).
- **페이지에서 직접 fetch 금지** — LPGA ?dates=2026 이 10.7MB·2.4초. 빌드 스크립트로 집계해 정적 JSON.
- 선수 한글명 필수(영문명으론 한국 사용자가 못 알아봄: Haeran Ryu·Hyo Joo Kim…).
  테니스와 같은 위키→Haiku fallback 패턴 [[espn-only-sports-tennis-golf-f1]].

## 주의
- flag.alt === "South Korea" 로 국적 판별 (ESPN 표기 고정).
- order 는 공동순위도 같은 값 → top10 은 order<=10 으로 계산.
- 시즌 진행 중이라 종료 대회만 집계(status.type.state === "post").
