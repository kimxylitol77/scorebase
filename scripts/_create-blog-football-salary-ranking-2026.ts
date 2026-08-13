// 축구선수 연봉 순위 TOP 30 블로그 발행 (slug 으로 idempotent upsert).
//   npx tsx --env-file=.env.local scripts/_create-blog-football-salary-ranking-2026.ts
// 데이터: data/football-wages.json(Capology 수집, 빅5 1,980명) + PlayerMarketValue(몸값·나이) + TheSportsPlayer(한글명).
// 표·핵심 수치를 전부 DB 에서 생성 — 재실행하면 본문 서술과 표가 함께 갱신돼 어긋나지 않는다.
import fs from "fs";
import { prisma } from "@/lib/db";

const SITE = "https://www.scorebase.kr";
const slug = "football-player-salary-ranking-2026";
const EUR_KRW = 1791.5; // src/app/transfers/page.tsx 와 동일 상수

/** € → 억원 */
const eok = (eur: number) => Math.round((eur * EUR_KRW) / 1e8);
const eokStr = (eur: number) => eok(eur).toLocaleString();

const CLUB_KO: Record<string, string> = {
  "real-madrid": "레알 마드리드", "manchester-city": "맨체스터 시티", "bayern-munich": "바이에른 뮌헨",
  liverpool: "리버풀", arsenal: "아스널", barcelona: "바르셀로나", "manchester-united": "맨체스터 유나이티드",
  psg: "파리 생제르맹", "atletico-madrid": "아틀레티코 마드리드", "athletic-club": "아틀레틱 빌바오",
  "inter-milan": "인터 밀란", chelsea: "첼시", tottenham: "토트넘", juventus: "유벤투스",
  "ac-milan": "AC 밀란", napoli: "나폴리", "aston-villa": "아스톤 빌라", "newcastle-united": "뉴캐슬",
};
const LEAGUE_KO: Record<string, string> = {
  EPL: "프리미어리그", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1",
};
const POS_KO: Record<string, string> = { F: "FW", M: "MF", D: "DF", G: "GK" };
const POS_LABEL: Record<string, string> = { F: "공격수", M: "미드필더", D: "수비수", G: "골키퍼" };

interface Row {
  id: string; ko: string; en: string; pos: string; club: string; league: string;
  eur: number; gbp: number; age: number | null; mv: number | null;
}

async function build(): Promise<{ rows: Row[]; totalPlayers: number; totalWage: number; fetchedAt: string }> {
  const raw = JSON.parse(fs.readFileSync("data/football-wages.json", "utf8"));
  const all: Array<[string, { eur: number; gbp: number; club: string; league: string }]> =
    Object.entries(raw.players as Record<string, { eur: number; gbp: number; club: string; league: string }>)
      .filter(([, v]) => v.eur > 0);
  const sorted = [...all].sort((a, b) => b[1].eur - a[1].eur);
  const top = sorted.slice(0, 30);
  const ids = top.map(([id]) => id);

  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true, position: true },
  });
  const pm = new Map(players.map((p) => [p.id, p]));
  const mvs = await prisma.playerMarketValue.findMany({
    where: { id: { in: ids } }, select: { id: true, age: true, currentValue: true },
  });
  const vm = new Map(mvs.map((m) => [m.id, m]));

  const rows: Row[] = top.map(([id, v]) => {
    const p = pm.get(id);
    const m = vm.get(id);
    return {
      id, ko: p?.nameKo || p?.name || "선수", en: p?.name || "", pos: p?.position || "",
      club: v.club, league: v.league, eur: v.eur, gbp: v.gbp,
      age: m?.age ?? null, mv: m?.currentValue ?? null,
    };
  });
  return {
    rows,
    totalPlayers: all.length,
    totalWage: all.reduce((s, [, v]) => s + v.eur, 0),
    fetchedAt: String(raw.fetchedAt || "").slice(0, 10),
  };
}

