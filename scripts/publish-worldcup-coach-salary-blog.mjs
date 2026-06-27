// 2026 월드컵 감독 연봉 랭킹 블로그 발행 — Blog upsert (slug 고유). 1회성 수동 발행.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SITE = "https://www.scorebase.kr";
const slug = "worldcup-manager-salary-ranking-2026";
const title = "2026 월드컵 감독 연봉 순위 — 안첼로티 167억 1위, 홍명보는?";
const excerpt =
  "2026 북중미 월드컵 참가국 감독 연봉 순위를 정리했습니다. 1위 브라질 안첼로티(약 167억원)부터 투헬·포체티노·나겔스만, 그리고 한국 홍명보 감독의 연봉·순위와 일본 모리야스 감독과의 비교까지 표와 그래프로 한눈에 살펴봅니다.";
const tags =
  "월드컵 감독 연봉,월드컵 감독 연봉 순위,2026 월드컵 감독,안첼로티 연봉,홍명보 연봉,투헬 연봉,포체티노 연봉,나겔스만 연봉,국가대표 감독 연봉,월드컵 감독 연봉 1위";

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "2026 월드컵 감독 연봉 1위는 누구인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "브라질 대표팀을 맡은 카를로 안첼로티 감독으로, 연 약 167억원(약 830만 파운드)으로 추정됩니다. 레알 마드리드 등에서 챔피언스리그를 여러 차례 제패한 이력에 걸맞은 액수로, 2위 잉글랜드 투헬 감독(약 102억원)과도 큰 차이를 보입니다.",
      },
    },
    {
      "@type": "Question",
      name: "홍명보 감독의 월드컵 연봉 순위는 어느 정도인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "홍명보 감독의 연봉은 약 37억원으로 추정되며, 48개 참가국 사령탑 가운데 대략 16~21위권으로 보도됩니다(집계 기준에 따라 순위는 달라집니다). 일본 모리야스 감독(약 16억원)의 두 배 수준이고, 스페인·벨기에 감독보다 높다는 추정도 있습니다.",
      },
    },
    {
      "@type": "Question",
      name: "월드컵 감독 연봉은 누가 지급하나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "각국 축구협회가 지급하며, 재원은 FIFA 분배금, 중계권료, 스폰서 수익 등에서 나옵니다. 따라서 시장 규모가 크고 후원이 많은 협회일수록 거물 감독에게 높은 연봉을 제시할 여력이 큽니다.",
      },
    },
    {
      "@type": "Question",
      name: "연봉이 높은 감독의 팀이 우승하나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "반드시 그렇지는 않습니다. 연봉은 감독의 명성과 협회의 투자 의지를 보여주지만, 단기 토너먼트인 월드컵은 선수 구성과 컨디션, 대진운의 영향이 큽니다. 실제로 과거 대회에서 최고 연봉 감독이 우승하지 못한 사례가 많습니다.",
      },
    },
  ],
};

const html = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.8;font-size:17px;word-break:keep-all;">
<figure style="margin:0 0 20px;"><img src="${SITE}/blog/worldcup-manager-salary-ranking-hero.svg" alt="2026 월드컵 감독 연봉 순위 포디움 — 1위 브라질 안첼로티 약 167억, 2위 잉글랜드 투헬, 3위 미국 포체티노" style="width:100%;border-radius:12px;display:block;" loading="lazy" /></figure>
<p>2026 북중미 월드컵에는 48개국이 출전하고, 그만큼 다양한 감독들이 벤치에 앉습니다. 그중에는 클럽 무대에서 최고의 자리를 경험한 명장들도 적지 않은데, 이들의 <strong>월드컵 감독 연봉</strong>은 협회의 투자 의지를 그대로 보여줍니다. 이 글에서는 2026 월드컵 참가국 감독 연봉 순위를 표와 그래프로 정리하고, 한국 홍명보 감독의 위치까지 함께 살펴봅니다.</p>

