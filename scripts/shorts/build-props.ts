// 쇼츠 자동 생성용 데이터 빌더 — 주제를 받아 DB 에서 실측치를 뽑아 Remotion props JSON 을 만들고,
// 필요한 선수 사진·팀 로고를 public/players 로 내려받는다.
// ⚠️ scorebase repo cwd 에서 실행해야 @prisma/client 가 잡힌다:
//   cd ~/scorebase && npx tsx --env-file=.env.local ~/scorebase-shorts/scripts/build-props.ts <topic>
// 출력: ~/scorebase-shorts/data/<topic>.json  ( { compositionId, props } )
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
// ⚠️ 절대경로(/Users/...) import 금지 — Vercel 빌드가 scripts/ 까지 타입체크해서 배포가 깨진다
import rawOv from "../../data/player-overrides.json";
import { toKoreanPlayerName } from "../../src/lib/player-names";
import { toKoreanTeamName } from "../../src/lib/team-names";
// 선발 JSON 파싱·사진 URL 은 사이트(/predictions/starters)와 같은 헬퍼를 쓴다
import { parseStarter, pitcherPhoto } from "../../src/lib/predict/starter-card";
// 축구 주간 베스트 XI — 화요일 글(weekly-xi cron)과 같은 산식·같은 7일 창
import { getWeeklyBestXi } from "../../src/lib/soccer/weekly-best-xi";

const OV = rawOv as Record<string, { nameKo?: string }>;
const SHORTS = "/Users/kimss/scorebase-shorts";
const p = new PrismaClient();

// ── 팀 컬러 맵 (fallback = 리그 기본색) ──
const KBO_COLOR: Record<string, string> = {
  LG: "#c30452", SSG: "#ce0e2d", 한화: "#fc4e00", KIA: "#ea0029", 두산: "#131230",
  삼성: "#074ca1", 롯데: "#041e42", KT: "#000000", NC: "#315288", 키움: "#570514",
};
const MLB_COLOR: Record<string, string> = {
  휴스턴: "#eb6e1f", 뉴욕양키스: "#0c2340", 보스턴: "#bd3039", "LA다저스": "#005a9c",
  뉴욕메츠: "#ff5910", 애틀랜타: "#ce1141", 필라델피아: "#e81828", 샌디에이고: "#2f241d",
  볼티모어: "#df4601", 시애틀: "#0c2c56", 텍사스: "#003278", 탬파베이: "#092c5c",
  마이애미: "#00a3e0", 샌프란시스코: "#fd5a1e", 피츠버그: "#fdb827",
};
const SOCCER_COLOR: Record<string, string> = {
  "Bayern München": "#dc052d", "Manchester City": "#6caee0", "Real Madrid": "#fdbf00",
  "Liverpool": "#c8102e", "Arsenal": "#ef0107", "Barcelona": "#a50044",
  "Inter": "#0068a8", "AC Milan": "#fb090b", "Paris Saint Germain": "#004170",
};

// ── ESPN MLB 팀 약어 (한글 팀명 → abbr, 30팀 전량) ──
const MLB_ABBR: Record<string, string> = {
  휴스턴: "hou", 뉴욕양키스: "nyy", 보스턴: "bos", "LA다저스": "lad", 뉴욕메츠: "nym",
  애틀랜타: "atl", 필라델피아: "phi", 볼티모어: "bal", 시애틀: "sea", 텍사스: "tex",
  탬파베이: "tb", 샌디에이고: "sd", 토론토: "tor", 디트로이트: "det", 클리블랜드: "cle",
  미네소타: "min", 밀워키: "mil", 시카고컵스: "chc", 애리조나: "ari", 샌프란시스코: "sf",
  워싱턴: "wsh", 신시내티: "cin", 마이애미: "mia", 콜로라도: "col", 캔자스시티: "kc",
  시카고화이트삭스: "chw", "LA에인절스": "laa", 세인트루이스: "stl", 피츠버그: "pit", 오클랜드: "ath",
};

const download = async (url: string, filename: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const out = `${SHORTS}/public/players/${filename}`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buf);
    return true;
  } catch {
    return false;
  }
};

// 발행 텍스트 — 유튜브(제목·설명·키워드) / 인스타(캡션)
interface PublishText {
  youtube: { title: string; description: string; tags: string };
  instagram: { caption: string };
}

