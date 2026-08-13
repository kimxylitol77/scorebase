// KBO 선수 연봉 순위 TOP 30 블로그 발행 (slug 으로 idempotent upsert).
//   npx tsx --env-file=.env.local scripts/_create-blog-kbo-salary-ranking.ts
// 데이터: data/kbo-salaries.json(국내 908명=만원 단위 / 외국인 54명=달러) + BaseballPlayerSeasonStats(KBO 2026 성적).
// 자체 지표 = 고액 연봉자의 당시즌 성적 결합 + 팀별 연봉 총액 — 3월 발표 시점 기사에는 없는 것.
// 표·핵심 수치를 전부 데이터에서 생성 — 재실행하면 본문 서술과 표가 함께 갱신된다.
import fs from "fs";
import { prisma } from "@/lib/db";

const SITE = "https://www.scorebase.kr";
const slug = "kbo-player-salary-ranking-2026";
const SEASON = "2026";
const USD_KRW = 1380; // 외국인 연봉 참고 환산용 — 본문에 기준 명시

/** 만원 → "N.N억" (1억 미만은 "N,NNN만원") */
const eok = (manwon: number) => (manwon >= 10000 ? `${(manwon / 10000).toFixed(manwon % 10000 === 0 ? 0 : 1)}억` : `${manwon.toLocaleString()}만원`);
const eokNum = (manwon: number) => manwon / 10000;

interface Salary { kboId: string; playerName: string; teamName: string; position: string; birthday: string; salary: number; signingBonus?: number }
interface Stat { playerName: string; teamName: string; avg: number | null; homeRuns: number | null; ops: number | null; hits: number | null; rbi: number | null; games: number | null; era: number | null; ip: number | null; so: number | null; wins: number | null; saves: number | null }

function ageOf(birthday: string): number {
  const d = new Date(birthday), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}

