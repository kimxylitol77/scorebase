// 스코어베이스 소개·사용법 정적 글 — /blog/about-scorebase (한 번 발행 후 거의 고정).
//   npx tsx --env-file=.env.local scripts/_create-blog-about-scorebase.ts

import { prisma } from "../src/lib/db";

const slug = "about-scorebase";

const title =
  "스코어베이스란? — AI 스포츠 데이터 분석 미디어 기능·사용법 안내";

const excerpt =
  "스코어베이스(Scorebase)는 Elo 모델과 멀티 AI로 매일 스포츠 경기를 분석하는 데이터 미디어입니다. 매치 프리뷰, 시즌 시뮬레이션, 모델 적중률 공개, 라이브 스코어까지 핵심 기능과 사용법을 안내합니다.";

const tags =
  "스코어베이스, Scorebase, 스포츠 분석, AI 스포츠 분석, 라이브 스코어, 스포츠 데이터, 매치 프리뷰, 시즌 시뮬레이션, Elo 레이팅, 스코어베이스 사용법";

const thumbnailUrl =
  "https://www.scorebase.kr/images/about/og-about-scorebase.png";

// 추가 구조화 데이터 — BreadcrumbList + Organization.
// (BlogPosting 은 /blog/[slug]/page.tsx 가 자동 생성하므로 여기선 생략.)
const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "홈", item: "https://www.scorebase.kr" },
    { "@type": "ListItem", position: 2, name: "블로그", item: "https://www.scorebase.kr/blog" },
    {
      "@type": "ListItem",
      position: 3,
      name: "스코어베이스란",
      item: "https://www.scorebase.kr/blog/about-scorebase",
    },
  ],
};

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "스코어베이스",
  alternateName: ["Scorebase", "스코어 베이스"],
  url: "https://www.scorebase.kr",
  logo: "https://www.scorebase.kr/icon.png",
  description: "Elo 모델과 멀티 AI로 매일 스포츠 경기를 분석하는 데이터 미디어",
};

