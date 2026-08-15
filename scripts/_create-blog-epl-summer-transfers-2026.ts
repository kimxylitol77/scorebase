// 2026 여름 EPL 최고 이적료 TOP 20 블로그 발행 (slug 으로 idempotent upsert).
//   npx tsx --env-file=.env.local scripts/_create-blog-epl-summer-transfers-2026.ts
// 데이터: FootballTransfer(league=EPL, 2026-06-01~, transferFee>0) + PlayerMarketValue + TheSportsPlayer(한글명).
// 자체 지표 두 개 — ① 잉글랜드 1부 안에서 돈 이적료 비중 ② 이적료 대비 현재 시장가치(프리미엄).
//
// ⚠ 팀별 "총 지출액" 랭킹은 만들지 않는다. 이적료 공개율이 팀마다 0~100% 로 갈려
//    (선덜랜드 13건 전부 미공개, 맨유 18건 중 2건) 합산하면 틀린 표가 된다.
//    상세 근거는 docs/epl-2026-summer-transfers/context-notes.md 참고.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";

const SITE = "https://www.scorebase.kr";
const slug = "epl-summer-transfer-fees-2026";
const EUR_KRW = 1791.5;
const N = 20;
const SUMMER_START = Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000);

/** 2025-26 시즌 EPL 소속이었다가 챔피언십으로 내려간 3팀 — "잉글랜드 1부 출신" 분류에 포함. */
const RELEGATED = new Set(["웨스트햄", "번리", "울버햄프턴"]);

const eok = (eur: number) => Math.round((eur * EUR_KRW) / 1e8);
const eokStr = (eur: number) => eok(eur).toLocaleString();
const mEur = (eur: number) => `€${(eur / 1e6).toFixed(eur % 1e6 ? 1 : 0)}M`;

/** 한글 받침 판정 조사 — 동적 생성 문장의 "뉴캐슬는/토트넘로" 같은 오류 방지. */
function josa(word: string, withBatchim: string, without: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return without; // 한글 음절이 아니면 기본형
  return (c - 0xac00) % 28 ? withBatchim : without;
}

interface Row {
  playerId: string;
  ko: string;
  fee: number;
  from: string;
  to: string;
  date: string;
  origin: "EPL" | "RELEGATED" | "ABROAD";
  mv: number | null;
  age: number | null;
}

async function build() {
  const teams = await prisma.team.findMany({ where: { league: "EPL" }, select: { name: true } });
  const EPL20 = new Set(teams.map((t) => toKoreanTeamName(t.name, "EPL")));

  const tr = await prisma.footballTransfer.findMany({
    where: { league: "EPL", transferTime: { gte: SUMMER_START }, transferFee: { gt: 0 } },
    orderBy: { transferFee: "desc" },
    select: { playerId: true, fromTeamName: true, toTeamName: true, transferFee: true, transferTime: true },
  });
  // 도착팀이 현 EPL 20팀인 건만 — league 필드는 출발팀이 EPL 이어도 붙는다.
  const inbound = tr.filter((t) => t.toTeamName && EPL20.has(toKoreanTeamName(t.toTeamName, "EPL")));
  const top = inbound.slice(0, N);

  const ids = top.map((t) => t.playerId);
  const [players, mvs, allInboundCount] = await Promise.all([
    prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true } }),
    prisma.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true, currentValue: true, age: true } }),
    prisma.footballTransfer.count({ where: { league: "EPL", transferTime: { gte: SUMMER_START } } }),
  ]);
  const pm = new Map(players.map((p) => [p.id, p]));
  const vm = new Map(mvs.map((m) => [m.id, m]));

  const rows: Row[] = top.map((t) => {
    const p = pm.get(t.playerId);
    const en = p?.name ?? "";
    const dict = toKoreanPlayerName(en); // 수동 사전 우선 (ts 자동 음역보다 정확)
    const ko = en && dict !== en ? dict : (p?.nameKo ?? en ?? "선수");
    const fromKo = toKoreanTeamName(t.fromTeamName ?? "", "");
    return {
      playerId: t.playerId,
      ko,
      fee: t.transferFee!,
      from: fromKo || "—",
      to: toKoreanTeamName(t.toTeamName!, "EPL"),
      date: new Date((t.transferTime ?? 0) * 1000).toISOString().slice(0, 10),
      origin: EPL20.has(fromKo) ? "EPL" : RELEGATED.has(fromKo) ? "RELEGATED" : "ABROAD",
      mv: vm.get(t.playerId)?.currentValue ?? null,
      age: vm.get(t.playerId)?.age ?? null,
    };
  });
  return { rows, allInboundCount, inboundPaid: inbound.length };
}