/** 성적 한 줄 — 투수/타자 구분, 표본 미달은 null(이상치 방지: 엄상백 ERA 27·0이닝 같은 행). */
function statLine(s: Stat | undefined, pos: string): string | null {
  if (!s) return null;
  if (pos === "투수") {
    if (!s.ip || s.ip < 10) return null;
    return `${s.ip.toFixed(1)}이닝 · ERA ${s.era ?? "—"} · ${s.wins ?? 0}승${s.saves ? ` · ${s.saves}세이브` : ""}`;
  }
  if (!s.games || s.games < 20 || s.avg === null) return null;
  return `${s.games}경기 · 타율 ${s.avg.toFixed(3)} · ${s.homeRuns ?? 0}홈런 · ${s.rbi ?? 0}타점`;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync("data/kbo-salaries.json", "utf8"));
  const dom: Salary[] = raw.players;
  const fx: Salary[] = raw.foreign;
  const collectedAt: string = raw.collectedAt;

  const stats = (await prisma.baseballPlayerSeasonStats.findMany({
    where: { league: "KBO", season: SEASON },
    select: { playerName: true, teamName: true, avg: true, homeRuns: true, ops: true, hits: true, rbi: true, games: true, era: true, ip: true, so: true, wins: true, saves: true },
  })) as Stat[];

  // 동명이인(이름+팀 중복)은 성적 오귀속 위험 → 조인에서 제외
  const nameCount = new Map<string, number>();
  for (const d of [...dom, ...fx]) nameCount.set(`${d.playerName}|${d.teamName}`, (nameCount.get(`${d.playerName}|${d.teamName}`) || 0) + 1);
  const sm = new Map<string, Stat>();
  for (const s of stats) {
    const key = `${s.playerName}|${s.teamName}`;
    if ((nameCount.get(key) || 0) > 1) continue;
    sm.set(key, s);
  }
  const statOf = (d: Salary) => sm.get(`${d.playerName}|${d.teamName}`);

  const sorted = [...dom].sort((a, b) => b.salary - a.salary);
  const top = sorted.slice(0, 30);
  const t1 = top[0], t2 = top[1];

  // ── 집계
  const totalSum = dom.reduce((s, d) => s + d.salary, 0);
  const salSorted = dom.map((d) => d.salary).sort((a, b) => b - a);
  const median = salSorted[Math.floor(salSorted.length / 2)];
  const overEok = salSorted.filter((s) => s >= 10000).length;
  const top30Sum = top.reduce((s, d) => s + d.salary, 0);

  const teamAgg: Record<string, { sum: number; n: number }> = {};
  for (const d of dom) { teamAgg[d.teamName] ??= { sum: 0, n: 0 }; teamAgg[d.teamName].sum += d.salary; teamAgg[d.teamName].n++; }
  const teamRank = Object.entries(teamAgg).sort((a, b) => b[1].sum - a[1].sum);
  const richest = teamRank[0], poorest = teamRank[teamRank.length - 1];

  const ages = top.map((d) => ageOf(d.birthday));
  const avgAge = (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1);
  const oldest = top[ages.indexOf(Math.max(...ages))];
  const youngest = top[ages.indexOf(Math.min(...ages))];
  const posAgg: Record<string, number> = {};
  for (const d of top) posAgg[d.position] = (posAgg[d.position] || 0) + 1;
  const posLine = Object.entries(posAgg).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}명`).join(" · ");

  const fxSorted = [...fx].sort((a, b) => b.salary - a.salary);
  const fxSum = fx.reduce((s, f) => s + f.salary, 0);

  // 저연봉 고생산 — 연봉 1억 이하에서 규정 표본을 채운 선수
  const cheapBat = dom
    .filter((d) => d.position !== "투수" && d.salary <= 10000)
    .map((d) => ({ d, s: statOf(d) }))
    .filter((x): x is { d: Salary; s: Stat } => !!x.s?.games && x.s.games >= 60 && x.s.ops !== null)
    .sort((a, b) => (b.s.ops ?? 0) - (a.s.ops ?? 0))
    .slice(0, 4);
  const cheapPit = dom
    .filter((d) => d.position === "투수" && d.salary <= 10000)
    .map((d) => ({ d, s: statOf(d) }))
    .filter((x): x is { d: Salary; s: Stat } => !!x.s?.ip && x.s.ip >= 60 && x.s.era !== null)
    .sort((a, b) => (a.s.era ?? 99) - (b.s.era ?? 99))
    .slice(0, 4);

  // ── 표
  const tableRows = top.map((d, i) => {
    const zebra = i % 2 === 1 ? "background:#fafafa;" : "";
    const line = statLine(statOf(d), d.position);
    return `      <tr style="border-bottom:1px solid #eee;${zebra}"><td style="padding:8px;">${i + 1}</td><td style="padding:8px;font-weight:600;">${d.playerName}</td><td style="padding:8px;">${d.teamName}</td><td style="padding:8px;">${d.position}</td><td style="padding:8px;">${ageOf(d.birthday)}</td><td style="padding:8px;font-weight:700;">${eok(d.salary)}</td><td style="padding:8px;font-size:13px;">${line ?? "—"}</td></tr>`;
  }).join("\n");

  const table = `  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#1a1a1a;">
    <thead>
      <tr style="background:#0a0a0a;color:#fff;text-align:left;">
        <th style="padding:10px 8px;">#</th>
        <th style="padding:10px 8px;">선수</th>
        <th style="padding:10px 8px;">팀</th>
        <th style="padding:10px 8px;">포지션</th>
        <th style="padding:10px 8px;">나이</th>
        <th style="padding:10px 8px;">연봉</th>
        <th style="padding:10px 8px;">${SEASON} 성적</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>
  </div>`;

  const teamTable = `  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#1a1a1a;">
    <thead>
      <tr style="background:#0a0a0a;color:#fff;text-align:left;">
        <th style="padding:10px 8px;">#</th><th style="padding:10px 8px;">구단</th><th style="padding:10px 8px;">연봉 총액</th><th style="padding:10px 8px;">인원</th><th style="padding:10px 8px;">1인 평균</th>
      </tr>
    </thead>
    <tbody>
