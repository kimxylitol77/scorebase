// KBO 경기 라인업 — KBO 공식 게임센터(타순)·1군 등록 현황(사진 id·투타·후보·불펜)을 묶어 네이버형 2열 라인업 데이터를 만든다.
// 근거·실측은 reports/plans/kbo-lineup/context-notes.md.
import { unstable_cache } from "next/cache";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import type { GameLineup, LineupPlayer, TeamLineup } from "@/lib/sports/baseball-lineup";

const BASE = "https://www.koreabaseball.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15";
const WS_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "X-Requested-With": "XMLHttpRequest",
  Referer: `${BASE}/Schedule/GameCenter/Main.aspx`,
  "User-Agent": UA,
};


interface KboGame {
  G_ID: string; G_TM: string; SR_ID: number; SEASON_ID: number;
  AWAY_ID: string; HOME_ID: string; AWAY_NM: string; HOME_NM: string;
  T_PIT_P_ID: number | null; T_PIT_P_NM: string; B_PIT_P_ID: number | null; B_PIT_P_NM: string;
}
interface Entry { playerId: string; name: string; group: string; throwBat: string }

async function wsPost<T>(path: string, body: Record<string, string>): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST", headers: WS_HEADERS, body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  if (!r.ok) throw new Error(`kbo ${path} http ${r.status}`);
  return (await r.json()) as T;
}

/** 1군 등록 현황 — ASP.NET 포스트백(hfSearchTeam·hfSearchDate + btnCalendarSelect).
 *  ymd 생략 시 페이지 기본 날짜(가장 최근 경기일). 미래 날짜는 빈 표가 온다(9/29 실측). */
async function fetchEntry(teamId: string, ymd?: string): Promise<Entry[]> {
  const url = `${BASE}/Player/Register.aspx`;
  const first = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000), cache: "no-store" }).then((r) => r.text());
  const form = new URLSearchParams();
  for (const m of first.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]+" value="([^"]*)"/g)) form.set(m[1], m[2]);
  const P = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$";
  form.set(`${P}hfSearchTeam`, teamId);
  if (ymd) form.set(`${P}hfSearchDate`, ymd);
  form.set("__EVENTTARGET", `${P}btnCalendarSelect`);
  form.set("__EVENTARGUMENT", "");
  const html = await fetch(url, {
    method: "POST", body: form.toString(),
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10_000), cache: "no-store",
  }).then((r) => r.text());
  const out: Entry[] = [];
  for (const table of html.match(/<table[^>]*class="tNData[^"]*"[\s\S]*?<\/table>/g) ?? []) {
    const group = table.match(/<th[^>]*>\s*등번호\s*<\/th>\s*<th[^>]*>\s*([^<]+?)\s*<\/th>/)?.[1] ?? "";
    if (!["투수", "포수", "내야수", "외야수"].includes(group)) continue; // 감독·코치 제외
    for (const m of table.matchAll(/<tr>\s*<td>[^<]*<\/td>\s*<td><a href="[^"]*playerId=(\d+)"[^>]*>([^<]+)<\/a><\/td>\s*<td>([^<]*)<\/td>/g)) {
      out.push({ playerId: m[1], name: m[2].trim(), group, throwBat: m[3].trim() });
    }
  }
  return out;
}

/** "우투좌타" → { throw: "우투", bat: "좌타" }. "우언우타" 의 우언 = 우완 언더. */
function splitThrowBat(s: string): { throw: string | null; bat: string | null } {
  const m = s.match(/^(우투|좌투|우언|좌언)(우타|좌타|양타)$/);
  return m ? { throw: m[1], bat: m[2] } : { throw: null, bat: null };
}
const PITCHER_LABEL: Record<string, string> = { 우투: "우완투수", 좌투: "좌완투수", 우언: "우완언더", 좌언: "좌완언더" };
const player = (name: string, pid: string | null, position: string, hand: string | null, order?: number): LineupPlayer => ({
  name, position, hand, order,
  photo: pid ? kboPhotoUrl(pid) : null,
  href: pid ? `/players/${pid}?league=KBO` : null,
});

function parseOrderTable(raw: unknown): { order: number; position: string; name: string }[] {
  try {
    const t = JSON.parse(String(raw)) as { rows?: { row: { Text: string }[] }[] };
    return (t.rows ?? []).map((r) => {
      const [o, pos, name] = r.row.map((c) => (c.Text ?? "").trim());
      return { order: Number(o), position: pos, name };
    }).filter((r) => r.order >= 1 && r.name);
  } catch {
    return [];
  }
}

