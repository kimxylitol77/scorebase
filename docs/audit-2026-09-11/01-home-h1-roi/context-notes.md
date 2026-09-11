# 컨텍스트 노트 — 과제 1 홈 H1 수익률 주장

## 2026-09-11 계획 시점 결정
- **수치 소스**: `flatUnitRoiStats()` (`src/lib/predict/model-vs-market.ts`). 적중률 페이지 KR/EN 「플랫 유닛 수익률」이 이미 이 함수만 쓴다. 홈도 같은 함수를 쓴다(복제 금지).
- **실측(2026-09-11 운영)**: 모델 −3.8% · 시장 favorite −6.6% · 차이 +2.8%p · 1,833경기. 지시서 예시(−5.2%/−7.0%/1,266)는 작성 시점 값이라 다르다 — 하드코딩 금지 원칙대로 값은 렌더 시 읽는다.
- **"항상 일치" 의 한계**: 홈과 적중률 페이지는 각각 ISR 3600 으로 따로 재생성된다. 같은 함수를 `unstable_cache` 1h 로 감싸 둘이 같은 캐시 항목을 읽게 하지만, 두 페이지의 재생성 시각이 캐시 만료를 사이에 두면 최대 1시간 시차가 생길 수 있다. 값·반올림·게이트가 같으니 표시 규칙은 동일하고, 시차는 1시간 창 안에서 자연 해소된다. 이 창까지 없애려면 evaluate 잡에서 revalidateTag 를 쏘아야 하는데 "새 기능 금지" 원칙과 과제 범위 밖이라 하지 않는다(후속 후보로 기록).
- **표본 게이트**: 적중률 페이지가 `flatRoi.model.all.evaluated >= 100` 일 때만 섹션을 그린다. 홈도 같은 100 게이트. 적중률 페이지 리터럴은 건드리지 않는다(외과적 변경).
- **부호 표기**: H1 은 타이포그래피 마이너스(U+2212 "−"), 적중률 페이지는 `toFixed` 의 ASCII "-" — 값 비교는 숫자로 한다. "−0.0%" 는 "0.0%" 로 정규화.
- **차이가 0 이하일 때**: 마케팅 문구로 부드럽게 바꾸지 않는다(원칙 3). "지금은 시장이 Y%p 앞서고, 이 숫자도 그대로 공개합니다."
- **기준일**: 캐시된 집계 시각(`asOf`) 을 KST 날짜로. 렌더 시각이 아니라 집계 시각이 정직하다(캐시 1h 라 자정 걸치면 하루 차이 가능).
- **서브 문구가 기존 리그 나열 lede 를 대체**: 지시서의 "서브" 가 곧 lede 위치. 리그 나열은 바로 아래 HomeFocusCards 가 이미 담당해 히어로에서 뺀다. fallback 시엔 기존 lede 유지.
- **CTA**: 기존 백단위 내림 `N+` 표기 유지(매시 숫자가 흔들리지 않게). 문구만 지시서대로 "실측 채점 기록 보기".
- **metadata**: `export const metadata` 를 함수로 바꾸면 EN 미러 override(`app__page.json`) 의 preReplace 가 들여쓰기로 매칭하는 항목이 깨진다 → 객체는 모듈 상수(`baseMetadata`) 로 그대로 두고 `generateMetadata` 가 펼쳐서 description 만 덧씌운다. og/twitter **title** 은 지시서가 요구하지 않아 유지.
- **fallback 렌더 검증**: DB 를 끊으면 홈의 다른 섹션이 먼저 죽어 히어로 fallback 만 따로 볼 수 없다 → 순수 함수(`buildRoiClaim`) 테스트 + 컴포넌트의 null 분기 코드로 검증한다.
- **배포**: 사용자 지시는 "별도 브랜치로 작업". push/배포는 요청 시.

## 2026-09-11 구현 중 결정·발견
- **캐시 직렬화**: `unstable_cache` 는 결과를 JSON 으로 저장한다. `FlatUnitRoiStat` 은 숫자·문자열뿐이라 안전. `asOf` 도 ISO 문자열로 넣었다(Date 금지).
- **반올림 동일성**: `pct()` 는 accuracy 페이지와 같은 `toFixed(1)` 을 쓴다. `Math.round` 식으로 짰다가 경계값에서 0.1 갈릴 수 있어 교체. 2,000회 무작위 대조 테스트로 확인(−0 vs 0 은 숫자 동등).
- **HeroSection 의 두 조회는 독립 실패**: `prisma.match.count(...).catch(() => 0)` + `roiClaim()`(내부 try/catch). 하나가 죽어도 다른 하나는 살아 CTA 와 주장이 각각 fallback 한다.
- **EN 미러 재생성 부작용 2건**
  1. `app__page.json` 의 preReplace `inLanguage: "ko-KR",\n  // sameAs` 가 현재 KR 소스에 없어(조직 JSON-LD 가 `organizationLd()` 로 바뀜) 미적용 → EN 조직 JSON-LD 의 `inLanguage: "en"` 이 빠질 뻔했다. preReplace 를 현재 소스(`organizationLd({ description })`) 기준으로 갱신해 복구. 미러 재생성 때 "preReplace 미적용" 경고는 반드시 확인할 것.
  2. `src/components/en/HomeRankingShowcase.tsx` 가 빌더 부산물로 생성된다(EN 페이지는 preReplace 로 import 를 지우지만 컴포넌트 미러는 방출). 본 저장소에서도 untracked 로 방치돼 있던 파일 — 커밋하지 않는다.
- **EN 페이지 lint**: `src/app/en/page.tsx` 의 `react/no-unescaped-entities` 3건(288·481·490행 `Today's` 등)은 origin/main 에 이미 있던 것. 이 과제 변경 밖이라 손대지 않음.
- **모바일 검증 함정**: 데스크톱 헤드리스 Chrome `--window-size=390,844` 스크린샷은 최소 창폭 때문에 히어로가 잘려 보여 오탐. CDP 로 `Emulation.setDeviceMetricsOverride(390, mobile:true)` 를 걸면 H1 이 2줄로 정상 줄바꿈("우리 픽의 수익률은 / −3.8%입니다."), 컨테이너 358px, 가로 스크롤 없음.
- **검증 결과(로컬 dev, 2026-09-11)**: `/` H1 −3.8% == `/predictions/accuracy` 모델 픽 전체 −3.8%. `/en` 도 동일. description·og:description·twitter:description 3종 모두 같은 값. EN verify 잔여 한글 0.

## 2026-09-11 배포·운영 검증
- 사용자 결정: 적중률 H1 안·차이(+2.8%p) 선행 타협안 대신 **원안(H1 에 −3.8%) 유지**. 이유는 같은 표본 적중률에서 시장이 이기고(55.4% vs 55.9%), 모델이 이기는 유일한 지표가 수익률이라서.
- main 반영 `2dc6ec2`(Vercel success). 운영 대조 결과 KR/EN 모두 `/` H1·meta·og·twitter description = `/predictions/accuracy` 「모델 픽 · 전체」 = −3.8% (시장 −6.6%, +2.8%p, 1,833경기, 2026-09-11 기준).
