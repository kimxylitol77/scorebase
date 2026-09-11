// 경기 종료 직후 데이터 카드 쇼츠(MatchShotShort) 의 props 빌더 — DB 경기 + TheStatsAPI 샷맵 + haiku 인사이트 2문장.
// 실행: cd ~/scorebase && npx tsx --env-file=.env.local scripts/shorts/build-match-short.ts <matchId|latest>
// 종료 코드: 0 성공 / 3 = 샷맵(xG) 아직 미제공(재시도 대상) / 1 그 외 실패. 출력: ~/scorebase-shorts/data/match-short.json
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { toKoreanPlayerName } from "../../src/lib/player-names";
import { toKoreanTeamName } from "../../src/lib/team-names";
import { generate } from "../../src/lib/ai/claude";

const SHORTS = process.env.SHORTS_DIR || `${process.env.HOME}/scorebase-shorts`;
const BASE = "https://api.thestatsapi.com/api";
const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BIG5: Record<string, { comp: string; ko: string }> = {
  EPL: { comp: "comp_3039", ko: "프리미어리그" }, LALIGA: { comp: "comp_8814", ko: "라리가" },
  BUNDESLIGA: { comp: "comp_4643", ko: "분데스리가" }, SERIE_A: { comp: "comp_5840", ko: "세리에A" }, LIGUE_1: { comp: "comp_0256", ko: "리그1" },
};
const p = new PrismaClient();