function tableHtml(rows: Row[]): string {
  const body = rows
    .map((r, i) => {
      const zebra = i % 2 === 1 ? "background:#fafafa;" : "";
      const gap = r.mv === null ? null : ((r.mv - r.fee) / r.fee) * 100;
      const gTxt = gap === null ? "—" : `${gap > 0 ? "▲" : gap < 0 ? "▼" : ""}${Math.abs(Math.round(gap))}%`;
      const gColor = gap === null ? "" : gap > 0 ? "color:#1a7f37;" : gap < 0 ? "color:#c0392b;" : "";
      const originTag =
        r.origin === "ABROAD"
          ? `<span style="font-size:12px;color:#888;">해외</span>`
          : `<span style="font-size:12px;color:#0a6ec0;">잉글랜드</span>`;
      return `      <tr style="border-bottom:1px solid #eee;${zebra}"><td style="padding:8px;">${i + 1}</td><td style="padding:8px;"><a href="${SITE}/transfers/${r.playerId}" style="color:#0a6ec0;text-decoration:none;">${r.ko}</a></td><td style="padding:8px;font-size:14px;">${r.from} → <strong>${r.to}</strong><br>${originTag}</td><td style="padding:8px;">${r.age ?? "—"}</td><td style="padding:8px;">${mEur(r.fee)}</td><td style="padding:8px;">${eokStr(r.fee)}억</td><td style="padding:8px;${gColor}">${gTxt}</td></tr>`;
    })
    .join("\n");

  return `  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#1a1a1a;">
    <thead>
      <tr style="background:#0a0a0a;color:#fff;text-align:left;">
        <th style="padding:10px 8px;">#</th>
        <th style="padding:10px 8px;">선수</th>
        <th style="padding:10px 8px;">이적</th>
        <th style="padding:10px 8px;">나이</th>
        <th style="padding:10px 8px;">이적료</th>
        <th style="padding:10px 8px;">원화</th>
        <th style="padding:10px 8px;">몸값 대비</th>
      </tr>
    </thead>
    <tbody>
${body}
    </tbody>
  </table>
  </div>`;
}

