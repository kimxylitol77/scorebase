# 해외파 한국 선수 허브 — 체크리스트

목표: 빌드업 `/korean-players` 대응. 유럽·MLS에서 뛰는 한국 선수 시즌 성적 + 소속팀 경기를 한 페이지에.

## 1차 (완료)

- [x] 데이터 가용성 실측 — 한국 국적 795명 식별 가능, 기존 시즌스탯으로 잡히는 해외파는 9명뿐
- [x] 수집 경로 결정 — ts `season/recent/player/stat` 은 현재 시즌만 응답(과거 시즌 = code 405)이라 af 스캔 채택
- [x] `scripts/build-korea-abroad.ts` — af 23개 리그 스캔 → 국적 필터 → `data/korea-abroad.json`
  - [x] 국적 문자열 실측 확인 (`Korea Republic`, `/countries` 의 `South-Korea` 와 다름)
  - [x] 임대·이적 다중 리그 합산 (`spells`, 평점은 출전 시간 가중)
  - [x] 한글명 어순 검증 — 순서 지킨 토큰 매칭 + 성(姓) 검증
  - [x] `--league=` 단일 리그 테스트 / `--names-only` af 재호출 없는 이름 재해석
- [x] 페이지 `/soccer/korea` — 요약·나라별 인원·주요 선수 카드(다음 경기 D-day)·시즌 성적 표·소속팀 최근 경기
- [x] 검색 노출 — 페이지 메타·canonical·BreadcrumbList·Dataset JSON-LD·sitemap 등록
- [x] 헤더 내비 축구 카테고리 등록
- [x] 주간 갱신 편입 (`weekly-static-refresh.sh` ⑧-b, 빈 파일 가드 포함)
- [x] 렌더 검증 — 30명 표시, 콘솔 에러 없음

## 2차 (완료 — 2026-07-28)

- [x] 한글명 30/30 확정 — 한국어 위키백과 표제어(en 문서 langlink)로 10명 확인해 `korea-abroad-names.json` 등재
  - `Lee Hyun-Ju` = **이현주** 확인 (ts 사전의 "이주현" 이 오류였음)
- [x] 선수 이름 → `/transfers/{tsId}` 링크 (23/30). `scripts/link-korea-abroad-players.ts`
  - 1차 = ts 팀 스쿼드 안에서 이름 매칭(팀으로 좁혀 동명이인 회피), 2차 = 확정 한글명 정확일치(유일할 때만)
  - DB 에 선수 레코드가 없는 7명은 **의도적으로 링크 없음**(404 방지)
- [x] 팀 로고 — `TeamBadge` + `Team.logoUrl` 로 주요 선수 카드·시즌 표·최근 경기 전부 (29/30, af 팀 미매핑 1건 제외)
- [x] 팀명 사전 보강 3건 — Midtjylland·SV Wehen Wiesbaden·St. Louis City

## 3차 — 개인페이지 데이터 보강 (완료 — 2026-07-28)

- [x] 시즌스탯 9→25 · 사진 8→25 — `apply-korea-abroad-stats.ts` (af 스캔이 이미 받아 둔 값 병합, 추가 호출 0)
- [x] 커리어 6→20 · 과거 시즌 5→22 — `enrich-players-wikidata` / `collect-wiki-seasons` 에 `--ids=` 옵션 추가해 재사용
- [x] 매치로그 9→25 — `collect-korea-abroad-match-logs.ts` (선수당 평균 29.4경기)
  - 리그 전수 대신 **소속팀이 낀 경기만** — 리그 목록 15콜로 892경기 추림 → 경기당 1콜
  - 주간은 `--days=10` 증분만 편입(전 시즌 backfill 은 최초 1회)
- [x] 선수 페이지 버그 3건 — 소개문 포지션·현 소속 우선순위·stale 보정 조건
- [x] 세부 포지션 13→25 — `collect-korea-abroad-positions.ts` (선발 경기 라인업 grid, 386콜)
  - 결과 정합 확인: 김민재 CB · 설영우 RB · 손흥민 ST[CAM] · 이강인 RW[RM] · 오현규 ST
  - afgrid 병합 후 `derive-detail-position` 재실행이 필요(주간 스크립트에 순서 반영)

## 4차 (후속 후보)

- [ ] 이적 반영 — 지금은 2025-26 시즌 소속 기준이라 여름 이적자(예: 황인범 페예노르트→포르투)가 옛 팀으로 보인다
- [ ] 시즌 개막 후 현재 시즌 갱신을 ts 리그당 1콜로 전환 (af 800콜 → 20여 콜)
- [ ] 링크 없는 7명 — ts 선수 레코드 자체가 없다. 스쿼드 수집 확대 시 자연 해결
- [ ] 남은 결손 — 시장가치 8/25(ts 몸값 수집 확대), 능력치(ts 미인가), 연봉(빅5 전용 소스)
- [ ] 유럽 지도 시각화 (빌드업은 지도, 우리는 나라별 칩)
