// sportspredictions.live 핵심 경기 영어 프리뷰 — 생성(LLM)·게이트·저장·조회. 하루 핵심 경기(≤5)만 대상.
// 저장은 Article 테이블에 type=SP_PREVIEW, status=SP_PUBLISHED 로 넣어 한국어 사이트의 PUBLISHED 목록·검색·IndexNow 에 새지 않게 한다.
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { buildMatchContext, enrichContextWithApiFootball } from "@/lib/predict/build-context";
import type { PredictMatch } from "@/lib/predict/types";
import { selectSeasonMatches } from "@/lib/predict/season-matches";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import type { PreviewContext } from "@/prompts/match-preview";
import { fetchKeyMatches, fetchPanelPicks, type KeyMatch, type PanelPick } from "./data";
import { hasDraw, leagueByCode } from "./leagues";

export const SP_PREVIEW_TYPE = "SP_PREVIEW";
export const SP_PREVIEW_STATUS = "SP_PUBLISHED";
export const spPreviewSlug = (matchId: number) => `sp-preview-${matchId}`;

export interface SpPreview {
  matchId: number;
  title: string;
  lead: string;
  content: string;
  publishedAt: Date | null;
}

function splitTitle(content: string): { title: string; body: string; lead: string } {
  const lines = content.trim().split("\n");
  let title = "";
  if (lines[0]?.startsWith("# ")) title = lines.shift()!.replace(/^#\s+/, "").trim();
  const body = lines.join("\n").trim();
  const lead = body.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#"))?.trim() ?? "";
  return { title, body, lead };
}

function rowToPreview(r: { matchId: number | null; title: string; content: string; publishedAt: Date | null }): SpPreview {
  const { lead } = splitTitle(`# ${r.title}\n\n${r.content}`);
  return { matchId: r.matchId ?? 0, title: r.title, lead, content: r.content, publishedAt: r.publishedAt };
}

export async function fetchSpPreview(matchId: number): Promise<SpPreview | null> {
  const r = await prisma.article.findUnique({
    where: { slug: spPreviewSlug(matchId) },
    select: { matchId: true, title: true, content: true, publishedAt: true, status: true },
  });
  return r && r.status === SP_PREVIEW_STATUS ? rowToPreview(r) : null;
}

export async function fetchSpPreviews(matchIds: number[]): Promise<Map<number, SpPreview>> {
  if (matchIds.length === 0) return new Map();
  const rows = await prisma.article.findMany({
    where: { slug: { in: matchIds.map(spPreviewSlug) }, status: SP_PREVIEW_STATUS },
    select: { matchId: true, title: true, content: true, publishedAt: true },
  });
  return new Map(rows.map((r) => [r.matchId ?? 0, rowToPreview(r)]));
}

// ── 프롬프트 ──
const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmtRec = (r?: { wins: number; draws: number; losses: number }) => (r ? `${r.wins}W-${r.draws}D-${r.losses}L` : "n/a");

function panelLine(p: PanelPick, home: string, away: string): string {
  const pick =
    p.market === "OU" ? `${p.pick === "OVER" ? "Over" : "Under"}${p.line != null ? ` ${p.line}` : ""}` :
    p.market === "HANDICAP" ? `${p.pick === "HOME" ? home : away}${p.line != null ? ` ${p.pick === "HOME" ? "-" : "+"}${Math.abs(p.line)}` : ""}` :
    p.pick === "HOME" ? home : p.pick === "AWAY" ? away : "Draw";
  return `- ${p.label} (${p.market === "1X2" ? "match winner" : p.market === "OU" ? "total" : "handicap"}): ${pick} ${pct(p.prob)}`;
}

/** 프롬프트에 실린 모든 % 값 — 게이트가 본문의 % 를 이 집합과 대조한다. */
function buildPrompt(m: KeyMatch, ctx: PreviewContext, panel: PanelPick[], seasonLabel: string | null): { prompt: string; allowedPct: Set<number> } {
  const lg = leagueByCode(m.league);
  const draw = hasDraw(m.league);
  const H = m.home.name, A = m.away.name;
  const allowed = new Set<number>();
  const addPct = (p?: number | null) => { if (p != null) { allowed.add(Math.round(p * 100)); } };
  const L: string[] = [];
  L.push(`MATCH: ${H} (home) vs ${A} (away) — ${lg?.name ?? m.league} — kick-off ${m.startTime} (UTC)`);
  if (m.probs) {
    addPct(m.probs.home); addPct(m.probs.away); if (draw) addPct(m.probs.draw);
    L.push(`MODEL WIN PROBABILITY: ${H} ${pct(m.probs.home)}${draw ? `, Draw ${pct(m.probs.draw ?? 0)}` : ""}, ${A} ${pct(m.probs.away)} — model pick: ${m.pick === "DRAW" ? "Draw" : m.pick === "HOME" ? H : A}${m.strong ? " (strong pick: clears the league threshold)" : ""}`);
  }
  if (m.market) {
    addPct(m.market.home); addPct(m.market.away); if (draw) addPct(m.market.draw);
    L.push(`MARKET-IMPLIED PROBABILITY (bookmaker margin removed): ${H} ${pct(m.market.home)}${draw ? `, Draw ${pct(m.market.draw ?? 0)}` : ""}, ${A} ${pct(m.market.away)}`);
    if (m.valueGap != null) L.push(`MODEL MINUS MARKET on the pick: ${m.valueGap > 0 ? "+" : ""}${Math.round(m.valueGap * 100)} points`);
  }
  if (m.over) { addPct(m.over.prob); addPct(1 - m.over.prob); L.push(`TOTAL GOALS 2.5: Over ${pct(m.over.prob)} / Under ${pct(1 - m.over.prob)} — lean ${m.over.pick === "OVER" ? "Over" : "Under"}`); }
  if (m.handicap) { addPct(m.handicap.prob); L.push(`HANDICAP: ${m.handicap.pick === "HOME" ? H : A} ${m.handicap.pick === "HOME" ? "-" : "+"}${Math.abs(m.handicap.line)} at ${pct(m.handicap.prob)}`); }
  if (ctx.elo) L.push(`ELO RATING: ${H} ${Math.round(ctx.elo.home)}, ${A} ${Math.round(ctx.elo.away)}`);
  if (ctx.position) L.push(`TABLE${seasonLabel ? ` (${seasonLabel} season, current)` : ""}: ${H} ${ctx.position.home}${ctx.points ? ` (${ctx.points.home} pts)` : ""}, ${A} ${ctx.position.away}${ctx.points ? ` (${ctx.points.away} pts)` : ""} of ${ctx.position.total} teams`);
  if (ctx.record) L.push(`SEASON RECORD (this season only): ${H} ${fmtRec(ctx.record.home)}, ${A} ${fmtRec(ctx.record.away)}`);
  if (ctx.homeAway) L.push(`HOME/AWAY SPLIT: ${H} at home ${fmtRec(ctx.homeAway.home)} (${ctx.homeAway.home.ppg.toFixed(2)} ppg), ${A} away ${fmtRec(ctx.homeAway.away)} (${ctx.homeAway.away.ppg.toFixed(2)} ppg)`);
  if (ctx.recentForm) L.push(`LAST 5 (newest first): ${H} ${ctx.recentForm.home.join("")}, ${A} ${ctx.recentForm.away.join("")}`);
  if (ctx.streak) L.push(`STREAK: ${H} unbeaten ${ctx.streak.home.unbeaten}, winning ${ctx.streak.home.winning}, losing ${ctx.streak.home.losing}; ${A} unbeaten ${ctx.streak.away.unbeaten}, winning ${ctx.streak.away.winning}, losing ${ctx.streak.away.losing}`);
  if (ctx.trend) L.push(`LAST-5 AVERAGES: ${H} scored ${ctx.trend.home.gf.toFixed(1)} conceded ${ctx.trend.home.ga.toFixed(1)}; ${A} scored ${ctx.trend.away.gf.toFixed(1)} conceded ${ctx.trend.away.ga.toFixed(1)}`);
  if (ctx.tsHistory?.h2h?.length) {
    const h = ctx.tsHistory.h2h.slice(0, 5).map((x) => `${x.date}: ${x.ourHomeWasHome ? `${H} ${x.ourHomeScore}-${x.ourAwayScore} ${A}` : `${A} ${x.ourAwayScore}-${x.ourHomeScore} ${H}`}`);
    L.push(`HEAD-TO-HEAD (most recent first):\n  ${h.join("\n  ")}`);
  }
  if (ctx.injuries && (ctx.injuries.home.length || ctx.injuries.away.length)) {
    L.push(`INJURIES/ABSENCES: ${H}: ${ctx.injuries.home.map((i) => i.name + (i.reason ? ` (${i.reason})` : "")).join(", ") || "none listed"}; ${A}: ${ctx.injuries.away.map((i) => i.name + (i.reason ? ` (${i.reason})` : "")).join(", ") || "none listed"}`);
  }
  if (ctx.keyPlayers && (ctx.keyPlayers.home.length || ctx.keyPlayers.away.length)) {
    const kp = (arr: { name: string; goals: number; assists: number }[]) => arr.slice(0, 3).map((p) => `${p.name} ${p.goals}G ${p.assists}A`).join(", ");
    L.push(`KEY PLAYERS (season): ${H}: ${kp(ctx.keyPlayers.home) || "n/a"}; ${A}: ${kp(ctx.keyPlayers.away) || "n/a"}`);
  }
  if (ctx.restDays) L.push(`REST DAYS: ${H} ${ctx.restDays.home ?? "n/a"}, ${A} ${ctx.restDays.away ?? "n/a"}`);
  if (ctx.dataSparse?.sparse) L.push(`NOTE: sample is thin (${ctx.dataSparse.homePlayed}/${ctx.dataSparse.awayPlayed} matches played this season) — say so.`);
  if (panel.length) { for (const p of panel) addPct(p.prob); L.push(`AI PANEL PICKS (independent LLMs, timestamped before kick-off):\n${panel.map((p) => panelLine(p, H, A)).join("\n")}`); }

  const prompt = `You are writing a match preview for sportspredictions.live, an English site that publishes model win probabilities and grades every pick in public.

DATA (the only facts you may use — do not invent players, injuries, quotes, lineups or scores):
${L.join("\n")}

WRITE a preview in Markdown, 550–800 words, British English, present tense, confident but sober. Structure exactly:
# <headline: "<Home> vs <Away> prediction: <angle>" — under 80 characters, no clickbait>
<one-paragraph lead: who is favoured, by how much, and the one thing that decides it>
## Where the model stands
## Form and the table
## Model vs market${panel.length ? "\n## What the AI panel thinks" : ""}
## Verdict
<end with one line starting "Prediction:" giving the model pick and its probability${m.over ? ", plus the total-goals lean" : ""}>

RULES
- Every percentage you write must be one of the percentages in DATA. Do not compute new ones.
- Refer to probabilities as "the model" / "the market" / "the panel". Never say bet, stake, wager, odds boost, bookie, tipster, parlay, lock or sure thing.
- If a section has no supporting data, keep it to two sentences and say the data is thin.
- No tables, no bullet lists longer than four items, no emojis.`;
  return { prompt, allowedPct: allowed };
}

const BETTING_WORDS = /\b(bet|bets|betting|stake|staking|wager|wagers|parlay|bookie|bookies|tipster|sure thing|lock of the day)\b/i;

export function gatePreview(content: string, allowedPct: Set<number>): { ok: true } | { ok: false; reason: string } {
  if (content.length < 1800) return { ok: false, reason: `too short (${content.length} chars)` };
  if (!content.trim().startsWith("# ")) return { ok: false, reason: "missing # headline" };
  if (!/\nPrediction:/i.test(content) && !/^Prediction:/im.test(content)) return { ok: false, reason: "missing Prediction: line" };
  const bad = content.match(BETTING_WORDS);
  if (bad) return { ok: false, reason: `betting vocabulary: ${bad[0]}` };
  const pcts = [...content.matchAll(/(\d{1,3})\s?%/g)].map((x) => Number(x[1]));
  const off = pcts.filter((p) => ![...allowedPct].some((a) => Math.abs(a - p) <= 1));
  if (off.length) return { ok: false, reason: `unsupported percentages: ${[...new Set(off)].join(", ")}` };
  return { ok: true };
}

async function loadLeagueMatches(league: string): Promise<PredictMatch[]> {
  const list = await prisma.match.findMany({
    where: { league },
    select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
  });
  return list as PredictMatch[];
}

/** 한 경기 프리뷰 생성 + 게이트 + 저장. 게이트 두 번 실패하면 null(발행 안 함). */
export async function generateSpPreview(m: KeyMatch, opts: { leagueMatches?: PredictMatch[] } = {}): Promise<{ title: string; chars: number } | null> {
  const row = await prisma.match.findUnique({ where: { id: m.id }, select: { homeTeamId: true, awayTeamId: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } });
  if (!row) return null;
  const leagueMatches = opts.leagueMatches ?? (await loadLeagueMatches(m.league));
  // 순위·전적·홈원정은 이번 시즌 경기만(calcStandings 는 시즌을 안 자른다 — 첫 생성에서 "23팀 42경기 97점" 오류 실측).
  // Elo 는 시즌을 넘어 누적돼야 하므로 전체 경기로 따로 계산해 덮어쓴다(season-matches.ts 주석과 같은 규칙).
  const sel = selectSeasonMatches(leagueMatches, m.league, row.startTime);
  let ctx = buildMatchContext(sel.season, m.league, row.homeTeamId, row.awayTeamId, row.startTime, row.homeTeam.name, row.awayTeam.name);
  const eloAll = calcEloTable(leagueMatches.filter((x) => x.startTime.getTime() < row.startTime.getTime()));
  ctx.elo = { home: getElo(eloAll, row.homeTeamId), away: getElo(eloAll, row.awayTeamId) };
  const seasonLabel = sel.seasonLabel;
  try {
    ctx = await enrichContextWithApiFootball(ctx, m.league, row.homeTeam.name, row.awayTeam.name, row.startTime);
  } catch (e) {
    console.warn(`[sp-preview] af enrich skipped for ${m.id}: ${(e as Error).message}`);
  }
  const panel = await fetchPanelPicks(m.id);
  const { prompt, allowedPct } = buildPrompt(m, ctx, panel, seasonLabel);
  const system = "You are a sports data journalist. You write clear, specific, number-literate previews. You never fabricate facts and never give betting advice.";

  let content = "";
  let lastReason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? prompt : `${prompt}\n\nYOUR PREVIOUS DRAFT WAS REJECTED: ${lastReason}. Fix that and rewrite the whole preview.`;
    content = (await generate(p, { system, maxTokens: 2048, temperature: 0.5 })).trim();
    const g = gatePreview(content, allowedPct);
    if (g.ok) break;
    lastReason = g.reason;
    console.warn(`[sp-preview] gate fail (${attempt + 1}/2) match ${m.id}: ${g.reason}`);
    content = "";
  }
  if (!content) return null;

  const { title, body } = splitTitle(content);
  if (!title) return null;
  await prisma.article.upsert({
    where: { slug: spPreviewSlug(m.id) },
    create: {
      matchId: m.id, type: SP_PREVIEW_TYPE, league: m.league, title, slug: spPreviewSlug(m.id), content: body,
      status: SP_PREVIEW_STATUS, publishedAt: new Date(),
      predHome: m.probs?.home ?? null, predDraw: m.probs?.draw ?? null, predAway: m.probs?.away ?? null, predWinner: m.pick,
    },
    update: { title, content: body, status: SP_PREVIEW_STATUS, publishedAt: new Date() },
  });
  return { title, chars: body.length };
}