// 본문 HTML — content 가 <article> 로 시작 → page.tsx 가 HTML 로 렌더(prose dark:prose-invert).
// 다크모드 안전: article 에 color 고정 안 함(prose 가 base 색 관리), 보조 텍스트는 color:inherit + opacity.
const content = `<article style="max-width:820px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo',sans-serif;line-height:1.8;">

  <p style="font-size:1.08em;">
    <strong>스코어베이스(Scorebase)</strong>는 Elo 레이팅 모델과 여러 AI를 활용해 매일 전 세계 스포츠 경기를 분석하는 데이터 미디어입니다.
    축구(<a href="https://www.scorebase.kr/leagues/EPL" style="color:#06b6d4;font-weight:600;">프리미어리그</a>·라리가·분데스리가·세리에 A·리그 1·K리그·<a href="https://www.scorebase.kr/leagues/UCL" style="color:#06b6d4;font-weight:600;">챔피언스리그</a>),
    야구(<a href="https://www.scorebase.kr/leagues/KBO" style="color:#06b6d4;font-weight:600;">KBO</a>·NPB·<a href="https://www.scorebase.kr/leagues/MLB" style="color:#06b6d4;font-weight:600;">MLB</a>),
    농구(<a href="https://www.scorebase.kr/leagues/NBA" style="color:#06b6d4;font-weight:600;">NBA</a>),
    아이스하키(<a href="https://www.scorebase.kr/leagues/NHL" style="color:#06b6d4;font-weight:600;">NHL</a>),
    e스포츠(LCK), 그리고 <a href="https://www.scorebase.kr/leagues/WORLD_CUP" style="color:#06b6d4;font-weight:600;">FIFA 월드컵 2026</a>까지 폭넓은 종목을 다루며,
    모든 분석은 도박·베팅과 무관한 정보 제공을 목적으로 합니다.
  </p>

  <p>
    스코어베이스의 핵심은 <strong>"감이 아니라 숫자"</strong>입니다. 경기 결과를 예측하거나 해설할 때 인상이나 경험이 아닌,
    통계 모델과 실제 데이터를 근거로 삼습니다.
  </p>

  <figure style="margin:32px 0;">
    <img src="/images/about/hero.png" alt="스코어베이스 — AI 스포츠 데이터 분석 미디어" width="1200" height="560" style="width:100%;height:auto;border-radius:14px;display:block;" loading="lazy" />
  </figure>

  <h2 style="font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    1. 매일 발행되는 AI 매치 프리뷰
  </h2>
  <p>
    스코어베이스는 주요 경기마다 매치 프리뷰(경기 전 분석)를 자동으로 작성해 발행합니다. 각 프리뷰는 다음 데이터를 기반으로 합니다.
  </p>
  <ul style="line-height:2;">
    <li><strong>선발 매치업</strong> — 야구의 경우 양 팀 선발 투수의 ERA·WHIP·K/9 비교, 축구·농구는 핵심 선수 비교</li>
    <li><strong>팀 전력</strong> — Elo 레이팅으로 수치화한 양 팀의 현재 전력</li>
    <li><strong>팀 통계</strong> — 시즌 평균 득점·실점, 홈/원정 강도, 최근 5경기 흐름</li>
    <li><strong>AI 예측</strong> — 모델이 추정한 승률과 예상 스코어</li>
    <li><strong>시장 odds</strong> — 여러 베팅사이트 평균 배당을 implied 확률로 환산한 참고 지표</li>
    <li><strong>라이브 배당 비교</strong> — 모델 추정치와 시장 평균의 차이 분석</li>
  </ul>
  <p>
    프리뷰는 경기 시작 전 자동으로 발행되며, 사람이 매번 작성하는 것이 아니라 데이터 파이프라인과 AI가 함께 만들어 빠른 발행 속도를 유지합니다.
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    2. Elo + 몬테카를로 시즌 시뮬레이션
  </h2>
  <p>
    스코어베이스는 단일 경기 예측을 넘어 시즌 전체를 시뮬레이션합니다. 각 팀의 Elo 레이팅과 잔여 경기 일정을 입력해,
    시즌 종료까지를 <strong>5,000회 반복 계산하는 몬테카를로 시뮬레이션</strong>을 수행합니다.
  </p>
  <p>이를 통해 다음을 확률로 제시합니다.</p>
  <ul style="line-height:2;">
    <li>우승 확률</li>
    <li>포스트시즌(가을야구·플레이오프) 진출 확률</li>
    <li>예상 최종 순위</li>
    <li>강등 확률(해당 리그)</li>
  </ul>
  <p>이 시뮬레이션은 매주 최신 경기 결과를 반영해 업데이트됩니다.</p>

  <figure style="margin:32px 0;">
    <img src="/images/about/simulation.png" alt="스코어베이스 시즌 시뮬레이션 — 우승 확률·진출 확률" width="1200" height="600" style="width:100%;height:auto;border-radius:14px;display:block;" loading="lazy" />
  </figure>

  <h2 style="font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    3. 모델 적중률 투명 공개
  </h2>
  <p>
    스코어베이스의 가장 큰 특징 중 하나는 <strong>예측이 맞았는지 틀렸는지를 숨기지 않는다는 점</strong>입니다.
    각 경기 리뷰에서 모델이 예측한 결과와 실제 결과를 비교해 "적중" 또는 "빗나감"을 그대로 표시합니다.
  </p>
  <p>
    또한 누적 적중률을 공개합니다. 승부 예측(1X2), 오버언더, 핸디캡 등 항목별로 모델이 실제로 얼마나 맞혔는지를 수치로 확인할 수 있습니다.
    예측을 제공하는 서비스가 자신의 적중률을 투명하게 공개하는 경우는 드물며, 스코어베이스는 이를 신뢰의 기준으로 삼습니다.
    실제 누적 성적은 <a href="https://www.scorebase.kr/predictions/accuracy" style="color:#06b6d4;font-weight:600;">적중률 보드</a>에서 항상 확인할 수 있습니다.
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    4. 라이브 스코어
  </h2>
  <p>
    스코어베이스는 <a href="https://www.scorebase.kr/scores" style="color:#06b6d4;font-weight:600;">실시간 라이브 스코어</a>를 제공합니다.
    단순히 점수만 보여주는 것이 아니라, 경기 중 흐름을 데이터로 따라갈 수 있도록 다양한 정보를 함께 제공합니다.
  </p>
  <ul style="line-height:2;">
    <li><strong>실시간 중계</strong> — 경기 진행 상황(이닝·쿼터·전후반 등)을 실시간 갱신</li>
    <li><strong>라인업</strong> — 양 팀 선발 라인업과 포지션</li>
    <li><strong>타자 기록·투수 기록(야구)</strong> — 타순별 성적, 투수 투구 내용</li>
    <li><strong>팀 스탯</strong> — 경기 중 누적되는 팀 단위 기록</li>
    <li><strong>라이브 배당</strong> — 경기 진행에 따라 변하는 시장 배당</li>
    <li><strong>승률 곡선</strong> — 경기 흐름에 따른 양 팀 승률 변화를 시각화</li>
  </ul>
  <p>
    라이브 스코어 화면은 종목 특성에 맞게 구성됩니다. 예를 들어 야구는 이닝별 점수표와 주자 상황을,
    축구는 전후반 진행 시간과 골 이벤트를 중심으로 보여줍니다.
  </p>

  <figure style="margin:32px 0;">
    <img src="/images/about/live-score.png" alt="스코어베이스 라이브 스코어 — 라인업·승률 곡선·라이브 배당" width="1200" height="600" style="width:100%;height:auto;border-radius:14px;display:block;" loading="lazy" />
  </figure>

  <h2 style="font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    5. 매치 인사이트 — 한 경기를 깊이 있게
  </h2>
  <p>
    각 경기 페이지에는 매치 인사이트가 제공됩니다. 이는 한 경기를 둘러싼 데이터를 한곳에 정리한 영역으로, 다음을 포함합니다.
  </p>
  <ul style="line-height:2;">
    <li>선발 매치업과 양 팀 전력 비교</li>
    <li>팀 통계(시즌 누적·홈원정·최근 폼)</li>
    <li>AI 예측 승률과 예상 스코어</li>
    <li>라이브 배당과 시장 odds 평균</li>
    <li>모델 추정치와 시장의 차이 분석</li>
  </ul>
  <p>
    이 정보들은 표와 그래프로 정리되어, 경기를 보기 전 핵심 변수를 빠르게 파악할 수 있습니다.
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    스코어베이스 이용 방법
  </h2>
  <p>스코어베이스는 별도 설치 없이 웹에서 바로 이용할 수 있습니다.</p>
  <ol style="line-height:2;">
    <li><strong>종목·리그 선택</strong> — 상단 메뉴에서 원하는 종목과 리그를 선택합니다.</li>
    <li><strong>라이브 스코어 확인</strong> — <a href="https://www.scorebase.kr/scores" style="color:#06b6d4;font-weight:600;">스코어 페이지</a>에서 오늘 경기 일정과 실시간 점수를 봅니다.</li>
    <li><strong>매치 프리뷰 읽기</strong> — 관심 경기의 프리뷰에서 AI 분석과 예측을 확인합니다.</li>
    <li><strong>시즌 예측 보기</strong> — <a href="https://www.scorebase.kr/predictions" style="color:#06b6d4;font-weight:600;">예측 페이지</a>에서 우승·진출 확률 시뮬레이션을 확인합니다.</li>
    <li><strong>적중률 확인</strong> — 모델이 그동안 얼마나 맞혔는지 <a href="https://www.scorebase.kr/predictions/accuracy" style="color:#06b6d4;font-weight:600;">적중률 페이지</a>에서 검증합니다.</li>
  </ol>

  <h2 style="font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    데이터와 책임
  </h2>
  <p>
    스코어베이스가 제공하는 모든 예측과 확률은 통계 모델에 기반한 추정치이며, 실제 경기는 부상·라인업 변화 등 여러 변수의 영향을 받습니다.
    스코어베이스는 도박·베팅을 권유하지 않으며, 데이터에 관심 있는 스포츠 팬을 위한 정보 제공을 목적으로 합니다.
  </p>

  <div style="margin:36px 0;padding:16px 20px;background:#eafaf5;border-radius:12px;border:1px solid rgba(6,182,212,0.25);">
    <p style="margin:0;font-size:0.9em;color:#0f6e56;">
      ⓘ 본 콘텐츠는 통계 모델 기반의 데이터 분석이며, 도박·베팅과 무관한 정보 제공 목적입니다. 모든 확률은 추정치로 실제 결과와 다를 수 있습니다.
    </p>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:32px 0;">
    <a href="https://www.scorebase.kr/scores" style="display:inline-block;padding:13px 26px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
      라이브 스코어 보기 →
    </a>
    <a href="https://www.scorebase.kr/predictions" style="display:inline-block;padding:13px 26px;background:rgba(6,182,212,0.10);color:#06b6d4;text-decoration:none;border-radius:10px;font-weight:600;border:1px solid rgba(6,182,212,0.35);">
      시즌 예측 대시보드 →
    </a>
    <a href="https://www.scorebase.kr/predictions/accuracy" style="display:inline-block;padding:13px 26px;background:rgba(34,197,94,0.10);color:#22c55e;text-decoration:none;border-radius:10px;font-weight:600;border:1px solid rgba(34,197,94,0.35);">
      모델 적중률 →
    </a>
  </div>

  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <script type="application/ld+json">${JSON.stringify(organizationLd)}</script>

</article>`;

async function main() {
  const existing = await prisma.blog.findUnique({ where: { slug } });
  const data = { title, excerpt, content, tags, thumbnailUrl };
  const created = existing
    ? await prisma.blog.update({ where: { slug }, data })
    : await prisma.blog.create({ data: { slug, ...data } });
  console.log(`✅ Blog ${existing ? "갱신" : "생성"}: id=${created.id} slug=${created.slug}`);
  console.log(`URL: https://www.scorebase.kr/blog/${created.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
