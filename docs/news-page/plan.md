# 해외 뉴스 게시판 `/news` — 계획

## 배경

해외 브리핑 파이프라인(`src/jobs/fetch-news-briefing.ts`, 2026-07-04 구축)은 이미 정상 가동 중이다.
누적 발행 478건, 일일 캡 12건이 최근 10일 내내 거의 포화(8~12건).

문제는 **만들 게 없는 게 아니라 두 가지가 어긋나 있다는 것**.

1. **노출** — `/analysis?board=briefing` 탭 하나에 묻혀 있다. 독자적 URL·메타·색인 경로가 없다.
2. **소스 신뢰도** — "공신력 있는 곳만"이 구조적으로 보장되지 않는다.
   Google News 기자 피드는 제목 끝 매체명을 `promote` 로 승격시키는데, 걸러내는 장치가
   블랙리스트(`TABLOID_RE`)뿐이다. 블랙리스트는 새어나간다 — 실측 결과
   `MSN 25건 · TheHardTackle 7건 · Motorcycle Sports 6건 · The Real Champs 5건` 이 이미 발행됐다.
3. **종목** — 전 소스가 축구. 사이트는 12개 리그 멀티 종목인데 뉴스만 축구다.

## 목표

축구·야구·농구·하키 해외 뉴스를 **공신력 소스만** 걸러 한국어 브리핑으로 발행하고,
`/blog` 처럼 독립된 게시판 페이지 `/news` 에서 읽게 한다.

## 저작권 원칙 (변경 없음 — 유지)

전문 번역은 출처를 표기해도 2차적저작물작성권 침해다(번역요약물 대법원 판례).
기존 파이프라인의 **"사실 재구성 + 직접 인용 최대 1문장 + 출처 링크"** 방식을 그대로 유지한다.
재작성·검증 2단계 LLM 게이트도 그대로 둔다 — 이 게이트는 제거 금지 (과거 품질 사고로 당일 철회 이력).

## 작업 3축

### A. 소스 신뢰도 — 블랙리스트 → 화이트리스트 전환

`ALLOWED_PUBLISHERS` 정규식 신설. gnews `promote` 로 매체명이 승격될 때 화이트리스트에
없으면 **항목 자체를 버린다**. 승격 실패 시 폴백으로 소스 기본명을 쓰지 않는다(오귀속 방지).

허용 매체 — 원소속 통신사·공영방송·리그 공식·종목 1급 전문지로 한정.
축구: BBC / Sky Sports / The Athletic / NYT / Guardian / Reuters / AP / ESPN / 구단·리그 공식
야구: MLB.com / ESPN / The Athletic / AP / Reuters
농구: NBA.com / ESPN / The Athletic / AP / Reuters
하키: NHL.com / ESPN / The Athletic / AP / Reuters

기존 `TABLOID_RE` 는 그대로 둔다 (2중 방어 — 화이트리스트 통과 이름의 유사 표기 방어).

### B. 종목 확장 — 야구·농구·하키

`SourceDef.sport` 필드 신설 (`soccer|baseball|basketball|hockey`). 소스가 종목을 고정한다
(LLM 분류에 맡기지 않는다 — 오분류 시 잘못된 게시판에 꽂힌다).

신규 소스 (2026-08-19 RSS 생존 실측 완료).
| 종목 | 소스 | kind | 실측 |
|---|---|---|---|
| baseball | ESPN MLB RSS | direct | 200, 16 items |
| baseball | gnews `site:mlb.com` | gnews | 100 items |
| baseball | gnews `"Jeff Passan"` (ESPN) | gnews·promote | 11 items |
| basketball | ESPN NBA RSS | direct | 200, 13 items |
| basketball | gnews `site:nba.com` | gnews | 100 items |
| basketball | gnews `"Shams Charania"` (ESPN) | gnews·promote | 44 items |
| hockey | ESPN NHL RSS | direct | 200, 22 items |
| hockey | gnews `site:nhl.com` | gnews | 100 items |

제외 — MLB.com/NHL.com/NBA.com 직접 RSS 는 403/302/404 (gnews `site:` 로 우회).
제외 — Wojnarowski 는 2024 은퇴, Chris Haynes 피드는 박스스코어 노이즈.
제외 — KBO 등 국내 매체. 한국어 기사를 한국어로 재구성하면 번역이 아니라 표절 위험
       (기존 `rumorOnly` 원칙 계승).

분류 rubric·재작성 시스템 프롬프트를 종목별로 분기. 한국 팬 관점 가중은 종목별 한국 선수
(축구 손흥민·이강인 / 야구 이정후·김하성 / 기타 해당 시).

### C. 발행 배분 — 축구 독식 방지

현재 후보 선정은 score 단일 정렬이라, 재료가 압도적으로 많은 축구가 캡을 전부 먹는다.
**종목별 런 상한**을 둔다 (축구 2 · 타 종목 각 1). score 게이트(`MIN_SCORE=5`)는 그대로라
재료가 없는 비시즌 종목은 억지로 발행되지 않고 그냥 비운다.

일일 캡 12 → 16. 런 캡 3 → 5. LLM 비용 월 $8~15 → 약 $11~20 (sonnet-5 재작성+검증 기준).

### D. `/news` 독립 게시판

- `src/app/news/page.tsx` — 목록. 종목 필터 탭(전체·축구·야구·농구·하키), 소스 배지,
  페이지네이션, 메타·JSON-LD(CollectionPage).
- **개별 글 URL 은 기존 `/analysis/{id}` 유지.** 478건이 이미 그 URL 로 색인돼 있어
  옮기면 색인 손실 + 중복 URL 이 생긴다. 목록만 신설한다.
- `/analysis?board=briefing` → `/news` 308 리다이렉트 (카니발라이제이션 차단).
- `BoardTabs` 의 briefing href 를 `/news` 로 교체, 헤더 nav 갱신.
- 상세 페이지의 "목록으로" 복귀 링크를 `/news` 로.
- sitemap 등록.

## 스키마

`NewsBriefing.sport` 컬럼 추가 — **raw SQL ALTER** (`prisma db push` 금지, prod DDL 락 사고 이력).
`lock_timeout 3s` 선행.

## 검증 기준

1. `npx tsc --noEmit` 통과
2. `DRY=1 npm run job:news-briefing` — 종목별 후보가 실제로 잡히는지, 화이트리스트가
   군소 매체를 실제로 차단하는지 로그로 확인
3. dev 서버 `/news` 실렌더 — 목록·필터·모바일 1열
4. `/analysis?board=briefing` 리다이렉트 확인
5. 실발행 1회 후 종목 배분·출처 표기 육안 검수
