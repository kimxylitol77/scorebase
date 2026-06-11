// 주간 이적시장 블로그 자동 발행 — Blog 테이블 upsert (slug: transfer-weekly-YYYY-MM-DD).
// 수동 발행 글(summer-transfer-window-2026, 2026-06-11)에서 검증한 템플릿·데이터 로직 그대로.
//
// 데이터 구성 (전부 우리 DB — TheSports 직접 호출 없음, Vercel cron 안전):
//   ① 주간 신규 빅딜 — updatedAt 7일 내(이번 주 수집분) + transferTime 이적창 내 (백필 잔상·발효일 반복 노출 차단)
//   ② 몸값 급등/급락 — /transfers 마켓 무브와 동일 (직전 업데이트 대비, 출발 €3M+) + 14일 내 갱신분만 (주간 중복 방지)
//   ③ 구단 지갑 — 이적창 개장 후 누적 (빅5, 공개 이적료)
// 얇은 주(딜·무브 모두 적음)는 발행 skip — 5월 색인 절벽 교훈 (대량 저품질 자동 글 금지).
// LLM 은 서술 문단만 담당, 수치·표는 결정적 생성. LLM 실패 시 템플릿 문장 폴백.
//   provider = claude.ts (haiku) — 현역 글 생성 잡(PREVIEW/RECAP/ANALYSIS)과 동일 경로.
//   openai.ts 는 Vercel 에서 실패 실측(2026-06-12, 키 미가동 추정) — 전환 금지.

import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { toKoreanTeamName } from "@/lib/team-names";
import { koTeam } from "@/app/transfers/transfer-display";
import rawOverrides from "../../data/player-overrides.json";

const OVERRIDES = rawOverrides as Record<string, { nameKo?: string }>;
const SITE = "https://www.scorebase.kr";
const FIVE = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const FEED_LEAGUES = [...FIVE, "K_LEAGUE_1", "SAUDI_PL", "MLS"];
const EUR_KRW = 1791.5;

const krw = (eur: number) => {
  const eok = (eur * EUR_KRW) / 1e8;
  return eok >= 10000 ? (eok / 10000).toFixed(2) + "조" : Math.round(eok).toLocaleString() + "억";
};
const feeM = (eur: number) => `€${Math.round(eur / 1e5) / 10}M`;

// 이적창 윈도우 — transfers/page.tsx 와 동일 규칙
function transferWindow(): { label: string; from: number } {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  if (m >= 6 && m <= 9) return { label: `${y} 여름 이적시장`, from: Date.UTC(y, 5, 1) / 1000 };
  if (m === 12) return { label: `${y + 1} 겨울 이적시장`, from: Date.UTC(y, 11, 1) / 1000 };
  if (m <= 2) return { label: `${y} 겨울 이적시장`, from: Date.UTC(y - 1, 11, 1) / 1000 };
  return { label: "최근 90일", from: Math.floor(now.getTime() / 1000) - 90 * 86400 };
}

interface Deal { id: string; name: string; from: string; to: string; fee: number }
interface Mover { id: string; name: string; v: number; prev: number; chg: number; league: string }
interface Wallet { team: string; inCnt: number; inFee: number; outFee: number }

interface WeeklyData {
  kst: Date;
  win: { label: string; from: number };
  weekDeals: Deal[];
  winFeeCnt: number;
  winFeeSum: number;
  rising: Mover[];
  falling: Mover[];
  spend: Wallet[];
  earn: Wallet[];
}

const LEAGUE_KO: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 1",
  K_LEAGUE_1: "K리그1", SAUDI_PL: "사우디", MLS: "MLS",
};

