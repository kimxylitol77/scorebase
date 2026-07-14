# 선수 근황 타임라인 (PlayerEvent) — 계획

> 2026-07-14 작성. 선수 개인페이지(/transfers/[id])를 나무위키처럼 "매주 자라는 페이지"로.

## 무엇을

선수에게 일어나는 경기 관련 사건(이적·몸값 변동·부상·활약·밀스톤·국대)을
**규칙 기반으로 자동 추출**해 `PlayerEvent` 테이블에 쌓고, 선수 페이지에
주차별 "근황" 타임라인으로 표시한다.

## 왜

- 현재 선수 페이지는 커리어가 정적 JSON(player-overrides.json)이라 시간이 지나면 낡는다.
- 부상·라인업 같은 소스는 피드에서 사라진다 — 사건 발생 시점 스냅샷을 쌓아야 역사가 보존된다.
- LLM 창작 서사는 배제한다. 5월 GSC 노출 폭락(대량 자동생성 의심) 재발 방지 + 비용.
  데이터 조립형 문장 템플릿만 사용한다.

## 확정된 결정 (2026-07-14 사용자 확인)

1. **사건 범위 = 경기 관련만.** 경기 외적 사건사고(구설·법적)는 뉴스 소스가 없어
   LLM 추측이 되고 명예훼손 리스크 → 제외.
2. **대상 = 몸값(PlayerMarketValue) 보유 선수 전체.** 규칙 기반이라 비용 0.
3. **배포 = Phase 완성 후 한 번에.** 중간 상태 프로덕션 노출 없음.

## 아키텍처

```
[주간 cron /api/cron/player-events (월 오전 KST)]
   ├─ FootballTransfer 최근 7일   → TRANSFER / LOAN 이벤트
   ├─ PlayerMarketValue.history   → VALUE_UP / VALUE_DOWN 이벤트
   ├─ 부상 명단 현재 스냅샷 vs 기존 이벤트 → INJURY / RETURN 이벤트
   ├─ (P2) playerStats 주간 집계  → PERFORMANCE / MILESTONE / NATIONAL
   └─ dedupeKey upsert (멱등)
            ↓
       PlayerEvent 테이블
            ↓
[/transfers/[id] 개요 탭 최상단 "근황" 섹션]
   주차 헤더 + 사건 bullet (최근 8주 표시 + 더보기)
```

## 단계

| 단계 | 내용 | LLM | 예상 |
|---|---|---|---|
| 1 | PlayerEvent 테이블 + 이적·몸값·부상 3종 규칙 + 백필 + 근황 UI | 0 | 1~2세션 |
| 2 | PERFORMANCE(주간 활약)·MILESTONE(N호골·해트트릭·데뷔·퇴장)·NATIONAL 규칙 + cron 정착 | 0 | 1세션 |
| 3 | 포커스 75명 주간 한 문단 요약(주 75콜) + Wikidata 커리어 주간 재동기(정적 JSON 탈피) | 소량 | 1세션 |

## 성공 기준 (검증 가능)

- 백필 후 안드레이 산투스(jw2r09hjw6odrz8) 페이지에 이적 8건 + 몸값 13건 타임라인 표시.
- 수집 잡 2회 연속 실행 시 중복 이벤트 0건 (dedupeKey 멱등 검증).
- tsc 통과 + 로컬 브라우저 검증 후 일괄 push.

## 주의 (기존 사고 재발 방지)

- **db push 금지** — 프로덕션 hang 사고 전례. 신규 테이블은 CREATE TABLE SQL 직접 실행,
  실행 전 pg_stat_activity에서 pg_dump 동작 여부 확인 (04:30 KST 백업 시간대 회피).
- 신규 파일 생성 전 존재 확인 (라우트 덮어쓰기 사고 전례).
- 커밋은 이 작업 파일만 선별 add (공유 워킹트리에 다른 세션 변경 다수).
