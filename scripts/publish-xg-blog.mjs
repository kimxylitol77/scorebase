// xG(기대득점) 설명글 블로그 발행 — Blog upsert (slug 고유). 1회성 수동 발행.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SITE = "https://www.scorebase.kr";
const slug = "xg-expected-goals-meaning";
const title = "xG(기대득점)란 무엇인가 — 뜻·계산법·실전 활용 정리";
const excerpt =
  "축구 xG(기대득점)의 뜻과 계산 방법, 0~1 값을 읽는 법, xGA·xGD·npxG 같은 파생 지표와 운·실력을 가르는 실전 활용까지 초보자도 이해하기 쉽게 정리했습니다. 2026 월드컵 실제 경기 사례로 살펴봅니다.";
const tags = "xG,기대득점,expected goals,축구 통계,xGA,xGD,축구 분석 지표,축구 데이터";

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "xG가 높은데도 진 경기는 무슨 의미인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "xG가 상대보다 높았는데 졌다면, 좋은 슈팅 기회를 더 많이 만들고도 결정력 부족이나 상대 골키퍼의 선방, 약간의 불운으로 졌다는 뜻입니다. 한 경기로는 흔히 일어나지만, 여러 경기 누적 xG가 계속 앞서는데도 진다면 마무리 능력에 문제가 있다는 신호로 해석합니다.",
      },
    },
    {
      "@type": "Question",
      name: "xG 0.8은 어느 정도의 기회인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "과거 비슷한 위치와 상황에서 시도한 슈팅 10번 중 약 8번이 골로 연결됐다는 의미입니다. 보통 페널티킥의 xG가 0.76 안팎, 골문 정면 가까운 무방비 슈팅이 0.8 이상으로, 0.8은 거의 넣어야 하는 결정적 기회에 해당합니다.",
      },
    },
    {
      "@type": "Question",
      name: "xG와 실제 득점은 왜 다른가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "xG는 슈팅의 '평균적인 골 기댓값'이라 한 경기에서는 운과 선수의 마무리 능력에 따라 실제 득점과 벌어집니다. 표본이 쌓일수록 실제 득점은 누적 xG에 가까워지는 경향이 있어, 시즌 단위로 보면 실력의 척도로 더 신뢰할 수 있습니다.",
      },
    },
    {
      "@type": "Question",
      name: "xGA, xGD는 무엇인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "xGA(기대실점)는 상대에게 내준 슈팅의 xG 합으로 수비력을 보는 지표이고, xGD(기대득실차)는 xG에서 xGA를 뺀 값으로 팀의 전반적 경기 지배력을 나타냅니다. xGD가 꾸준히 플러스인 팀은 순위표 등수보다 실제 전력이 강한 경우가 많습니다.",
      },
    },
  ],
};

const html = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.8;font-size:17px;word-break:keep-all;">
<figure style="margin:0 0 20px;"><img src="${SITE}/blog/xg-expected-goals-zones.svg" alt="축구 페널티 박스 xG 기대득점 확률 존 — 골문에 가까울수록 높아지는 기대득점" style="width:100%;border-radius:12px;display:block;" loading="lazy" /></figure>
<p><strong>xG</strong>(기대득점, Expected Goals)는 슈팅 하나하나가 골이 될 확률을 수치로 환산한 축구 분석 지표입니다. 슈팅 횟수나 점유율만으로는 보이지 않던 '경기 내용'을 숫자로 보여주기 때문에, 오늘날 거의 모든 축구 데이터 분석의 출발점이 됩니다. 이 글에서는 xG의 뜻과 계산 방법, 값을 읽는 법부터 xGA·xGD 같은 파생 지표와 실전 활용까지 초보자도 이해하기 쉽게 정리합니다.</p>

