# 인계 — 해외축구 정적 블로그 셋업 (방향 합의, 코드 미착수)

## 지금 상태 한 줄

**scorebase 시너지용 해외축구 블로그를 새로 만들기로 방향만 확정.** 코드 착수 전,
사용자의 도메인 구매를 대기 중. 사용자가 "컨텍스트창 넘기기" 지시로 여기서 중단.

## 확정된 방향 (사용자와 합의 완료)

- **목적** — scorebase 권위·유입 시너지. 자체 도메인 블로그로 자연스럽게 scorebase 인용·유입.
  (PBN·자동 대량 도배 10개는 2025~26 구글 scaled-content/link-spam 정책 위험이라 **기각**,
   1~2개 품질로 합의.)
- **주제** — 해외축구 가이드 (일정·중계·선수·월드컵). scorebase 예측·베스트XI·라인업 인용 자연.
- **호스팅** — **정적 사이트 + Cloudflare Pages (완전 무료)**. 워드프레스(PHP·월 $5·서버관리)는
   자동발행 목적엔 손해라 기각. 정적이 무료·빠름·자동화 동일패턴·관리 0.
- **스택** — Astro 정적 블로그 추천 (콘텐츠·SEO 특화, 마크다운 네이티브).
- **자동발행** — scorebase `lib/ai/claude.ts`(haiku) 재사용 → 해외축구 마크다운 글 생성
   → git push → Cloudflare Pages 자동 빌드·배포. scorebase blog-weekly 와 동일 흐름.
- **cron** — 맥미니/Lightsail worker 에서 매일 1글 (scorebase 자동화 패턴 준용).
- **비용** — 도메인 값(연 1만원대)만. 호스팅·CDN·SSL·빌드 전부 Cloudflare 무료.

## 역할 분담

- **사용자(사장님)** — ① 도메인 구매(Cloudflare Registrar 추천 — 원가·DNS 통합)
   ② Cloudflare 계정에서 Pages ↔ GitHub 레포 연결(GitHub 인증 1회).
- **나(다음 세션)** — Astro 블로그 골격 + 해외축구 자동발행 코드 + SEO(메타·sitemap·
   scorebase 내부링크 자동 삽입)까지. 정적이라 서버 SSH 없이 코드로 거의 전부 가능.

## 다음 세션이 할 일

1. **사용자가 도메인 확보했는지 먼저 확인** — 안 했으면 골격만 로컬로 먼저 만들어 미리보기 가능.
2. Astro 블로그 스캐폴드 (새 로컬 디렉토리 + GitHub 레포. scorebase 레포와 **별개**).
3. 자동발행 파이프라인 — haiku 글 생성(해외축구 프롬프트) → 마크다운 파일 → git commit/push.
   글 생성 코드는 블로그 레포에 두되 `ANTHROPIC_API_KEY` 재사용(cross-repo 복잡성 회피).
4. SEO — sitemap·메타·OG·**scorebase 내부링크 자동 삽입**(시너지 핵심).
5. Cloudflare Pages 연결(사용자 계정) + 도메인 DNS(Cloudflare 자동).
6. cron 편입(맥미니/Lightsail) — 매일 1글.

## 참고

- **`seo-blog-post` 스킬** 있음 — 정적 블로그에 SEO·GEO·AEO 기준 글 1편 작성·발행용. 글 쓸 때 사용.
- 관련 메모리 후보: [[blog-publishing-mechanism]] [[blog-data-posts]](scorebase 본체 블로그 패턴),
   [[llm-fallback-openai-2026-06]](claude.ts haiku 필수).
- 사용자 성향 — 빠른 진행·완전 무료 선호, 옵션 제시 후 추천 명확히, 한국어.

## 이번 세션에서 이미 완료·배포된 것 (맥락용, 손댈 것 없음)

3건 모두 main 반영 + 이후 다른 세션이 더 발전시킴. 재작업 불필요.
- 유령 LIVE 안전망 (c16be9c) — stale-ts-verify LIVE 확장 + cleanup 축구 cutoff. 후속 dcf3408 등.
- 오늘의 베스트 XI (c2bcdc8) — `/world-cup/team-of-day`. 후속 3e42040(SVG 통일)·[date] 라우트 등.
- 예측 비교 3-way (c8f5671) — MatchInsight 순수 Elo·Scorebase·시장.
