// AI 스포츠 분석 가이드 블로그 발행 (slug 으로 idempotent upsert).
//   npx tsx --env-file=.env.local scripts/_create-blog-ai-sports-analysis.ts
import { prisma } from "@/lib/db";

const SITE = "https://www.scorebase.kr";
const slug = "ai-sports-analysis";

const title = "AI 스포츠 분석은 어떻게 작동하나 — 데이터로 경기를 읽는 방법";
const excerpt =
  "AI 스포츠 분석은 Elo 레이팅과 시뮬레이션으로 경기를 예측합니다. AI 승부예측 사이트를 고르는 기준과 스코어베이스의 데이터 분석 방식을 정리했습니다.";
const tags =
  "AI 스포츠 분석, AI 승부예측 사이트, 승부예측 사이트, 스포츠 AI, 축구 승부예측, 야구 승부예측, AI 축구 예측, AI 야구 예측, 스포츠 예측 사이트, 프로야구 예측, 스코어베이스";
const thumbnailUrl = `${SITE}/og/ai-sports-analysis.png`;

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "홈", item: SITE },
    { "@type": "ListItem", position: 2, name: "블로그", item: `${SITE}/blog` },
    { "@type": "ListItem", position: 3, name: "AI 스포츠 분석", item: `${SITE}/blog/${slug}` },
  ],
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "AI 스포츠 분석은 정확한가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AI 스포츠 분석은 확률적 추정으로, 결과를 보장하지 않습니다. 데이터 기반 참고 자료로 이해해야 합니다.",
      },
    },
    {
      "@type": "Question",
      name: "AI 승부예측 사이트는 어떻게 골라야 하나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "적중률을 공개하는지, 예측 근거를 제시하는지, 도박을 권유하지 않는지를 기준으로 판단해야 합니다.",
      },
    },
    {
      "@type": "Question",
      name: "스코어베이스는 어떤 모델을 사용하나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Elo 레이팅, 포아송 모델, 5,000회 몬테카를로 시뮬레이션을 사용하며 적중률을 공개합니다.",
      },
    },
  ],
};

const L = "color:#06b6d4;font-weight:600;"; // 내부 링크 스타일
const H2 =
  "font-size:1.5em;font-weight:700;margin:44px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;";
const FAQ_CARD =
  "margin:16px 0;padding:18px 20px;background:rgba(6,182,212,0.06);border-radius:12px;border:1px solid rgba(6,182,212,0.18);";