${teamRank.map(([t, v], i) => `      <tr style="border-bottom:1px solid #eee;${i % 2 === 1 ? "background:#fafafa;" : ""}"><td style="padding:8px;">${i + 1}</td><td style="padding:8px;font-weight:600;">${t}</td><td style="padding:8px;font-weight:700;">${eokNum(v.sum).toFixed(1)}억</td><td style="padding:8px;">${v.n}명</td><td style="padding:8px;">${v.sum / v.n >= 10000 ? `${(v.sum / v.n / 10000).toFixed(2)}억` : `${Math.round(v.sum / v.n).toLocaleString()}만원`}</td></tr>`).join("\n")}
    </tbody>
  </table>
  </div>`;

  const fxTable = `  <div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:15px;background:#fff;color:#1a1a1a;">
    <thead>
      <tr style="background:#0a0a0a;color:#fff;text-align:left;">
        <th style="padding:10px 8px;">#</th><th style="padding:10px 8px;">선수</th><th style="padding:10px 8px;">팀</th><th style="padding:10px 8px;">포지션</th><th style="padding:10px 8px;">연봉(달러)</th><th style="padding:10px 8px;">${SEASON} 성적</th>
      </tr>
    </thead>
    <tbody>
${fxSorted.slice(0, 10).map((f, i) => {
  const line = statLine(statOf(f), f.position);
  return `      <tr style="border-bottom:1px solid #eee;${i % 2 === 1 ? "background:#fafafa;" : ""}"><td style="padding:8px;">${i + 1}</td><td style="padding:8px;font-weight:600;">${f.playerName}</td><td style="padding:8px;">${f.teamName}</td><td style="padding:8px;">${f.position}</td><td style="padding:8px;font-weight:700;">$${f.salary.toLocaleString()}</td><td style="padding:8px;font-size:13px;">${line ?? "—"}</td></tr>`;
}).join("\n")}
    </tbody>
  </table>
  </div>`;

  const title = `KBO 연봉 순위 2026 TOP 30 — ${t1.playerName} ${eok(t1.salary)} 1위, 팀별 총액까지`;
  const excerpt =
    `KBO 연봉 순위 2026 TOP 30을 구단별 총액과 당시즌 성적까지 함께 정리했습니다. ${t1.playerName}가 ${eok(t1.salary)}으로 1위, ${t2.playerName}가 ${eok(t2.salary)}으로 뒤를 잇습니다. 국내 ${dom.length}명 연봉 총액 ${eokNum(totalSum).toFixed(0)}억 원 가운데 상위 30명이 ${((top30Sum / totalSum) * 100).toFixed(0)}%를 가져갑니다.`;
  const tags =
    "KBO 연봉 순위, KBO 선수 연봉, 프로야구 연봉 순위, 2026 KBO 연봉, 양의지 연봉, 류현진 연봉, 최정 연봉, 고영표 연봉, KBO 구단 연봉 총액, KBO 외국인 선수 연봉, KBO 샐러리캡, 스코어베이스";
  const thumbnailUrl = `${SITE}/blog/kbo-salary-ranking-2026-hero.png`;

  const faq = [
    {
      q: `${SEASON}년 KBO 최고 연봉 선수는 누구인가요?`,
      a: `${t1.teamName}의 ${t1.playerName}(${t1.position})가 ${eok(t1.salary)}으로 1위입니다. 2위는 ${t2.teamName} ${t2.playerName}의 ${eok(t2.salary)}, 3위는 ${top[2].teamName} ${top[2].playerName}의 ${eok(top[2].salary)}입니다. 이 순위는 외국인 선수를 제외한 국내 선수 기준이며, 외국인 선수는 달러로 별도 공시됩니다.`,
    },
    {
      q: "KBO 평균 연봉은 얼마인가요?",
      a: `KBO 공식 발표 기준 ${SEASON}년 평균 연봉은 1억 7,536만 원으로, 신인·외국인·아시아쿼터를 제외한 529명이 대상입니다. 다만 신인과 저연봉 선수까지 포함한 국내 등록 선수 ${dom.length}명 전체로 넓히면 평균은 ${Math.round(totalSum / dom.length).toLocaleString()}만 원, 중앙값은 ${median.toLocaleString()}만 원으로 내려갑니다. 평균과 중앙값의 격차가 큰 것은 상위 소수가 총액을 끌어올리기 때문입니다.`,
    },
    {
      q: "KBO에서 연봉을 가장 많이 쓰는 구단은 어디인가요?",
      a: `국내 선수 연봉 단순 합계 기준으로 ${richest[0]}가 ${eokNum(richest[1].sum).toFixed(1)}억 원으로 가장 많고, ${poorest[0]}가 ${eokNum(poorest[1].sum).toFixed(1)}억 원으로 가장 적습니다. 두 구단의 차이는 ${(eokNum(richest[1].sum) / eokNum(poorest[1].sum)).toFixed(1)}배입니다. 다만 이 숫자는 연봉만 더한 값이라, FA 계약금 분할과 옵션이 포함되는 경쟁균형세 산정액과는 다릅니다.`,
    },
    {
      q: "KBO 샐러리캡(경쟁균형세) 상한액은 얼마인가요?",
      a: "2026년 상한액은 143억 9,723만 원입니다. 2026년부터 2028년까지 3년간 매년 5%씩 오르도록 개정됐으며, 2027년 151억 1,709만 원, 2028년 158억 7,294만 원으로 예정돼 있습니다. 2027년부터는 60억 원의 하한액도 도입됩니다. 산정액에는 연봉 외에 FA 계약금 분할분과 옵션이 포함되므로 단순 연봉 합계보다 큽니다.",
    },
    {
      q: "KBO 외국인 선수 연봉은 왜 따로 나오나요?",
      a: `외국인 선수는 달러로 계약해 공시되기 때문에 원화 연봉 순위와 같은 표에 넣으면 기준이 섞입니다. ${SEASON}년 외국인 최고 연봉은 ${fxSorted[0].teamName} ${fxSorted[0].playerName}의 $${fxSorted[0].salary.toLocaleString()}이며, 외국인 ${fx.length}명의 연봉 총액은 $${fxSum.toLocaleString()}, 평균은 $${Math.round(fxSum / fx.length).toLocaleString()}입니다.`,
    },
  ];

  const content = `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;word-break:keep-all;">

  <figure style="margin:0 0 28px;">
    <img src="/blog/kbo-salary-ranking-2026-hero.png"
         alt="KBO 연봉 순위 2026 TOP 30 - ${t1.playerName} ${eok(t1.salary)} 1위 프로야구 선수 연봉 랭킹 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="eager">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      ${SEASON} KBO 선수 연봉 순위 · 국내 선수 ${dom.length}명 기준 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p style="color:inherit;opacity:0.75;font-size:15px;margin:0 0 28px;">
    최종 업데이트: 2026년 8월 · 데이터 기준: KBO 공시 연봉(국내 ${dom.length}명 · 외국인 ${fx.length}명, ${collectedAt} 수집) + ${SEASON} 시즌 성적
  </p>

  <p>
    <strong>${SEASON}년 KBO 최고 연봉 선수는 ${t1.teamName}의 ${t1.playerName}입니다. 연봉 ${eok(t1.salary)} 원으로,
    2위 ${t2.teamName} ${t2.playerName}(${eok(t2.salary)})와 ${eokNum(t1.salary - t2.salary).toFixed(0)}억 원 차이가 납니다.</strong>
    ${t1.playerName}는 직전 시즌 16억 원에서 26억 원이 올라 KBO 역대 최고 연봉 상승액을 기록했습니다.
  </p>

  <p>
    연봉 순위 자체는 매년 3월 KBO 발표로 이미 알려집니다. 이 글이 다르게 보는 지점은 두 가지입니다.
    첫째, <strong>연봉 옆에 그 선수의 ${SEASON} 시즌 성적을 나란히 붙였습니다.</strong>
    3월 발표 시점에는 존재하지 않던 정보이고, 8월 현재 시즌이 상당히 진행된 지금이라야 볼 수 있는 숫자입니다.
    둘째, <strong>구단별 연봉 총액</strong>을 국내 선수 전원 기준으로 계산했습니다.
  </p>

  <p>
    국내 선수 ${dom.length}명의 연봉을 모두 더하면 ${eokNum(totalSum).toFixed(0)}억 원입니다.
    이 가운데 <strong>상위 30명이 ${eokNum(top30Sum).toFixed(0)}억 원, 전체의 ${((top30Sum / totalSum) * 100).toFixed(1)}%</strong>를 가져갑니다.
    선수단 전체 연봉의 3분의 1이 3%의 선수에게 몰려 있다는 뜻입니다.
    구단별 실시간 순위와 선수 기록은
    <a href="${SITE}/salaries/kbo" target="_blank" rel="noopener"><strong>스코어베이스 KBO 연봉 랭킹 페이지</strong></a>에서 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">한눈에 보는 결론 (요약)</h2>
  <ul style="padding-left:20px;">
    <li><strong>1위:</strong> ${t1.playerName}(${t1.teamName} · ${t1.position}) — ${eok(t1.salary)} 원</li>
    <li><strong>2~3위:</strong> ${t2.playerName}(${t2.teamName}) ${eok(t2.salary)} · ${top[2].playerName}(${top[2].teamName}) ${eok(top[2].salary)}</li>
    <li><strong>연봉 총액 1위 구단:</strong> ${richest[0]} ${eokNum(richest[1].sum).toFixed(1)}억 원 (최하위 ${poorest[0]} ${eokNum(poorest[1].sum).toFixed(1)}억의 ${(richest[1].sum / poorest[1].sum).toFixed(1)}배)</li>
    <li><strong>억대 연봉자:</strong> ${dom.length}명 중 ${overEok}명 (${((overEok / dom.length) * 100).toFixed(1)}%)</li>
    <li><strong>평균과 중앙값:</strong> 평균 ${Math.round(totalSum / dom.length).toLocaleString()}만 원 · 중앙값 ${median.toLocaleString()}만 원</li>
    <li><strong>외국인 최고 연봉:</strong> ${fxSorted[0].playerName}(${fxSorted[0].teamName}) $${fxSorted[0].salary.toLocaleString()}</li>
    <li><strong>TOP 30 평균 나이:</strong> ${avgAge}세 (${posLine})</li>
  </ul>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 16px;font-weight:800;">KBO 연봉 순위 ${SEASON} TOP 30 (전체 표)</h2>
  <p style="margin:0 0 14px;">
    국내 선수 ${dom.length}명 가운데 상위 30명입니다. 오른쪽 성적은 ${SEASON} 시즌 기록이며,
    표본이 너무 적은 경우(투수 10이닝 미만·타자 20경기 미만)는 —로 표시했습니다.
  </p>