async function collectData(): Promise<WeeklyData> {
  const kst = new Date(Date.now() + 9 * 3600_000); // KST 표기용
  const win = transferWindow();
  const nowSec = Math.floor(Date.now() / 1000);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  // ① 주간 신규 빅딜
  const dealRows = await prisma.footballTransfer.findMany({
    where: {
      league: { in: FEED_LEAGUES },
      updatedAt: { gte: weekAgo },
      transferTime: { gte: win.from, lte: nowSec + 60 * 86400 },
      transferFee: { gt: 0 },
    },
    orderBy: { transferFee: "desc" },
    take: 30,
  });
  const dIds = [...new Set(dealRows.map((r) => r.playerId))];
  const dPlayers = await prisma.theSportsPlayer.findMany({
    where: { id: { in: dIds } },
    select: { id: true, nameKo: true, name: true },
  });
  const dMap = new Map(dPlayers.map((p) => [p.id, p]));
  const dSeen = new Set<string>();
  const weekDeals: Deal[] = [];
  for (const r of dealRows) {
    const k = `${r.playerId}|${r.toTeamId}|${r.transferFee}`;
    if (dSeen.has(k)) continue;
    dSeen.add(k);
    const p = dMap.get(r.playerId);
    const name = OVERRIDES[r.playerId]?.nameKo || p?.nameKo || p?.name;
    if (!name) continue; // 이름 미상 제외
    weekDeals.push({ id: r.playerId, name, from: koTeam(r.fromTeamName || ""), to: koTeam(r.toTeamName || ""), fee: r.transferFee || 0 });
    if (weekDeals.length >= 5) break;
  }

  // 이적창 누적 (공개 이적료)
  const winRows = await prisma.footballTransfer.findMany({
    where: { league: { in: FEED_LEAGUES }, transferTime: { gte: win.from }, transferFee: { gt: 0 } },
    select: { playerId: true, toTeamId: true, transferFee: true },
  });
  const wSeen = new Set<string>();
  let winFeeSum = 0, winFeeCnt = 0;
  for (const r of winRows) {
    const k = `${r.playerId}|${r.toTeamId}|${r.transferFee}`;
    if (wSeen.has(k)) continue;
    wSeen.add(k);
    winFeeSum += r.transferFee || 0;
    winFeeCnt++;
  }

  // ② 몸값 급등/급락 — 14일 내 갱신된 무버만
  const fresh = nowSec - 14 * 86400;
  const raw = await prisma.playerMarketValue.findMany({
    where: { league: { in: FIVE }, currentValue: { not: null } },
    orderBy: { currentValue: "desc" },
    select: { id: true, currentValue: true, league: true, history: true },
  });
  const pIds = raw.map((r) => r.id);
  const ps = await prisma.theSportsPlayer.findMany({ where: { id: { in: pIds } }, select: { id: true, nameKo: true, name: true } });
  const pMap = new Map(ps.map((p) => [p.id, p]));
  interface Hist { market_value?: number; market_time?: number }
  const mSeen = new Set<string>();
  const movers: Mover[] = [];
  for (const r of raw) {
    const hist = Array.isArray(r.history) ? (r.history as Hist[]) : [];
    const last = hist[hist.length - 1];
    if ((last?.market_time ?? 0) < fresh) continue; // 최근 갱신분만
    const vals = hist.map((h) => (h?.market_value || 0) / 1e6).filter((v) => v > 0);
    if (vals.length < 2 || vals[vals.length - 2] < 3) continue; // 저가 노이즈 제거
    const p = pMap.get(r.id);
    const name = OVERRIDES[r.id]?.nameKo || p?.nameKo || p?.name;
    if (!name) continue;
    if (mSeen.has(name)) continue;
    mSeen.add(name);
    const prev = vals[vals.length - 2];
    const v = Math.round((r.currentValue || 0) / 1e6);
    movers.push({ id: r.id, name, v, prev, chg: Math.round(((v - prev) / prev) * 100), league: LEAGUE_KO[r.league || ""] || r.league || "" });
  }
  const rising = movers.filter((m) => m.chg > 0).sort((a, b) => b.chg - a.chg).slice(0, 5);
  const falling = movers.filter((m) => m.chg < 0).sort((a, b) => a.chg - b.chg).slice(0, 5);

  // ③ 구단 지갑 — 이적창 누적 (빅5)
  const big5Teams = await prisma.team.findMany({ where: { league: { in: FIVE } }, select: { id: true, name: true } });
  const tsRows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", teamId: { in: big5Teams.map((t) => t.id) } },
    select: { externalId: true, teamId: true },
  });
  const extToOur = new Map(tsRows.map((t) => [t.externalId, t.teamId]));
  const winT = await prisma.footballTransfer.findMany({
    where: { transferTime: { gte: win.from }, OR: [{ toTeamId: { in: tsRows.map((t) => t.externalId) } }, { fromTeamId: { in: tsRows.map((t) => t.externalId) } }] },
    select: { playerId: true, toTeamId: true, fromTeamId: true, transferFee: true },
  });
  const agg = new Map<number, { inCnt: number; inFee: number; outFee: number }>();
  const tSeen = new Set<string>();
  for (const r of winT) {
    const k = `${r.playerId}|${r.toTeamId}|${r.fromTeamId}|${r.transferFee}`;
    if (tSeen.has(k)) continue;
    tSeen.add(k);
    const inOur = r.toTeamId ? extToOur.get(r.toTeamId) : undefined;
    if (inOur != null) {
      const a = agg.get(inOur) || { inCnt: 0, inFee: 0, outFee: 0 };
      a.inCnt++; a.inFee += r.transferFee || 0; agg.set(inOur, a);
    }
    const outOur = r.fromTeamId ? extToOur.get(r.fromTeamId) : undefined;
    if (outOur != null) {
      const a = agg.get(outOur) || { inCnt: 0, inFee: 0, outFee: 0 };
      a.outFee += r.transferFee || 0; agg.set(outOur, a);
    }
  }
  const nm = new Map(big5Teams.map((t) => [t.id, t.name]));
  const wallets: Wallet[] = [...agg.entries()].map(([id, a]) => ({
    team: toKoreanTeamName(nm.get(id) || "") || nm.get(id) || "",
    ...a,
  }));
  const spend = wallets.filter((w) => w.inFee > 0).sort((a, b) => b.inFee - a.inFee).slice(0, 5);
  const earn = wallets.filter((w) => w.outFee > 0).sort((a, b) => b.outFee - a.outFee).slice(0, 3);

  return { kst, win, weekDeals, winFeeCnt, winFeeSum, rising, falling, spend, earn };
}