<h2>xG(기대득점)란 무엇인가</h2>
<p>xG는 특정 위치와 상황에서 이루어진 슈팅이 골로 이어질 확률을 0에서 1 사이의 값으로 나타낸 지표입니다. 0.2라면 같은 조건의 슈팅 10번 중 평균 2번이 골이 된다는 뜻이고, 1에 가까울수록 거의 확실한 득점 기회를 의미합니다.</p>
<p>한 경기에서 팀이 시도한 모든 슈팅의 xG를 더하면 그 팀의 경기 xG가 됩니다. 예를 들어 한 팀의 경기 xG가 2.4라면 "그 정도 기회라면 평균적으로 2~3골은 기대할 수 있었다"는 의미로 읽습니다. 실제 스코어와 비교하면 그 경기의 내용과 결과가 얼마나 들어맞았는지 한눈에 보입니다.</p>
<p>슈팅 횟수는 멀리서 막 찬 슛과 골문 앞 결정적 기회를 똑같이 1로 세지만, xG는 기회의 '질'까지 반영한다는 점이 핵심입니다.</p>

<h2>xG는 어떻게 계산되나</h2>
<p>xG 모델은 과거 수십만 건의 슈팅 데이터를 학습해, 새로운 슈팅이 들어왔을 때 골이 될 확률을 추정합니다. 계산에 들어가는 주요 변수는 다음과 같습니다.</p>
<ul>
<li><strong>슈팅 위치</strong> — 골문까지의 거리. 가까울수록 xG가 높아집니다.</li>
<li><strong>슈팅 각도</strong> — 골문을 정면으로 바라보는 각도가 넓을수록 유리합니다.</li>
<li><strong>신체 부위</strong> — 발 슈팅인지 헤더인지. 헤더는 보통 xG가 낮습니다.</li>
<li><strong>상황</strong> — 정규 플레이, 역습, 세트피스, 페널티킥 등 패턴에 따라 골 확률이 다릅니다.</li>
<li><strong>수비 압박</strong> — 수비수와 골키퍼의 위치가 반영되는 모델도 있습니다.</li>
</ul>
<p>이 변수들을 종합해 "역사적으로 이런 슈팅은 몇 %가 골이 됐는가"를 계산한 값이 곧 그 슈팅의 xG입니다. 정확한 공식은 제공사마다 다르지만, 위치와 각도가 가장 큰 비중을 차지한다는 점은 공통적입니다.</p>

<h2>xG 값을 읽는 법</h2>
<p>대표적인 슈팅 상황별 xG를 정리하면 다음과 같습니다. 절대적인 수치는 모델마다 조금씩 다르지만, 대략적인 감을 잡기에는 충분합니다.</p>
<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;margin:16px 0;">
<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">슈팅 상황</th><th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">대략적 xG</th></tr></thead>
<tbody>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">페널티킥</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 0.76</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">골문 정면 6m 무방비 슈팅</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">0.7 ~ 0.9</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">박스 안 일반적인 슈팅</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">0.1 ~ 0.3</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">박스 밖 중거리 슈팅</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">0.02 ~ 0.06</td></tr>
<tr><td style="padding:8px;">예각에서의 헤더</td><td style="text-align:right;padding:8px;">0.05 미만</td></tr>
</tbody>
</table></div>
<p>중거리 슛이 멋지게 들어가면 환호하지만, xG로 보면 0.03짜리 '운 좋은 한 방'인 경우가 많습니다. 반대로 0.8을 놓치면 그 경기의 흐름이 크게 바뀌는 결정적 실수가 됩니다.</p>

<h2>xG로 무엇을 알 수 있나 — 운과 실력</h2>
<p>xG의 진짜 쓸모는 실제 득점과 비교할 때 드러납니다. 실제 득점에서 xG를 뺀 값(G − xG)으로 그 경기가 '운이 좋았는지, 억울했는지'를 가늠할 수 있습니다.</p>
<ul>
<li><strong>실제 득점 &gt; xG</strong> — 기대보다 많이 넣은 경기. 마무리가 빛났거나 운이 따랐습니다.</li>
<li><strong>실제 득점 &lt; xG</strong> — 좋은 기회를 살리지 못한 경기. "이겼어야 할 경기를 비기거나 졌다"는 평가가 여기서 나옵니다.</li>
</ul>
<p>한 경기로는 편차가 크지만, 여러 경기를 누적하면 실제 득점은 xG에 수렴하는 경향이 있습니다. 그래서 시즌 단위로 보면 xG는 순위표보다 팀의 실제 전력을 더 정확히 보여주기도 합니다. 초반에 결과는 좋은데 xG가 따라오지 않는 팀은 이후 순위가 내려갈 가능성을 의심해 볼 수 있습니다.</p>