<h2>2026 월드컵 감독 연봉 순위 한눈에</h2>
<p>아래는 보도된 추정치를 기준으로 한 고연봉 감독 상위 10명입니다. 원화는 영국 파운드 보도액을 1파운드 약 2,000원으로 환산한 값이며, 모두 추정치라는 점을 감안해야 합니다.</p>
<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:16px;">
<thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">순위</th><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">감독</th><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">국가</th><th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">연봉(추정)</th></tr></thead>
<tbody>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">1</td><td style="padding:8px;border-bottom:1px solid #eee;">카를로 안첼로티</td><td style="padding:8px;border-bottom:1px solid #eee;">브라질</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 167억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">2</td><td style="padding:8px;border-bottom:1px solid #eee;">토마스 투헬</td><td style="padding:8px;border-bottom:1px solid #eee;">잉글랜드</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 102억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">3</td><td style="padding:8px;border-bottom:1px solid #eee;">마우리시오 포체티노</td><td style="padding:8px;border-bottom:1px solid #eee;">미국</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 91억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">4</td><td style="padding:8px;border-bottom:1px solid #eee;">율리안 나겔스만</td><td style="padding:8px;border-bottom:1px solid #eee;">독일</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 84억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">5</td><td style="padding:8px;border-bottom:1px solid #eee;">파비오 칸나바로</td><td style="padding:8px;border-bottom:1px solid #eee;">우즈베키스탄</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 70억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">6</td><td style="padding:8px;border-bottom:1px solid #eee;">로베르토 마르티네스</td><td style="padding:8px;border-bottom:1px solid #eee;">포르투갈</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 70억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">7</td><td style="padding:8px;border-bottom:1px solid #eee;">디디에 데샴</td><td style="padding:8px;border-bottom:1px solid #eee;">프랑스</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 66억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">8</td><td style="padding:8px;border-bottom:1px solid #eee;">리오넬 스칼로니</td><td style="padding:8px;border-bottom:1px solid #eee;">아르헨티나</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 52억원</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;">9</td><td style="padding:8px;border-bottom:1px solid #eee;">마르셀로 비엘사</td><td style="padding:8px;border-bottom:1px solid #eee;">우루과이</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">약 52억원</td></tr>
<tr><td style="padding:8px;">10</td><td style="padding:8px;">로날트 쿠만</td><td style="padding:8px;">네덜란드</td><td style="text-align:right;padding:8px;">약 52억원</td></tr>
</tbody>
</table></div>
<p>1위 안첼로티 감독과 10위권의 격차는 세 배가 넘습니다. 상위권에는 챔피언스리그와 빅리그 우승을 경험한 클럽 명장들이 대거 포진해, 이번 대회가 '감독 명성' 면에서도 역대급이라는 평가가 나옵니다.</p>

<h2>1위 안첼로티 — 브라질이 베팅한 167억</h2>
<p>월드컵 감독 연봉 1위는 브라질을 이끄는 카를로 안첼로티 감독입니다. 연 약 167억원으로 추정되며, 2위와도 60억원 이상 벌어지는 독보적 1위입니다. 레알 마드리드에서만 챔피언스리그를 여러 차례 들어 올린 그의 경력을 고려하면 놀라운 액수는 아닙니다.</p>
<p>브라질 축구협회가 이만한 연봉을 감수한 배경에는 '월드컵 우승 가뭄'이 있습니다. 2002년 이후 정상에 오르지 못한 브라질은, 검증된 명장에게 거액을 투자해 6번째 별을 노립니다. 안첼로티의 합류로 브라질은 우승 후보 평가에서도 상위권을 유지하고 있습니다.</p>
<p>이처럼 거물 감독 선임은 단순한 인건비를 넘어, 협회의 성적 목표와 자존심이 걸린 '베팅'에 가깝습니다.</p>

<h2>2~4위 투헬·포체티노·나겔스만 — 빅클럽 명장의 대표팀행</h2>
<p>2위는 잉글랜드의 토마스 투헬 감독으로 약 102억원입니다. 첼시에서 챔피언스리그를 우승하고 바이에른 뮌헨까지 지휘한 그는, '준우승만 반복하던' 잉글랜드의 마지막 퍼즐로 영입됐습니다.</p>
<p>3위는 미국의 마우리시오 포체티노 감독(약 91억원)입니다. 토트넘 시절 손흥민을 키운 지도자로 한국 팬에게도 익숙하며, 개최국 미국의 흥행과 성적을 동시에 책임지는 자리입니다. 4위 독일의 율리안 나겔스만 감독(약 84억원)은 30대의 젊은 명장으로, 자국 개최 유로 이후 독일의 부활을 이어가고 있습니다.</p>
<p>이들 모두 클럽 무대에서 검증된 뒤 대표팀으로 자리를 옮긴 공통점이 있습니다. 빅클럽 감독직이 점점 단명하는 흐름 속에서, 안정적인 대표팀 사령탑이 매력적인 선택지가 되고 있다는 분석도 나옵니다.</p>