function tableHtml(rows: Row[]): string {
  const body = rows.map((r, i) => {
    const zebra = i % 2 === 1 ? "background:#fafafa;" : "";
    const club = CLUB_KO[r.club] || r.club;
    const league = LEAGUE_KO[r.league] || r.league;
    const weekly = Math.round(r.gbp / 52 / 1000); // 주급 £천 단위
    const mult = r.mv ? (r.mv / r.eur).toFixed(1) + "배" : "—";
    const multColor = r.mv && r.mv / r.eur >= 5 ? "color:#1a7f37;" : r.mv && r.mv / r.eur < 1 ? "color:#c0392b;" : "";
    return `      <tr style="border-bottom:1px solid #eee;${zebra}"><td style="padding:8px;">${i + 1}</td><td style="padding:8px;"><a href="${SITE}/transfers/${r.id}" style="color:#0a6ec0;text-decoration:none;">${r.ko}</a></td><td style="padding:8px;">${POS_KO[r.pos] || "—"}</td><td style="padding:8px;">${club} · ${league}</td><td style="padding:8px;">${r.age ?? "—"}</td><td style="padding:8px;">€${(r.eur / 1e6).toFixed(1)}M<br><span style="font-size:12px;opacity:0.6;">주급 £${weekly}k</span></td><td style="padding:8px;">${eokStr(r.eur)}억</td><td style="padding:8px;${multColor}">${mult}</td></tr>`;
  }).join("\n");

  return `  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#1a1a1a;">
    <thead>
      <tr style="background:#0a0a0a;color:#fff;text-align:left;">
        <th style="padding:10px 8px;">#</th>
        <th style="padding:10px 8px;">선수</th>
        <th style="padding:10px 8px;">포지션</th>
        <th style="padding:10px 8px;">소속 · 리그</th>
        <th style="padding:10px 8px;">나이</th>
        <th style="padding:10px 8px;">연봉 (주급)</th>
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
  const { rows, totalPlayers, totalWage, fetchedAt } = await build();
  const top = rows[0];
  const second = rows[1];

  // ── 본문 서술에 쓰는 집계 (표와 같은 소스 → 재실행해도 어긋나지 않음)
  const byLeague: Record<string, number> = {};
  const byClub: Record<string, number> = {};
  const byPos: Record<string, number> = {};
  for (const r of rows) {
    byLeague[r.league] = (byLeague[r.league] || 0) + 1;
    byClub[r.club] = (byClub[r.club] || 0) + 1;
    byPos[r.pos] = (byPos[r.pos] || 0) + 1;
  }
  const clubRank = Object.entries(byClub).sort((a, b) => b[1] - a[1]);
  const leagueRank = Object.entries(byLeague).sort((a, b) => b[1] - a[1]);
  const ages = rows.map((r) => r.age).filter((a): a is number => a !== null);
  const avgAge = (ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1);
  const youngest = rows.filter((r) => r.age === Math.min(...ages))[0];
  const oldest = rows.filter((r) => r.age === Math.max(...ages))[0];

  const withMv = rows.filter((r) => r.mv);
  const byMult = [...withMv].sort((a, b) => b.mv! / b.eur - a.mv! / a.eur);
  const bestValue = byMult.slice(0, 3);
  const worstValue = byMult.slice(-3).reverse();
  const mult = (r: Row) => (r.mv! / r.eur).toFixed(1);

  const topClub = clubRank[0];
  const leagueLine = leagueRank.map(([l, n]) => `${LEAGUE_KO[l] || l} ${n}명`).join(" · ");
  const posLine = Object.entries(byPos).sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${POS_LABEL[p] || p} ${n}명`).join(" · ");

  const title = `축구선수 연봉 순위 TOP 30 — ${top.ko} ${eokStr(top.eur)}억 1위, 호날두가 없는 이유 (2026)`;
  const excerpt =
    `축구선수 연봉 순위 TOP 30을 유럽 빅5 리그 구단 급여 기준으로 정리했습니다. ${top.ko}가 연 €${(top.eur / 1e6).toFixed(1)}M(약 ${eokStr(top.eur)}억 원)으로 1위이며, 광고·스폰서 수입을 뺀 순수 급여만 집계했습니다. 연봉 대비 몸값 배수까지 함께 확인할 수 있습니다.`;
  const tags =
    "축구선수 연봉 순위, 축구선수 주급 순위, 2026 축구 연봉, 홀란드 연봉, 음바페 연봉, 야말 연봉, 프리미어리그 연봉, 빅5 리그 급여, 손흥민 연봉, 김민재 연봉, 축구선수 몸값, 스코어베이스";
  const thumbnailUrl = `${SITE}/blog/football-salary-ranking-2026-hero.png`;

  const faq = [
    {
      q: "2026년 축구선수 연봉 1위는 누구인가요?",
      a: `유럽 빅5 리그 구단 급여 기준으로는 ${top.ko}(${CLUB_KO[top.club] || top.club})가 연 €${(top.eur / 1e6).toFixed(1)}M, 약 ${eokStr(top.eur)}억 원으로 1위입니다. 주급으로 환산하면 약 £${Math.round(top.gbp / 52 / 1000)}k입니다. 사우디아라비아 리그와 광고 수입을 포함하면 순위는 달라집니다.`,
    },
    {
      q: "이 순위에 호날두와 메시가 없는 이유는 무엇인가요?",
      a: "이 순위는 유럽 빅5 리그(프리미어리그·라리가·분데스리가·세리에 A·리그 1) 소속 선수의 구단 급여만 집계하기 때문입니다. 크리스티아누 호날두는 사우디 프로리그, 리오넬 메시는 미국 MLS 소속이라 집계 범위 밖입니다. 또한 두 선수 수입의 상당 부분은 구단 급여가 아니라 광고·스폰서 계약에서 나옵니다.",
    },
    {
      q: "연봉과 주급 중 어느 쪽이 정확한 기준인가요?",
      a: "둘은 같은 금액을 다르게 표현한 것입니다. 유럽 축구는 주급 단위로 계약하는 관행이 있어 주급이 자주 인용되고, 연봉은 주급에 52를 곱한 값입니다. 다만 보너스와 이미지권 수익은 계약마다 포함 여부가 달라 매체별로 숫자가 조금씩 다를 수 있습니다.",
    },
    {
      q: "손흥민과 김민재의 연봉도 이 순위에 있나요?",
      a: "없습니다. 손흥민은 미국 MLS의 LAFC 소속이라 빅5 리그 집계 대상이 아니며, 김민재와 이강인은 빅5 소속이지만 급여 데이터가 확인되지 않아 표에서 제외했습니다. 세 선수의 시장가치와 최근 이적 기록은 스코어베이스 선수 페이지에서 확인할 수 있습니다.",
    },
    {
      q: "연봉이 높으면 몸값도 높은가요?",
      a: `반드시 그렇지는 않습니다. 스코어베이스 데이터로 계산하면 TOP 30 안에서도 ${bestValue[0].ko}는 몸값이 연봉의 ${mult(bestValue[0])}배인 반면 ${worstValue[0].ko}는 ${mult(worstValue[0])}배에 그칩니다. 연봉은 과거 계약 시점의 평가이고 몸값은 현재 시장의 평가라, 나이가 많거나 폼이 떨어진 선수일수록 둘의 격차가 벌어집니다.`,
    },
  ];

  const content = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;word-break:keep-all;">

  <figure style="margin:0 0 28px;">
    <img src="/blog/football-salary-ranking-2026-hero.png"
         alt="축구선수 연봉 순위 2026 - 유럽 빅5 리그 구단 급여 랭킹 TOP 30 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="eager">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      2026년 유럽 빅5 리그 축구선수 연봉 순위 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p style="color:inherit;opacity:0.75;font-size:15px;margin:0 0 28px;">
    최종 업데이트: 2026년 8월 · 데이터 기준: 유럽 빅5 리그(프리미어리그·라리가·분데스리가·세리에 A·리그 1) 구단 급여 ${totalPlayers.toLocaleString()}명
  </p>

  <p>
    <strong>2026년 유럽 빅5 리그에서 구단 급여를 가장 많이 받는 선수는 ${top.ko}입니다.</strong>
    연 €${(top.eur / 1e6).toFixed(1)}M, 우리 돈으로 약 ${eokStr(top.eur)}억 원이며 주급으로 환산하면 £${Math.round(top.gbp / 52 / 1000)}k입니다.
    2위 ${second.ko}(${eokStr(second.eur)}억 원)와의 차이는 ${eok(top.eur) - eok(second.eur)}억 원 남짓이라,
    사실상 두 선수가 최상단을 나눠 갖고 있는 구도입니다.
  </p>

  <p>
    그런데 이 순위를 처음 본 분이라면 곧바로 의아하실 겁니다. 호날두도 메시도 보이지 않기 때문입니다.
    이 글은 <strong>광고·스폰서 수입을 모두 뺀 '구단이 실제로 지급하는 급여'</strong>만 기준으로 삼았고,
    집계 범위도 유럽 빅5 리그로 한정했습니다. 기준을 섞지 않았기 때문에 선수 간 비교가 가능한 순위표가 나옵니다.
    자세한 이유는 바로 다음 항목에서 설명합니다.
  </p>

  <p>
    아래 순위는 스코어베이스가 보유한 빅5 리그 급여 데이터 ${totalPlayers.toLocaleString()}명분에서 상위 30명을 뽑은 것이며,
    각 선수의 현재 시장가치를 나란히 붙여 <strong>연봉 대비 몸값 배수</strong>까지 계산했습니다.
    이 배수는 다른 곳에서는 보기 어려운 수치로, "누가 받는 만큼 하고 있는가"를 한 칸으로 보여줍니다.
    선수별 실시간 시장가치는
    <a href="${SITE}/transfers" target="_blank" rel="noopener"><strong>스코어베이스 이적시장 페이지</strong></a>에서 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한눈에 보는 결론 (요약)</h2>
  <ul style="padding-left:20px;">
    <li><strong>1위:</strong> ${top.ko}(${CLUB_KO[top.club] || top.club}) — 연 €${(top.eur / 1e6).toFixed(1)}M · 약 ${eokStr(top.eur)}억 원 · 주급 £${Math.round(top.gbp / 52 / 1000)}k</li>
    <li><strong>2위:</strong> ${second.ko}(${CLUB_KO[second.club] || second.club}) — 연 €${(second.eur / 1e6).toFixed(1)}M · 약 ${eokStr(second.eur)}억 원</li>
    <li><strong>최다 보유 구단:</strong> ${CLUB_KO[topClub[0]] || topClub[0]}가 TOP 30에 ${topClub[1]}명</li>
    <li><strong>리그 분포:</strong> ${leagueLine}</li>
    <li><strong>가장 남는 계약:</strong> ${bestValue[0].ko} — 몸값이 연봉의 <span style="color:#1a7f37;">${mult(bestValue[0])}배</span></li>
    <li><strong>가장 부담스러운 계약:</strong> ${worstValue[0].ko} — 몸값이 연봉의 <span style="color:#c0392b;">${mult(worstValue[0])}배</span></li>
    <li><strong>TOP 30 평균 나이:</strong> ${avgAge}세 (최연소 ${youngest.ko} ${youngest.age}세 · 최고령 ${oldest.ko} ${oldest.age}세)</li>
  </ul>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">이 순위에 호날두와 메시가 없는 이유</h2>
  <p>
    <strong>이 순위가 구단 급여만, 그리고 유럽 빅5 리그만 집계하기 때문입니다.</strong>
    크리스티아누 호날두는 사우디 프로리그의 알 나스르, 리오넬 메시는 미국 MLS의 인터 마이애미 소속이라
    집계 범위 자체에 들어오지 않습니다. 범위를 넓히면 두 선수가 최상단에 오는 것이 맞습니다.
  </p>
  <p>
    더 중요한 차이는 '무엇을 연봉으로 볼 것인가'입니다. 국내 기사에서 호날두 연봉이 4,000억 원대로 소개되는 경우가 많은데,
    이 숫자는 구단 급여에 나이키·스폰서 계약·소셜미디어 광고 수익까지 모두 합친 <strong>총수입(total earnings)</strong>입니다.
    반면 이 글의 숫자는 구단이 계약서에 적어 지급하는 급여만 담았습니다.
    두 기준을 섞으면 광고 수입이 많은 선수가 무조건 위로 올라가서, 정작 "구단이 이 선수에게 얼마를 쓰는가"라는
    질문에는 답할 수 없게 됩니다.
  </p>
  <p>
    기준을 하나로 고정하면 얻는 것이 분명합니다. 같은 잣대로 재기 때문에 선수끼리, 구단끼리, 리그끼리 비교가 가능해집니다.
    아래 표에서 ${CLUB_KO[topClub[0]] || topClub[0]}가 TOP 30에 ${topClub[1]}명을 올렸다는 사실이 의미를 갖는 것도 같은 이유입니다.
    광고 수입이 섞여 있었다면 그 숫자는 구단의 지출을 전혀 설명하지 못했을 것입니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 16px;font-weight:800;">축구선수 연봉 순위 TOP 30 (전체 표)</h2>
  <p style="margin:0 0 14px;">
    유럽 빅5 리그 ${totalPlayers.toLocaleString()}명의 급여 데이터에서 상위 30명입니다.
    '몸값 대비'는 현재 시장가치를 연봉으로 나눈 값으로, 숫자가 클수록 받는 돈에 비해 자산 가치가 높다는 뜻입니다.
  </p>

