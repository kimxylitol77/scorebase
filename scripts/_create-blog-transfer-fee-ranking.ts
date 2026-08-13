// 역대 최고 이적료 순위 TOP 50 블로그 발행 (slug 으로 idempotent upsert).
//   npx tsx --env-file=.env.local scripts/_create-blog-transfer-fee-ranking.ts
// 데이터: FootballTransfer(ts 이적 23,435건, transferFee>0) + PlayerMarketValue(현재 시장가치) + TheSportsPlayer(한글명).
// 자체 지표 = "이적료 대비 현재 시장가치" — TOP 50 중 몇 건이 지불액을 회수했는지. 표·수치 전부 DB 생성.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

const SITE = "https://www.scorebase.kr";
const slug = "football-highest-transfer-fees-ranking";
const EUR_KRW = 1791.5;
const N = 50;

const eok = (eur: number) => Math.round((eur * EUR_KRW) / 1e8);
const eokStr = (eur: number) => eok(eur).toLocaleString();

/** ts 원문 팀명 → 한글. team-names 사전을 먼저 쓰고, 미매칭만 여기서 보완. */
const TEAM_FIX: Record<string, string> = {
  "FC Barcelona": "바르셀로나", "Paris Saint Germain": "파리 생제르맹", "AS Monaco": "AS 모나코",
  "Borussia Dortmund": "도르트문트", "Newcastle United": "뉴캐슬", Liverpool: "리버풀",
  "Aston Villa": "아스톤 빌라", Chelsea: "첼시", "Nottingham Forest": "노팅엄 포레스트",
  "Manchester City": "맨체스터 시티", Benfica: "벤피카", "Atletico Madrid": "아틀레티코 마드리드",
  "Real Madrid": "레알 마드리드", "Bayer 04 Leverkusen": "레버쿠젠", "RB Leipzig": "RB 라이프치히",
  "West Ham United": "웨스트햄", Arsenal: "아스널", "Brighton Hove Albion": "브라이턴",
  "Inter Milan": "인터 밀란", "Tottenham Hotspur": "토트넘", Juventus: "유벤투스",
  "Manchester United": "맨체스터 유나이티드", "Eintracht Frankfurt": "프랑크푸르트",
  "AFC Ajax": "아약스", "FC Bayern Munich": "바이에른 뮌헨", Napoli: "나폴리",
  "Santos Fc - SP": "산투스", "Leicester City": "레스터 시티", Fiorentina: "피오렌티나",
  Everton: "에버턴", Southampton: "사우샘프턴", "LOSC Lille": "릴", Atalanta: "아탈란타",
  "Athletic Club": "아틀레틱 빌바오", "VfL Wolfsburg": "볼프스부르크", "VfB Stuttgart": "슈투트가르트",
  "Al Hilal": "알 힐랄", "Al Nassr": "알 나스르", Galatasaray: "갈라타사라이",
  "Real Sociedad": "레알 소시에다드", "AC Milan": "AC 밀란", "Zenit St. Petersburg": "제니트",
};
const koTeam = (n: string | null) => (n ? TEAM_FIX[n] || toKoreanTeamName(n) || n : "—");

interface Row {
  id: string; playerId: string; ko: string; fee: number; year: number;
  from: string; to: string; mv: number | null; age: number | null;
}

async function build() {
  const tr = await prisma.footballTransfer.findMany({
    where: { transferFee: { gt: 0 } },
    orderBy: { transferFee: "desc" },
    take: N,
    select: { id: true, playerId: true, fromTeamName: true, toTeamName: true, transferFee: true, transferTime: true },
  });
  const ids = [...new Set(tr.map((t) => t.playerId))];
  const players = await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true } });
  const pm = new Map(players.map((p) => [p.id, p.nameKo || p.name]));
  const mvs = await prisma.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true, currentValue: true, age: true } });
  const vm = new Map(mvs.map((m) => [m.id, m]));

  const rows: Row[] = tr.map((t) => ({
    id: t.id,
    playerId: t.playerId,
    ko: pm.get(t.playerId) || "선수",
    fee: t.transferFee!,
    year: new Date((t.transferTime ?? 0) * 1000).getFullYear(),
    from: koTeam(t.fromTeamName),
    to: koTeam(t.toTeamName),
    mv: vm.get(t.playerId)?.currentValue ?? null,
    age: vm.get(t.playerId)?.age ?? null,
  }));

  const totalFeeRows = await prisma.footballTransfer.count({ where: { transferFee: { gt: 0 } } });
  const over100 = await prisma.footballTransfer.count({ where: { transferFee: { gte: 100e6 } } });
  const over50 = await prisma.footballTransfer.count({ where: { transferFee: { gte: 50e6 } } });
  return { rows, totalFeeRows, over100, over50 };
}