// LLM 서술 — 수치는 표가 책임지고 LLM 은 문단만. 실패 시 null → 템플릿 폴백.
async function narrate(d: WeeklyData): Promise<{ intro: string; deals: string; wallet: string } | null> {
  const facts = {
    기간: `${d.win.label}, 이번 주 리포트`,
    주간_빅딜: d.weekDeals.map((x) => `${x.name} ${x.from}→${x.to} ${feeM(x.fee)}(${krw(x.fee)})`),
    이적창_누적: `공개 이적료 ${d.winFeeCnt}건 합 ${feeM(d.winFeeSum)}(${krw(d.winFeeSum)})`,
    몸값_급등: d.rising.map((x) => `${x.name}(${x.league}) €${x.prev}M→€${x.v}M +${x.chg}%`),
    몸값_급락: d.falling.map((x) => `${x.name}(${x.league}) €${x.prev}M→€${x.v}M ${x.chg}%`),
    지출_상위: d.spend.map((x) => `${x.team} ${feeM(x.inFee)} ${x.inCnt}명`),
    수입_상위: d.earn.map((x) => `${x.team} +${feeM(x.outFee)}`),
  };
  try {
    const res = await generate(
      `아래 JSON 은 이번 주 축구 이적시장 데이터다. 이 수치만 사용해 블로그 리포트의 서술 문단 3개를 작성하라.\n\n` +
        `${JSON.stringify(facts, null, 1)}\n\n` +
        `응답은 JSON 하나만: {"intro": "...", "deals": "...", "wallet": "..."}\n` +
        `- intro: 글 도입부 2~3문장. 이번 주 시장 분위기를 핵심 수치 1~2개로 요약.\n` +
        `- deals: 빅딜 표 아래 코멘트 2~3문장. 최고액 딜 중심.\n` +
        `- wallet: 구단 지출 표 아래 코멘트 1~2문장.\n` +
        `규칙: 제공된 수치·이름 외 어떤 사실(부상·근황·루머·배경·평가)도 언급 금지. 입력에 없는 숫자 금지. 존댓말("~입니다"). 과장 광고 톤 금지.`,
      { system: "너는 스포츠 데이터 미디어의 에디터다. 데이터에 있는 사실만 차분하게 전달한다.", maxTokens: 700, temperature: 0.4 },
    );
    const m = res.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as { intro?: string; deals?: string; wallet?: string };
    if (!j.intro || !j.deals || !j.wallet) return null;
    return { intro: j.intro, deals: j.deals, wallet: j.wallet };
  } catch (e) {
    console.warn("[blog-weekly] LLM 서술 실패 — 템플릿 폴백:", (e as Error).message);
    return null;
  }
}