<figure style="margin:24px 0;"><img src="${SITE}/blog/xg-expected-goals-shotmap.svg" alt="xG 슛맵 — 슈팅 위치별 기대득점을 점 크기와 색으로 표현한 시각화" style="width:100%;border-radius:12px;display:block;" loading="lazy" /><figcaption style="text-align:center;font-size:14px;color:#888;margin-top:8px;">슛맵 — 점이 클수록 기대득점(xG)이 높은 위치</figcaption></figure>

<h2>xGA·xGD·npxG — 함께 보면 좋은 파생 지표</h2>
<p>xG에서 한 걸음 더 들어가면 수비와 전체 경기 지배력까지 읽을 수 있는 지표들이 있습니다.</p>
<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;margin:16px 0;">
<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">지표</th><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">의미</th></tr></thead>
<tbody>
<tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>xGA</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">기대실점. 상대에게 내준 슈팅의 xG 합으로 수비력을 봅니다.</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>xGD</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">기대득실차(xG − xGA). 팀의 전반적 경기 지배력을 나타냅니다.</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>npxG</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">페널티킥을 제외한 xG. PK 의존도를 걷어내고 필드 플레이만 평가합니다.</td></tr>
<tr><td style="padding:8px;"><strong>xG per shot</strong></td><td style="padding:8px;">슈팅당 평균 xG. 기회의 질, 즉 좋은 위치에서 쏘는지를 봅니다.</td></tr>
</tbody>
</table></div>
<p>예컨대 xGD가 꾸준히 플러스인 팀은 등수가 낮아도 실제 전력이 탄탄하다는 신호이고, npxG가 높은 선수는 페널티킥 없이도 양질의 기회를 스스로 만들어내는 공격수로 평가할 수 있습니다.</p>

<h2>실제 사례 — 2026 월드컵 경기로 본 xG</h2>
<p>숫자만으로는 와닿지 않으니 실제 경기로 살펴봅니다. 스코어베이스는 2026 북중미 월드컵 전 경기의 xG와 실제 결과를 함께 추적합니다.</p>
<p>예를 들어 한 팀이 경기 xG 2.5를 기록하고도 상대의 xG 0.9에 1골을 내주며 비겼다면, 내용으로는 충분히 이길 만한 경기를 결정력 부족으로 놓쳤다고 읽을 수 있습니다. 반대로 xG가 낮은 팀이 역습 한두 번을 살려 이겼다면 '효율적인 승리' 혹은 '운이 따른 승리'로 해석합니다.</p>
<p>이렇게 경기마다 xG와 실제 스코어의 차이를 따라가면 이변의 조짐과 팀의 진짜 폼이 보입니다. 경기별 기대득점과 실제 결과 비교는 <a href="${SITE}/world-cup/xg" target="_blank" rel="noopener">월드컵 xG 트래커</a>에서 한눈에 확인할 수 있고, 이 데이터는 <a href="${SITE}/predictions/WORLD_CUP" target="_blank" rel="noopener">월드컵 AI 승부 예측</a>에도 반영됩니다.</p>