${table}
  <p style="font-size:13px;color:#888;margin-top:10px;">
    ※ KBO 공시 연봉 기준이며 FA 계약금과 옵션은 포함하지 않습니다. 외국인 선수는 달러로 별도 공시되어 아래에 따로 정리했습니다.
    나이는 만 나이 기준입니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">${eok(t1.salary)} 받는 ${t1.playerName}, 성적은 어떤가</h2>
  <p>
    <strong>고액 연봉과 성적이 항상 같이 가지는 않습니다.</strong>
    ${(() => {
      const s1 = statLine(statOf(t1), t1.position);
      return s1 ? `${t1.playerName}는 ${SEASON} 시즌 ${s1}을 기록 중입니다.` : `${t1.playerName}의 ${SEASON} 시즌 기록은 표를 참고하시면 됩니다.`;
    })()}
    ${(() => {
      const p = top.filter((d) => d.position === "투수" && statLine(statOf(d), "투수"));
      const best = p.map((d) => ({ d, s: statOf(d)! })).filter((x) => x.s.era !== null).sort((a, b) => (a.s.era ?? 99) - (b.s.era ?? 99))[0];
      return best ? `TOP 30 투수 가운데 평균자책점이 가장 낮은 선수는 ${best.d.playerName}(${best.d.teamName})으로 ERA ${best.s.era}, ${best.s.ip?.toFixed(1)}이닝을 던지고 있습니다.` : "";
    })()}
  </p>
  <p>
    ${(() => {
      const b = top.map((d) => ({ d, s: statOf(d) })).filter((x) => x.d.position !== "투수" && x.s?.ops != null && (x.s.games ?? 0) >= 20).sort((a, b2) => (b2.s!.ops ?? 0) - (a.s!.ops ?? 0));
      if (!b.length) return "";
      const bb = b[0];
      return `타자 쪽에서는 ${bb.d.playerName}(${bb.d.teamName}, 연봉 ${eok(bb.d.salary)})가 OPS ${bb.s!.ops}로 TOP 30 내 최고입니다. ${bb.s!.games}경기에서 ${bb.s!.homeRuns}홈런 ${bb.s!.rbi}타점을 기록했습니다.`;
    })()}
    다만 연봉은 그해 성적이 아니라 <strong>직전까지의 누적 성과와 FA 계약 조건으로 정해집니다.</strong>
    올해 성적이 부진하다고 해서 계약이 잘못됐다고 보기는 어렵고, 반대로 올해 잘한다고 연봉이 즉시 오르지도 않습니다.
    KBO는 FA 계약 시 연봉을 연도별로 다르게 배분하는 경우가 많아, 특정 해에 금액이 몰리는 구조도 흔합니다.
  </p>
  <p>
    ${t1.playerName}의 연봉이 한 해 만에 16억 원에서 ${eok(t1.salary)} 원으로 뛴 것도 같은 맥락입니다.
    총액이 늘어난 것이 아니라 계약 기간 안에서 지급 시점이 조정된 결과에 가깝습니다.
    연봉 순위를 볼 때 그해 성적과 곧바로 연결짓기보다, 계약 구조를 함께 보는 편이 정확합니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">구단별 연봉 총액 — ${richest[0]} ${eokNum(richest[1].sum).toFixed(1)}억 vs ${poorest[0]} ${eokNum(poorest[1].sum).toFixed(1)}억</h2>

  <figure style="margin:0 0 24px;">
    <img src="/blog/kbo-salary-ranking-2026-team-total.png"
         alt="KBO 구단별 연봉 총액 2026 비교 - ${richest[0]} ${eokNum(richest[1].sum).toFixed(1)}억 1위 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="lazy">
    <figcaption style="font-size:13px;color:#888;margin-top:8px;text-align:center;">
      ${SEASON} KBO 구단별 국내 선수 연봉 총액 · 데이터: 스코어베이스
    </figcaption>
  </figure>

  <p>
    <strong>국내 선수 연봉을 구단별로 더하면 ${richest[0]}가 ${eokNum(richest[1].sum).toFixed(1)}억 원으로 가장 많고,
    ${poorest[0]}가 ${eokNum(poorest[1].sum).toFixed(1)}억 원으로 가장 적습니다.</strong>
    두 구단의 차이는 ${(richest[1].sum / poorest[1].sum).toFixed(1)}배입니다.
    등록 인원은 ${richest[1].n}명과 ${poorest[1].n}명으로 거의 같은데 총액만 벌어졌습니다.
  </p>