function buildHtml(d: WeeklyData, prose: { intro: string; deals: string; wallet: string }, dateLabel: string): string {
  const G = "#1a7f37", R = "#c0392b";
  const hr = `<hr style="border:none;border-top:1px solid #eee;margin:32px 0;">`;
  const h2 = (t: string) => `<h2 style="font-size:24px;margin:0 0 14px;font-weight:800;">${t}</h2>`;
  const th = `style="padding:10px 8px;text-align:left;font-size:13px;color:inherit;opacity:0.6;border-bottom:2px solid #ddd;white-space:nowrap;"`;
  const td = `style="padding:10px 8px;border-bottom:1px solid #eee;font-size:15px;"`;
  const tdR = `style="padding:10px 8px;border-bottom:1px solid #eee;font-size:15px;text-align:right;white-space:nowrap;"`;
  const table = (head: string, rows: string) =>
    `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;margin:16px 0;"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;

  const dealsTable = d.weekDeals.length
    ? table(
        `<th ${th}>#</th><th ${th}>선수</th><th ${th}>이동</th><th ${th} style="text-align:right;">이적료</th>`,
        d.weekDeals.map((x, i) =>
          `<tr><td ${td}>${i + 1}</td><td ${td}><a href="${SITE}/transfers/${x.id}"><strong>${x.name}</strong></a></td><td ${td}>${x.from} → ${x.to}</td><td ${tdR}><strong>${feeM(x.fee)}</strong> · ${krw(x.fee)}</td></tr>`,
        ).join(""),
      )
    : `<p style="color:inherit;opacity:0.7;">이번 주에는 이적료가 공개된 신규 빅딜이 없었습니다. 임대·자유이적 중심의 조용한 한 주였네요.</p>`;

  const moverRow = (x: Mover, up: boolean) =>
    `<tr><td ${td}><a href="${SITE}/transfers/${x.id}"><strong>${x.name}</strong></a></td><td ${td}>${x.league}</td><td ${tdR}>€${x.prev}M → €${x.v}M</td><td ${tdR}><strong style="color:${up ? G : R};">${up ? "▲" : "▼"}${Math.abs(x.chg)}%</strong></td></tr>`;
  const moverHead = `<th ${th}>선수</th><th ${th}>리그</th><th ${th} style="text-align:right;">몸값 변화</th><th ${th} style="text-align:right;">변동률</th>`;

  return `<article class="sb-post" style="max-width:820px;margin:0 auto;line-height:1.75;font-size:17px;word-break:keep-all;">

  <figure style="margin:0 0 28px;">
    <img src="/blog/transfer-weekly-hero.png"
         alt="이적시장 위클리 - 주간 빅딜과 몸값 무브 리포트 (스코어베이스)"
         style="width:100%;height:auto;border-radius:12px;display:block;" loading="eager">
  </figure>

  <p style="color:inherit;opacity:0.75;font-size:15px;margin:0 0 28px;">
    ${dateLabel} 발행 · 집계 범위: 유럽 빅5 + K리그1·사우디·MLS (8개 리그) · ${d.win.label} · 공개 이적료 기준
  </p>

  <p>${prose.intro}</p>

  ${hr}

  ${h2("한눈에 보는 이번 주")}
  <ul style="padding-left:20px;">
    ${d.weekDeals[0] ? `<li><strong>주간 최고액:</strong> ${d.weekDeals[0].name}, ${d.weekDeals[0].from} → ${d.weekDeals[0].to} <strong>${feeM(d.weekDeals[0].fee)}(${krw(d.weekDeals[0].fee)})</strong></li>` : ""}
    <li><strong>${d.win.label} 누적:</strong> 공개 이적료 ${d.winFeeCnt}건 · <strong>${feeM(d.winFeeSum)}(약 ${krw(d.winFeeSum)})</strong></li>
    ${d.rising[0] ? `<li><strong>몸값 급등 1위:</strong> ${d.rising[0].name} <span style="color:${G};">▲${d.rising[0].chg}%</span> (€${d.rising[0].prev}M→€${d.rising[0].v}M)</li>` : ""}
    ${d.falling[0] ? `<li><strong>몸값 급락 1위:</strong> ${d.falling[0].name} <span style="color:${R};">▼${Math.abs(d.falling[0].chg)}%</span> (€${d.falling[0].prev}M→€${d.falling[0].v}M)</li>` : ""}
    ${d.spend[0] ? `<li><strong>창 개장 후 최다 지출:</strong> ${d.spend[0].team} ${feeM(d.spend[0].inFee)}</li>` : ""}
  </ul>

  ${hr}

  ${h2("이번 주 빅딜")}
  ${dealsTable}
  ${d.weekDeals.length ? `<p>${prose.deals}</p>` : ""}

  ${hr}

  ${h2("몸값 무브 — 급등")}
  ${d.rising.length ? table(moverHead, d.rising.map((x) => moverRow(x, true)).join("")) : `<p style="color:inherit;opacity:0.7;">이번 주 기준을 넘는 급등 사례가 없었습니다.</p>`}

  ${h2("몸값 무브 — 급락")}
  ${d.falling.length ? table(moverHead, d.falling.map((x) => moverRow(x, false)).join("")) : `<p style="color:inherit;opacity:0.7;">이번 주 기준을 넘는 급락 사례가 없었습니다.</p>`}

  ${hr}

  ${h2(`구단 지갑 — ${d.win.label} 누적`)}
  ${d.spend.length ? table(
    `<th ${th}>구단</th><th ${th} style="text-align:right;">영입</th><th ${th} style="text-align:right;">지출</th>`,
    d.spend.map((x) => `<tr><td ${td}><strong>${x.team}</strong></td><td ${tdR}>${x.inCnt}명</td><td ${tdR}><strong>${feeM(x.inFee)}</strong> · ${krw(x.inFee)}</td></tr>`).join(""),
  ) : ""}
  ${d.earn.length ? `<p>판 쪽에서는 ${d.earn.map((x) => `<strong>${x.team}</strong>(+${feeM(x.outFee)})`).join(" · ")} 순으로 수입을 올렸습니다.</p>` : ""}
  <p>${prose.wallet}</p>

  ${hr}

  ${h2("실시간으로 보려면")}
  <ul style="padding-left:20px;">
    <li>📈 <a href="${SITE}/transfers?view=bigdeals"><strong>빅딜 랭킹</strong></a> — 이적료 순위 실시간</li>
    <li>🔄 <a href="${SITE}/transfers?view=inout"><strong>팀별 IN/OUT</strong></a> — 구단별 영입·방출 집계</li>
    <li>💰 <a href="${SITE}/transfers"><strong>선수 몸값 랭킹</strong></a> — 빅5 시장가치 전체</li>
  </ul>

  <p style="color:inherit;opacity:0.6;font-size:14px;margin-top:28px;">
    이 리포트는 스코어베이스 데이터 파이프라인이 매주 자동 생성하며 운영진이 모니터링합니다.
    수치는 발행 시점의 수집 데이터(공개 이적료) 기준이며 시장 상황에 따라 변동될 수 있습니다.
  </p>

</article>`;
}