const save = (topic: string, compositionId: string, props: unknown, text: PublishText) => {
  const out = `${SHORTS}/data/${topic}.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ compositionId, props, text }, null, 2));
  console.log(`✓ ${topic} → ${out}`);
};

const FOOTER = "\n\n데이터로 보는 스포츠 · 스코어베이스\nhttps://www.scorebase.kr";

// 카드류(야구·축구) 공통 텍스트 — 1위 선수를 훅으로
function cardText(opts: {
  headline: string; // 유튜브 제목 앞부분
  cards: { name: string; team: string; stats: { label: string; value: number; decimals?: number; dropLeadingZero?: boolean }[] }[];
  keyStatIdx: number; // 대표 스탯 인덱스
  ctaUrl: string;
  tags: string;
  igHashtags: string;
}): PublishText {
  const fmt = (s: { value: number; decimals?: number; dropLeadingZero?: boolean }) => {
    const t = s.value.toFixed(s.decimals ?? 0);
    return s.dropLeadingZero ? t.replace(/^0/, "") : t;
  };
  const top = opts.cards[0];
  const key = top.stats[opts.keyStatIdx];
  const list = opts.cards.map((c, i) => `${i + 1}. ${c.name} (${c.team}) ${key.label} ${fmt(c.stats[opts.keyStatIdx])}`).join("\n");
  const title = `${top.name} ${key.label} ${fmt(key)} · ${opts.headline}`;
  return {
    youtube: {
      title,
      description: `${opts.headline}\n\n${list}\n\n순위는 매일 자동 갱신됩니다.${FOOTER}`,
      tags: opts.tags,
    },
    instagram: {
      caption: `${opts.headline}\n\n${list}\n\n매일 업데이트 · scorebase.kr\n\n${opts.igHashtags}`,
    },
  };
}

// ─────────────────────────── 몸값 급등·급락 ───────────────────────────
async function buildMarketValue() {
  const SINCE = Math.floor(Date.now() / 1000) - 180 * 86400; // 6개월
  const rows = await p.playerMarketValue.findMany({
    where: { currentValue: { gte: 5_000_000 }, league: { not: null } },
    select: { id: true, currentValue: true, league: true, teamId: true, history: true },
  });
  type H = { market_time?: number; market_value?: number; team_id?: string };
  const moves: { id: string; league: string; teamId: string | null; from: number; to: number; diff: number }[] = [];
  for (const r of rows) {
    const h = (Array.isArray(r.history) ? (r.history as H[]) : [])
      .filter((x) => (x?.market_value || 0) > 0 && x?.market_time)
      .sort((a, b) => (a.market_time || 0) - (b.market_time || 0));
    if (h.length < 2) continue;
    const last = h[h.length - 1];
    if ((last.market_time || 0) < SINCE) continue;
    const base = [...h].reverse().find((x) => (x.market_time || 0) < SINCE);
    if (!base || base.market_value === last.market_value) continue;
    moves.push({ id: r.id, league: r.league!, teamId: last.team_id || r.teamId, from: base.market_value!, to: last.market_value!, diff: last.market_value! - base.market_value! });
  }
  const up = [...moves].sort((a, b) => b.diff - a.diff).slice(0, 5);
  const down = [...moves].sort((a, b) => a.diff - b.diff).slice(0, 5);
  const ids = [...up, ...down].map((x) => x.id);
  const tsp = await p.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true } });
  const nm = new Map(tsp.map((t) => [t.id, OV[t.id]?.nameKo || t.nameKo || t.name]));
  const en = new Map(tsp.map((t) => [t.id, t.name]));
  const LEAGUE_KO: Record<string, string> = { EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에A", LIGUE_1: "리그1" };
  const teamIds = [...new Set([...up, ...down].map((x) => x.teamId).filter(Boolean))] as string[];
  const tss = await p.teamSourceId.findMany({ where: { source: "thesports", externalId: { in: teamIds } }, select: { externalId: true, teamId: true } });
  const teams = await p.team.findMany({ where: { id: { in: tss.map((s) => s.teamId) } }, select: { id: true, name: true } });
  const tById = new Map(teams.map((t) => [t.id, t.name]));
  const teamKo = new Map(tss.map((s) => [s.externalId, tById.get(s.teamId) || null]));
  const row = (x: (typeof up)[0]) => ({
    nameKo: nm.get(x.id) || "?",
    nameEn: en.get(x.id) || "",
    team: teamKo.get(x.teamId!) || "-",
    league: LEAGUE_KO[x.league] || x.league,
    from: Math.round(x.from / 1e6),
    to: Math.round(x.to / 1e6),
  });
  const upRows = up.map(row);
  const downRows = down.map(row);
  const u = upRows[0];
  const d = downRows[0];
  const upList = upRows.map((x, i) => `${i + 1}. ${x.nameKo} (${x.team}) €${x.from}M→€${x.to}M`).join("\n");
  const downList = downRows.map((x, i) => `${i + 1}. ${x.nameKo} (${x.team}) €${x.from}M→€${x.to}M`).join("\n");
  const headline = "최근 6개월 유럽축구 몸값 급등·급락 TOP5";
  const text: PublishText = {
    youtube: {
      title: `${u.nameKo} €${u.from}M→€${u.to}M · ${headline}`,
      description: `${headline}\n\n[급등]\n${upList}\n\n[급락]\n${downList}\n\n순위는 증감 금액 기준. 매일 자동 갱신됩니다.${FOOTER}`,
      tags: "축구,이적시장,몸값,EPL,라리가,분데스리가,세리에A,리그1,축구선수,트랜스퍼마켓",
    },
    instagram: {
      caption: `${headline}\n\n[급등]\n${upList}\n\n[급락]\n${downList}\n\n매일 업데이트 · scorebase.kr\n\n#축구 #이적시장 #몸값 #EPL #라리가 #분데스리가 #세리에A #해외축구`,
    },
  };
  save("market-value", "MarketValueTop", { period: "최근 6개월", up: upRows, down: downRows }, text);
}

// ─────────────────────────── 이번 주 이적시장 TOP5 (수요일) ───────────────────────────
// 최근 7일 유료 이적을 이적료순으로 — 부족하면 21일로 창 확장. 유입팀을 우리 Team(빅리그)과
// 이름 매칭해 로고를 붙이고, 선수 사진(TheSportsPlayer)이 있는 건만 카드로 채택한다.
async function buildTransferDeals() {
  const BIG_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "SAUDI_PL", "EREDIVISIE", "PRIMEIRA_LIGA", "CSL", "SUPER_LIG"];
  const teams = await p.team.findMany({ where: { league: { in: BIG_LEAGUES } }, select: { id: true, name: true, league: true, logoUrl: true } });
  // 접미 제거는 공백 뒤 FC/CF/AFC 만 — \s* 0개 허용이면 "LAFC"→"l" 로 붕괴해 오매칭됐다(레알→LAFC 사고)
  const norm = (s: string) => s.toLowerCase().replace(/\s+(fc|cf|afc)$/i, "").replace(/\s+/g, "");
  const teamKeys = teams.map((t) => ({ t, key: norm(t.name) }));

  type Deal = { rank: number; name: string; team: string; photo: string; logo: string; color: string; tier: string; note: string; stats: { label: string; value: number }[] };
  let picked: Deal[] = [];
  for (const days of [7, 21]) {
    const since = Math.floor((Date.now() - days * 24 * 3600_000) / 1000);
    const trs = await p.footballTransfer.findMany({
      where: { transferFee: { gt: 0 }, transferTime: { gte: since } },
      orderBy: { transferFee: "desc" }, take: 40,
      select: { playerId: true, fromTeamName: true, toTeamName: true, transferFee: true },
    });
    const out: Deal[] = [];
    const seenPlayer = new Set<string>();
    for (const tr of trs) {
      if (out.length >= 5) break;
      if (seenPlayer.has(tr.playerId)) continue;
      const toKey = norm(tr.toTeamName ?? "");
      if (!toKey) continue;
      // exact 우선, 그다음 접두 일치(양쪽 4자 이상) — 짧은 키의 포함 오매칭 방지
      const hit =
        teamKeys.find((k) => k.key === toKey) ??
        teamKeys.find((k) => k.key.length >= 4 && toKey.length >= 4 && (toKey.startsWith(k.key) || k.key.startsWith(toKey)));
      if (!hit?.t.logoUrl) continue;
      const pl = await p.theSportsPlayer.findUnique({ where: { id: tr.playerId }, select: { name: true, nameKo: true, photoUrl: true } });
      if (!pl?.photoUrl) continue;
      const photo = `trdeal-${tr.playerId}.png`;
      if (!(await download(pl.photoUrl, photo))) continue;
      const logo = `trteam-${hit.t.id}.png`;
      if (!(await download(hit.t.logoUrl, logo))) continue;
      const fee = Math.round((tr.transferFee ?? 0) / 1e6);
      const toKo = toKoreanTeamName(hit.t.name, hit.t.league);
      seenPlayer.add(tr.playerId);
      out.push({
        rank: out.length + 1,
        name: pl.nameKo || pl.name || "?",
        team: toKo,
        photo, logo,
        color: SOCCER_COLOR[hit.t.name] ?? "#334155",
        tier: `€${fee}M`,
        note: `${tr.fromTeamName ?? "?"} → ${toKo}`,
        stats: [{ label: "이적료(€M)", value: fee }],
      });
    }
    if (out.length >= 5) { picked = out; break; }
    if (days === 21 && out.length >= 3) picked = out; // 3~4건이면 그대로 발행
  }
  if (picked.length < 3) throw new Error(`이적 데이터 부족 (${picked.length}건) — 폴백 진행`);

  const props = {
    title: "이번 주 이적시장",
    subtitle: `이적료 TOP ${picked.length}`,
    cta: "scorebase.kr/transfers",
    cards: picked,
  };
  const text = cardText({
    headline: `이번 주 이적시장 이적료 TOP ${picked.length}`,
    cards: picked,
    keyStatIdx: 0,
    ctaUrl: "https://www.scorebase.kr/transfers",
    tags: "이적시장, 축구 이적, 이적료, 해외축구, 스코어베이스",
    igHashtags: "#이적시장 #축구 #해외축구 #이적료 #스코어베이스",
  });
  save("transfer-deals", "PlayerCards", props, text);
}