/** cron 진입점 — 오늘의 핵심 경기 중 프리뷰 없는 것만, 동시 2건. */
export async function runSpPreviews(opts: { limit?: number } = {}): Promise<{ candidates: number; generated: number; skipped: number; failed: number; titles: string[] }> {
  const key = await fetchKeyMatches();
  const existing = await fetchSpPreviews(key.map((k) => k.id));
  const todo = key.filter((k) => !existing.has(k.id)).slice(0, opts.limit ?? key.length);
  const out = { candidates: key.length, generated: 0, skipped: key.length - todo.length, failed: 0, titles: [] as string[] };
  const cache = new Map<string, PredictMatch[]>();
  const one = async (m: KeyMatch) => {
    try {
      if (!cache.has(m.league)) cache.set(m.league, await loadLeagueMatches(m.league));
      const r = await generateSpPreview(m, { leagueMatches: cache.get(m.league) });
      if (r) { out.generated++; out.titles.push(r.title); console.log(`[sp-preview] ok ${m.id}: ${r.title} (${r.chars} chars)`); }
      else out.failed++;
    } catch (e) {
      out.failed++;
      console.error(`[sp-preview] error ${m.id}: ${(e as Error).message}`);
    }
  };
  for (let i = 0; i < todo.length; i += 2) await Promise.all(todo.slice(i, i + 2).map(one));
  return out;
}