async function main() {
  const { rows, allInboundCount, inboundPaid } = await build();
  const top1 = rows[0], top2 = rows[1];

  // ── 자체 지표 ① 잉글랜드 1부 안에서 돈 이적료
  const sumFee = rows.reduce((s, r) => s + r.fee, 0);
  const home = rows.filter((r) => r.origin !== "ABROAD");
  const homeFee = home.reduce((s, r) => s + r.fee, 0);
  const homePct = Math.round((homeFee / sumFee) * 100);
  const inLeague = rows.filter((r) => r.origin === "EPL");
  const abroad = rows.filter((r) => r.origin === "ABROAD");

  // ── 자체 지표 ② 이적료 대비 현재 시장가치
  const withMv = rows.filter((r) => r.mv !== null);
  const premium = withMv.filter((r) => r.mv! < r.fee); // 시장가치보다 비싸게 산 건
  const gap = (r: Row) => ((r.mv! - r.fee) / r.fee) * 100;
  const biggestPremium = [...withMv].sort((a, b) => gap(a) - gap(b))[0];
  const bestValue = [...withMv].sort((a, b) => gap(b) - gap(a))[0];

  const ages = rows.map((r) => r.age).filter((a): a is number => !!a);
  const avgAge = ages.reduce((s, a) => s + a, 0) / ages.length;

  // ── 구단별 TOP20 진입 건수
  const byBuyer: Record<string, { n: number; fee: number }> = {};
  for (const r of rows) {
    byBuyer[r.to] = { n: (byBuyer[r.to]?.n ?? 0) + 1, fee: (byBuyer[r.to]?.fee ?? 0) + r.fee };
  }
  const buyerRank = Object.entries(byBuyer).sort((a, b) => b[1].fee - a[1].fee);
  const topBuyer = buyerRank[0];

  // ── 구단별 유출 (TOP20 에서 선수를 판 팀)
  const bySeller: Record<string, { n: number; fee: number }> = {};
  for (const r of rows) {
    bySeller[r.from] = { n: (bySeller[r.from]?.n ?? 0) + 1, fee: (bySeller[r.from]?.fee ?? 0) + r.fee };
  }
  const sellerRank = Object.entries(bySeller).sort((a, b) => b[1].fee - a[1].fee);
  const topSeller = sellerRank[0];

  const title = `EPL 이적료 순위 2026 여름 TOP 20 — ${top1.ko} ${eokStr(top1.fee)}억 1위, ${home.length}건은 리그 안에서 돌았다`;

  // meta description 은 155자 안으로 — 넘으면 검색결과에서 잘린다.
  const excerpt =
    `2026년 여름 프리미어리그 영입 이적료 순위 TOP 20. ${top1.ko}${josa(top1.ko, "이", "가")} ${top1.from}에서 ${top1.to}${josa(top1.to, "으로", "로")} ${mEur(top1.fee)}(약 ${eokStr(top1.fee)}억 원)에 이적해 1위입니다. ` +
    `합계 ${mEur(sumFee)} 중 ${homePct}%가 잉글랜드 1부 팀끼리 오간 돈입니다. 개막은 8월 21일.`;

  const tags =
    "EPL 이적료, 프리미어리그 이적료 순위, 2026 여름 이적시장, EPL 영입, 첼시 영입, 토트넘 영입, 아스널 영입, 맨체스터 시티 영입, 맨유 영입, 뉴캐슬 이적, EPL 개막, 스코어베이스";

  const thumbnailUrl = `${SITE}/blog/epl-summer-transfers-2026-hero.png`;

  const faq = [
    {
      q: "2026년 여름 EPL 최고 이적료는 누구인가요?",
      a: `${top1.ko}입니다. ${top1.date.replace(/(\d+)-(\d+)-(\d+)/, "$1년 $2월 $3일")} ${top1.from}에서 ${top1.to}${josa(top1.to, "으로", "로")} 이적하며 ${mEur(top1.fee)}, 약 ${eokStr(top1.fee)}억 원의 이적료가 발생했습니다. 2위는 ${top2.ko}(${top2.from} → ${top2.to})의 ${mEur(top2.fee)}이며, 1·2위 격차는 ${mEur(top1.fee - top2.fee)}에 그칩니다.`,
    },
    {
      q: "이번 여름 EPL 구단이 가장 많이 쓴 곳은 어디인가요?",
      a: `TOP 20 안에 들어온 영입만 놓고 보면 ${topBuyer[0]}${josa(topBuyer[0], "이", "가")} ${topBuyer[1].n}건 ${mEur(topBuyer[1].fee)}로 가장 많습니다. 다만 이것은 "구단별 총 지출액"이 아닙니다. 이적료를 공개하지 않는 계약이 많아 구단별로 공개 비율이 크게 갈리기 때문입니다. 이번 여름 EPL 영입 ${allInboundCount}건 가운데 금액이 확인되는 건 ${inboundPaid}건뿐이라, 구단별 총액 비교는 신뢰할 수 없습니다.`,
    },
    {
      q: "이적료와 몸값(시장가치)은 어떻게 다른가요?",
      a: `이적료는 두 구단이 실제로 주고받은 금액이고, 몸값은 지금 이 선수를 사려면 얼마가 필요할지에 대한 추정치입니다. 계약 잔여 기간이 길거나 영입 경쟁이 붙으면 이적료는 시장가치를 크게 넘습니다. 이번 TOP 20에서도 시장가치가 확인되는 ${withMv.length}건 가운데 ${premium.length}건이 평가액보다 비싼 값에 거래됐습니다.`,
    },
    {
      q: "왜 매체마다 이적료 금액이 다른가요?",
      a: "옵션 금액의 포함 여부가 다르기 때문입니다. 대부분의 이적 계약에는 출전 횟수나 우승 여부에 따라 추가 지급되는 조건부 금액이 붙는데, 어떤 매체는 기본 이적료만, 어떤 매체는 옵션을 모두 더한 최대 금액을 씁니다. 구단이 총액을 공개하지 않는 경우도 많아 집계 기관마다 수치가 갈립니다.",
    },
    {
      q: "2026-27 EPL은 언제 개막하나요?",
      a: "한국 시간 기준 2026년 8월 21일 금요일 밤에 개막합니다. 개막전은 아스널과 코번트리 시티의 경기입니다. 개막 일정과 승격·강등팀 전체 정리는 스코어베이스 EPL 개막 가이드에서 확인할 수 있습니다.",
    },
  ];

  const content = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;word-break:keep-all;">

  <figure style="margin:0 0 28px;">
    <img src="/blog/epl-summer-transfers-2026-hero.png"
         alt="2026 여름 EPL 최고 이적료 TOP 5 - ${rows.slice(0, 3).map((r) => r.ko).join(" ")} 프리미어리그 이적료 순위 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="eager">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      2026년 여름 프리미어리그 영입 이적료 상위 5건 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p style="color:inherit;opacity:0.75;font-size:15px;margin:0 0 28px;">
    최종 업데이트: 2026년 8월 15일 · 집계 기간: 2026년 6월 1일 ~ 8월 15일 · 대상: 프리미어리그 20개 구단 영입
  </p>

  <p>
    <strong>2026년 여름 프리미어리그에서 가장 비싼 영입은 ${top1.from}에서 ${top1.to}${josa(top1.to, "으로", "로")} 옮긴 ${top1.ko}입니다.</strong>
    이적료 ${mEur(top1.fee)}, 우리 돈으로 약 ${eokStr(top1.fee)}억 원입니다.
    2위 ${top2.ko}(${mEur(top2.fee)})${josa(top2.ko, "과", "와")}의 차이는 ${mEur(top1.fee - top2.fee)}에 불과해, 올여름 최상단은 예년보다 촘촘합니다.
  </p>

  <p>
    이 글은 스코어베이스 이적 데이터에서 <strong>2026년 6월 1일 이후 프리미어리그 20개 구단이 영입한 선수 가운데 이적료가 확인되는 ${inboundPaid}건</strong>을
    추려 상위 ${N}건을 정리한 것입니다. 8월 21일 개막을 앞두고 각 팀이 어디에 돈을 썼는지 한 번에 볼 수 있습니다.
  </p>

  <p>
    그런데 표를 정렬하고 나면 다른 게 먼저 눈에 들어옵니다.
    <strong>TOP 20 이적료 합계 ${mEur(sumFee)} 가운데 ${homePct}%인 ${mEur(homeFee)}가 잉글랜드 1부 팀끼리 주고받은 돈</strong>이라는 점입니다.
    올여름 프리미어리그의 큰돈은 대부분 리그 밖으로 나가지 않고 안에서 돌았습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한눈에 보는 결론 (요약)</h2>
  <ul style="padding-left:20px;">
    <li><strong>1위:</strong> ${top1.ko} — ${mEur(top1.fee)} · 약 ${eokStr(top1.fee)}억 원 (${top1.from} → ${top1.to})</li>
    <li><strong>2위:</strong> ${top2.ko} — ${mEur(top2.fee)} · 약 ${eokStr(top2.fee)}억 원 (${top2.from} → ${top2.to})</li>
    <li><strong>TOP 20 합계:</strong> ${mEur(sumFee)} · 약 ${Math.round((sumFee * EUR_KRW) / 1e12 * 10) / 10}조 원</li>
    <li><strong>리그 안에서 돈 돈:</strong> ${home.length}건 ${mEur(homeFee)} — 전체의 ${homePct}%</li>
    <li><strong>해외에서 데려온 건:</strong> ${abroad.length}건 ${mEur(sumFee - homeFee)}</li>
    <li><strong>시장가치보다 비싸게 산 건:</strong> ${withMv.length}건 중 ${premium.length}건</li>
    <li><strong>TOP 20 평균 나이:</strong> ${avgAge.toFixed(1)}세 (${ages.length}명 기준)</li>
    <li><strong>가장 많이 쓴 구단(TOP 20 기준):</strong> ${topBuyer[0]} ${topBuyer[1].n}건 ${mEur(topBuyer[1].fee)}</li>
    <li><strong>가장 많이 판 구단(TOP 20 기준):</strong> ${topSeller[0]} ${topSeller[1].n}건 ${mEur(topSeller[1].fee)}</li>
  </ul>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 16px;font-weight:800;">2026 여름 EPL 이적료 순위 TOP ${N} (전체 표)</h2>
  <p style="margin:0 0 14px;">
    '몸값 대비'는 현재 시장가치가 지불한 이적료보다 몇 퍼센트 높은지 낮은지입니다.
    <span style="color:#c0392b;">▼</span>는 평가액보다 비싸게 샀다는 뜻이고,
    <span style="color:#1a7f37;">▲</span>는 평가액보다 싸게 데려왔다는 뜻입니다.
    선수 이름을 누르면 이적 이력과 몸값 추이를 볼 수 있습니다.
  </p>

${tableHtml(rows)}
  <p style="font-size:13px;color:#888;margin-top:10px;">
    ※ 이적료는 스코어베이스가 수집한 이적 데이터 기준이며, 옵션·추가 지급 조건의 포함 여부에 따라 매체별 수치와 다를 수 있습니다.
    원화는 €1 = ₩${EUR_KRW.toLocaleString()} 기준 환산입니다. '잉글랜드' 표시는 직전 소속이 2025-26 프리미어리그 구단이었다는 뜻입니다.
    나이와 시장가치가 아직 집계되지 않은 선수는 —로 표시됩니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">큰돈의 ${homePct}%는 리그 밖으로 나가지 않았다</h2>

  <figure style="margin:0 0 24px;">
    <img src="/blog/epl-summer-transfers-2026-origin.png"
         alt="2026 여름 EPL 상위 20건 이적료의 출처 - 잉글랜드 1부 내부 거래와 해외 영입 비교 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="lazy">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      TOP 20 이적료를 직전 소속 기준으로 나눈 결과 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p>
    <strong>TOP 20 가운데 ${home.length}건은 직전 소속이 지난 시즌 프리미어리그 구단이었습니다.</strong>
    금액으로는 ${mEur(homeFee)}, 전체의 ${homePct}%입니다. 해외 리그에서 데려온 건 ${abroad.length}건 ${mEur(sumFee - homeFee)}에 그칩니다.
  </p>
  <p>
    ${(() => {
      const n = rows.slice(0, 5).filter((r) => r.origin !== "ABROAD").length;
      return n === 5 ? "상위 5건은 전부 잉글랜드 안에서의 이동입니다." : `상위 5건 가운데 ${n}건이 잉글랜드 안에서의 이동입니다.`;
    })()}
    ${inLeague.slice(0, 3).map((r) => `${r.ko}(${r.from} → ${r.to})`).join(", ")} 등이 여기에 해당합니다.
    같은 리그 경쟁팀에서 데려오려면 프리미엄을 더 얹어야 하는데도, 구단들이 그 값을 치르고 있다는 뜻입니다.
  </p>
  <p>
    이 흐름이 만든 부작용이 하나 보입니다. <strong>${topSeller[0]}</strong>${josa(topSeller[0], "은", "는")} TOP 20에서만 ${topSeller[1].n}건 ${mEur(topSeller[1].fee)}어치 선수를 내보냈습니다.
    파는 쪽에 큰돈이 들어오지만, 그 선수들이 향한 곳이 대부분 같은 리그 상위권이라는 점이 다릅니다.
    개막 후 순위표는 <a href="${SITE}/scores" target="_blank" rel="noopener">스코어베이스 실시간 순위</a>에서 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">${withMv.length}건 중 ${premium.length}건은 몸값보다 비싸게 샀다</h2>
  <p>
    이적료와 시장가치를 나란히 놓으면 구단이 얼마나 급했는지가 드러납니다.
    <strong>시장가치가 집계되는 ${withMv.length}건 가운데 ${premium.length}건이 평가액보다 높은 값에 거래됐습니다.</strong>
  </p>
  <p>
    프리미엄이 가장 컸던 건 <strong>${biggestPremium.ko}</strong>입니다.
    ${biggestPremium.from}에서 ${biggestPremium.to}${josa(biggestPremium.to, "으로", "로")} ${mEur(biggestPremium.fee)}에 이적했는데,
    현재 시장가치는 ${mEur(biggestPremium.mv!)}, 이적료의 ${Math.round((biggestPremium.mv! / biggestPremium.fee) * 100)}% 수준입니다.
    반대로 ${bestValue.ko}${josa(bestValue.ko, "은", "는")} 시장가치 ${mEur(bestValue.mv!)}인 선수를 ${mEur(bestValue.fee)}에 데려와, TOP 20에서 가장 값을 아낀 영입이 됐습니다.
  </p>
  <p>
    다만 시장가치는 통계 기반 추정치라 이적 직후에는 갱신이 늦습니다.
    갓 이적한 선수의 평가액은 새 팀에서 몇 경기를 치른 뒤에야 움직이는 경우가 많으니, 위 수치는 '지금 시점의 스냅샷'으로 읽는 편이 정확합니다.
    선수별 몸값 변동 이력은 <a href="${SITE}/transfers" target="_blank" rel="noopener"><strong>스코어베이스 이적시장 페이지</strong></a>에서 볼 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">평균 ${avgAge.toFixed(1)}세 — 완성된 선수보다 오를 선수</h2>
  <p>
    TOP 20 가운데 나이가 확인되는 ${ages.length}명의 평균은 <strong>${avgAge.toFixed(1)}세</strong>입니다.
    20대 초중반에 몰려 있고, 20세 이하도 ${rows.filter((r) => r.age !== null && r.age <= 20).length}명 들어 있습니다.
    전성기 기량을 즉시 사오는 대신, 앞으로 값이 오를 선수에게 큰돈을 쓰는 쪽으로 무게가 실린 셈입니다.
  </p>
  <p>
    이런 영입은 개막 직후 성적으로 바로 답이 나오지 않습니다.
    실제로 얼마나 뛰고 얼마나 기여하는지는 시즌이 굴러가야 보이는데,
    경기별 출전 기록과 팀 순위는 <a href="${SITE}/scores" target="_blank" rel="noopener">실시간 스코어</a> 페이지에서 따라갈 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">8월 21일 개막 — 일정과 승격·강등팀</h2>
  <p>
    2026-27 프리미어리그는 <strong>한국 시간 8월 21일 금요일 밤</strong> 아스널과 코번트리 시티의 경기로 문을 엽니다.
    개막 라운드 전체 일정, 승격 3팀과 강등 3팀, 최종전 날짜까지는
    <a href="${SITE}/blog/epl-2026-27-opening-guide"><strong>2026-27 EPL 개막 가이드</strong></a>에 따로 정리해 두었습니다.
  </p>
  <p>
    개막 이후에는 이 글의 영입들이 실제로 순위표를 어떻게 움직이는지가 관전 포인트입니다.
    경기 일정과 순위는 <a href="${SITE}/scores" target="_blank" rel="noopener">스코어베이스 실시간 스코어</a>에서 확인하세요.
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
    데이터 출처: 스코어베이스 이적 데이터베이스 · 집계 기간 2026년 6월 1일 ~ 8월 15일 · 프리미어리그 20개 구단 영입 ${allInboundCount}건 중 이적료가 확인되는 ${inboundPaid}건 기준.
    이적료를 공개하지 않는 계약이 많아 <strong>구단별 총 지출액 비교는 싣지 않았습니다</strong>.
    시장가치는 통계 기반 추정치이며 실제 이적료와 다를 수 있습니다.
    이적료 집계 기준은 <a href="https://www.premierleague.com" target="_blank" rel="noopener nofollow" style="color:inherit;">프리미어리그</a> 등록 기준 구단 간 합의 금액이며,
    옵션·추가 지급 조건 포함 여부에 따라 매체별 수치가 다를 수 있습니다. 원화는 €1 = ₩${EUR_KRW.toLocaleString()} 기준 환산입니다.
  </p>

  <p style="font-size:13px;color:inherit;opacity:0.5;margin-top:18px;">
    #EPL이적료 #프리미어리그이적 #2026여름이적시장 #EPL영입 #첼시영입 #토트넘영입
    #아스널영입 #맨시티영입 #맨유영입 #EPL개막 #이적시장 #스코어베이스
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
  console.log(`  잉글랜드 ${home.length}건 ${mEur(homeFee)} (${homePct}%) · 해외 ${abroad.length}건`);
  console.log(`  프리미엄 ${premium.length}/${withMv.length}건 · 평균 나이 ${avgAge.toFixed(1)}세`);
  console.log(`  최다구매 ${topBuyer[0]} ${topBuyer[1].n}건 · 최다판매 ${topSeller[0]} ${topSeller[1].n}건`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
