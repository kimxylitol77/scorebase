// 축구 풀(api-football) — EPL·K리그 과거 시즌 선수 표. 평점과 생산 기록(골·도움·태클 등)을 시즌·포지션 안에서 표준화.
import { cachedJson, nameResolver, pctRanks, round1, standardizeFame, zscores, type Built } from "./common";
import { toKoreanTeamName } from "../../src/lib/team-names";
import { teamColor } from "../../src/lib/team-colors";
import type { PoolCard, PoolTeam } from "../../src/lib/draft/types";

const SCALE = 2.5;
const MIN_SHARE = 0.4; // 시즌 최다 출전 분의 40%
const POS: Record<string, "GK" | "DF" | "MF" | "FW"> = { Goalkeeper: "GK", Defender: "DF", Midfielder: "MF", Attacker: "FW" };
/** 기여도 중 공격 몫 */
const OFF_SHARE = { GK: 0, DF: 0.25, MF: 0.55, FW: 0.85 };

interface AfStat {
  team: { id: number; name: string; logo: string };
  league: { id: number | null };
  games: { appearences: number | null; minutes: number | null; position: string | null; rating: string | null };
  goals: { total: number | null; assists: number | null; conceded: number | null; saves: number | null };
  shots: { on: number | null };
  passes: { key: number | null };
  tackles: { total: number | null; interceptions: number | null };
}
interface AfResp {
  paging?: { total: number };
  response?: Array<{ player: { id: number; name: string; firstname: string | null; lastname: string | null; photo: string | null }; statistics: AfStat[] }>;
  errors?: unknown;
}
const v = (x: number | null | undefined) => x ?? 0;

/**
 * 이름 풀이 — af 의 name 은 "M. Salah"·"Mohamed Salah" 가 섞여 온다. 먼저 공용 사전에서 찾고,
 * 없으면 "약칭 | 본명" 을 음역 사전의 키로 쓴다(본명을 같이 줘야 음역기가 누구인지 안다).
 * 음역 전에는 카드 이름이 이 키 그대로 남고, finalize 가 "|" 뒤를 떼어 약칭만 보여준다.
 */