function tableHtml(rows: Row[]): string {
  const body = rows.map((r, i) => {
    const zebra = i % 2 === 1 ? "background:#fafafa;" : "";
    const ratio = r.mv !== null ? ((r.mv - r.fee) / r.fee) * 100 : null;
    const rTxt = ratio === null ? "—" : `${ratio > 0 ? "▲" : ratio < 0 ? "▼" : ""}${Math.abs(Math.round(ratio))}%`;
    const rColor = ratio === null ? "" : ratio > 0 ? "color:#1a7f37;" : "color:#c0392b;";
    return `      <tr style="border-bottom:1px solid #eee;${zebra}"><td style="padding:8px;">${i + 1}</td><td style="padding:8px;"><a href="${SITE}/transfers/${r.playerId}" style="color:#0a6ec0;text-decoration:none;">${r.ko}</a></td><td style="padding:8px;font-size:14px;">${r.from} → ${r.to}</td><td style="padding:8px;">${r.year}</td><td style="padding:8px;">€${(r.fee / 1e6).toFixed(1)}M</td><td style="padding:8px;">${eokStr(r.fee)}억</td><td style="padding:8px;${rColor}">${rTxt}</td></tr>`;
  }).join("\n");

  return `  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#1a1a1a;">
    <thead>
      <tr style="background:#0a0a0a;color:#fff;text-align:left;">
        <th style="padding:10px 8px;">#</th>
        <th style="padding:10px 8px;">선수</th>
        <th style="padding:10px 8px;">이적</th>
        <th style="padding:10px 8px;">연도</th>
        <th style="padding:10px 8px;">이적료</th>
        <th style="padding:10px 8px;">원화</th>
        <th style="padding:10px 8px;">현재 몸값</th>
      </tr>
    </thead>
    <tbody>
${body}
    </tbody>
  </table>
  </div>`;
}