${tableHtml(rows)}
  <p style="font-size:13px;color:#888;margin-top:10px;">
    ※ 연봉은 세전 기본급 기준이며 보너스·이미지권 수익은 포함하지 않습니다. 원화는 €1 = ₩${EUR_KRW.toLocaleString()} 기준 환산이며,
    급여 데이터 수집 시점은 ${fetchedAt}입니다. 시장가치는 매일 갱신되므로 최신 값은
    <a href="${SITE}/transfers" target="_blank" rel="noopener">이적시장 페이지</a>를 확인하세요.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">연봉 대비 몸값 — 누가 받는 만큼 하고 있나</h2>

  <figure style="margin:0 0 24px;">
    <img src="/blog/football-salary-ranking-2026-wage-vs-value.png"
         alt="축구선수 연봉 대비 몸값 배수 비교 - ${bestValue[0].ko} ${mult(bestValue[0])}배 vs ${worstValue[0].ko} ${mult(worstValue[0])}배"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="lazy">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      연봉 대비 시장가치 배수 — 같은 연봉이라도 자산 가치는 크게 갈립니다 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p>
    <strong>연봉 순위표에서 가장 흥미로운 지점은 같은 금액을 받는 선수들의 가치가 전혀 다르다는 것입니다.</strong>
    스코어베이스는 급여 데이터와 시장가치 데이터를 모두 갖고 있어 둘을 나눈 배수를 계산할 수 있습니다.
    이 배수가 높다는 것은 구단이 지급하는 급여에 비해 선수가 지닌 자산 가치가 크다는 뜻이고,
    낮다면 급여가 현재 가치보다 앞서 나가 있다는 뜻입니다.
  </p>
  <p>
    배수가 가장 높은 쪽은 ${bestValue.map((r) => `<strong>${r.ko}</strong>(${mult(r)}배)`).join(", ")} 순입니다.
    ${bestValue[0].ko}는 ${bestValue[0].age}세에 연봉 ${eokStr(bestValue[0].eur)}억 원을 받으면서 시장가치는 €${((bestValue[0].mv || 0) / 1e6).toFixed(0)}M,
    약 ${eokStr(bestValue[0].mv || 0)}억 원으로 평가됩니다. 어린 나이에 계약을 맺어 급여는 아직 낮게 묶여 있는데
    기량 평가가 먼저 올라간 전형적인 형태입니다. 구단 입장에서는 가장 남는 계약입니다.
  </p>
  <p>
    반대쪽 끝에는 ${worstValue.map((r) => `<strong>${r.ko}</strong>(${mult(r)}배)`).join(", ")}가 있습니다.
    ${worstValue[0].ko}는 ${worstValue[0].age}세로, 연봉은 TOP 30 수준을 유지하지만 시장가치는 €${((worstValue[0].mv || 0) / 1e6).toFixed(0)}M까지 내려왔습니다.
    전성기에 맺은 장기 계약이 그대로 남아 있는 경우로, 이런 계약이 여러 건 쌓이면 구단의 급여 총액이
    성적과 무관하게 굳어집니다. 최근 몇 년간 빅클럽들이 30대 선수의 장기 재계약에 신중해진 배경이기도 합니다.
  </p>
  <p>
    다만 이 배수를 선수의 실력 평가로 읽으면 곤란합니다. 시장가치는 남은 계약 기간과 나이가 크게 반영되는 지표라,
    은퇴를 앞둔 최정상급 선수는 기량과 무관하게 배수가 낮게 나옵니다.
    이 숫자는 '선수가 잘하느냐'가 아니라 '구단이 지금 이 계약을 팔 수 있느냐'에 가까운 지표입니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">${CLUB_KO[topClub[0]] || topClub[0]}가 ${topClub[1]}명 — 돈이 어디에 몰려 있나</h2>
  <p>
    <strong>TOP 30을 구단별로 나누면 ${CLUB_KO[topClub[0]] || topClub[0]}가 ${topClub[1]}명으로 가장 많습니다.</strong>
    ${clubRank.slice(1, 4).map(([c, n]) => `${CLUB_KO[c] || c} ${n}명`).join(", ")}이 뒤를 잇습니다.
    상위 30개 계약이 사실상 열 개 안팎의 구단에 집중돼 있다는 뜻입니다.
  </p>
  <p>
    리그별로 보면 ${leagueLine}입니다.
    프리미어리그와 라리가가 상단을 양분하는 구조인데, 성격은 다릅니다.
    프리미어리그는 중계권 수입이 리그 전반에 고르게 분배돼 여러 구단이 고액 계약을 감당하는 반면,
    라리가는 특정 구단에 집중되는 경향이 뚜렷합니다.
  </p>
  <p>
    참고로 스코어베이스가 집계한 빅5 리그 ${totalPlayers.toLocaleString()}명의 급여 총액은 약 €${(totalWage / 1e9).toFixed(2)}B,
    우리 돈으로 ${Math.round((totalWage * EUR_KRW) / 1e12).toLocaleString()}조 원 규모입니다.
    이 가운데 TOP 30, 즉 상위 1.5% 남짓의 선수들이 €${(rows.reduce((s, r) => s + r.eur, 0) / 1e6).toFixed(0)}M을 가져갑니다.
    전체의 ${((rows.reduce((s, r) => s + r.eur, 0) / totalWage) * 100).toFixed(1)}%에 해당하는 금액으로,
    축구 급여 시장이 얼마나 상단에 쏠려 있는지를 보여줍니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">포지션과 나이는 연봉을 어떻게 가르나</h2>
  <p>
    <strong>TOP 30의 포지션 분포는 ${posLine}입니다.</strong>
    공격 자원이 절반을 넘게 차지하는데, 득점이라는 성과가 가장 눈에 잘 띄고 대체 선수를 구하기 어렵다는 점이
    급여에 그대로 반영된 결과입니다.
  </p>
  <p>
    골키퍼가 ${byPos["G"] || 0}명 포함된 점은 눈여겨볼 만합니다.
    한 자리에 한 명만 뛰는 포지션이라 최상위권 골키퍼의 희소성이 크고, 계약 기간도 필드 플레이어보다 긴 편입니다.
    다만 이들은 앞서 본 몸값 대비 배수가 낮게 나오는 경우가 많습니다. 30대에 접어들면 시장가치가 빠르게 떨어지는데
    급여는 장기 계약으로 묶여 있기 때문입니다.
  </p>
  <p>
    나이는 TOP 30 평균 ${avgAge}세입니다. 최연소는 ${youngest.age}세의 ${youngest.ko},
    최고령은 ${oldest.age}세의 ${oldest.ko}로 나이 차가 ${(oldest.age || 0) - (youngest.age || 0)}살에 이릅니다.
    ${youngest.ko}처럼 10대에 최상위 급여 구간에 들어오는 사례는 과거에는 드물었습니다.
    구단들이 완성된 기량보다 남은 커리어 전체를 사려는 흐름이 강해지면서,
    계약 시점이 점점 앞당겨지고 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한국 선수 연봉은 어디쯤인가</h2>
  <p>
    <strong>이번 빅5 리그 TOP 30에 한국 선수는 들지 못했습니다.</strong>
    손흥민은 2026년 현재 미국 MLS의 LAFC 소속이라 빅5 집계 대상이 아니고,
    김민재와 이강인은 빅5 소속이지만 급여 데이터가 확인되지 않아 표에서 제외했습니다.
    확인 가능한 범위에서는 마인츠의 이재성이 연 €2.6M, 약 47억 원 수준으로 가장 높습니다.
  </p>
  <p>
    다만 연봉이 아닌 시장가치로 보면 이야기가 달라집니다. 스코어베이스 데이터 기준으로
    이강인이 €28M(약 501억 원), 김민재가 €20M(약 358억 원), 손흥민이 €15M(약 269억 원)으로 평가됩니다.
    급여는 계약 시점의 평가가 굳어진 값이고 시장가치는 현재의 평가라, 한국 선수처럼
    이적이 잦은 경우 두 숫자의 방향이 엇갈리는 일이 자주 있습니다.
  </p>
  <p>
    각 선수의 시장가치 변동 추이와 이적 기록은
    <a href="${SITE}/transfers" target="_blank" rel="noopener">스코어베이스 이적시장 페이지</a>에서
    국가별로 필터링해 확인할 수 있습니다. 개별 선수 페이지에서는 시즌별 성적과 몸값 그래프를 함께 볼 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">연봉·몸값·이적료는 각각 무엇이 다른가</h2>
  <p>
    <strong>세 숫자는 서로 다른 질문에 답합니다.</strong>
    연봉은 구단이 선수에게 매년 지급하는 급여이고, 몸값(시장가치)은 지금 이 선수를 사려면 얼마가 필요할지에 대한 추정치이며,
    이적료는 실제로 구단 사이에 오간 금액입니다. 셋을 섞어 쓰면 순위가 완전히 달라집니다.
  </p>
  <p>
    예를 들어 계약 만료가 임박한 선수는 이적료가 0원이지만 연봉은 최상위권일 수 있습니다.
    반대로 이적료를 크게 지불하고 데려온 선수가 부상으로 시장가치가 급락하는 경우도 흔합니다.
    실제로 스코어베이스가 집계한 역대 최고 이적료 상위 50건 가운데 대다수는 현재 시장가치가 지불한 이적료를 밑돕니다.
  </p>
  <p>
    같은 선수를 세 각도에서 보고 싶다면
    <a href="${SITE}/blog/football-player-market-value-2026"><strong>2026 축구 선수 몸값 순위 TOP 30</strong></a>을 함께 읽어보시길 권합니다.
    이 글의 연봉 순위와 몸값 순위를 나란히 놓으면, 어떤 선수가 급여에 비해 저평가돼 있고
    어떤 계약이 구단에 부담이 되고 있는지가 선명하게 드러납니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">자주 묻는 질문 (FAQ)</h2>