/** af 는 이름에 HTML 엔티티를 섞어 준다 ("M&apos;Vila") */
const decode = (v: string | null) => (v ?? "").replace(/&apos;|&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

function afName(koName: (en: string) => string, raw: { name: string; firstname: string | null; lastname: string | null }): string {
  const p = { name: decode(raw.name), firstname: decode(raw.firstname), lastname: decode(raw.lastname) };
  const direct = koName(p.name);
  if (/[가-힣]/.test(direct)) return direct;
  return koName(`${p.name} | ${p.firstname ?? ""} ${p.lastname ?? ""}`.replace(/\s+/g, " ").trim());
}

/** endYear: af 시즌 번호 → 우리 시즌(종료 연도). 추춘제는 +1, 춘추제는 그대로 */
async function buildAf(mode: "epl" | "kleague", leagueId: number, leagueCode: string, first: number, last: number, endYear: (y: number) => number): Promise<Built> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY 가 없습니다 (--env-file=.env.local)");
  const koName = nameResolver(mode);
  const headers = { "x-apisports-key": key };
  const teamMap = new Map<string, PoolTeam>();
  const cards: PoolCard[] = [];
  const seasons: number[] = [];

  for (let y = first; y <= last; y++) {
    const rows: NonNullable<AfResp["response"]> = [];
    let pages = 1;
    for (let p = 1; p <= pages; p++) {
      const d = await cachedJson<AfResp>(`af-${leagueId}-${y}-${p}`, `https://v3.football.api-sports.io/players?league=${leagueId}&season=${y}&page=${p}`, headers, 250);
      if (p === 1) pages = d.paging?.total ?? 1;
      rows.push(...(d.response ?? []));
    }
    // 그 리그에서 가장 오래 뛴 팀의 기록 한 줄 (시즌 중 이적 선수)
    const list = rows
      .map((r) => {
        const st = r.statistics.filter((s) => s.league.id === leagueId || s.league.id == null).sort((a, b) => v(b.games.minutes) - v(a.games.minutes))[0];
        return st ? { p: r.player, st, pos: POS[st.games.position ?? ""], min: v(st.games.minutes) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x && !!x.pos && x.min > 0);
    if (list.length < 150) {
      console.log(`${mode.toUpperCase()} ${y}: ${list.length}명 — 건너뜀`);
      continue;
    }
    const season = endYear(y);
    seasons.push(season);
    const maxMin = Math.max(...list.map((x) => x.min));
    // 막 시작한 시즌은 몇 경기 기록으로 순위가 요동친다 — 열 경기쯤 치른 뒤부터 카드로 만든다
    if (maxMin < 900) {
      console.log(`${mode.toUpperCase()} ${season}: 최다 출전 ${maxMin}분 — 진행 중이라 건너뜀`);
      seasons.pop();
      continue;
    }
    const qual = list.filter((x) => x.min >= maxMin * MIN_SHARE);
    const rated = qual.filter((x) => x.st.games.rating).length / qual.length >= 0.7;
    for (const pos of ["GK", "DF", "MF", "FW"] as const) {
      const grp = qual.filter((x) => x.pos === pos);
      const prod = grp.map(({ st }) =>
        pos === "GK"
          ? v(st.goals.saves) - 1.5 * v(st.goals.conceded)
          : pos === "DF"
            ? v(st.tackles.total) + 1.2 * v(st.tackles.interceptions) + 6 * v(st.goals.total) + 4 * v(st.goals.assists)
            : v(st.goals.total) + 0.7 * v(st.goals.assists) + 0.08 * v(st.passes.key) + 0.05 * v(st.shots.on) + (pos === "MF" ? 0.02 * (v(st.tackles.total) + v(st.tackles.interceptions)) : 0),
      );
      const zp = zscores(prod);
      // 평점은 시즌 누적으로 — 잠깐 잘한 선수보다 시즌 내내 잘한 선수가 높다
      const zr = rated ? zscores(grp.map((x) => (Number(x.st.games.rating ?? 0) - 6.6) * x.min)) : zp;
      const dur = pctRanks(grp.map((x) => x.min));
      grp.forEach((x, i) => {
        const z = rated && x.st.games.rating ? 0.6 * zr[i] + 0.4 * zp[i] : zp[i];
        if (z < 0) return;
        const { st, p } = x;
        const tkey = String(st.team.id);
        if (!teamMap.has(tkey)) {
          const ko = toKoreanTeamName(st.team.name, leagueCode) || st.team.name;
          teamMap.set(tkey, { key: tkey, name: ko, logo: st.team.logo, color: teamColor(st.team.name) ?? teamColor(ko) ?? "#334155" });
        }
        const total = z * SCALE;
        const rating = st.games.rating ? ` · 평점 ${Number(st.games.rating).toFixed(2)}` : "";
        const apps = `${v(st.games.appearences)}경기`;
        cards.push({
          id: `${p.id}-${season}`,
          pid: String(p.id),
          name: afName(koName, p),
          season,
          team: tkey,
          teamName: teamMap.get(tkey)!.name,
          pos: [pos],
          off: round1(total * OFF_SHARE[pos]),
          def: round1(total * (1 - OFF_SHARE[pos])),
          dur: dur[i],
          line:
            pos === "GK"
              ? `${apps} · 선방 ${v(st.goals.saves)} · 실점 ${v(st.goals.conceded)}${rating}`
              : pos === "DF"
                ? `${apps} · 태클 ${v(st.tackles.total)} · 가로채기 ${v(st.tackles.interceptions)}${rating}`
                : `${apps} · ${v(st.goals.total)}골 ${v(st.goals.assists)}도움${rating}`,
          fame: pos === "GK" || pos === "DF" ? (Number(st.games.rating ?? 6.6) - 6.6) * 10 + x.min / 600 : 1.5 * v(st.goals.total) + v(st.goals.assists) + (Number(st.games.rating ?? 6.6) - 6.6) * 5,
          photo: p.photo,
        });
      });
    }
    console.log(`${mode.toUpperCase()} ${season}: ${list.length}명 (${pages}쪽, 평점 ${rated ? "있음" : "부족"}) → 누적 카드 ${cards.length}`);
  }
  standardizeFame(cards, (c) => c.pos[0]);
  return { teams: [...teamMap.values()], cards, seasons: [Math.min(...seasons), Math.max(...seasons)] };
}

export const buildEpl = () => buildAf("epl", 39, "EPL", 2010, new Date().getFullYear(), (y) => y + 1);
// K리그1 은 2021 시즌부터만 평점·도움·태클이 온다 (2016·2019 실측: 출전 분과 득점뿐) — 그 전은 카드 능력치를 못 만든다
export const buildKleague = () => buildAf("kleague", 292, "K_LEAGUE_1", 2021, new Date().getFullYear(), (y) => y);
