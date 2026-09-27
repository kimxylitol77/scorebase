// MLB 풀 — 공식 Stats API 시즌 표(타격·투구) 1980~. 타자는 타격 득점 가치, 투수는 실점 억제 가치를 시즌·역할 안에서 표준화.
import { cachedJson, nameResolver, pctRanks, round1, standardizeFame, zscores, type Built } from "./common";
import { toKoreanTeamName } from "../../src/lib/team-names";
import { teamColor } from "../../src/lib/team-colors";
import type { PoolCard, PoolTeam, Pos } from "../../src/lib/draft/types";

const FIRST = 1980;
const SCALE = 2.2;
const MIN_SHARE = 0.4; // 시즌 최다 타석·이닝의 40%

interface Split {
  team?: { id: number; name: string };
  player: { id: number; fullName: string };
  position?: { abbreviation?: string };
  stat: Record<string, number | string>;
}
interface Resp {
  stats?: Array<{ splits?: Split[] }>;
}

const HIT_POS: Record<string, Pos[]> = {
  C: ["C"],
  "1B": ["IF"], "2B": ["IF"], "3B": ["IF"], SS: ["IF"], IF: ["IF"],
  LF: ["OF"], CF: ["OF"], RF: ["OF"], OF: ["OF"],
  DH: ["IF", "OF"], TWP: ["IF", "OF"], UT: ["IF", "OF"], PH: ["IF", "OF"],
};
// 옛 구단명 — 팀 id 는 연고를 옮겨도 그대로라 계보는 id 로 묶이고, 표기만 당시 이름으로
const OLD_NAMES: Record<string, string> = {
  "Montreal Expos": "몬트리올 엑스포스",
  "Florida Marlins": "플로리다 말린스",
  "Tampa Bay Devil Rays": "탬파베이 데블레이스",
  "California Angels": "캘리포니아 에인절스",
  "Anaheim Angels": "애너하임 에인절스",
  "Los Angeles Angels of Anaheim": "LA 에인절스",
  "Cleveland Indians": "클리블랜드 인디언스",
  "Oakland Athletics": "오클랜드 애슬레틱스",
};
const n = (v: number | string | undefined) => (typeof v === "number" ? v : Number(v) || 0);
/** "210.1" = 210이닝 1아웃 */
const innings = (v: number | string | undefined) => {
  const [a, b] = String(v ?? "0").split(".");
  return Number(a) + (Number(b) || 0) / 3;
};
const photo = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`;

async function season(group: "hitting" | "pitching", y: number): Promise<Split[]> {
  const d = await cachedJson<Resp>(
    `mlb-${group}-${y}`,
    `https://statsapi.mlb.com/api/v1/stats?stats=season&group=${group}&sportId=1&season=${y}&limit=3000&playerPool=ALL`,
  );
  return d.stats?.[0]?.splits ?? [];
}