const content = `<article style="max-width:820px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo',sans-serif;line-height:1.8;">

  <p style="font-size:1.08em;">
    <strong>AI 스포츠 분석</strong>은 경기 데이터를 통계 모델에 넣어 경기 결과를 확률로 추정하는 방법입니다.
    과거의 감(感)이나 전문가의 직관 대신, 수치화된 전력과 누적 데이터를 근거로 삼는다는 점이 특징입니다.
    최근에는 AI 승부예측 사이트, 스포츠 예측 서비스가 늘면서 일반 팬도 데이터 기반 분석을 쉽게 접할 수 있게 됐습니다.
  </p>
  <p>
    이 글에서는 AI가 스포츠 경기를 어떻게 분석하고 예측하는지, 그리고 신뢰할 수 있는 분석 서비스를 어떻게 구분하는지 정리합니다.
  </p>

  <figure style="margin:32px 0;">
    <img src="/og/ai-sports-analysis.png" alt="AI 스포츠 분석 — 데이터로 경기를 읽는 방법" width="1200" height="630" style="width:100%;height:auto;border-radius:14px;display:block;" loading="lazy" />
  </figure>

  <h2 style="${H2}">AI는 경기를 어떻게 예측할까</h2>
  <p>대부분의 AI 스포츠 분석은 다음 세 단계를 거칩니다.</p>

  <figure style="margin:28px 0;">
    <img src="/images/ai-analysis/three-steps.png" alt="AI 스포츠 분석 3단계 — Elo 레이팅, 확률 계산, 시뮬레이션" width="1200" height="500" style="width:100%;height:auto;border-radius:14px;display:block;" loading="lazy" />
  </figure>

  <p>
    <strong>첫째, 전력 수치화입니다.</strong> 가장 널리 쓰이는 방법은 Elo 레이팅입니다. 원래 체스에서 선수 실력을 비교하기 위해
    만들어진 이 방식은, 경기 결과에 따라 점수가 오르내리며 팀의 현재 전력을 하나의 숫자로 표현합니다. 강한 팀을 이기면 점수가
    크게 오르고, 약한 팀에 지면 크게 떨어집니다.
  </p>
  <p>
    <strong>둘째, 경기별 확률 계산입니다.</strong> 두 팀의 Elo 점수 차이와 홈 어드밴티지 등을 반영해 승·무·패 확률을
    계산합니다. 야구처럼 득점이 자주 나는 종목은 포아송 분포 같은 통계 기법으로 이닝별 득점 가능성까지 추정하기도 합니다.
  </p>
  <p>
    <strong>셋째, 시즌 시뮬레이션입니다.</strong> 단일 경기를 넘어 시즌 전체를 예측할 때는
    <a href="${SITE}/predictions" style="${L}">몬테카를로 시뮬레이션</a>을 사용합니다. 남은 일정을 수천 번 반복 계산해,
    각 팀이 우승하거나 포스트시즌에 진출할 확률을 산출하는 방식입니다.
  </p>

  <h2 style="${H2}">좋은 AI 승부예측 사이트를 고르는 기준</h2>
  <p>AI 분석을 제공하는 서비스는 많지만, 신뢰도는 제각각입니다. 다음 기준으로 구분할 수 있습니다.</p>
  <p>
    <strong>적중률을 공개하는가.</strong> 가장 중요한 기준입니다. 예측 서비스가 자신의 과거 적중률을 투명하게 보여준다면,
    그 예측을 검증할 수 있습니다. 반대로 적중률을 숨기는 서비스는 신뢰하기 어렵습니다.
  </p>
  <p>
    <strong>근거를 제시하는가.</strong> 단순히 “A팀 승”이라고만 말하는 것이 아니라, 왜 그렇게 예측했는지 데이터로
    설명하는지 확인해야 합니다. Elo 점수, 팀 통계, 선발 라인업 등 근거가 있어야 합니다.
  </p>
  <p>
    <strong>도박을 권유하지 않는가.</strong> 건전한 분석 서비스는 정보 제공에 초점을 둡니다. 특정 베팅을 유도하거나
    수익을 보장한다고 주장하는 서비스는 주의가 필요합니다.
  </p>
  <p>
    <strong>데이터가 최신인가.</strong> 부상, 라인업 변경, 최근 폼이 반영된 최신 데이터인지 확인해야 합니다.
  </p>

  <h2 style="${H2}">스코어베이스의 분석 방식</h2>
  <p>
    <a href="${SITE}/blog/about-scorebase" style="${L}">스코어베이스</a>는 위 기준을 충족하도록 설계된 AI 스포츠 분석
    미디어입니다.
  </p>
  <p>
    경기마다 Elo 레이팅으로 양 팀 전력을 비교하고, 승률을 추정합니다. 시즌 단위로는 5,000회
    <a href="${SITE}/predictions" style="${L}">몬테카를로 시뮬레이션</a>을 통해 우승 확률과
    <a href="${SITE}/predictions" style="${L}">포스트시즌 진출 확률</a>을 계산합니다. 야구의 경우 포아송 모델로
    이닝별 득점 가능성까지 분석합니다.
  </p>
  <p>
    무엇보다 스코어베이스는 모델의 <a href="${SITE}/predictions/accuracy" style="${L}">적중률을 공개</a>합니다.
    각 경기 리뷰에서 예측이 맞았는지 틀렸는지를 그대로 표시하고, 승부 예측·오버언더·핸디캡 항목별
    <a href="${SITE}/predictions/accuracy" style="${L}">누적 적중률</a>을 확인할 수 있습니다. 예측이 빗나간 경우도 숨기지 않습니다.
  </p>
  <p>
    분석 대상은 축구(<a href="${SITE}/leagues/EPL" style="${L}">프리미어리그</a>·라리가·분데스리가·세리에 A·K리그·<a href="${SITE}/leagues/UCL" style="${L}">챔피언스리그</a>),
    야구(<a href="${SITE}/leagues/KBO" style="${L}">KBO</a>·NPB·<a href="${SITE}/leagues/MLB" style="${L}">MLB</a>),
    농구(<a href="${SITE}/leagues/NBA" style="${L}">NBA</a>), 아이스하키(<a href="${SITE}/leagues/NHL" style="${L}">NHL</a>),
    e스포츠(LCK)를 포함합니다.
  </p>

  <h2 style="${H2}">AI 예측의 한계</h2>
  <p>
    AI 스포츠 분석을 이용할 때 반드시 기억해야 할 점이 있습니다. 모든 예측은 확률적 추정이라는 것입니다.
  </p>
  <p>
    55%의 승률로 예측된 팀이 진다고 해서 예측이 틀린 것은 아닙니다. 45%의 가능성이 현실화됐을 뿐입니다.
    스포츠는 본질적으로 변수가 많고, 부상·날씨·심판 판정·선수 컨디션 등 모델이 담지 못하는 요소가 항상 존재합니다.
  </p>
  <p>
    그래서 AI 스포츠 분석은 “정답”이 아니라 “더 나은 참고 자료”로 이해하는 것이 정확합니다. 데이터는 경기를 더 깊이
    이해하는 도구이며, 결과를 보장하지 않습니다.
  </p>

  <h2 style="${H2}">정리</h2>
  <p>
    AI 스포츠 분석은 Elo 레이팅, 확률 계산, 몬테카를로 시뮬레이션을 통해 경기를 데이터로 읽는 방법입니다.
    신뢰할 수 있는 AI 승부예측 사이트는 적중률을 공개하고, 근거를 제시하며, 도박을 권유하지 않습니다.
    스코어베이스는 이러한 기준에 따라 매일 스포츠 경기를 분석하고, 그 결과를 투명하게 공개하는 데이터 미디어입니다.
  </p>

  <h2 style="${H2}">자주 묻는 질문</h2>
  <div style="${FAQ_CARD}">
    <p style="margin:0 0 6px;font-weight:700;">Q. AI 스포츠 분석은 정확한가요?</p>
    <p style="margin:0;">AI 스포츠 분석은 확률적 추정으로, 결과를 보장하지 않습니다. 데이터 기반 참고 자료로 이해해야 합니다.</p>
  </div>
  <div style="${FAQ_CARD}">
    <p style="margin:0 0 6px;font-weight:700;">Q. AI 승부예측 사이트는 어떻게 골라야 하나요?</p>
    <p style="margin:0;">적중률을 공개하는지, 예측 근거를 제시하는지, 도박을 권유하지 않는지를 기준으로 판단해야 합니다.</p>
  </div>
  <div style="${FAQ_CARD}">
    <p style="margin:0 0 6px;font-weight:700;">Q. 스코어베이스는 어떤 모델을 사용하나요?</p>
    <p style="margin:0;">Elo 레이팅, 포아송 모델, 5,000회 몬테카를로 시뮬레이션을 사용하며 적중률을 공개합니다.</p>
  </div>

  <div style="margin:36px 0;padding:16px 20px;background:#eafaf5;border-radius:12px;border:1px solid rgba(6,182,212,0.25);">
    <p style="margin:0;font-size:0.9em;color:#0f6e56;">
      ⓘ 본 콘텐츠는 통계 모델 기반의 데이터 분석이며, 도박·베팅과 무관한 정보 제공 목적입니다. 모든 확률은 추정치로 실제 결과와 다를 수 있습니다.
    </p>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:32px 0;">
    <a href="${SITE}/scores" style="display:inline-block;padding:13px 26px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
      라이브 스코어 보기 →
    </a>
    <a href="${SITE}/predictions" style="display:inline-block;padding:13px 26px;background:rgba(6,182,212,0.10);color:#06b6d4;text-decoration:none;border-radius:10px;font-weight:600;border:1px solid rgba(6,182,212,0.35);">
      시즌 예측 대시보드 →
    </a>
    <a href="${SITE}/predictions/accuracy" style="display:inline-block;padding:13px 26px;background:rgba(34,197,94,0.10);color:#22c55e;text-decoration:none;border-radius:10px;font-weight:600;border:1px solid rgba(34,197,94,0.35);">
      모델 적중률 →
    </a>
  </div>

  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>

</article>`;

async function main() {
  const existing = await prisma.blog.findUnique({ where: { slug }, select: { id: true } });
  const row = await prisma.blog.upsert({
    where: { slug },
    update: { title, excerpt, content, tags, thumbnailUrl },
    create: { slug, title, excerpt, content, tags, thumbnailUrl },
  });
  console.log(`${existing ? "UPDATED" : "CREATED"} blog [${row.id}] /blog/${row.slug}`);
  console.log(`  title: ${row.title}`);
  console.log(`  thumb: ${row.thumbnailUrl}`);
  console.log(`  content length: ${content.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