<h2>xG의 한계 — 맹신하면 안 되는 이유</h2>
<p>xG는 강력한 지표지만 만능은 아닙니다. 다음 한계를 알고 보아야 합니다.</p>
<ul>
<li><strong>슈팅 이후는 반영하지 않음</strong> — 슈팅의 코스나 골키퍼의 실제 위치 같은 '슛 다음 순간'은 기본 xG에 들어가지 않습니다.</li>
<li><strong>모델마다 값이 다름</strong> — 같은 슈팅도 제공사에 따라 xG가 조금씩 달라, 절대 수치보다 추세와 비교가 중요합니다.</li>
<li><strong>표본이 적으면 불안정</strong> — 단판이나 몇 경기로 단정하면 운에 휘둘립니다. 누적해서 보아야 합니다.</li>
</ul>
<p>그래서 xG는 점유율·슈팅 수·실제 스코어와 함께 볼 때 가장 정확합니다. 하나의 숫자로 결론을 내리기보다 경기 내용을 입체적으로 읽는 도구로 쓰는 것이 좋습니다.</p>

<h2>xG는 어디서 확인하나</h2>
<p>xG의 정의와 모델은 <a href="https://en.wikipedia.org/wiki/Expected_goals" target="_blank" rel="noopener nofollow">위키피디아 Expected goals 문서</a>에 자세히 정리돼 있고, 해외에서는 FBref·Understat 같은 데이터 사이트가 경기별 xG를 제공합니다. 한국어로 경기별 xG와 실제 결과를 함께 보고 싶다면, 스코어베이스의 <a href="${SITE}/world-cup/xg" target="_blank" rel="noopener">xG 트래커</a>와 <a href="${SITE}/world-cup" target="_blank" rel="noopener">월드컵 데이터 센터</a>에서 라이브로 확인할 수 있습니다. 빅5 리그 경기 상세 페이지에서도 매치 단위 xG를 제공합니다.</p>

<h2>자주 묻는 질문</h2>
<p><strong>Q. xG가 높은데도 진 경기는 무슨 의미인가요?</strong><br>좋은 기회를 더 많이 만들고도 결정력 부족이나 상대 골키퍼의 선방, 약간의 불운으로 졌다는 뜻입니다. 한 경기로는 흔하지만, 누적 xG가 계속 앞서는데도 진다면 마무리 능력의 문제로 봅니다.</p>
<p><strong>Q. xG 0.8은 어느 정도의 기회인가요?</strong><br>비슷한 상황의 슈팅 10번 중 약 8번이 골이 됐다는 의미로, 거의 넣어야 하는 결정적 기회에 해당합니다. 페널티킥이 약 0.76 안팎입니다.</p>
<p><strong>Q. xG와 실제 득점은 왜 다른가요?</strong><br>xG는 평균적인 골 기댓값이라 한 경기에서는 운과 마무리 능력에 따라 실제 득점과 벌어집니다. 표본이 쌓일수록 둘은 가까워집니다.</p>
<p><strong>Q. xGA, xGD는 무엇인가요?</strong><br>xGA는 기대실점으로 수비력을, xGD는 기대득실차(xG − xGA)로 경기 지배력을 봅니다. xGD가 꾸준히 플러스면 등수보다 전력이 강한 팀입니다.</p>

<script type="application/ld+json">${JSON.stringify(faq)}</script>
</article>`;

if (process.argv.includes("--dry")) {
  const plain = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  console.log("slug:", slug);
  console.log("title:", title, `(${title.length}자)`);
  console.log("excerpt:", excerpt.length, "자");
  console.log("본문 글자수(태그 제외, 공백포함):", plain.length);
  console.log("h2 개수:", (html.match(/<h2>/g) || []).length);
  console.log("내부링크:", (html.match(/scorebase\.kr/g) || []).length, "· 외부링크 fbref:", html.includes("fbref.com"));
  console.log("FAQPage:", html.includes('"@type":"FAQPage"'));
  process.exit(0);
}

const post = await prisma.blog.upsert({
  where: { slug },
  update: { title, excerpt, tags, content: html, thumbnailUrl: `${SITE}/blog/xg-expected-goals-zones.svg` },
  create: { slug, title, excerpt, tags, content: html, thumbnailUrl: `${SITE}/blog/xg-expected-goals-zones.svg` },
});
console.log("발행 완료:", `${SITE}/blog/${post.slug}`, "(id", post.id + ")");
await prisma.$disconnect();