<figure style="margin:24px 0;"><img src="${SITE}/blog/worldcup-manager-salary-chart.svg" alt="2026 월드컵 감독 연봉 TOP 8 막대그래프 — 안첼로티 166억부터 홍명보 37억까지 비교" style="width:100%;border-radius:12px;display:block;" loading="lazy" /><figcaption style="text-align:center;font-size:14px;color:#888;margin-top:8px;">월드컵 감독 연봉 상위권과 홍명보 감독(빨간 막대) 비교 — 단위 억원(추정)</figcaption></figure>

<h2>홍명보 감독은 몇 위? — 한국 사령탑 연봉</h2>
<p>한국 대표팀을 이끄는 홍명보 감독의 연봉은 약 37억원으로 추정됩니다. 48개 참가국 가운데 대략 16~21위권으로 보도되는데, 집계 기준과 보도 시점에 따라 순위는 달라집니다. 상위 10위권과는 거리가 있지만, 전체 참가국 평균보다는 위에 있는 중상위권입니다.</p>
<p>눈에 띄는 점은 아시아 라이벌과의 비교입니다. 일본 모리야스 하지메 감독의 연봉은 약 16억원으로, 홍명보 감독이 두 배가량 높다는 추정이 나옵니다. 보도에 따라서는 스페인 데라푸엔테, 벨기에 감독보다도 높은 수준으로 분류되기도 합니다.</p>
<p>한국 대표팀의 일정과 최근 폼, 조 편성은 <a href="${SITE}/national-teams" target="_blank" rel="noopener">국가대표팀 페이지</a>에서, 월드컵 전체 판도는 <a href="${SITE}/world-cup" target="_blank" rel="noopener">월드컵 데이터 센터</a>에서 확인할 수 있습니다.</p>

<h2>감독 연봉은 누가, 어떻게 정하나</h2>
<p>국가대표 감독의 연봉은 각국 축구협회가 지급합니다. 재원은 FIFA 분배금과 중계권료, 스폰서 수익이 핵심이라, 시장 규모가 크고 후원이 많은 협회일수록 거물 감독에게 높은 금액을 제시할 수 있습니다. 잉글랜드·독일·미국·브라질이 상위를 차지하는 것도 이런 배경입니다.</p>
<p>또한 협회는 감독 개인의 연봉 외에 코칭스태프 비용, 성과급(월드컵 단계별 보너스)까지 함께 부담합니다. 그래서 같은 감독이라도 보도되는 액수가 기관마다 다른데, 순수 기본급만 집계했는지 보너스·스태프를 포함했는지에 따라 차이가 납니다.</p>
<p>이 글의 수치는 협회의 공식 공시가 아니라 언론 보도·시장 추정치라는 점을 분명히 해 둡니다.</p>

<h2>연봉이 높으면 성적도 좋을까</h2>
<p>높은 연봉은 감독의 명성과 협회의 기대치를 보여주지만, 성적을 보장하지는 않습니다. 월드컵은 한 달 남짓의 단기 토너먼트라 선수단 구성과 컨디션, 대진운이 큰 변수로 작용하기 때문입니다.</p>
<p>실제로 역대 대회를 보면 최고 연봉 감독이 우승까지 간 사례는 의외로 드뭅니다. 반대로 상대적으로 저연봉 감독이 조직력과 전술로 이변을 만든 경우가 적지 않습니다. 연봉은 '출발선의 기대치'일 뿐, 결승선의 결과와는 별개로 보는 것이 합리적입니다.</p>
<p>각 팀의 전력과 우승 확률을 데이터로 비교하고 싶다면, 5,000회 몬테카를로 시뮬레이션 기반의 <a href="${SITE}/predictions/WORLD_CUP" target="_blank" rel="noopener">월드컵 AI 우승 확률·승부 예측</a>을 참고할 수 있습니다.</p>