// ─────────────────────────── 야구 카드 (KBO / MLB) ───────────────────────────
async function buildBaseballCards(league: "KBO" | "MLB") {
  const latest = await p.baseballPlayerSeasonStats.findMany({ where: { league }, orderBy: { season: "desc" }, take: 1, select: { season: true } });
  const season = latest[0]?.season;
  const minG = league === "KBO" ? 70 : 60;
  const rows = await p.baseballPlayerSeasonStats.findMany({
    where: { league, season, ops: { not: null }, games: { gte: minG }, externalId: { not: null } },
    orderBy: { ops: "desc" }, take: 5,
  });
  const teams = await p.team.findMany({ where: { league }, select: { name: true, logoUrl: true } });
  const cards = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const color = league === "KBO" ? (KBO_COLOR[r.teamName] ?? "#c30452") : (MLB_COLOR[r.teamName] ?? "#1d4ed8");
    // 사진
    const photoFile = `${league.toLowerCase()}-${r.externalId}.png`;
    const photoUrl = league === "KBO"
      ? `https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/${season}/${r.externalId}.jpg`
      : `https://midfield.mlbstatic.com/v1/people/${r.externalId}/spots/240`;
    await download(photoUrl, photoFile);
    // 로고
    let logoFile = "";
    if (league === "KBO") {
      const t = teams.find((x) => x.name.replace(/\s/g, "").startsWith(r.teamName.replace(/\s/g, "")));
      if (t?.logoUrl) { logoFile = `kbologo-${r.externalId}.png`; await download(t.logoUrl, logoFile); }
    } else {
      const abbr = MLB_ABBR[r.teamName];
      if (abbr) { logoFile = `mlbteam-${abbr}.png`; await download(`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${abbr}.png`, logoFile); }
    }
    cards.push({
      rank: i + 1,
      name: r.playerName,
      team: r.teamName,
      photo: photoFile,
      logo: logoFile,
      color,
      tier: (r.ops ?? 0) >= 1 ? "OPS 1.000+" : (r.ops ?? 0) >= 0.9 ? "OPS 0.900+" : "OPS 리더",
      note: `${r.games}경기 · 안타 ${r.hits ?? "-"}`,
      round: league === "MLB",
      stats: [
        { label: "타율", value: r.avg ?? 0, decimals: 3, dropLeadingZero: true },
        { label: "홈런", value: r.homeRuns ?? 0 },
        { label: "타점", value: r.rbi ?? 0 },
        { label: "OPS", value: r.ops ?? 0, decimals: 3 },
      ],
    });
  }
  const text = cardText({
    headline: `${season} ${league} OPS 상위 타자 TOP5`,
    cards,
    keyStatIdx: 3, // OPS
    ctaUrl: "scorebase.kr/baseball",
    tags: league === "KBO"
      ? "KBO,프로야구,야구,타율,OPS,홈런,오스틴,강백호,김도영,한국야구"
      : "MLB,메이저리그,야구,OPS,홈런,오타니,소토,베이스볼,해외야구",
    igHashtags: league === "KBO"
      ? "#KBO #프로야구 #야구 #OPS #홈런 #타율왕 #한국야구"
      : "#MLB #메이저리그 #야구 #오타니 #홈런 #베이스볼 #해외야구",
  });
  save(league === "KBO" ? "kbo-cards" : "mlb-cards", league === "KBO" ? "KboCards" : "MlbCards", {
    title: `${season} ${league}`,
    subtitle: "지금 가장 뜨거운 타자 5명",
    cta: "scorebase.kr/baseball",
    cards,
  }, text);
}

// ─────────────────────────── 축구 카드 (빅5 득점 상위) ───────────────────────────
async function buildSoccerCards() {
  const BIG5 = ["Serie A", "La Liga", "Premier League", "Bundesliga", "Ligue 1"];
  const LEAGUE_KO: Record<string, string> = { "Serie A": "세리에A", "La Liga": "라리가", "Premier League": "프리미어리그", "Bundesliga": "분데스리가", "Ligue 1": "리그1" };
  const logs = await p.playerMatchLog.findMany({ where: { leagueName: { in: BIG5 } }, select: { playerId: true, leagueName: true, goals: true, assists: true, rating: true } });
  const m = new Map<string, { pid: string; league: string; g: number; a: number; rSum: number; rN: number }>();
  for (const l of logs) {
    let x = m.get(l.playerId);
    if (!x) { x = { pid: l.playerId, league: l.leagueName, g: 0, a: 0, rSum: 0, rN: 0 }; m.set(l.playerId, x); }
    x.g += l.goals; x.a += l.assists;
    if (l.rating) { x.rSum += l.rating; x.rN++; }
  }
  const top = [...m.values()].sort((a, b) => b.g - a.g || b.a - a.a).slice(0, 5);
  const tsp = await p.theSportsPlayer.findMany({ where: { id: { in: top.map((t) => t.pid) } }, select: { id: true, name: true, nameKo: true, photoUrl: true } });
  const tmap = new Map(tsp.map((t) => [t.id, t]));
  const cards = [];
  for (let i = 0; i < top.length; i++) {
    const t = top[i];
    const tp = tmap.get(t.pid);
    // 소속팀 로고·이름 = 최근 로그
    const last = await p.playerMatchLog.findFirst({ where: { playerId: t.pid }, orderBy: { date: "desc" }, select: { playerSide: true, homeName: true, homeLogo: true, awayName: true, awayLogo: true } });
    const isHome = last?.playerSide === "H";
    const teamName = (isHome ? last?.homeName : last?.awayName) ?? "-";
    const teamLogo = (isHome ? last?.homeLogo : last?.awayLogo) ?? null;
    const photoFile = `soc-${t.pid}.png`;
    if (tp?.photoUrl) await download(tp.photoUrl, photoFile);
    let logoFile = "";
    if (teamLogo) { logoFile = `socteam-${t.pid}.png`; await download(teamLogo, logoFile); }
    cards.push({
      rank: i + 1,
      name: OV[t.pid]?.nameKo || tp?.nameKo || tp?.name || "?",
      team: teamName,
      photo: photoFile,
      logo: logoFile,
      color: SOCCER_COLOR[teamName] ?? "#6366f1",
      tier: LEAGUE_KO[t.league] || t.league,
      note: `도움 ${t.a} · 평점 ${t.rN ? (t.rSum / t.rN).toFixed(2) : "-"}`,
      cutout: true,
      stats: [
        { label: "득점", value: t.g },
        { label: "도움", value: t.a },
        { label: "평점", value: t.rN ? +(t.rSum / t.rN).toFixed(2) : 0, decimals: 2 },
      ],
    });
  }
  const text = cardText({
    headline: "유럽 빅5 이번 시즌 최다 득점 TOP5",
    cards,
    keyStatIdx: 0, // 득점
    ctaUrl: "scorebase.kr/soccer",
    tags: "축구,해외축구,득점왕,EPL,라리가,분데스리가,세리에A,케인,홀란,음바페",
    igHashtags: "#축구 #해외축구 #득점왕 #EPL #라리가 #분데스리가 #프리미어리그",
  });
  save("soccer-cards", "SoccerCards", { title: "유럽 빅5", subtitle: "이번 시즌 최다 득점 5명", cta: "scorebase.kr/soccer", cards }, text);
}