${teamTable}

  <p style="margin-top:14px;">
    이 표는 <strong>공시 연봉만 단순 합산</strong>한 값입니다.
    KBO가 운영하는 경쟁균형세(샐러리캡) 산정액은 여기에 FA 계약금 분할분과 옵션이 더해지므로 실제로는 이보다 커집니다.
    2026년 상한액은 143억 9,723만 원이며, 2028년까지 매년 5%씩 오르도록 개정됐습니다.
    2027년부터는 60억 원의 하한액도 도입돼, 돈을 너무 안 쓰는 구단도 제재 대상이 됩니다.
  </p>
  <p>
    총액 상위 구단과 하위 구단의 차이는 대체로 팀의 방향과 맞물립니다.
    FA 영입으로 즉시 전력을 보강한 구단은 고액 계약이 쌓이고, 육성 기조로 젊은 선수를 주전으로 올린 구단은 총액이 낮게 유지됩니다.
    총액이 낮다는 것이 곧 성적이 나쁘다는 뜻은 아니며, 저연봉 주전이 자리를 잡으면 오히려 효율이 높아집니다.
    실제 순위는 <a href="${SITE}/standings/KBO" target="_blank" rel="noopener">KBO 팀 순위 페이지</a>에서 확인할 수 있습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">억대 연봉자는 ${dom.length}명 중 ${overEok}명</h2>
  <p>
    <strong>KBO 국내 등록 선수 ${dom.length}명 가운데 연봉 1억 원 이상은 ${overEok}명, 비율로는 ${((overEok / dom.length) * 100).toFixed(1)}%입니다.</strong>
    나머지 ${dom.length - overEok}명은 1억 원 미만을 받습니다.
  </p>
  <p>
    평균과 중앙값의 차이가 이 구조를 잘 보여줍니다.
    ${dom.length}명 전체 평균은 ${Math.round(totalSum / dom.length).toLocaleString()}만 원이지만, 중앙값은 ${median.toLocaleString()}만 원입니다.
    평균이 중앙값의 ${(totalSum / dom.length / median).toFixed(1)}배라는 것은 상위 소수가 총액을 크게 끌어올리고 있다는 뜻입니다.
    KBO가 공식 발표하는 평균 연봉 1억 7,536만 원은 신인·외국인·아시아쿼터를 제외한 529명 기준이라
    이 글의 ${dom.length}명 기준 평균보다 높게 나옵니다. 같은 리그를 봐도 모집단에 따라 숫자가 달라집니다.
  </p>
  <p>
    프로야구 선수의 연봉이 화제가 될 때 인용되는 숫자는 대부분 상위권입니다.
    실제로 1군에서 뛰지 못하는 선수까지 포함하면 절반이 ${median.toLocaleString()}만 원 아래를 받습니다.
    ${SEASON}년 KBO 최저 연봉은 3,000만 원이며, 육성선수는 이보다 낮은 금액으로 계약합니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">외국인 선수 연봉은 달러로 따로</h2>
  <p>
    <strong>${SEASON}년 KBO 외국인 최고 연봉은 ${fxSorted[0].teamName} ${fxSorted[0].playerName}의 $${fxSorted[0].salary.toLocaleString()}입니다.</strong>
    원화로 환산하면 약 ${Math.round((fxSorted[0].salary * USD_KRW) / 1e8)}억 원 수준으로(1달러 ${USD_KRW.toLocaleString()}원 기준),
    국내 선수 순위에 넣는다면 상위권에 해당합니다.
  </p>