<h2>연봉 수치, 이렇게 읽어야 합니다</h2>
<p>마지막으로 주의할 점을 정리합니다. 감독 연봉은 협회가 공식 발표하는 경우가 드물어, 대부분 언론과 시장 관계자의 추정에 기댑니다. 따라서 같은 감독도 출처마다 금액과 순위가 조금씩 다릅니다.</p>
<p>이 글의 원화 환산은 파운드 보도액을 1파운드 약 2,000원으로 단순 환산한 값이라, 환율과 시점에 따라 변동할 수 있습니다. 순위 역시 상위권은 대체로 일치하지만, 중하위권은 집계마다 차이가 큽니다. 절대 금액보다 '상대적 격차'와 '협회의 투자 규모'를 읽는 용도로 활용하는 것이 좋습니다.</p>
<p>해외 매체의 상세 집계는 <a href="https://www.givemesport.com/highest-paid-managers-2026-world-cup-football-soccer/" target="_blank" rel="noopener nofollow">GiveMeSport의 2026 월드컵 감독 연봉 정리</a>에서도 확인할 수 있습니다.</p>

<h2>자주 묻는 질문</h2>
<p><strong>Q. 2026 월드컵 감독 연봉 1위는 누구인가요?</strong><br>브라질을 맡은 카를로 안첼로티 감독으로 연 약 167억원으로 추정됩니다. 2위 잉글랜드 투헬 감독(약 102억원)과도 큰 차이를 보입니다.</p>
<p><strong>Q. 홍명보 감독의 월드컵 연봉 순위는 어느 정도인가요?</strong><br>약 37억원으로 추정되며 48개국 중 대략 16~21위권으로 보도됩니다. 일본 모리야스 감독(약 16억원)의 두 배 수준입니다.</p>
<p><strong>Q. 월드컵 감독 연봉은 누가 지급하나요?</strong><br>각국 축구협회가 FIFA 분배금·중계권료·스폰서 수익을 재원으로 지급합니다. 시장이 큰 협회일수록 높은 연봉을 제시할 여력이 큽니다.</p>
<p><strong>Q. 연봉이 높은 감독의 팀이 우승하나요?</strong><br>반드시 그렇지는 않습니다. 단기 토너먼트인 월드컵은 선수 구성·컨디션·대진운의 영향이 커, 최고 연봉 감독이 우승하지 못한 사례가 많습니다.</p>

<script type="application/ld+json">${JSON.stringify(faq)}</script>
</article>`;

if (process.argv.includes("--dry")) {
  const plain = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  console.log("slug:", slug);
  console.log("title:", title, `(${title.length}자)`);
  console.log("excerpt:", excerpt.length, "자");
  console.log("본문 글자수(태그 제외, 공백포함):", plain.length);
  console.log("h2 개수:", (html.match(/<h2>/g) || []).length);
  console.log("표 개수:", (html.match(/<table/g) || []).length, "· 이미지:", (html.match(/<img/g) || []).length);
  console.log("내부링크:", (html.match(/scorebase\.kr\/(world-cup|national-teams|predictions)/g) || []).length, "· 외부링크 givemesport:", html.includes("givemesport.com"));
  console.log("FAQPage:", html.includes('"@type":"FAQPage"'), "· FAQ Q개수:", (html.match(/<strong>Q\./g) || []).length);
  console.log("CJK 볼드버그 의심(**):", (html.match(/\*\*/g) || []).length);
  process.exit(0);
}

const post = await prisma.blog.upsert({
  where: { slug },
  update: { title, excerpt, tags, content: html, thumbnailUrl: `${SITE}/blog/worldcup-manager-salary-ranking-hero.svg` },
  create: { slug, title, excerpt, tags, content: html, thumbnailUrl: `${SITE}/blog/worldcup-manager-salary-ranking-hero.svg` },
});
console.log("발행 완료:", `${SITE}/blog/${post.slug}`, "(id", post.id + ")");
await prisma.$disconnect();