// ─────────────────────────── MLB 타율 카드 (이정후 얼굴 훅 + TOP5 역순 카운트다운) ───────────────────────────
async function buildMlbAvgCards() {
  // 사이트 리더보드(/standings)와 동일한 출처 — leagueLeader BA (규정 필터 적용된 공식 순위)
  const leaders = await p.leagueLeader.findMany({
    where: { league: "MLB", category: "BA" },
    orderBy: [{ season: "desc" }, { rank: "asc" }],
    take: 10,
  });
  const season = leaders[0]?.season;
  const rows = leaders.filter((l) => l.season === season);
  const top5 = rows.filter((r) => r.rank <= 5);
  const lee = rows.find((r) => r.playerNameEn === "Jung Hoo Lee" && r.rank > 5) ?? null;
  const ids = [...top5, ...(lee ? [lee] : [])].map((r) => r.externalId).filter(Boolean) as string[];
  const st = await p.baseballPlayerSeasonStats.findMany({ where: { league: "MLB", season, externalId: { in: ids } } });
  const sMap = new Map(st.map((s) => [s.externalId!, s]));
  const fmtAvg = (v: number) => v.toFixed(3).replace(/^0/, "");

  const mkCard = async (r: (typeof rows)[0]) => {
    const s = sMap.get(r.externalId ?? "");
    const photoFile = `mlb-${r.externalId}.png`;
    await download(`https://midfield.mlbstatic.com/v1/people/${r.externalId}/spots/240`, photoFile);
    const abbr = MLB_ABBR[r.teamName];
    let logoFile = "";
    if (abbr) { logoFile = `mlbteam-${abbr}.png`; await download(`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${abbr}.png`, logoFile); }
    return {
      rank: r.rank,
      name: r.playerName,
      team: r.teamName,
      photo: photoFile,
      logo: logoFile,
      color: MLB_COLOR[r.teamName] ?? "#1d4ed8",
      tier: r.value >= 0.3 ? ".300 클럽" : "타율 리더",
      note: s ? `${s.games}경기 · 안타 ${s.hits ?? "-"}` : "",
      round: true,
      stats: [
        { label: "타율", value: r.value, decimals: 3, dropLeadingZero: true },
        { label: "홈런", value: s?.homeRuns ?? 0 },
        { label: "타점", value: s?.rbi ?? 0 },
        { label: "OPS", value: s?.ops ?? 0, decimals: 3 },
      ],
    };
  };

  const cardsByRank = [];
  for (const r of top5) cardsByRank.push(await mkCard(r));

  // 훅 = 이정후 얼굴 + 큰 숫자 (순위권 밖으로 밀리면 1위 얼굴로 폴백)
  let hookFace;
  if (lee) {
    const photoFile = `mlb-${lee.externalId}.png`;
    await download(`https://midfield.mlbstatic.com/v1/people/${lee.externalId}/spots/240`, photoFile);
    hookFace = {
      photo: photoFile,
      bigStat: fmtAvg(lee.value),
      line1: `${lee.playerName} MLB 타율 ${lee.rank}위`,
      line2: "그보다 잘 치는 타자, 딱 5명",
      color: MLB_COLOR[lee.teamName] ?? "#fd5a1e",
    };
  } else {
    const t = cardsByRank[0];
    hookFace = { photo: t.photo, bigStat: fmtAvg(t.stats[0].value), line1: `${t.name} MLB 타율 1위`, line2: "타율 TOP5 카운트다운", color: t.color };
  }

  const listLines = cardsByRank.map((c) => `${c.rank}. ${c.name} (${c.team}) 타율 ${fmtAvg(c.stats[0].value)}`);
  if (lee) listLines.push(`${lee.rank}. ${lee.playerName} (${lee.teamName}) 타율 ${fmtAvg(lee.value)}`);
  const list = listLines.join("\n");
  const headline = `${season} MLB 타율 TOP5`;
  const title = lee
    ? `이정후 타율 ${fmtAvg(lee.value)} MLB ${lee.rank}위 · 그 위 5명은?`
    : `${cardsByRank[0].name} 타율 ${fmtAvg(cardsByRank[0].stats[0].value)} · ${headline}`;
  const text: PublishText = {
    youtube: {
      title,
      description: `${headline}\n\n${list}\n\n순위는 매일 자동 갱신됩니다.${FOOTER}`,
      tags: "MLB,메이저리그,이정후,타율,샌프란시스코,야구,안타,수위타자,해외야구,베이스볼",
    },
    instagram: {
      caption: `${headline}\n\n${list}\n\n매일 업데이트 · scorebase.kr\n\n#이정후 #MLB #메이저리그 #야구 #타율 #샌프란시스코 #해외야구`,
    },
  };
  save("mlb-avg-cards", "MlbAvgCards", {
    title: `${season} MLB`,
    subtitle: "타율 TOP5 카운트다운",
    cta: "scorebase.kr/baseball",
    hookFace,
    cards: [...cardsByRank].reverse(), // 5위 → 1위 역순 재생
  }, text);
}

// ── AI 7대전 — 멀티 LLM 성적표 (최근 100건 채점 기준, /predictions/scorecard 와 동일 공정 지표) ──
const AI_META: Record<string, { label: string; color: string }> = {
  scorebase: { label: "스코어베이스", color: "#f43f5e" },
  gpt: { label: "GPT-5.6", color: "#10b981" },
  grok: { label: "Grok", color: "#38bdf8" },
  gemini: { label: "Gemini", color: "#f59e0b" },
  "qwen2.5-32b": { label: "Qwen", color: "#14b8a6" },
  claude: { label: "Claude", color: "#8b5cf6" },
  "kimi-k3": { label: "Kimi K3", color: "#6366f1" },
};
const normAiModel = (m: string): string => (m.startsWith("gpt") ? "gpt" : m);

