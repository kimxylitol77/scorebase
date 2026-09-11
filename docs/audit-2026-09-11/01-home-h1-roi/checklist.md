# 체크리스트 — 과제 1 홈 H1 수익률 주장

## 구현
- [x] `model-vs-market.ts`: `flatUnitRoiStats` unstable_cache 1h + `asOf`
- [x] `model-vs-market.ts`: `buildRoiClaim`(순수) + `roiClaim`(래퍼, 실패 시 null)
- [x] `HeroSection.tsx`: H1·서브·기준일·CTA 를 claim 기반으로, 없으면 기존 문구 fallback
- [x] `page.tsx`: `generateMetadata` 로 description / og / twitter description 교체 (fallback 포함)
- [x] EN 미러: override 사전 추가 → `build.ts / --write` → `components/en/HeroSection.tsx`, `app/en/page.tsx` 재생성

## 검증
- [x] tsc 통과
- [x] eslint(변경 파일) 통과
- [x] 순수 함수 테스트 통과 (null·표본부족·음수·양수·0)
- [x] 로컬 `/` H1 값 == `/predictions/accuracy` 모델 픽 전체 값
- [x] 로컬 `/en` H1 값 == `/en/predictions/accuracy` 값
- [x] `/` meta description · og:description · twitter:description 에 같은 값
- [x] EN verify 스크립트에서 잔여 한글 0

## 지시서 §1 수용 기준
- [x] `<h1>` 에 수익률 수치, 「플랫 유닛 수익률」과 항상 일치
- [x] 백테스트 갱신 시 재배포 없이 H1 변경 (ISR 3600 + 캐시 1h)
- [x] meta description / og:description 같은 주장
- [x] 소스 없음·실패 시 fallback 문구, 잘못된 숫자 노출 없음

## 마무리
- [x] `docs/SCOREBASE_AUDIT_2026-09-11.md` §1 체크박스 갱신
- [x] 커밋 (브랜치 `audit/01-home-h1-roi`)