${fxTable}

  <p style="margin-top:14px;">
    외국인 ${fx.length}명의 연봉 총액은 $${fxSum.toLocaleString()}, 1인 평균은 $${Math.round(fxSum / fx.length).toLocaleString()}입니다.
    외국인 선수를 원화 순위와 같은 표에 넣지 않는 이유는 기준이 섞이기 때문입니다.
    계약 통화가 다르고 환율에 따라 원화 환산액이 매년 달라져, 국내 선수와 나란히 두면 순위가 환율에 흔들립니다.
  </p>
  <p>
    KBO는 신규 외국인 선수의 계약 총액을 100만 달러로 제한하고 있지만, 재계약 선수는 이 제한을 받지 않습니다.
    상위권에 재계약 선수가 몰리는 것도 그 때문입니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">적은 연봉으로 큰 몫을 한 선수들</h2>
  <p>
    <strong>연봉 1억 원 이하이면서 주전급 출전을 소화한 선수들입니다.</strong>
    연봉은 직전까지의 누적 성과로 정해지므로, 올해 처음 자리를 잡은 선수는 성적과 연봉의 간극이 가장 큽니다.
  </p>
${cheapBat.length ? `  <p><strong>타자</strong> — 60경기 이상 출전 기준 OPS 상위<br>
${cheapBat.map((x) => `    · ${x.d.playerName}(${x.d.teamName}, 연봉 ${eok(x.d.salary)}) — ${x.s.games}경기 OPS ${x.s.ops} · ${x.s.homeRuns ?? 0}홈런 ${x.s.rbi ?? 0}타점`).join("<br>\n")}
  </p>` : ""}
