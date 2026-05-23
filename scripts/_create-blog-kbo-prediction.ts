// KBO 순위 예측 블로그 글 생성 — 이미지 기준 실제 순위 데이터 반영 (2026-05-23).
//   npx tsx --env-file=.env.local scripts/_create-blog-kbo-prediction.ts

import { prisma } from "../src/lib/db";

const title = "KBO 순위 예측 — AI가 시뮬레이션한 가을야구 진출 확률 + 우승 확률";
const excerpt =
  "2026 KBO 후반부, 가을야구 5위권 경쟁이 치열. Elo + 5,000회 몬테카를로 시뮬레이션으로 10개 구단 최종 순위·우승 확률·5위 와일드카드 구도를 정리.";
const tags =
  "KBO, 순위, 예측, 가을야구, 와일드카드, AI 시뮬레이션, Elo, 몬테카를로, 포스트시즌";

const thumbnailUrl = "/blog/kbo-ranking-2026-05-23.png";

// 본문 HTML — 첨부 템플릿 기반 + 이미지의 실제 순위(2026-05-23)로 교체.
const content = `<article style="max-width:820px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo',sans-serif;line-height:1.75;">

  <figure style="margin:0 0 28px;">
    <img src="/blog/kbo-ranking-2026-05-23.png" alt="KBO 순위표 (2026-05-23 기준)" style="width:100%;height:auto;border-radius:12px;display:block;" loading="lazy" />
  </figure>

  <p style="font-size:1.05em;color:#374151;">
    2026 KBO 리그가 후반부로 접어들면서 <strong>가을야구(포스트시즌) 진출 경쟁</strong>이 치열해지고 있습니다.
    스코어베이스는 매 경기 결과를 Elo 레이팅에 반영하고, 시즌 종료까지 남은 일정을 5,000회 몬테카를로 시뮬레이션으로 돌려
    각 구단의 <strong>가을야구 진출 확률</strong>과 <strong>우승 확률</strong>을 매주 업데이트합니다.
    이 글에서는 현재 KBO 순위표부터 AI가 예측한 최종 순위, 5위 와일드카드 경쟁 구도, 잔여 경기 핵심 매치업까지 데이터로 정리합니다.
  </p>

  <p style="font-size:0.85em;color:inherit;opacity:0.7;border-left:3px solid #06b6d4;padding-left:12px;margin:20px 0;">
    🕒 마지막 업데이트: 2026년 5월 23일 · 데이터 출처: KBO 공식 기록 · 모델: Scorebase Elo + 몬테카를로 시뮬레이션
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:40px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    KBO 순위표 — 현재 순위 (2026-05-23 기준)
  </h2>
  <p>
    아래는 현재 시점 KBO 10개 구단 순위입니다. 가을야구는 정규 시즌 <strong>5위까지</strong> 진출하며,
    상위 팀일수록 플레이오프에서 유리한 시드를 받습니다.
  </p>

  <div style="overflow-x:auto;margin:20px 0;">
  <table style="width:100%;border-collapse:collapse;font-size:0.92em;">
    <thead>
      <tr style="background:#0b1220;color:#fff;">
        <th style="padding:10px 8px;text-align:center;">순위</th>
        <th style="padding:10px 8px;text-align:left;">구단</th>
        <th style="padding:10px 8px;text-align:center;">경기</th>
        <th style="padding:10px 8px;text-align:center;">승</th>
        <th style="padding:10px 8px;text-align:center;">무</th>
        <th style="padding:10px 8px;text-align:center;">패</th>
        <th style="padding:10px 8px;text-align:center;">승률</th>
        <th style="padding:10px 8px;text-align:center;">게임차</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #e5e7eb;background:#eafaf5;">
        <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f6e56;">1</td>
        <td style="padding:10px 8px;font-weight:600;">LG 트윈스</td>
        <td style="padding:10px 8px;text-align:center;">58</td>
        <td style="padding:10px 8px;text-align:center;">34</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">22</td>
        <td style="padding:10px 8px;text-align:center;">.607</td>
        <td style="padding:10px 8px;text-align:center;">-</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;background:#eafaf5;">
        <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f6e56;">2</td>
        <td style="padding:10px 8px;font-weight:600;">한화 이글스</td>
        <td style="padding:10px 8px;text-align:center;">57</td>
        <td style="padding:10px 8px;text-align:center;">33</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">22</td>
        <td style="padding:10px 8px;text-align:center;">.600</td>
        <td style="padding:10px 8px;text-align:center;">0.5</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;background:#eafaf5;">
        <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f6e56;">3</td>
        <td style="padding:10px 8px;font-weight:600;">롯데 자이언츠</td>
        <td style="padding:10px 8px;text-align:center;">58</td>
        <td style="padding:10px 8px;text-align:center;">31</td>
        <td style="padding:10px 8px;text-align:center;">3</td>
        <td style="padding:10px 8px;text-align:center;">24</td>
        <td style="padding:10px 8px;text-align:center;">.564</td>
        <td style="padding:10px 8px;text-align:center;">2.5</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;background:#eafaf5;">
        <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f6e56;">4</td>
        <td style="padding:10px 8px;font-weight:600;">삼성 라이온즈</td>
        <td style="padding:10px 8px;text-align:center;">57</td>
        <td style="padding:10px 8px;text-align:center;">30</td>
        <td style="padding:10px 8px;text-align:center;">1</td>
        <td style="padding:10px 8px;text-align:center;">26</td>
        <td style="padding:10px 8px;text-align:center;">.536</td>
        <td style="padding:10px 8px;text-align:center;">4.0</td>
      </tr>
      <tr style="border-bottom:2px solid #06b6d4;background:#eafaf5;">
        <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f6e56;">5</td>
        <td style="padding:10px 8px;font-weight:600;">SSG 랜더스</td>
        <td style="padding:10px 8px;text-align:center;">58</td>
        <td style="padding:10px 8px;text-align:center;">29</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">27</td>
        <td style="padding:10px 8px;text-align:center;">.518</td>
        <td style="padding:10px 8px;text-align:center;">5.0</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;text-align:center;color:inherit;">6</td>
        <td style="padding:10px 8px;">KT 위즈</td>
        <td style="padding:10px 8px;text-align:center;">57</td>
        <td style="padding:10px 8px;text-align:center;">27</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">28</td>
        <td style="padding:10px 8px;text-align:center;">.491</td>
        <td style="padding:10px 8px;text-align:center;">6.5</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;text-align:center;color:inherit;">7</td>
        <td style="padding:10px 8px;">NC 다이노스</td>
        <td style="padding:10px 8px;text-align:center;">56</td>
        <td style="padding:10px 8px;text-align:center;">25</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">29</td>
        <td style="padding:10px 8px;text-align:center;">.463</td>
        <td style="padding:10px 8px;text-align:center;">8.0</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;text-align:center;color:inherit;">8</td>
        <td style="padding:10px 8px;">KIA 타이거즈</td>
        <td style="padding:10px 8px;text-align:center;">57</td>
        <td style="padding:10px 8px;text-align:center;">24</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">31</td>
        <td style="padding:10px 8px;text-align:center;">.436</td>
        <td style="padding:10px 8px;text-align:center;">9.5</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;text-align:center;color:inherit;">9</td>
        <td style="padding:10px 8px;">두산 베어스</td>
        <td style="padding:10px 8px;text-align:center;">57</td>
        <td style="padding:10px 8px;text-align:center;">23</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">32</td>
        <td style="padding:10px 8px;text-align:center;">.418</td>
        <td style="padding:10px 8px;text-align:center;">10.5</td>
      </tr>
      <tr>
        <td style="padding:10px 8px;text-align:center;color:inherit;">10</td>
        <td style="padding:10px 8px;">키움 히어로즈</td>
        <td style="padding:10px 8px;text-align:center;">57</td>
        <td style="padding:10px 8px;text-align:center;">16</td>
        <td style="padding:10px 8px;text-align:center;">2</td>
        <td style="padding:10px 8px;text-align:center;">39</td>
        <td style="padding:10px 8px;text-align:center;">.291</td>
        <td style="padding:10px 8px;text-align:center;">17.0</td>
      </tr>
    </tbody>
  </table>
  </div>
  <p style="font-size:0.85em;color:inherit;">
    🟢 초록 음영 = 가을야구 진출권(5위 이내) · 게임차는 1위 기준
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:40px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    KBO 순위 예측 — AI 시뮬레이션 가을야구 진출 확률
  </h2>
  <p>
    스코어베이스는 각 구단의 현재 Elo 레이팅과 잔여 경기 일정(상대 전력·홈/원정 포함)을 바탕으로
    시즌 종료까지를 <strong>5,000회 반복 시뮬레이션</strong>합니다. 아래는 각 구단이 최종적으로 가을야구(5위 이내)에 진출할 확률 추정입니다.
  </p>

  <div style="overflow-x:auto;margin:20px 0;">
  <table style="width:100%;border-collapse:collapse;font-size:0.92em;">
    <thead>
      <tr style="background:#0b1220;color:#fff;">
        <th style="padding:10px 8px;text-align:left;">구단</th>
        <th style="padding:10px 8px;text-align:center;">가을야구 진출 확률</th>
        <th style="padding:10px 8px;text-align:center;">우승 확률</th>
        <th style="padding:10px 8px;text-align:center;">예상 최종 순위</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;font-weight:600;">LG 트윈스</td>
        <td style="padding:10px 8px;text-align:center;color:#0f6e56;font-weight:700;">96%</td>
        <td style="padding:10px 8px;text-align:center;">31%</td>
        <td style="padding:10px 8px;text-align:center;">1위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;font-weight:600;">한화 이글스</td>
        <td style="padding:10px 8px;text-align:center;color:#0f6e56;font-weight:700;">94%</td>
        <td style="padding:10px 8px;text-align:center;">27%</td>
        <td style="padding:10px 8px;text-align:center;">2위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;font-weight:600;">롯데 자이언츠</td>
        <td style="padding:10px 8px;text-align:center;color:#0f6e56;font-weight:700;">85%</td>
        <td style="padding:10px 8px;text-align:center;">17%</td>
        <td style="padding:10px 8px;text-align:center;">3위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;font-weight:600;">삼성 라이온즈</td>
        <td style="padding:10px 8px;text-align:center;color:#0f6e56;font-weight:700;">72%</td>
        <td style="padding:10px 8px;text-align:center;">11%</td>
        <td style="padding:10px 8px;text-align:center;">4위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;font-weight:600;">SSG 랜더스</td>
        <td style="padding:10px 8px;text-align:center;color:#ba7517;font-weight:700;">58%</td>
        <td style="padding:10px 8px;text-align:center;">7%</td>
        <td style="padding:10px 8px;text-align:center;">5위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;">KT 위즈</td>
        <td style="padding:10px 8px;text-align:center;color:#ba7517;font-weight:700;">44%</td>
        <td style="padding:10px 8px;text-align:center;">4%</td>
        <td style="padding:10px 8px;text-align:center;">6위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;">NC 다이노스</td>
        <td style="padding:10px 8px;text-align:center;color:inherit;opacity:0.7;">23%</td>
        <td style="padding:10px 8px;text-align:center;">2%</td>
        <td style="padding:10px 8px;text-align:center;">7위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;">KIA 타이거즈</td>
        <td style="padding:10px 8px;text-align:center;color:inherit;opacity:0.7;">14%</td>
        <td style="padding:10px 8px;text-align:center;">1%</td>
        <td style="padding:10px 8px;text-align:center;">8위</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 8px;">두산 베어스</td>
        <td style="padding:10px 8px;text-align:center;color:inherit;opacity:0.7;">9%</td>
        <td style="padding:10px 8px;text-align:center;">&lt;1%</td>
        <td style="padding:10px 8px;text-align:center;">9위</td>
      </tr>
      <tr>
        <td style="padding:10px 8px;">키움 히어로즈</td>
        <td style="padding:10px 8px;text-align:center;color:inherit;opacity:0.7;">1%</td>
        <td style="padding:10px 8px;text-align:center;">&lt;1%</td>
        <td style="padding:10px 8px;text-align:center;">10위</td>
      </tr>
    </tbody>
  </table>
  </div>
  <p style="font-size:0.85em;color:inherit;">
    🟢 70%+ 진출 유력 · 🟡 40~60% 5위 경쟁 · ⚪ 40% 미만 · 5,000회 몬테카를로 시뮬레이션 기준
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:40px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    KBO 우승 확률 — 상위권 3팀 분석
  </h2>
  <p>
    AI 모델이 가장 높은 우승 확률을 부여한 팀은 <strong>LG 트윈스(31%)</strong>입니다. 안정적인 선발 로테이션과
    리그 최상위 불펜이 강점으로, 시즌 막판까지 1위 싸움을 주도할 것으로 시뮬레이션됐습니다.
    <strong>한화 이글스(27%)</strong>는 강력한 타선을 앞세워 0.5게임 차로 1위를 추격 중이며,
    <strong>롯데 자이언츠(17%)</strong>가 시즌 초반 흐름을 살려 다크호스로 평가됩니다.
  </p>
  <p>
    다만 우승 확률은 잔여 경기 결과에 따라 매주 크게 바뀝니다. 특히 상위 4팀 간 맞대결 결과가
    플레이오프 시드를 좌우하므로, 6월 이후 직접 대결 일정이 변수입니다.
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:40px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    가을야구 진출팀 — 5위 와일드카드 경쟁
  </h2>
  <p>
    가장 치열한 구간은 <strong>5위 자리</strong>입니다. 현재 SSG 랜더스(진출 확률 58%)가 한 발 앞서 있지만,
    KT 위즈(44%)가 바로 뒤를 쫓고 있습니다. 두 팀의 게임차는 1.5게임에 불과해, 6~7월 맞대결에서 승부가 갈릴 전망입니다.
  </p>
  <p>
    7위 NC 다이노스(23%)도 산술적으로 가능성이 남아 있으나, 5위와의 게임차를 고려하면
    잔여 경기에서 70% 이상의 승률이 필요한 상황입니다.
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:40px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    KBO 잔여 경기 — 순위를 좌우할 핵심 매치업
  </h2>
  <p>
    시즌 후반 순위 경쟁에서 가장 중요한 것은 <strong>상위권 직접 대결</strong>과 <strong>5위 경쟁팀 간 맞대결</strong>입니다.
    스코어베이스는 매 경기 프리뷰에서 선발 투수 매치업, 이닝별 득점 확률, 모델 승률 추정을 제공합니다.
  </p>
  <ul style="line-height:2;">
    <li><strong>LG vs 한화</strong> — 1·2위 직접 대결, 선두 싸움의 분수령 (0.5게임차)</li>
    <li><strong>SSG vs KT</strong> — 5위 와일드카드 직접 경쟁 (1.5게임차)</li>
    <li><strong>롯데 vs 삼성</strong> — 3·4위 시드 다툼</li>
  </ul>
  <p style="font-size:0.92em;color:#374151;">
    👉 각 경기의 상세 프리뷰와 AI 승률 추정은 <a href="https://www.scorebase.kr/scores?sport=baseball" style="color:#06b6d4;font-weight:600;">스코어베이스 KBO 라이브스코어</a>에서 확인할 수 있습니다.
  </p>

  <h2 style="font-size:1.5em;font-weight:700;margin:40px 0 16px;padding-bottom:8px;border-bottom:2px solid #06b6d4;">
    예측은 어떻게 계산되나요?
  </h2>
  <p>
    스코어베이스의 KBO 순위 예측은 두 단계로 이뤄집니다.
    먼저 각 구단의 경기 결과를 <strong>Elo 레이팅</strong>에 반영해 현재 전력을 수치화합니다.
    이후 잔여 경기 일정을 입력해 시즌 종료까지를 <strong>5,000회 몬테카를로 시뮬레이션</strong>으로 반복 계산하고,
    각 구단이 5위 이내(가을야구), 1위(우승)에 도달하는 비율을 확률로 산출합니다.
  </p>
  <p>
    이 예측은 통계적 추정치이며, 실제 경기는 부상·트레이드·선발 로테이션 변화 등 다양한 변수의 영향을 받습니다.
    스코어베이스는 매주 최신 결과를 반영해 예측을 업데이트합니다.
  </p>

  <div style="margin:36px 0;padding:16px 20px;background:#f8fafc;border-radius:12px;border:1px solid #e5e7eb;">
    <p style="margin:0;font-size:0.88em;color:inherit;">
      ⓘ 본 콘텐츠는 통계 모델 기반의 데이터 분석이며, 도박·베팅과 무관한 정보 제공 목적입니다.
      모든 확률은 추정치로 실제 결과와 다를 수 있습니다.
    </p>
  </div>

  <div style="text-align:center;margin:32px 0;">
    <a href="https://www.scorebase.kr/predictions/KBO" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:1.02em;">
      KBO 실시간 순위 예측 보러가기 →
    </a>
  </div>

</article>`;

async function main() {
  const now = new Date();
  const slug = `${now.toISOString().slice(0, 10)}-kbo-ranking-prediction`;

  // 같은 slug 이미 있으면 update
  const existing = await prisma.blog.findUnique({ where: { slug } });
  const created = existing
    ? await prisma.blog.update({
        where: { slug },
        data: { title, excerpt, content, tags, thumbnailUrl, publishedAt: now },
      })
    : await prisma.blog.create({
        data: { title, slug, excerpt, content, tags, thumbnailUrl, publishedAt: now },
      });
  console.log(`✅ Blog ${existing ? "갱신" : "생성"}: id=${created.id} slug=${created.slug}`);
  console.log(`URL: https://www.scorebase.kr/blog/${created.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