function buildTeam(
  orderRows: ReturnType<typeof parseOrderTable>,
  entry: Entry[],
  starterId: number | null,
  starterName: string,
): TeamLineup {
  const byName = new Map(entry.map((e) => [e.name, e]));
  const byId = new Map(entry.map((e) => [e.playerId, e]));
  const batters = orderRows.map((r) => {
    const e = byName.get(r.name);
    return player(r.name, e?.playerId ?? null, r.position, e ? splitThrowBat(e.throwBat).bat : null, r.order);
  });
  const sid = starterId != null ? String(starterId) : null;
  const starterEntry = sid ? byId.get(sid) : undefined;
  const starter = starterName.trim()
    ? player(starterName.trim(), sid, "선발", starterEntry ? splitThrowBat(starterEntry.throwBat).throw : null)
    : null;
  const inLineup = new Set(batters.map((b) => b.name));
  const bench = entry
    .filter((e) => e.group !== "투수" && !inLineup.has(e.name))
    .map((e) => player(e.name, e.playerId, e.group, splitThrowBat(e.throwBat).bat));
  const bullpen = entry
    .filter((e) => e.group === "투수" && e.playerId !== sid)
    .map((e) => {
      const th = splitThrowBat(e.throwBat).throw;
      return player(e.name, e.playerId, th ? PITCHER_LABEL[th] : "투수", null);
    });
  return { starter, batters, bench, bullpen };
}

const kstYmd = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
const kstHm = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16);
/** "두산 베어스" ↔ KBO 약칭 "두산", "KIA 타이거즈" ↔ "KIA" */
const nameHas = (full: string, abbr: string) => full.replace(/\s+/g, "").toUpperCase().startsWith(abbr.replace(/\s+/g, "").toUpperCase());

async function loadKboGameLineup(homeName: string, awayName: string, startIso: string): Promise<GameLineup | null> {
  const start = new Date(startIso);
  const ymd = kstYmd(start);
  const list = await wsPost<{ game?: KboGame[] }>("/ws/Main.asmx/GetKboGameList", { leId: "1", srId: "0,1,3,4,5,6,7,8,9", date: ymd });
  const cands = (list.game ?? []).filter((g) => nameHas(homeName, g.HOME_NM) && nameHas(awayName, g.AWAY_NM));
  const g = cands.find((c) => c.G_TM === kstHm(start)) ?? cands[0];
  if (!g) return null;
  const la = await wsPost<unknown[][]>("/ws/Schedule.asmx/GetLineUpAnalysis", {
    leId: "1", srId: String(g.SR_ID), seasonId: String(g.SEASON_ID), gameId: g.G_ID,
  });
  const confirmed = (la?.[0]?.[0] as { LINEUP_CK?: boolean } | undefined)?.LINEUP_CK === true;
  // [1]·[2] 팀 정보의 T_ID 로 [3]·[4] 표가 어느 팀인지 가른다(순서 가정 금지)
  const tid = (i: number) => (la?.[i]?.[0] as { T_ID?: string } | undefined)?.T_ID;
  const tableFor = (teamId: string) => parseOrderTable(tid(1) === teamId ? la?.[3]?.[0] : tid(2) === teamId ? la?.[4]?.[0] : null);
  // 경기일 등록 현황, 비면(미래 경기) 가장 최근 등록 현황
  const entryOf = async (teamId: string) => {
    const e = await fetchEntry(teamId, ymd);
    return e.length ? e : fetchEntry(teamId);
  };
  const [homeEntry, awayEntry] = await Promise.all([entryOf(g.HOME_ID), entryOf(g.AWAY_ID)]);
  const home = buildTeam(tableFor(g.HOME_ID), homeEntry, g.B_PIT_P_ID, g.B_PIT_P_NM ?? "");
  const away = buildTeam(tableFor(g.AWAY_ID), awayEntry, g.T_PIT_P_ID, g.T_PIT_P_NM ?? "");
  if (home.batters.length === 0 && away.batters.length === 0) return null;
  return { confirmed, note: confirmed ? "KBO 공식 · 금일 라인업" : "발표 전 · KBO 공식 최근 라인업 기준", home, away };
}

/** 우리 KBO Match(팀 한글 정식명·시작 시각) → 네이버형 라인업. 발표 전이면 confirmed=false(최근 라인업). 10분 캐시. */
export async function getKboGameLineup(homeName: string, awayName: string, startTime: Date): Promise<GameLineup | null> {
  return unstable_cache(loadKboGameLineup, ["kbo-game-lineup-v1"], { revalidate: 600 })(homeName, awayName, startTime.toISOString())
    .catch(() => null);
}