async function api<T>(path: string): Promise<T | null> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${KEY}` } });
    if (r.status === 429) { await new Promise((z) => setTimeout(z, 8000 * (i + 1))); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return (await r.json()) as T;
  }
  throw new Error(`429 지속 ${path}`);
}
const DROP = new Set(["afc", "cf", "fc", "football", "club", "calcio", "ud", "cd", "sd", "rcd", "1", "1899", "tsg", "vfl", "vfb", "sc", "fsv", "bsc", "ssc", "us", "ac", "as", "ogc", "rc", "sv"]);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !DROP.has(w)).join(" ");
const sim = (a: string, b: string) => { const A = new Set(norm(a).split(" ")), B = new Set(norm(b).split(" ")); const inter = [...A].filter((w) => B.has(w)).length; return inter / Math.max(1, Math.min(A.size, B.size)); };
const download = async (url: string, file: string) => { try { const r = await fetch(url); if (!r.ok) return false; const out = `${SHORTS}/public/players/${file}`; mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, Buffer.from(await r.arrayBuffer())); return true; } catch { return false; } };

type TsMatch = { id: string; utc_date: string; status: string; xg_available: boolean; home_team: { id: string; name: string }; away_team: { id: string; name: string }; score: { home: number | null; away: number | null } };
type TsShot = { player_name: string; team_id: string; x: number; y: number; minute: number; result: string; expected_goals: number | null };

async function main() {
  const arg = process.argv[2] || "latest";
  const where = arg === "latest" ? { league: { in: Object.keys(BIG5) }, status: "FINISHED" } : { id: Number(arg) };
  const m = await p.match.findFirst({ where, orderBy: { startTime: "desc" }, include: { homeTeam: true, awayTeam: true } });
  if (!m) throw new Error(`경기 없음 (${arg})`);
  const lg = BIG5[m.league]; if (!lg) throw new Error(`빅5 아님: ${m.league}`);
  if (m.status !== "FINISHED") throw new Error(`아직 종료 아님: ${m.status}`);

  // TheStatsAPI: 현재 시즌 → 킥오프 ±1일 경기 → 팀명 유사도로 매칭
  const seasons = await api<{ data: { id: string; is_current: boolean }[] }>(`/football/competitions/${lg.comp}/seasons`);
  const season = seasons?.data.find((s) => s.is_current)?.id; if (!season) throw new Error("현재 시즌 없음");
  const d0 = new Date(m.startTime.getTime() - 86400000).toISOString().slice(0, 10), d1 = new Date(m.startTime.getTime() + 86400000).toISOString().slice(0, 10);
  const list = await api<{ data: TsMatch[] }>(`/football/matches?competition_id=${lg.comp}&season_id=${season}&date_from=${d0}&date_to=${d1}&per_page=50`);
  const cand = (list?.data ?? []).map((t) => ({ t, s: sim(t.home_team.name, m.homeTeam.name) + sim(t.away_team.name, m.awayTeam.name) + (Math.abs(Date.parse(t.utc_date) - m.startTime.getTime()) < 3 * 3600000 ? 0.5 : 0) })).sort((a, b) => b.s - a.s)[0];
  if (!cand || cand.s < 1.5) throw new Error(`TheStatsAPI 매칭 실패: ${m.homeTeam.name} v ${m.awayTeam.name} (best=${cand?.t.home_team.name} v ${cand?.t.away_team.name} ${cand?.s.toFixed(2)})`);
  const ts = (await api<{ data: TsMatch }>(`/football/matches/${cand.t.id}`))?.data ?? cand.t;
  if (!ts.xg_available) { console.error(`xG 아직 없음 (${ts.id}, status=${ts.status})`); process.exit(3); }
  const shots = (await api<{ data: TsShot[] }>(`/football/matches/${ts.id}/shotmap`))?.data ?? [];
  if (shots.length === 0) { console.error("샷맵 비어 있음"); process.exit(3); }

  const H = ts.home_team.id;
  const side = (t: string) => (t === H ? "H" : "A") as "H" | "A";
  // 사전에 없는 선수명은 haiku 로 일괄 음역 (실패 시 영문 유지). 사전 매핑이 항상 우선.
  const koName = new Map<string, string>();
  // toKoreanPlayerName 은 사전에 없으면 원문을 그대로 돌려준다(빈 문자열 아님) → 한글 포함 여부로 판정
  const dictKo = (n: string) => { const k = toKoreanPlayerName(n); return /[가-힣]/.test(k) ? k : ""; };
  const unmapped = [...new Set(shots.map((s) => s.player_name))].filter((n) => !dictKo(n));
  if (unmapped.length) {
    const out = await generate(`다음 축구 선수 이름을 한국 언론 표기로 음역해라. 출력은 "원문\t한글" 한 줄씩, 다른 말 없이.\n${unmapped.join("\n")}`, { model: process.env.SHORT_INSIGHT_MODEL || "claude-haiku-4-5-20251001", maxTokens: 800 }).catch(() => "");
    for (const line of out.split("\n")) { const [en, ko] = line.split(/\t| {2,}| - /).map((x) => x?.trim()); if (en && ko && /^[가-힣 .·'-]+$/.test(ko) && unmapped.includes(en)) koName.set(en, ko); }
    console.error(`[음역] ${koName.size}/${unmapped.length}${koName.size === 0 ? " 원출력: " + JSON.stringify(out.slice(0, 200)) : ""}`);
  }
  const conv = shots.map((s) => ({
    team: side(s.team_id),
    x: +(((s.team_id === H ? Math.min(100, Math.max(0, s.x)) : 100 - Math.min(100, Math.max(0, s.x))) / 100) * 105).toFixed(1),
    y: +((Math.min(100, Math.max(0, s.y)) / 100) * 68).toFixed(1),
    min: s.minute, result: s.result, xg: +(s.expected_goals ?? 0).toFixed(2),
    name: dictKo(s.player_name) || koName.get(s.player_name) || s.player_name,
  }));
  const agg = (t: "H" | "A") => { const S = conv.filter((s) => s.team === t); return { xg: +S.reduce((a, s) => a + s.xg, 0).toFixed(2), shots: S.length, onTarget: S.filter((s) => s.result === "goal" || s.result === "save").length, goals: S.filter((s) => s.result === "goal") }; };
  const aH = agg("H"), aA = agg("A");
  const hs = m.homeScore ?? ts.score.home ?? aH.goals.length, as = m.awayScore ?? ts.score.away ?? aA.goals.length;
  const homeKo = toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.nameKo || m.homeTeam.name;
  const awayKo = toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.nameKo || m.awayTeam.name;
  const byPlayer = new Map<string, { team: "H" | "A"; shots: number; xg: number }>();
  for (const s of conv) { const c = byPlayer.get(s.name) ?? { team: s.team, shots: 0, xg: 0 }; c.shots++; c.xg += s.xg; byPlayer.set(s.name, c); }
  const top = [...byPlayer.entries()].sort((a, b) => b[1].shots - a[1].shots || b[1].xg - a[1].xg)[0];
  const topShooter = top ? { name: top[0], team: top[1].team, shots: top[1].shots, xg: +top[1].xg.toFixed(2) } : null;

  // 로고
  const logoFile = (name: string) => `socteam-${norm(name).replace(/\s/g, "")}.png`;
  const hl = logoFile(m.homeTeam.name), al = logoFile(m.awayTeam.name);
  if (m.homeTeam.logoUrl) await download(m.homeTeam.logoUrl, hl);
  if (m.awayTeam.logoUrl) await download(m.awayTeam.logoUrl, al);

  // 인사이트 — 브리핑 안의 숫자만 쓰도록 강제 + 결정론적 팩트 게이트
  const kst = new Date(m.startTime.getTime() + 9 * 3600000);
  const dateKst = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} (${"일월화수목금토"[kst.getUTCDay()]})`;
  const goalsLine = (t: "H" | "A", A: typeof aH) => A.goals.map((g) => `${g.min}분 ${g.name}(xG ${g.xg})`).join(", ") || "없음";
  const brief = [
    `${lg.ko} ${dateKst} ${homeKo} ${hs}-${as} ${awayKo} (종료)`,
    `xG: ${homeKo} ${aH.xg} / ${awayKo} ${aA.xg}`,
    `슛: ${homeKo} ${aH.shots}개(유효 ${aH.onTarget}) / ${awayKo} ${aA.shots}개(유효 ${aA.onTarget})`,
    `${homeKo} 골: ${goalsLine("H", aH)}`, `${awayKo} 골: ${goalsLine("A", aA)}`,
    topShooter ? `최다 슛: ${topShooter.name} ${topShooter.shots}회 xG ${topShooter.xg}` : "",
  ].filter(Boolean).join("\n");
  const allowed = new Set<string>(); for (const n of brief.match(/\d+(?:\.\d+)?/g) ?? []) { allowed.add(n); if (n.includes(".")) allowed.add(n.replace(/0+$/, "").replace(/\.$/, "")); }
  // 파생 수치도 허용: 스코어 차·xG 차(소수 2자리)·골 수·작은 정수(1골 차, 2배 같은 표현)
  for (const n of [Math.abs(hs - as), aH.goals.length, aA.goals.length, 0, 1, 2, 3]) allowed.add(String(n));
  for (const x of [Math.abs(aH.xg - aA.xg), aH.xg + aA.xg]) { const t = x.toFixed(2); allowed.add(t); allowed.add(t.replace(/0+$/, "").replace(/\.$/, "")); }
  const prompt = `아래 축구 경기 데이터만 근거로 한국어 인사이트 문장 2개를 써라. 규칙: 각 문장 40자 이내, 아래 브리핑에 있는 숫자만 사용(새 숫자·비율 계산 금지), 팀명은 브리핑 표기 그대로, 이모지·따옴표 금지, 두 문장을 줄바꿈으로만 구분해 출력.\n첫 문장 = 스코어와 xG 의 관계(누가 기회를 더 만들었고 결과는 어땠나). 둘째 문장 = 골 장면이나 최다 슛 선수 중 가장 눈에 띄는 사실.\n\n${brief}`;
  let insight: string[] = [];
  for (let attempt = 0; attempt < 2 && insight.length === 0; attempt++) {
    const out = await generate(prompt, { model: process.env.SHORT_INSIGHT_MODEL || "claude-haiku-4-5-20251001", maxTokens: 300 }).catch((e) => { console.error("생성 실패:", (e as Error).message); return ""; });
    let lines = out.split("\n").map((l) => l.replace(/^[-•\d.)\s]+/, "").trim()).filter(Boolean);
    if (lines.length < 2 && lines[0]) lines = lines[0].split(/(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean); // 한 줄로 붙여 쓴 경우
    lines = lines.filter((l) => l.length >= 8 && l.length <= 48).slice(0, 2);
    const bad = lines.flatMap((l) => (l.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !allowed.has(n)));
    if (lines.length === 2 && bad.length === 0) insight = lines; else console.error(`인사이트 게이트 탈락(시도 ${attempt + 1}): 허용 외 숫자 ${bad.join(",") || "-"} / 줄 ${lines.length}`);
  }
  if (insight.length === 0) {
    const lead = aH.xg > aA.xg ? homeKo : awayKo, leadXg = Math.max(aH.xg, aA.xg), trailXg = Math.min(aH.xg, aA.xg);
    insight = [`${lead}가 xG ${leadXg} vs ${trailXg}로 기회를 더 만들었다. 결과는 ${hs}-${as}.`, topShooter ? `최다 슛은 ${topShooter.name}, ${topShooter.shots}회에 xG ${topShooter.xg}.` : `슛 ${aH.shots}개 vs ${aA.shots}개.`];
  }

  const props = { leagueKo: lg.ko, dateKst, home: { name: homeKo, logo: hl, score: hs, xg: aH.xg, shots: aH.shots, onTarget: aH.onTarget }, away: { name: awayKo, logo: al, score: as, xg: aA.xg, shots: aA.shots, onTarget: aA.onTarget }, shots: conv, insight, topShooter, cta: "scorebase.kr/scores" };
  const url = `https://www.scorebase.kr/live/${m.league}/${m.externalId}`;
  const title = `${homeKo} ${hs}-${as} ${awayKo} — xG ${aH.xg} vs ${aA.xg} #shorts`;
  const text = {
    youtube: { title, description: `${lg.ko} ${dateKst} 종료.\n\n${insight.join("\n")}\n\n슛 ${aH.shots}개(유효 ${aH.onTarget}) vs ${aA.shots}개(유효 ${aA.onTarget})\n샷맵·xG 전체 보기: ${url}\n\nxG(기대 득점)는 슛 위치·상황으로 계산한 득점 확률의 합입니다. 데이터: TheStatsAPI.\n\n#${lg.ko.replace(/\s/g, "")} #${homeKo.replace(/\s/g, "")} #${awayKo.replace(/\s/g, "")} #xG #샷맵 #shorts`, tags: `${lg.ko},${homeKo},${awayKo},xG,샷맵,해외축구,경기 분석,스코어베이스` },
    instagram: { caption: `${homeKo} ${hs}-${as} ${awayKo}\nxG ${aH.xg} vs ${aA.xg}\n\n${insight.join("\n")}\n\n전 경기 샷맵 → scorebase.kr\n\n#${lg.ko.replace(/\s/g, "")} #해외축구 #xG #샷맵 #릴스` },
  };
  const out = `${SHORTS}/data/match-short.json`;
  writeFileSync(out, JSON.stringify({ compositionId: "MatchShotShort", matchId: m.id, tsId: ts.id, props, text }, null, 2));
  console.log(`✓ match ${m.id} ${homeKo} ${hs}-${as} ${awayKo} | xG ${aH.xg} vs ${aA.xg} | 슛 ${conv.length} | 인사이트: ${insight.join(" / ")} → ${out}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => p.$disconnect());