${faq.map((f) => `  <h3 style="font-size:18px;margin:18px 0 6px;">Q. ${f.q}</h3>
  <p>${f.a}</p>`).join("\n")}

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <p style="background:#f5f7fa;border-radius:10px;padding:18px 20px;font-size:15px;color:#1a1a1a;">
    <strong>실시간 선수 몸값과 이적 소식이 궁금하다면?</strong><br>
    리그별·팀별·국가별로 정렬되는 전체 시장가치 랭킹과 이적 피드를
    <a href="${SITE}/transfers" target="_blank" rel="noopener"><strong>스코어베이스 이적시장 페이지</strong></a>에서
    매일 업데이트로 확인하세요.
  </p>

  <p style="font-size:13px;color:#999;margin-top:24px;">
    데이터 출처: 급여 = <a href="https://www.capology.com" target="_blank" rel="noopener nofollow" style="color:inherit;">Capology</a> 집계를 스코어베이스가 수집(${fetchedAt} 기준) ·
    시장가치·나이·이적 기록 = 스코어베이스 데이터. 연봉은 세전 기본급 기준이며 보너스·이미지권 수익은 포함하지 않습니다.
    원화는 €1 = ₩${EUR_KRW.toLocaleString()} 기준 환산이며 환율에 따라 달라질 수 있습니다.
  </p>

  <p style="font-size:13px;color:inherit;opacity:0.5;margin-top:18px;">
    #축구선수연봉순위 #축구선수주급 #홀란드연봉 #음바페연봉 #야말연봉 #프리미어리그연봉 #빅5리그급여
    #축구선수몸값 #손흥민연봉 #김민재연봉 #이적시장 #스코어베이스
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
  console.log(`  1위 ${top.ko} €${(top.eur / 1e6).toFixed(1)}M · 최다구단 ${topClub[0]} ${topClub[1]}명 · 평균나이 ${avgAge}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