async function buildAiBattle() {
  // 채점 완료 픽 전체를 경기 시작시간 desc 로 — 모델별 최근 100건 창
  const rows = await p.aiPrediction.findMany({
    where: { correct: { not: null }, published: true },
    select: { model: true, correct: true, match: { select: { startTime: true } } },
    orderBy: { match: { startTime: "desc" } },
  });
  const WINDOW = 100;
  const acc = new Map<string, { graded: number; correct: number }>();
  for (const r of rows) {
    const key = normAiModel(r.model);
    if (!AI_META[key]) continue;
    const a = acc.get(key) ?? { graded: 0, correct: 0 };
    if (a.graded >= WINDOW) continue;
    a.graded++;
    if (r.correct) a.correct++;
    acc.set(key, a);
  }
  const ranked = [...acc.entries()]
    .filter(([, a]) => a.graded >= 30) // 표본 너무 적은 모델은 제외
    .map(([key, a]) => ({
      key,
      label: AI_META[key].label,
      color: AI_META[key].color,
      rate: Math.round((a.correct / a.graded) * 1000) / 10,
      graded: a.graded,
      isOurs: key === "scorebase",
    }))
    .sort((x, y) => y.rate - x.rate)
    .map((m, i) => ({ ...m, rank: i + 1 }));
  if (ranked.length < 3) throw new Error(`채점 표본 부족 — 활성 모델 ${ranked.length}개`);

  const top = ranked[0];
  const list = ranked.map((m) => `${m.rank}. ${m.label} ${m.rate}% (${m.graded}건)`).join("\n");
  const headline = `AI ${ranked.length}개 스포츠 예측 대결 — 최근 ${WINDOW}건 적중률`;
  const text: PublishText = {
    youtube: {
      title: `${top.label} ${top.rate}% 1위 · AI ${ranked.length}개 스포츠 예측 대결`,
      description: `${headline}\n\n${list}\n\n같은 경기·같은 기준으로 채점한 공정 비교입니다.\n전체 성적표는 매일 갱신됩니다.\n\n데이터로 보는 스포츠 · 스코어베이스\nhttps://www.scorebase.kr/predictions/scorecard`,
      tags: "AI,인공지능,GPT,Claude,Gemini,스포츠예측,승부예측,적중률,AI대결,프로야구",
    },
    instagram: {
      caption: `${headline}\n\n${list}\n\n매일 갱신 · scorebase.kr/predictions/scorecard\n\n#AI #GPT #Claude #Gemini #스포츠예측 #적중률`,
    },
  };
  save("ai-battle", "AiBattle", {
    windowLabel: `최근 ${WINDOW}건`,
    models: [...ranked].reverse(), // 꼴찌 → 1위 카운트다운
  }, text);
}

// ─────────────────────────── 선발 투수 맞대결 (KBO / MLB) ───────────────────────────
// /predictions/starters 와 같은 출처 — Match.homeStarter/awayStarter JSON + predHome/Away.
// 지표 5개(ERA·WHIP·K/9·FIP·최근3등판)를 비교해 "한쪽이 다 이기는데 AI 는 반대" 매치업을 자동 선정.
const MLB_EN_COLOR: Record<string, string> = {
  "New York Yankees": "#0c2340", "Boston Red Sox": "#bd3039", "Toronto Blue Jays": "#134a8e",
  "Baltimore Orioles": "#df4601", "Tampa Bay Rays": "#092c5c", "Cleveland Guardians": "#00385d",
  "Detroit Tigers": "#0c2340", "Kansas City Royals": "#004687", "Minnesota Twins": "#002b5c",
  "Chicago White Sox": "#27251f", "Houston Astros": "#eb6e1f", "Seattle Mariners": "#0c2c56",
  "Texas Rangers": "#003278", "Los Angeles Angels": "#ba0021", "Athletics": "#003831",
  "Atlanta Braves": "#ce1141", "New York Mets": "#ff5910", "Philadelphia Phillies": "#e81828",
  "Miami Marlins": "#00a3e0", "Washington Nationals": "#ab0003", "Chicago Cubs": "#0e3386",
  "Milwaukee Brewers": "#12284b", "St. Louis Cardinals": "#c41e3a", "Cincinnati Reds": "#c6011f",
  "Pittsburgh Pirates": "#fdb827", "Los Angeles Dodgers": "#005a9c", "San Diego Padres": "#2f241d",
  "San Francisco Giants": "#fd5a1e", "Arizona Diamondbacks": "#a71930", "Colorado Rockies": "#333366",
};

interface StarterJson {
  name: string; pid?: number;
  era?: number; whip?: number; k9?: number; fip?: number; recentEra?: number;
  wins?: number; losses?: number; ip?: string;
}

// 이닝 문자열 → 숫자 (KBO "115 2/3" · MLB "122.1"). 표본 미달 투수를 걸러내는 데만 쓴다.
const parseIp = (ip?: string) => {
  if (!ip) return 0;
  const m = String(ip).match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
};
// 최소 이닝 — 12이닝 투수의 ERA 1.50 이 "지표 압승" 으로 잡히는 걸 막는다
const MIN_IP: Record<string, number> = { KBO: 40, MLB: 50 };

const METRICS: { label: string; key: keyof StarterJson; lower: boolean; digits: number }[] = [
  { label: "ERA", key: "era", lower: true, digits: 2 },
  { label: "WHIP", key: "whip", lower: true, digits: 2 },
  { label: "K/9", key: "k9", lower: false, digits: 1 },
  { label: "FIP", key: "fip", lower: true, digits: 2 },
  { label: "최근3등판 ERA", key: "recentEra", lower: true, digits: 2 },
];
// 훅 큰 숫자는 설명 없이 읽히는 시즌 지표만 (최근3등판·FIP 는 맥락이 필요해 제외)
const HOOK_LABELS = ["K/9", "ERA"];

type RowCalc = { label: string; homeText: string; awayText: string; homeShare: number; winner: "H" | "A" | "E"; gap: number };

// 두 선발의 같은 지표를 맞대고 줄다리기 비율·승자·격차를 계산. labels 를 주면 그 지표만 쓴다(다경기 보드용).
function duelRows(home: StarterJson, away: StarterJson, labels?: string[]): RowCalc[] {
  const rows: RowCalc[] = [];
  for (const mt of METRICS) {
    if (labels && !labels.includes(mt.label)) continue;
    const hv = home[mt.key] as number | undefined;
    const av = away[mt.key] as number | undefined;
    if (typeof hv !== "number" || typeof av !== "number" || hv <= 0 || av <= 0) continue;
    const gap = Math.abs(hv - av) / Math.max(hv, av);
    // 상대격차 3% 미만은 무승부 — K/9 7.8 vs 7.7 을 "우위" 로 칠하면 과장이 된다
    const better = gap < 0.03 ? "E" : mt.lower ? (hv < av ? "H" : "A") : (hv > av ? "H" : "A");
    // 줄다리기 바 — 낮을수록 좋은 지표는 뒤집어 계산, 시각적 극단 방지로 0.2~0.8 클램프
    const raw = mt.lower ? av / (hv + av) : hv / (hv + av);
    rows.push({
      label: mt.label,
      homeText: hv.toFixed(mt.digits),
      awayText: av.toFixed(mt.digits),
      homeShare: Math.min(0.8, Math.max(0.2, raw)),
      winner: better as "H" | "A" | "E",
      gap,
    });
  }
  return rows;
}
const winCount = (rows: RowCalc[], side: "H" | "A") => rows.filter((r) => r.winner === side).length;

// 팀 표시색 — KBO 는 축약 한글명(키움·LG) 키, MLB 는 영문 팀명 키
const teamColor = (league: "KBO" | "MLB", teamName: string) =>
  league === "KBO"
    ? (KBO_COLOR[Object.keys(KBO_COLOR).find((k) => teamName.startsWith(k)) ?? ""] ?? "#c30452")
    : (MLB_EN_COLOR[teamName] ?? "#1d4ed8");
// 축약 팀명 — 다경기 보드는 폭이 좁아 "키움 히어로즈" 대신 "키움"
const shortTeam = (teamName: string) => Object.keys(KBO_COLOR).find((k) => teamName.startsWith(k)) ?? teamName;