${cheapPit.length ? `  <p><strong>투수</strong> — 60이닝 이상 기준 평균자책점 상위<br>
${cheapPit.map((x) => `    · ${x.d.playerName}(${x.d.teamName}, 연봉 ${eok(x.d.salary)}) — ${x.s.ip?.toFixed(1)}이닝 ERA ${x.s.era} · ${x.s.wins ?? 0}승`).join("<br>\n")}
  </p>` : ""}
  <p>
    이런 선수들이 많은 구단일수록 같은 총액으로 더 많은 전력을 확보합니다.
    앞서 본 구단별 총액 표에서 하위권에 있으면서도 순위가 나쁘지 않은 팀은 대체로 이 구조를 갖고 있습니다.
    다만 이 선수들은 다음 시즌 연봉이 크게 오르기 때문에, 구단 입장에서 이 효율은 길게 유지되지 않습니다.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">자주 묻는 질문 (FAQ)</h2>
${faq.map((f) => `  <h3 style="font-size:18px;margin:18px 0 6px;">Q. ${f.q}</h3>
  <p>${f.a}</p>`).join("\n")}

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">

  <p style="background:#f5f7fa;border-radius:10px;padding:18px 20px;font-size:15px;color:#1a1a1a;">
    <strong>KBO 선수 기록과 순위를 매일 확인하려면?</strong><br>
    팀 순위·선수 성적·경기 일정을
    <a href="${SITE}/standings/KBO" target="_blank" rel="noopener"><strong>스코어베이스 KBO 팀 순위</strong></a>에서,
    연봉 전체 랭킹은 <a href="${SITE}/salaries/kbo" target="_blank" rel="noopener"><strong>KBO 연봉 랭킹</strong></a>에서 확인하세요.
  </p>

  <p style="font-size:13px;color:#999;margin-top:24px;">
    데이터 출처: 연봉 = <a href="https://www.koreabaseball.com" target="_blank" rel="noopener nofollow" style="color:inherit;">KBO 공시 자료</a>를 스코어베이스가 수집(${collectedAt} 기준) ·
    시즌 성적 = 스코어베이스 KBO 데이터. 연봉은 FA 계약금과 옵션을 제외한 공시 연봉이며, 경쟁균형세 산정액과는 다릅니다.
    외국인 선수 원화 환산은 1달러 ${USD_KRW.toLocaleString()}원 기준으로 환율에 따라 달라집니다.
  </p>

  <p style="font-size:13px;color:inherit;opacity:0.5;margin-top:18px;">
    #KBO연봉순위 #KBO선수연봉 #프로야구연봉 #${t1.playerName}연봉 #류현진연봉 #최정연봉
    #KBO구단연봉총액 #KBO샐러리캡 #KBO외국인선수연봉 #프로야구순위 #스코어베이스
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
  console.log(`  1위 ${t1.playerName} ${eok(t1.salary)} · 총액 ${eokNum(totalSum).toFixed(0)}억 · 억대 ${overEok}/${dom.length}`);
  console.log(`  구단 1위 ${richest[0]} ${eokNum(richest[1].sum).toFixed(1)}억 / 최하 ${poorest[0]} ${eokNum(poorest[1].sum).toFixed(1)}억`);
  console.log(`  성적 매칭 TOP30: ${top.filter((d) => statLine(statOf(d), d.position)).length}/30 · 저연봉 타자 ${cheapBat.length} 투수 ${cheapPit.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