export async function buildMlb(): Promise<Built> {
  const koName = nameResolver("mlb");
  const teamsNow = await cachedJson<{ teams: Array<{ id: number; name: string }> }>("mlb-teams", "https://statsapi.mlb.com/api/v1/teams?sportId=1");
  const teamKo = (en: string) => OLD_NAMES[en] ?? (toKoreanTeamName(en, "MLB") || en);
  const teams: PoolTeam[] = teamsNow.teams.map((t) => ({
    key: String(t.id),
    name: teamKo(t.name),
    logo: `https://www.mlbstatic.com/team-logos/${t.id}.svg`,
    color: teamColor(t.name) ?? teamColor(teamKo(t.name)) ?? "#334155",
  }));
  const known = new Set(teams.map((t) => t.key));
  const cards: PoolCard[] = [];
  const last = new Date().getFullYear();
  let lastWithData = FIRST;

  for (let y = FIRST; y <= last; y++) {
    const [hit, pit] = [await season("hitting", y), await season("pitching", y)];
    if (hit.length < 300) continue;
    lastWithData = y;

    // ── 타자 — 포지션 묶음(포수·내야·외야) 안에서 비교한다. 포수를 1루수와 같은 잣대로 재면 포수 카드가 사라진다.
    const batters = hit
      .map((s) => ({ s, pos: HIT_POS[s.position?.abbreviation ?? ""], pa: n(s.stat.plateAppearances) }))
      .filter((b) => b.pos && b.s.team && known.has(String(b.s.team.id)));
    const maxPa = Math.max(...batters.map((b) => b.pa));
    const qual = batters.filter((b) => b.pa >= maxPa * MIN_SHARE);
    const woba = (st: Split["stat"]) => {
      const pa = n(st.plateAppearances) || 1;
      const single = n(st.hits) - n(st.doubles) - n(st.triples) - n(st.homeRuns);
      return (0.69 * n(st.baseOnBalls) + 0.72 * n(st.hitByPitch) + 0.89 * single + 1.27 * n(st.doubles) + 1.62 * n(st.triples) + 2.1 * n(st.homeRuns)) / pa;
    };
    const lg = qual.reduce((a, b) => a + woba(b.s.stat) * b.pa, 0) / qual.reduce((a, b) => a + b.pa, 0);
    const value = (b: (typeof qual)[number]) => ((woba(b.s.stat) - lg) / 1.2) * b.pa + 0.2 * n(b.s.stat.stolenBases) - 0.4 * n(b.s.stat.caughtStealing);
    for (const g of ["C", "IF", "OF"]) {
      // 지명타자는 내야·외야 양쪽에 들어갈 수 있지만 비교는 첫 묶음에서 한 번만
      const grp = qual.filter((b) => b.pos![0] === g);
      const z = zscores(grp.map(value));
      const dur = pctRanks(grp.map((b) => b.pa));
      grp.forEach((b, i) => {
        if (z[i] < 0) return;
        const st = b.s.stat;
        cards.push({
          id: `${b.s.player.id}-${y}`,
          pid: String(b.s.player.id),
          name: koName(b.s.player.fullName),
          season: y,
          team: String(b.s.team!.id),
          teamName: teamKo(b.s.team!.name),
          pos: b.pos!,
          off: round1(z[i] * SCALE),
          def: 0,
          dur: dur[i],
          line: `타율 ${st.avg} · ${n(st.homeRuns)}홈런 · ${n(st.rbi)}타점 · OPS ${st.ops}`,
          fame: n(st.homeRuns) + 0.3 * n(st.rbi) + 150 * Number(st.avg || 0) + 0.2 * n(st.stolenBases),
          photo: photo(b.s.player.id),
        });
      });
    }

    // ── 투수 — 선발과 불펜을 따로. 평균자책과 FIP(홈런·볼넷·삼진)를 반씩 섞어 운을 덜어낸다.
    const arms = pit
      .filter((s) => s.team && known.has(String(s.team.id)))
      .map((s) => {
        const ip = innings(s.stat.inningsPitched);
        const g = n(s.stat.gamesPitched) || n(s.stat.gamesPlayed);
        return { s, ip, g, sp: g > 0 && n(s.stat.gamesStarted) / g >= 0.6 };
      })
      .filter((a) => a.ip > 0);
    const fipRaw = (st: Split["stat"], ip: number) => (13 * n(st.homeRuns) + 3 * (n(st.baseOnBalls) + n(st.hitBatsmen)) - 2 * n(st.strikeOuts)) / ip;
    const totIp = arms.reduce((a, x) => a + x.ip, 0);
    const lgEra = (arms.reduce((a, x) => a + n(x.s.stat.earnedRuns), 0) * 9) / totIp;
    const fipConst = lgEra - arms.reduce((a, x) => a + fipRaw(x.s.stat, x.ip) * x.ip, 0) / totIp;
    for (const role of ["SP", "RP"] as const) {
      const pool = arms.filter((a) => (role === "SP") === a.sp);
      const maxIp = Math.max(...pool.map((a) => a.ip));
      const grp = pool.filter((a) => a.ip >= maxIp * MIN_SHARE);
      const val = grp.map((a) => {
        const blend = 0.5 * Number(a.s.stat.era) + 0.5 * (fipRaw(a.s.stat, a.ip) + fipConst);
        return ((lgEra - blend) / 9) * a.ip * (role === "RP" ? 1.6 : 1); // 불펜은 접전 이닝이라 가중
      });
      const z = zscores(val);
      const dur = pctRanks(grp.map((a) => a.ip));
      grp.forEach((a, i) => {
        if (z[i] < 0) return;
        const st = a.s.stat;
        cards.push({
          id: `${a.s.player.id}-${y}-P`,
          pid: String(a.s.player.id),
          name: koName(a.s.player.fullName),
          season: y,
          team: String(a.s.team!.id),
          teamName: teamKo(a.s.team!.name),
          pos: [role],
          off: 0,
          def: round1(z[i] * SCALE),
          dur: dur[i],
          line:
            role === "SP"
              ? `${n(st.wins)}승 ${n(st.losses)}패 · 평균자책 ${st.era} · ${n(st.strikeOuts)}탈삼진`
              : `${n(st.saves)}세이브 ${n(st.holds)}홀드 · 평균자책 ${st.era} · ${n(st.strikeOuts)}탈삼진`,
          fame: role === "SP" ? 2 * n(st.wins) + 0.05 * n(st.strikeOuts) - 3 * Number(st.era) : n(st.saves) + 0.5 * n(st.holds) + 0.05 * n(st.strikeOuts) - 3 * Number(st.era),
          photo: photo(a.s.player.id),
        });
      });
    }
    console.log(`MLB ${y}: 타자 ${hit.length} 투수 ${pit.length} → 누적 카드 ${cards.length}`);
  }
  standardizeFame(cards, (c) => c.pos[0]);
  return { teams, cards, seasons: [FIRST, lastWithData] };
}