export interface BlogWeeklyResult {
  skipped?: string;
  slug?: string;
  title?: string;
  llmUsed?: boolean;
  weekDeals?: number;
  movers?: number;
  htmlPreview?: string;
}

export async function runBlogWeekly(opts: { dryRun?: boolean } = {}): Promise<BlogWeeklyResult> {
  const d = await collectData();

  // 얇은 주 발행 skip — 저품질 자동 글 방지
  if (d.weekDeals.length < 2 && d.rising.length + d.falling.length < 4) {
    console.log("[blog-weekly] 콘텐츠 부족 — 발행 skip", { deals: d.weekDeals.length, movers: d.rising.length + d.falling.length });
    return { skipped: "thin-week", weekDeals: d.weekDeals.length, movers: d.rising.length + d.falling.length };
  }

  const y = d.kst.getUTCFullYear(), m = d.kst.getUTCMonth() + 1, day = d.kst.getUTCDate();
  const slug = `transfer-weekly-${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const weekOfMonth = Math.ceil(day / 7);
  const dateLabel = `${y}년 ${m}월 ${day}일`;

  const top = d.weekDeals[0];
  const title = top
    ? `이적시장 위클리 ${m}월 ${weekOfMonth}주차 — ${top.name} ${krw(top.fee)} 이적 외 주간 무브 총정리`
    : `이적시장 위클리 ${m}월 ${weekOfMonth}주차 — 몸값 급등락 무브 총정리`;
  const excerpt =
    `${dateLabel} 이적시장 주간 리포트 — ` +
    (top ? `${top.name} ${top.from}→${top.to} ${krw(top.fee)} 등 주간 빅딜, ` : "") +
    (d.rising[0] ? `${d.rising[0].name} +${d.rising[0].chg}% 등 몸값 급등락, ` : "") +
    `${d.win.label} 누적 ${krw(d.winFeeSum)} 구단별 지출까지 스코어베이스 데이터로 정리했습니다.`;
  const tags = `이적시장, 여름 이적시장, 이적시장 위클리, 축구 이적, 이적료 순위, 몸값 급등, 주간 이적, 빅딜, 스코어베이스`;

  const llm = await narrate(d);
  const prose =
    llm ?? {
      intro: top
        ? `이번 주 이적시장에서는 ${top.name}의 ${top.to}행(${feeM(top.fee)}, 약 ${krw(top.fee)})이 가장 큰 딜이었습니다. ${d.win.label} 개장 후 공개 이적료는 누적 ${d.winFeeCnt}건, ${feeM(d.winFeeSum)}(약 ${krw(d.winFeeSum)})까지 불어났습니다.`
        : `이번 주는 대형 이적료 딜 없이 몸값 변동이 중심이 된 한 주였습니다. ${d.win.label} 개장 후 공개 이적료는 누적 ${d.winFeeCnt}건, ${feeM(d.winFeeSum)}(약 ${krw(d.winFeeSum)})입니다.`,
      deals: top ? `최고액은 ${top.from}에서 ${top.to}로 이동한 ${top.name}(${feeM(top.fee)})입니다. 자세한 조건과 시장가치 추이는 선수 이름을 눌러 개인 페이지에서 확인할 수 있습니다.` : "",
      wallet: d.spend[0]
        ? `${d.win.label} 개장 후 공개 이적료 기준 최다 지출 구단은 ${d.spend[0].team}(${feeM(d.spend[0].inFee)})입니다. 미공개 금액과 임대료는 집계에서 제외됩니다.`
        : `아직 공개 이적료 기준 지출이 집계된 구단이 없습니다.`,
    };
  const llmUsed = llm !== null;

  const html = buildHtml(d, prose, dateLabel);

  if (opts.dryRun) {
    console.log("[blog-weekly] DRY RUN:", { slug, title, weekDeals: d.weekDeals.length, rising: d.rising.length, falling: d.falling.length, htmlBytes: html.length });
    return { slug, title, llmUsed, weekDeals: d.weekDeals.length, movers: d.rising.length + d.falling.length, htmlPreview: html };
  }

  const post = await prisma.blog.upsert({
    where: { slug },
    create: { slug, title, excerpt, tags, thumbnailUrl: `${SITE}/blog/transfer-weekly-hero.png`, content: html },
    update: { title, excerpt, tags, thumbnailUrl: `${SITE}/blog/transfer-weekly-hero.png`, content: html },
  });
  console.log("[blog-weekly] 발행:", `${SITE}/blog/${post.slug}`);
  return { slug, title, llmUsed, weekDeals: d.weekDeals.length, movers: d.rising.length + d.falling.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBlogWeekly({ dryRun: process.argv.includes("--dry") })
    .then(async (r) => {
      if (r.htmlPreview) {
        // 로컬 dry run 검수용
        const { writeFileSync } = await import("fs");
        writeFileSync("/tmp/blog-weekly-preview.html", r.htmlPreview);
        console.log("HTML 미리보기: /tmp/blog-weekly-preview.html");
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