async function buildStarterDuel(league: "KBO" | "MLB") {
  const now = new Date();
  // 지금부터 30시간 창 — KBO 는 당일 저녁, MLB 는 KST 새벽 경기가 잡힌다
  const matches = await p.match.findMany({
    where: { league, status: "SCHEDULED", startTime: { gte: now, lte: new Date(now.getTime() + 30 * 3600_000) } },
    select: {
      id: true, startTime: true, predHome: true, predAway: true, homeStarter: true, awayStarter: true,
      homeTeam: { select: { name: true, logoUrl: true } }, awayTeam: { select: { name: true, logoUrl: true } },
    },
    orderBy: { startTime: "asc" },
  });

  // 후보 = 양쪽 선발 + AI 승률이 모두 있는 경기
  type Cand = {
    m: (typeof matches)[0]; home: StarterJson; away: StarterJson;
    rows: RowCalc[]; homeWins: number; awayWins: number; score: number;
  };
  const cands: Cand[] = [];
  for (const m of matches) {
    const home = parseStarter(m.homeStarter) as StarterJson | null;
    const away = parseStarter(m.awayStarter) as StarterJson | null;
    if (!home?.name || !away?.name || m.predHome == null || m.predAway == null) continue;
    if (parseIp(home.ip) < MIN_IP[league] || parseIp(away.ip) < MIN_IP[league]) continue;
    const rows = duelRows(home, away);
    const homeWins = winCount(rows, "H");
    const awayWins = winCount(rows, "A");
    if (rows.length < 3) continue;
    const sweep = Math.max(homeWins, awayWins);
    const heroIsHome = homeWins >= awayWins;
    const heroPred = heroIsHome ? m.predHome! : m.predAway!;
    // 지표 우위 투수의 팀이 AI 승률에서 밀리면 = 이야기가 되는 매치업
    const score = sweep + (heroPred < 0.5 ? 2 : 0);
    cands.push({ m, home, away, rows, homeWins, awayWins, score });
  }
  if (cands.length === 0) throw new Error(`${league} — 선발 양쪽이 확정된 30시간 내 경기가 없음`);
  cands.sort((a, b) => b.score - a.score || a.m.startTime.getTime() - b.m.startTime.getTime());
  const c = cands[0];
  console.log(`  후보 ${cands.length}경기 → 채택: ${c.m.awayTeam?.name} @ ${c.m.homeTeam?.name} (score ${c.score})`);

  // 팀 시즌 전적 (실측) — MLB 는 영문명, KBO 는 축약 한글명 매칭
  const season = String(new Date(now.getTime() + 9 * 3600_000).getFullYear());
  const teamStats = await p.baseballTeamSeasonStats.findMany({ where: { league, season } });
  const recordOf = (teamName: string) => {
    const t = teamStats.find((x) =>
      league === "MLB"
        ? (x.teamNameEn ?? "") === teamName
        : teamName.replace(/\s/g, "").startsWith(x.teamName.replace(/\s/g, "")),
    );
    return t ? `${t.wins ?? 0}승 ${t.losses ?? 0}패` : "-";
  };
  const koTeam = (teamName: string) => {
    if (league === "KBO") return teamName;
    const t = teamStats.find((x) => (x.teamNameEn ?? "") === teamName);
    return t?.teamName ?? teamName;
  };
  const colorOf = (teamName: string) => teamColor(league, teamName);

  const side = async (s: StarterJson, teamName: string, logoUrl: string | null, pct: number, tag: "h" | "a") => {
    const photoFile = `duel-${league.toLowerCase()}-${s.pid}.png`;
    const photoUrl = pitcherPhoto(league, s);
    const ok = photoUrl ? await download(photoUrl, photoFile) : false;
    let logoFile = "";
    if (logoUrl) { logoFile = `duelteam-${c.m.id}-${tag}.png`; if (!(await download(logoUrl, logoFile))) logoFile = ""; }
    return {
      name: league === "KBO" ? s.name : toKoreanPlayerName(s.name),
      team: koTeam(teamName),
      record: `${s.wins ?? 0}승 ${s.losses ?? 0}패`,
      teamRecord: recordOf(teamName),
      photo: ok ? photoFile : "",
      logo: logoFile,
      color: colorOf(teamName),
      aiPct: Math.round(pct * 100),
    };
  };

  const homeName = c.m.homeTeam?.name ?? "-";
  const awayName = c.m.awayTeam?.name ?? "-";
  // 화면 좌 = 원정, 우 = 홈 (스코어보드 관례)
  const left = await side(c.away, awayName, c.m.awayTeam?.logoUrl ?? null, c.m.predAway!, "a");
  const right = await side(c.home, homeName, c.m.homeTeam?.logoUrl ?? null, c.m.predHome!, "h");
  const stats = c.rows.map((r) => ({
    label: r.label,
    leftText: r.awayText,
    rightText: r.homeText,
    leftShare: 1 - r.homeShare,
    winner: r.winner === "H" ? ("R" as const) : r.winner === "A" ? ("L" as const) : ("E" as const),
  }));

  const heroIsHome = c.homeWins >= c.awayWins;
  const hero = heroIsHome ? right : left;
  const sweep = Math.max(c.homeWins, c.awayWins);
  const heroWon = c.rows.filter((r) => r.winner === (heroIsHome ? "H" : "A"));
  const byGap = [...heroWon].sort((x, y) => y.gap - x.gap);
  const bigRow = byGap.find((r) => HOOK_LABELS.includes(r.label)) ?? byGap[0] ?? c.rows[0];
  const bigStat = heroIsHome ? bigRow.homeText : bigRow.awayText;
  const mismatch = hero.aiPct < 50;

  const kst = new Date(c.m.startTime.getTime() + 9 * 3600_000);
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const dateLabel = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 (${DOW[kst.getUTCDay()]}) ${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;

  const props = {
    league,
    dateLabel,
    left,
    right,
    stats,
    hook: {
      side: heroIsHome ? ("R" as const) : ("L" as const),
      bigStat,
      bigLabel: bigRow.label,
      line1: sweep === c.rows.length ? `${hero.name}, 지표 ${c.rows.length}개 전부 우위` : `${hero.name}, 지표 ${c.rows.length}개 중 ${sweep}개 우위`,
      line2: mismatch ? "그런데 AI 는 반대편을 찍었다" : `AI 도 ${hero.aiPct}% 로 같은 편`,
    },
    verdictLine: "선발 능력치 + 팀 전력 + 시장 배당 블렌드",
    cta: "scorebase.kr/predictions/starters",
  };

  const statLines = stats.map((s) => `${s.label}  ${left.name} ${s.leftText} vs ${right.name} ${s.rightText}`).join("\n");
  const headline = `${league} ${dateLabel} ${left.team} vs ${right.team} 선발 맞대결`;
  const body = `${headline}\n\n${left.name} — ${left.team} (개인 ${left.record} · 팀 ${left.teamRecord})\n${right.name} — ${right.team} (개인 ${right.record} · 팀 ${right.teamRecord})\n\n${statLines}\n\nAI 승률 — ${left.team} ${left.aiPct}% / ${right.team} ${right.aiPct}%\n\n선발 지표는 시즌 누적, 최근 3등판은 직전 3경기 실측입니다.`;
  const text: PublishText = {
    youtube: {
      title: `${hero.name} ${bigRow.label} ${bigStat} · ${league} ${left.team} vs ${right.team} 선발 맞대결`,
      description: `${body}${FOOTER}/predictions/starters`,
      tags: league === "KBO"
        ? "KBO,프로야구,야구,선발투수,선발맞대결,ERA,탈삼진,승부예측,AI예측,한국야구"
        : "MLB,메이저리그,야구,선발투수,선발맞대결,ERA,탈삼진,승부예측,AI예측,해외야구",
      },
    instagram: {
      caption: `${body}\n\n매일 갱신 · scorebase.kr/predictions/starters\n\n${league === "KBO" ? "#KBO #프로야구 #야구 #선발투수 #승부예측 #AI예측" : "#MLB #메이저리그 #야구 #선발투수 #승부예측 #해외야구"}`,
    },
  };
  save(league === "KBO" ? "starter-kbo" : "starter-mlb", "StarterDuel", props, text);
}

// ─────────────────────────── 오늘 KBO 선발 전 경기 비교 (StarterBoard) ───────────────────────────
// 한 편에 그날 선발이 확정된 모든 경기를 담는다. 카드당 지표 3개만 — 30초에 5경기가 들어가야 읽힌다.
const BOARD_LABELS = ["ERA", "K/9", "최근3등판 ERA"];

async function buildStarterBoard(league: "KBO") {
  const now = new Date();
  const todayKst = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const matches = await p.match.findMany({
    where: {
      league,
      status: { in: ["SCHEDULED", "LIVE"] },
      startTime: { gte: new Date(`${todayKst}T00:00:00+09:00`), lte: new Date(`${todayKst}T23:59:59+09:00`) },
    },
    select: {
      id: true, startTime: true, predHome: true, predAway: true, homeStarter: true, awayStarter: true,
      homeTeam: { select: { name: true, logoUrl: true } }, awayTeam: { select: { name: true, logoUrl: true } },
    },
    orderBy: { startTime: "asc" },
  });

  type Prepped = {
    m: (typeof matches)[0]; home: StarterJson; away: StarterJson; rows: RowCalc[];
    homeWins: number; awayWins: number; sampleOk: boolean;
  };
  const prepped: Prepped[] = [];
  for (const m of matches) {
    const home = parseStarter(m.homeStarter) as StarterJson | null;
    const away = parseStarter(m.awayStarter) as StarterJson | null;
    if (!home?.name || !away?.name || m.predHome == null || m.predAway == null) continue;
    const rows = duelRows(home, away, BOARD_LABELS);
    if (rows.length === 0) continue;
    prepped.push({
      m, home, away, rows,
      homeWins: winCount(rows, "H"),
      awayWins: winCount(rows, "A"),
      // 훅 주인공 후보 자격 — 표본 미달 투수의 낮은 ERA 를 대표 숫자로 내세우지 않는다
      sampleOk: parseIp(home.ip) >= MIN_IP[league] && parseIp(away.ip) >= MIN_IP[league],
    });
  }
  if (prepped.length === 0) throw new Error(`${league} — 오늘 선발이 확정된 경기가 없음`);

  // 훅 = 표본 충분한 경기 중 가장 격차 큰 시즌 지표(ERA·K/9)의 승자
  const hookCands = prepped.filter((x) => x.sampleOk);
  const pool = (hookCands.length ? hookCands : prepped).flatMap((x) =>
    x.rows.filter((r) => HOOK_LABELS.includes(r.label) && r.winner !== "E").map((r) => ({ x, r })),
  );
  pool.sort((a, b) => b.r.gap - a.r.gap);
  const best = pool[0];
  if (!best) throw new Error(`${league} — 훅으로 쓸 지표 우위가 없음`);

  // 격차 작은 경기부터 → 마지막은 훅 주인공의 경기 (훅에서 "마지막에" 라고 예고하므로 반드시 일치해야 한다)
  const strength = (x: Prepped) => Math.abs(x.homeWins - x.awayWins) + Math.max(...x.rows.map((r) => r.gap));
  prepped.sort((a, b) => strength(a) - strength(b));
  const heroIdx = prepped.indexOf(best.x);
  prepped.push(...prepped.splice(heroIdx, 1));

  const games = [];
  for (const x of prepped) {
    const side = async (s: StarterJson, teamName: string, logoUrl: string | null, tag: "h" | "a") => {
      const photoFile = `duel-${league.toLowerCase()}-${s.pid}.png`;
      const photoUrl = pitcherPhoto(league, s);
      const ok = photoUrl ? await download(photoUrl, photoFile) : false;
      let logoFile = `duelteam-${x.m.id}-${tag}.png`;
      if (!logoUrl || !(await download(logoUrl, logoFile))) logoFile = "";
      return {
        name: s.name,
        team: shortTeam(teamName),
        sub: `${s.wins ?? 0}승 ${s.losses ?? 0}패 · ${s.ip ?? "-"} 이닝`,
        photo: ok ? photoFile : "",
        logo: logoFile,
        color: teamColor(league, teamName),
      };
    };
    const homeName = x.m.homeTeam?.name ?? "-";
    const awayName = x.m.awayTeam?.name ?? "-";
    // 화면 좌 = 원정, 우 = 홈
    const left = await side(x.away, awayName, x.m.awayTeam?.logoUrl ?? null, "a");
    const right = await side(x.home, homeName, x.m.homeTeam?.logoUrl ?? null, "h");
    const kst = new Date(x.m.startTime.getTime() + 9 * 3600_000);
    const edgeWinner = x.homeWins > x.awayWins ? right.name : x.awayWins > x.homeWins ? left.name : null;
    const edgeCount = Math.max(x.homeWins, x.awayWins);
    // 표본 미달 투수가 우위로 잡히면 그대로 단정하지 않는다 (페덱 12이닝 ERA 1.50 류)
    const edgeIp = parseIp(x.homeWins > x.awayWins ? x.home.ip : x.away.ip);
    const edgeNote = edgeWinner && edgeIp < MIN_IP[league] ? " (표본 적음)" : "";
    games.push({
      timeLabel: `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`,
      left,
      right,
      stats: x.rows.map((r) => ({
        label: r.label,
        leftText: r.awayText,
        rightText: r.homeText,
        leftShare: 1 - r.homeShare,
        winner: r.winner === "H" ? ("R" as const) : r.winner === "A" ? ("L" as const) : ("E" as const),
      })),
      aiLeft: Math.round(x.m.predAway! * 100),
      aiRight: Math.round(x.m.predHome! * 100),
      edge: edgeWinner ? `${edgeWinner} ${edgeCount}개 우위${edgeNote}` : "지표 호각",
    });
  }

  const heroIsHome = best.r.winner === "H";
  const heroStarter = heroIsHome ? best.x.home : best.x.away;
  const heroTeam = (heroIsHome ? best.x.m.homeTeam?.name : best.x.m.awayTeam?.name) ?? "-";
  const heroGame = games.find((g) => (heroIsHome ? g.right : g.left).name === heroStarter.name);
  const monthDay = `${Number(todayKst.slice(5, 7))}월 ${Number(todayKst.slice(8, 10))}일`;

  const props = {
    league,
    dateLabel: monthDay,
    games,
    hook: {
      photo: (heroIsHome ? heroGame?.right.photo : heroGame?.left.photo) ?? "",
      color: teamColor(league, heroTeam),
      bigStat: heroIsHome ? best.r.homeText : best.r.awayText,
      bigLabel: best.r.label,
      line1: `오늘 ${league} ${games.length}경기 선발 비교`,
      line2: `${heroStarter.name}의 매치업은 마지막에`,
    },
    cta: "scorebase.kr/predictions/starters",
  };

  const list = games
    .map((g, i) => `${i + 1}. ${g.left.team} ${g.left.name} vs ${g.right.team} ${g.right.name} — ${g.stats.map((s) => `${s.label} ${s.leftText}:${s.rightText}`).join(" · ")} / AI ${g.left.team} ${g.aiLeft}% · ${g.right.team} ${g.aiRight}%`)
    .join("\n");
  const headline = `${monthDay} ${league} ${games.length}경기 선발 투수 전체 비교`;
  const body = `${headline}\n\n${list}\n\n좌:우 순서는 원정:홈. 지표는 시즌 누적, 최근3등판은 직전 3경기 실측입니다.`;
  const text: PublishText = {
    youtube: {
      // 제목은 "전체 비교" 를 앞세운다 — 단일 매치업 편(같은 훅 투수)과 제목이 겹치지 않게
      title: `${headline} — ${heroStarter.name} ${best.r.label} ${props.hook.bigStat}`,
      description: `${body}${FOOTER}/predictions/starters`,
      tags: "KBO,프로야구,야구,선발투수,선발맞대결,ERA,탈삼진,승부예측,AI예측,한국야구",
    },
    instagram: {
      caption: `${body}\n\n매일 갱신 · scorebase.kr/predictions/starters\n\n#KBO #프로야구 #야구 #선발투수 #승부예측 #AI예측`,
    },
  };
  save("starter-board-kbo", "StarterBoard", props, text);
}

// ─────────────────────────── 축구 주간 베스트 5 (리그 요일 로테이션) ───────────────────────────
// 주간 베스트 XI 글(화 발행)의 산식을 그대로 써서 지난 7일 평점 상위 5명을 카드로 만든다.
// 리그는 요일로 돌린다(월 EPL·화 라리가·수 분데스·목 세리에·금 리그1·토 EPL·일 라리가) — argv[3] 로 강제 가능.
// 표본이 부족하면(개막 주·A매치 브레이크) throw → daily-shorts.sh 가 soccer-cards 로 폴백한다.
async function buildSoccerWeeklyXi() {
  const ROTATION = ["LALIGA", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "EPL"]; // 일~토
  const league = process.argv[3] || ROTATION[new Date(Date.now() + 9 * 3600000).getUTCDay()];
  const LEAGUE_KO: Record<string, string> = { EPL: "프리미어리그", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에A", LIGUE_1: "리그1" };
  const LEAGUE_COLOR: Record<string, string> = { EPL: "#37003c", LALIGA: "#ee8707", BUNDESLIGA: "#d3010c", SERIE_A: "#024494", LIGUE_1: "#091c3e" };
  const POS_KO: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };
  const w = await getWeeklyBestXi(league);
  if (!w || w.xi.length < 5) throw new Error(`${league} 주간 베스트 표본 부족 (matches=${w?.matchCount ?? 0})`);
  const top = [...w.xi].sort((a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists).slice(0, 5);
  const tsp = await p.theSportsPlayer.findMany({ where: { id: { in: top.map((t) => t.id) } }, select: { id: true, photoUrl: true } });
  const photoOf = new Map(tsp.map((t) => [t.id, t.photoUrl]));
  const leagueKo = LEAGUE_KO[league] ?? league;
  const range = `${w.from.slice(5).replace("-", "/")}~${w.to.slice(5).replace("-", "/")}`;
  const cards = [];
  for (let i = 0; i < top.length; i++) {
    const t = top[i];
    const photoFile = `soc-${t.id}.png`;
    const ok = photoOf.get(t.id) ? await download(photoOf.get(t.id)!, photoFile) : false;
    let logoFile = "";
    if (t.logo) { logoFile = `socteam-${t.country.replace(/[^a-z0-9]/gi, "").toLowerCase()}.png`; await download(t.logo, logoFile); }
    cards.push({
      rank: i + 1,
      name: OV[t.id]?.nameKo || t.name,
      team: toKoreanTeamName(t.country) || t.countryKo || t.country,
      photo: ok ? photoFile : "soc-placeholder.png",
      logo: logoFile,
      color: SOCCER_COLOR[t.country] ?? LEAGUE_COLOR[league] ?? "#6366f1",
      tier: `${leagueKo} 주간 베스트`,
      note: `${POS_KO[t.pos] ?? t.pos} · ${range} · 리그 ${w.matchCount}경기 기준`,
      cutout: true,
      heroIdx: 0,
      stats: [
        { label: "평점", value: +t.rating.toFixed(2), decimals: 2 },
        { label: "골", value: t.goals },
        { label: "도움", value: t.assists },
      ],
    });
  }
  const mvp = top[0];
  const hookFace = {
    photo: cards[0].photo,
    bigStat: mvp.rating.toFixed(2),
    line1: `${cards[0].name}, 이번 주 ${leagueKo} MVP`,
    line2: `${mvp.goals}골 ${mvp.assists}도움 · 평점 1위`,
    color: cards[0].color,
  };
  const text = cardText({
    headline: `${leagueKo} 이번 주 베스트 5 (${range})`,
    cards,
    keyStatIdx: 0,
    ctaUrl: "scorebase.kr/soccer",
    tags: `축구,해외축구,${leagueKo},주간 베스트,평점,MVP,${cards.map((c) => c.name).join(",")}`,
    igHashtags: `#축구 #해외축구 #${leagueKo.replace(/\s/g, "")} #주간베스트 #MVP`,
  });
  save("soccer-weekly-xi", "SoccerCards", { title: `${leagueKo} · ${range}`, subtitle: "이번 주 평점 베스트 5", cta: "scorebase.kr/soccer", cards, hookFace }, text);
}

(async () => {
  const topic = process.argv[2];
  const builders: Record<string, () => Promise<void>> = {
    "market-value": buildMarketValue,
    "transfer-deals": buildTransferDeals,
    "kbo-cards": () => buildBaseballCards("KBO"),
    "mlb-cards": () => buildBaseballCards("MLB"),
    "soccer-cards": buildSoccerCards,
    "soccer-weekly-xi": buildSoccerWeeklyXi,
    "mlb-avg-cards": buildMlbAvgCards,
    "ai-battle": buildAiBattle,
    "starter-kbo": () => buildStarterDuel("KBO"),
    "starter-mlb": () => buildStarterDuel("MLB"),
    "starter-board-kbo": () => buildStarterBoard("KBO"),
  };
  if (!topic || !builders[topic]) {
    console.error(`사용법: build-props.ts <${Object.keys(builders).join(" | ")}>`);
    process.exit(1);
  }
  await builders[topic]();
  await p.$disconnect();
})();
