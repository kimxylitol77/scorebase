# 감사 과제 1 [P0] — 홈 H1 을 수익률 주장으로 교체

> 지시서: `docs/SCOREBASE_AUDIT_2026-09-11.md` §1. 브랜치 `audit/01-home-h1-roi`.

## 무엇을
홈(`/`) 히어로의 H1·서브·CTA 와 meta/og/twitter description 을 "검증 가능한 수치 주장"으로 바꾼다.
수치는 `/predictions/accuracy` 「플랫 유닛 수익률」과 같은 함수(`flatUnitRoiStats`)에서 읽는다.

## 왜
현재 H1 "감이 아니라, 숫자로 보는 경기." 는 경쟁사 누구나 쓸 수 있는 문장이고,
유일한 차별 자산(모델 vs 시장 플랫 유닛 ROI)이 홈 어디에도 없다.

## 어떻게 (파일 단위)
1. `src/lib/predict/model-vs-market.ts`
   - `flatUnitRoiStats` 를 `unstable_cache`(키 `flat-unit-roi`, 1h) 로 감싼다 → 홈·적중률 페이지·generateMetadata 가 같은 캐시 항목을 읽어 값이 갈리지 않는다.
   - 결과에 `asOf`(집계 시각 ISO) 를 추가 → 홈의 "기준일" 표기 근거.
   - `buildRoiClaim(stat)`(순수 함수) + `roiClaim()`(DB·캐시 래퍼, 실패 시 null) 신설. 문구용 문자열(모델 ROI·시장 ROI·차이·표본·기준일)을 한 곳에서 포맷해 H1 과 meta 가 항상 같은 문자열을 쓴다.
   - 표본 게이트는 적중률 페이지 섹션 게이트와 동일(100경기 미만이면 주장 없음 → fallback).
2. `src/components/HeroSection.tsx`
   - claim 있음: H1 `우리 픽의 수익률은 −3.8%입니다.` / 서브 `시장 인기픽은 −6.6%. 그 차이 +2.8%p가 우리 모델의 전부입니다.` / 기준일 `2026-09-11 기준 · 1,833경기 · 경기 전 마지막 배당에 1경기 1유닛` / CTA `N+ 경기 실측 채점 기록 보기 →` (`/predictions/accuracy`).
   - 차이가 0 이하일 때도 숨기지 않는다. `시장 인기픽은 X%. 지금은 시장이 Y%p 앞서고, 이 숫자도 그대로 공개합니다.`
   - claim 없음(소스 없음·실패·표본 부족): 기존 H1·서브 그대로(fallback). 숫자 노출 없음.
3. `src/app/page.tsx`
   - `export const metadata` → 모듈 상수 `baseMetadata` 로 두고 `generateMetadata()` 가 claim 으로 description / og:description / twitter:description 만 교체. claim 없으면 baseMetadata 그대로.
   - `revalidate = 3600` 유지 → 백테스트(evaluate cron 22:00) 갱신 후 1시간 안에 재배포 없이 반영.
4. 영어판 미러 재생성 (`/en`, `components/en/HeroSection.tsx`) — 사전(override) 에 새 문구 영어 항목 추가 후 `build.ts / --write`.

## 검증
- tsc + eslint(변경 파일).
- 순수 함수 테스트(tsx 스크립트): null·표본 부족 → null, 음수/양수/0 차이 포맷, 기준일 KST.
- 로컬 렌더: `/` `<h1>` 의 ROI 값 == `/predictions/accuracy` 「모델 픽 · 전체」 값(숫자 비교). `/en` 동일.
- `/` head 의 description·og:description·twitter:description 에 같은 값 포함.
- 지시서 §1 수용 기준 4개 체크 후 `docs/SCOREBASE_AUDIT_2026-09-11.md` 체크박스 갱신.

## 범위 밖 (하지 않음)
- 적중률 페이지 문구·구조 변경, 새 기능, 배포(push 는 사용자 지시 후).