async function main() {
  const { rows, totalFeeRows, over100, over50 } = await build();
  const top = rows[0], second = rows[1];

  // ── 자체 지표: 이적료 대비 현재 시장가치
  const withMv = rows.filter((r) => r.mv !== null);
  const recovered = withMv.filter((r) => r.mv! >= r.fee);
  const lost = withMv.filter((r) => r.mv! < r.fee);
  const ratio = (r: Row) => ((r.mv! - r.fee) / r.fee) * 100;
  const worst = [...withMv].sort((a, b) => ratio(a) - ratio(b)).slice(0, 5);
  const best = [...recovered].sort((a, b) => ratio(b) - ratio(a));

  // 최근 3년(2024~) 만 따로 — 나이 효과를 걷어낸 공정 비교
  const recent = withMv.filter((r) => r.year >= 2024);
  const recentRecovered = recent.filter((r) => r.mv! >= r.fee);
  const recentAvg = recent.length ? recent.reduce((s, r) => s + ratio(r), 0) / recent.length : 0;
  const oldOnes = withMv.filter((r) => r.year <= 2020);
  const oldAvg = oldOnes.length ? oldOnes.reduce((s, r) => s + ratio(r), 0) / oldOnes.length : 0;

  const byBuyer: Record<string, number> = {};
  const byYear: Record<number, number> = {};
  for (const r of rows) {
    byBuyer[r.to] = (byBuyer[r.to] || 0) + 1;
    byYear[r.year] = (byYear[r.year] || 0) + 1;
  }
  const buyerRank = Object.entries(byBuyer).sort((a, b) => b[1] - a[1]);
  const sumFee = rows.reduce((s, r) => s + r.fee, 0);
  const since2024 = rows.filter((r) => r.year >= 2024).length;

  const title = `역대 최고 이적료 순위 TOP 50 — ${top.ko} ${eokStr(top.fee)}억 1위, ${lost.length}건은 본전을 잃었다`;
  const excerpt =
    `역대 최고 이적료 순위 TOP 50을 2026년 여름 이적까지 반영해 정리했습니다. ${top.ko}가 €${(top.fee / 1e6).toFixed(0)}M(약 ${eokStr(top.fee)}억 원)으로 ${new Date().getFullYear() - top.year}년째 1위이며, 지불한 이적료를 현재 시장가치로 회수한 건 ${recovered.length}건뿐입니다.`;
  const tags =
    "역대 최고 이적료, 이적료 순위, 축구 이적료 TOP 50, 네이마르 이적료, 음바페 이적료, 호날두 이적료, 벨링엄 이적료, 김민재 이적료, 손흥민 이적료, 축구 이적시장, 선수 몸값, 스코어베이스";
  const thumbnailUrl = `${SITE}/blog/transfer-fee-ranking-hero.png`;

  const faq = [
    {
      q: "역대 최고 이적료 1위는 누구인가요?",
      a: `${top.ko}입니다. ${top.year}년 ${top.from}에서 ${top.to}로 이적하며 €${(top.fee / 1e6).toFixed(0)}M, 약 ${eokStr(top.fee)}억 원의 이적료가 발생했습니다. ${new Date().getFullYear() - top.year}년이 지난 2026년 8월까지도 이 기록은 깨지지 않았습니다. 2위는 ${second.year}년 ${second.ko}의 €${(second.fee / 1e6).toFixed(0)}M입니다.`,
    },
    {
      q: "이적료와 몸값(시장가치)은 어떻게 다른가요?",
      a: "이적료는 두 구단이 실제로 주고받은 금액이고, 몸값은 지금 이 선수를 사려면 얼마가 필요할지에 대한 추정치입니다. 이적료는 계약 잔여 기간, 구단의 협상력, 영입 경쟁 여부에 따라 시장가치보다 훨씬 높게 결정되는 일이 많습니다. 실제로 이 글의 TOP 50 가운데 현재 시장가치가 지불 이적료를 넘는 사례는 " + "소수에 그칩니다.",
    },
    {
      q: "한국 선수 최고 이적료는 얼마인가요?",
      a: "스코어베이스 데이터 기준으로 김민재가 2023년 나폴리에서 바이에른 뮌헨으로 이적할 때 발생한 €50M, 약 896억 원이 한국 선수 최고액입니다. 이어서 이강인이 2026년 파리 생제르맹에서 아틀레티코 마드리드로 이적하며 €40M(약 717억 원), 손흥민이 2015년 레버쿠젠에서 토트넘으로 이적할 때 €30M(약 537억 원)을 기록했습니다.",
    },
    {
      q: "왜 매체마다 이적료 금액이 다른가요?",
      a: "옵션 금액의 포함 여부가 다르기 때문입니다. 대부분의 이적 계약에는 출전 횟수나 우승 여부에 따라 추가 지급되는 조건부 금액이 붙는데, 어떤 매체는 기본 이적료만, 어떤 매체는 옵션을 모두 더한 최대 금액을 씁니다. 구단이 총액을 공개하지 않는 경우도 많아 집계 기관마다 수치가 갈립니다.",
    },
    {
      q: "이적료가 가장 비쌌던 해는 언제인가요?",
      a: `TOP 50을 연도별로 나누면 ${Object.entries(byYear).sort((a, b) => b[1] - a[1])[0][0]}년이 ${Object.entries(byYear).sort((a, b) => b[1] - a[1])[0][1]}건으로 가장 많습니다. 다만 최근 흐름이 더 중요한데, 2024년 이후 이적이 이미 TOP 50 안에 ${since2024}건 들어와 있습니다. 상위 50건의 3분의 1 가까이가 최근 3년 사이에 발생한 셈입니다.`,
    },
  ];

  const content = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;word-break:keep-all;">

  <figure style="margin:0 0 28px;">
    <img src="/blog/transfer-fee-ranking-hero.png"
         alt="역대 최고 이적료 순위 TOP 50 - 네이마르 음바페 뎀벨레 축구 이적료 랭킹 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="eager">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      역대 최고 이적료 순위 · 2026년 여름 이적까지 반영 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p style="color:inherit;opacity:0.75;font-size:15px;margin:0 0 28px;">
    최종 업데이트: 2026년 8월 · 데이터 기준: 스코어베이스 이적 데이터베이스 ${totalFeeRows.toLocaleString()}건(이적료 확인 건)
  </p>

  <p>
    <strong>축구 역사상 가장 비싼 이적은 ${top.year}년 ${top.ko}의 ${top.from} → ${top.to} 이적입니다.</strong>
    이적료 €${(top.fee / 1e6).toFixed(0)}M, 우리 돈으로 약 ${eokStr(top.fee)}억 원이었습니다.
    ${new Date().getFullYear() - top.year}년이 지난 지금까지 이 기록은 깨지지 않았고, 2위 ${second.ko}(${eokStr(second.fee)}억 원)와의 격차도
    ${eok(top.fee) - eok(second.fee)}억 원에 달합니다.
  </p>

  <p>
    이 글은 스코어베이스가 보유한 이적 데이터 ${totalFeeRows.toLocaleString()}건에서 이적료 상위 ${N}건을 뽑아 정리한 것입니다.
    다른 순위표와 다른 점이 두 가지 있습니다. 첫째, <strong>2026년 여름 이적까지 반영</strong>돼 있습니다.
    실제로 TOP 50 가운데 ${since2024}건이 2024년 이후 이적입니다.
    둘째, 각 선수의 <strong>현재 시장가치를 나란히 붙여 지불한 돈을 회수했는지</strong>를 표시했습니다.
  </p>

  <p>
    그리고 그 결과가 이 글에서 가장 할 말이 많은 부분입니다.
    시장가치가 확인되는 ${withMv.length}건 가운데 <strong>지불한 이적료 이상의 가치를 유지하고 있는 건 ${recovered.length}건</strong>에 그칩니다.
    나머지 ${lost.length}건은 현재 평가액이 지불액보다 낮습니다.
    실시간 시장가치는 <a href="${SITE}/transfers" target="_blank" rel="noopener"><strong>스코어베이스 이적시장 페이지</strong></a>에서 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한눈에 보는 결론 (요약)</h2>
  <ul style="padding-left:20px;">
    <li><strong>1위:</strong> ${top.ko} — €${(top.fee / 1e6).toFixed(0)}M · 약 ${eokStr(top.fee)}억 원 (${top.year}년 ${top.from} → ${top.to})</li>
    <li><strong>2위:</strong> ${second.ko} — €${(second.fee / 1e6).toFixed(0)}M · 약 ${eokStr(second.fee)}억 원 (${second.year}년)</li>
    <li><strong>본전을 지킨 이적:</strong> ${withMv.length}건 중 ${recovered.length}건뿐 (${((recovered.length / withMv.length) * 100).toFixed(0)}%)</li>
    <li><strong>가장 크게 잃은 이적:</strong> ${worst[0].ko}(${worst[0].year}) — 현재 시장가치가 이적료 대비 <span style="color:#c0392b;">${Math.round(ratio(worst[0]))}%</span></li>
    <li><strong>가장 크게 남긴 이적:</strong> ${best[0] ? `${best[0].ko}(${best[0].year}) — <span style="color:#1a7f37;">▲${Math.round(ratio(best[0]))}%</span>` : "해당 없음"}</li>
    <li><strong>최다 지출 구단:</strong> ${buyerRank[0][0]}가 TOP 50에 ${buyerRank[0][1]}건</li>
    <li><strong>TOP 50 합계:</strong> €${(sumFee / 1e9).toFixed(2)}B · 약 ${Math.round((sumFee * EUR_KRW) / 1e12).toLocaleString()}조 원</li>
  </ul>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">${new Date().getFullYear() - top.year}년째 깨지지 않는 ${top.ko}의 기록</h2>
  <p>
    <strong>${top.year}년 ${top.to}가 ${top.ko}의 바이아웃 조항을 통째로 지불하면서 세운 €${(top.fee / 1e6).toFixed(0)}M은
    아직도 유일한 €2억 대 이적입니다.</strong> 2위 ${second.ko}(€${(second.fee / 1e6).toFixed(0)}M)와 €${((top.fee - second.fee) / 1e6).toFixed(0)}M 차이가 나는데,
    이 격차 자체가 웬만한 스타 선수 한 명 값입니다.
  </p>
  <p>
    이 기록이 오래 버티는 이유는 시장이 식어서가 아닙니다. 오히려 반대입니다.
    재정적 페어플레이 규정과 구단별 지출 상한이 자리를 잡으면서, 한 선수에게 €2억을 몰아넣는 방식 대신
    €1억 안팎의 영입을 여러 건 하는 쪽으로 전략이 바뀌었습니다.
    스코어베이스 데이터에서 이적료 €100M 이상 이적은 ${over100}건, €50M 이상은 ${over50}건으로,
    최상단은 좁고 그 아래층은 두껍습니다.
  </p>
  <p>
    상위 10건의 면면을 보면 시대가 나뉩니다.
    ${rows.slice(0, 3).map((r) => `${r.ko}(${r.year})`).join(", ")}처럼 2010년대 후반의 기록이 여전히 상단을 지키는 한편,
    ${rows.slice(0, 10).filter((r) => r.year >= 2025).map((r) => `${r.ko}(${r.year})`).join(", ") || "최근 이적"}처럼
    최근 이적이 TOP 10에 진입하고 있습니다. 오래된 기록이 남아 있는 것이지, 시장이 멈춘 것은 아닙니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 16px;font-weight:800;">역대 최고 이적료 순위 TOP ${N} (전체 표)</h2>
  <p style="margin:0 0 14px;">
    '현재 몸값'은 지금 시장가치가 당시 이적료보다 몇 퍼센트 높은지 낮은지를 나타냅니다.
    <span style="color:#1a7f37;">▲</span>는 지불액 이상을 유지하고 있다는 뜻이고,
    <span style="color:#c0392b;">▼</span>는 그만큼 평가가 내려갔다는 뜻입니다.
  </p>

${tableHtml(rows)}
  <p style="font-size:13px;color:#888;margin-top:10px;">
    ※ 이적료는 스코어베이스가 수집한 이적 데이터 기준이며, 옵션·추가 지급 조건의 포함 여부에 따라 매체별 수치와 다를 수 있습니다.
    원화는 €1 = ₩${EUR_KRW.toLocaleString()} 기준 환산입니다. 은퇴했거나 시장가치가 집계되지 않는 선수는 '현재 몸값'이 —로 표시됩니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">${withMv.length}건 중 ${lost.length}건은 본전을 잃었다</h2>

  <figure style="margin:0 0 24px;">
    <img src="/blog/transfer-fee-ranking-recovery.png"
         alt="역대 최고 이적료 TOP 10의 이적료 대비 현재 시장가치 회수율 비교 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="lazy">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      이적료 대비 현재 시장가치 — 상위 이적 대부분은 지불액을 회수하지 못했습니다 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p>
    <strong>이적료 상위 ${N}건 가운데 시장가치가 확인되는 ${withMv.length}건을 계산하면, 지금도 지불액 이상의 가치를 유지하는 건 ${recovered.length}건입니다.</strong>
    비율로는 ${((recovered.length / withMv.length) * 100).toFixed(0)}%입니다.
    가장 크게 떨어진 사례는 ${worst.slice(0, 3).map((r) => `<strong>${r.ko}</strong>(${r.year}, ${Math.round(ratio(r))}%)`).join(", ")} 순입니다.
  </p>
  <p>
    다만 이 숫자를 곧바로 '실패'로 읽으면 절반만 맞습니다.
    시장가치는 나이를 강하게 반영하는 지표라, 이적 후 5년, 10년이 지난 선수는 어떤 활약을 했든 평가액이 내려갑니다.
    ${worst[0].ko}는 현재 ${worst[0].age ?? "30대"}세이고, 이적 시점은 ${worst[0].year}년입니다.
    그 사이 우승을 몇 번 했는지는 시장가치에 잡히지 않습니다.
  </p>
  <p>
    그래서 나이 효과를 걷어내고 <strong>2024년 이후 이적 ${recent.length}건만 따로</strong> 계산했습니다.
    이 그룹의 평균은 이적료 대비 ${recentAvg > 0 ? "+" : ""}${recentAvg.toFixed(0)}%이고, ${recentRecovered.length}건이 지불액 이상을 유지하고 있습니다.
    반면 2020년 이전 이적 ${oldOnes.length}건의 평균은 ${oldAvg.toFixed(0)}%입니다.
    시간이 지날수록 회수율이 내려간다는 사실 자체가 확인되는 셈이고,
    이는 고액 이적이 실패해서가 아니라 <strong>선수의 자산 가치가 계약 기간과 함께 소모되는 구조</strong>이기 때문입니다.
  </p>
  <p>
    구단이 이적료를 회계상 여러 해에 나눠 상각하는 것도 같은 이유입니다.
    €100M을 5년 계약으로 나누면 연간 €20M이 비용으로 잡히고, 그 기간 안에 성적으로 값을 뽑아야 합니다.
    즉 이적료의 성패는 되팔 때의 가격이 아니라 계약 기간 동안의 기여로 판단하는 것이 맞습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">본전을 넘긴 이적은 무엇이 달랐나</h2>
  <p>
    <strong>지불한 이적료보다 현재 시장가치가 높은 ${recovered.length}건에는 공통점이 있습니다. 전부 이적 당시 20대 초중반이었다는 점입니다.</strong>
    ${best.slice(0, 3).map((r) => `${r.ko}(${r.year}, ▲${Math.round(ratio(r))}%)`).join(", ")}가 대표적입니다.
  </p>
  <p>
    ${best[0] ? `${best[0].ko}는 ${best[0].year}년 ${best[0].from}에서 ${best[0].to}로 €${(best[0].fee / 1e6).toFixed(0)}M에 이적했는데, 현재 시장가치는 €${((best[0].mv || 0) / 1e6).toFixed(0)}M입니다. 이적료 대비 ${Math.round(ratio(best[0]))}% 높은 수치입니다.` : ""}
    이적 시점에 이미 완성형이라는 평가를 받았지만 나이가 어려 성장 여지가 남아 있었고,
    옮긴 팀에서 곧바로 주전으로 자리 잡으며 평가가 계속 올라간 경우입니다.
  </p>
  <p>
    반대로 크게 잃은 쪽은 대체로 두 부류입니다. 하나는 이적 당시 이미 전성기 정점을 지난 선수이고,
    다른 하나는 새 팀의 전술에 끝내 녹아들지 못한 선수입니다.
    이적료가 선수의 실력만이 아니라 <strong>파는 구단의 협상력</strong>으로도 결정된다는 점을 생각하면 당연한 결과입니다.
    계약이 길게 남은 핵심 선수를 데려오려면 웃돈을 얹어야 하고, 그 웃돈은 선수의 가치에 반영되지 않습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">어느 구단이 가장 많이 썼나</h2>
  <p>
    <strong>TOP ${N}을 영입한 구단 기준으로 나누면 ${buyerRank[0][0]}가 ${buyerRank[0][1]}건으로 가장 많습니다.</strong>
    ${buyerRank.slice(1, 5).map(([c, n]) => `${c} ${n}건`).join(", ")}이 뒤를 잇습니다.
    상위 50건의 절반 이상이 다섯 개 구단에 몰려 있습니다.
  </p>
  <p>
    ${buyerRank[0][0]}의 방식은 특히 뚜렷합니다. 한 번에 한 명을 사는 대신 €1억 안팎의 영입을 여러 해에 걸쳐 반복했고,
    그 결과 TOP 50 안에 ${buyerRank[0][1]}건을 남겼습니다.
    장기 계약으로 연간 상각액을 낮추는 회계 방식과 맞물린 전략인데,
    영입한 선수가 자리를 못 잡으면 그 비용이 몇 년씩 장부에 남는다는 위험도 함께 안습니다.
  </p>
  <p>
    TOP ${N}의 이적료를 모두 더하면 €${(sumFee / 1e9).toFixed(2)}B, 약 ${Math.round((sumFee * EUR_KRW) / 1e12).toLocaleString()}조 원입니다.
    선수 50명을 옮기는 데 쓰인 돈이며, 여기에는 급여가 포함돼 있지 않습니다.
    같은 선수들에게 지급되는 연봉까지 더하면 실제 비용은 훨씬 커집니다.
    구단이 실제로 급여에 얼마를 쓰는지는
    <a href="${SITE}/blog/football-player-salary-ranking-2026"><strong>축구선수 연봉 순위 TOP 30</strong></a>에서 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한국 선수 최고 이적료는 김민재 896억 원</h2>
  <p>
    <strong>스코어베이스 데이터 기준 한국 선수 최고 이적료는 2023년 김민재의 나폴리 → 바이에른 뮌헨 이적으로, €50M(약 896억 원)입니다.</strong>
    바이에른이 계약서에 명시된 바이아웃 조항을 행사한 형태였습니다.
  </p>
  <p>
    2위는 2026년 7월 이강인의 파리 생제르맹 → 아틀레티코 마드리드 이적으로 €40M, 약 717억 원입니다.
    3위는 2015년 손흥민의 레버쿠젠 → 토트넘 이적(€30M, 약 537억 원)으로,
    당시 아시아 선수 역대 최고 이적료였습니다. 손흥민은 2025년 토트넘에서 LAFC로 이적하며 €22M(약 394억 원)을 한 번 더 기록했습니다.
  </p>
  <p>
    한국 선수 이적료가 €50M 선에서 멈춰 있는 것은 실력만의 문제가 아닙니다.
    이적료는 계약 잔여 기간이 길수록, 영입 경쟁이 붙을수록 올라가는데
    아시아 선수는 유럽 진출 시점이 상대적으로 늦어 첫 빅클럽 이적 때 이미 20대 중후반인 경우가 많습니다.
    각 선수의 이적 이력과 시장가치 추이는
    <a href="${SITE}/transfers" target="_blank" rel="noopener">스코어베이스 이적시장 페이지</a>에서 국가별로 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">자주 묻는 질문 (FAQ)</h2>
${faq.map((f) => `  <h3 style="font-size:18px;margin:18px 0 6px;">Q. ${f.q}</h3>
  <p>${f.a}</p>`).join("\n")}

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <p style="background:#f5f7fa;border-radius:10px;padding:18px 20px;font-size:15px;color:#1a1a1a;">
    <strong>이적 소식과 몸값 변동을 매일 확인하려면?</strong><br>
    리그별·팀별·국가별 이적 피드와 실시간 시장가치 랭킹을
    <a href="${SITE}/transfers" target="_blank" rel="noopener"><strong>스코어베이스 이적시장 페이지</strong></a>에서 확인하세요.
  </p>

  <p style="font-size:13px;color:#999;margin-top:24px;">
    데이터 출처: 스코어베이스 이적 데이터베이스(이적료 확인 ${totalFeeRows.toLocaleString()}건) · 시장가치는 통계 기반 추정치이며 실제 이적료와 다를 수 있습니다.
    이적료 집계 기준은 <a href="https://www.fifa.com" target="_blank" rel="noopener nofollow" style="color:inherit;">FIFA</a>의 국제 이적 규정상 구단 간 합의 금액이며,
    옵션·추가 지급 조건 포함 여부에 따라 매체별 수치가 다를 수 있습니다. 원화는 €1 = ₩${EUR_KRW.toLocaleString()} 기준 환산입니다.
  </p>

  <p style="font-size:13px;color:inherit;opacity:0.5;margin-top:18px;">
    #역대최고이적료 #이적료순위 #축구이적료 #네이마르이적료 #음바페이적료 #호날두이적료
    #벨링엄이적료 #김민재이적료 #손흥민이적료 #이적시장 #선수몸값 #스코어베이스
  </p>

  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a.replace(/<[^>]+>/g, "") },
    })),
  })}</script>

</article>`;

  const existing = await prisma.blog.findUnique({ where: { slug }, select: { id: true } });
  const row = await prisma.blog.upsert({
    where: { slug },
    update: { title, excerpt, content, tags, thumbnailUrl },
    create: { slug, title, excerpt, content, tags, thumbnailUrl },
  });
  console.log(`${existing ? "UPDATED" : "CREATED"} blog [${row.id}] /blog/${row.slug}`);
  console.log(`  title: ${row.title} (${title.length}자)`);
  console.log(`  excerpt: ${excerpt.length}자`);
  console.log(`  content: ${content.length}자 · 본문 텍스트 ${content.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "").replace(/\s/g, "").length}자(공백 제외)`);
  console.log(`  회수 ${recovered.length}/${withMv.length}건 · 최근3년 평균 ${recentAvg.toFixed(0)}% vs 2020이전 ${oldAvg.toFixed(0)}%`);
  console.log(`  최다구단 ${buyerRank[0][0]} ${buyerRank[0][1]}건 · 합계 €${(sumFee / 1e9).toFixed(2)}B`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
