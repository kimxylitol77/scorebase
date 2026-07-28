// 롱폼 1편 데이터 빌더 — 2026 여름 이적료 TOP 7 + 이강인.
// 이적료 정본은 FootballTransfer.transferFee(TheSports) 하나만 쓴다. TransferRumor.fee 는 파싱 오류가 있어 배제.
// ⚠️ scorebase repo cwd 에서 실행해야 @prisma/client 가 잡힌다:
//   cd ~/scorebase && npx tsx --env-file=.env.local scripts/shorts/build-longform-transfer.ts
// 출력: ~/scorebase-shorts/data/longform-transfer-top7.json
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
// ⚠️ 절대경로(/Users/...) import 금지 — Vercel 빌드가 scripts/ 까지 타입체크해서
// 로컬에만 있는 경로면 배포가 통째로 깨진다 (2026-07-28 실사고). repo 상대경로만 쓸 것.
import rawPhotos from "../../data/player-photos.json";
import rawTeamLogos from "../../data/team-logos.json";
import rawOv from "../../data/player-overrides.json";
import { toKoreanTeamName } from "../../src/lib/team-names";

const PHOTOS = rawPhotos as Record<string, string>;
const TEAM_LOGOS = rawTeamLogos as Record<string, string>;
const OV = rawOv as Record<string, { nameKo?: string }>;
const SHORTS = "/Users/kimss/scorebase-shorts";
const p = new PrismaClient();

// 사이트(src/app/transfers/page.tsx)와 같은 상수 — 영상·웹 원화 표기 일치용
const EUR_KRW = 1791.5;
// 2026 여름 이적시장 = transferWindow() 와 동일 범위
const WIN_FROM = Date.UTC(2026, 5, 1) / 1000;
const WIN_TO = Date.UTC(2026, 9, 1) / 1000;
const FEED_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1", "SAUDI_PL", "MLS"];
const LEE_KANGIN = "l7oqdehed20r510";

// DB 값과 언론 헤드라인이 갈리는 건 — 자막 병기용 (docs/longform-transfer-top7-context.md 근거)
const FEE_NOTES: Record<string, string> = {
  [LEE_KANGIN]: "옵션 포함 총액 · 기본 3,500만",
};
const FEE_NOTES_BY_NAME: Record<string, string> = {
  "산드로 토날리": "즉시 지급분 · 보너스 포함 £100m",
  "앤서니 고든": "공식 발표액 · 에이전트비 포함 €104M 보도",
  "크리센시오 서머빌": "보장분 기준 · 보너스 포함 £60m",
};

const download = async (url: string, filename: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    const out = `${SHORTS}/public/players/${filename}`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buf);
    return filename;
  } catch {
    return "";
  }
};

const krwEok = (eurM: number) => Math.round((eurM * 1e6 * EUR_KRW) / 1e8);

// ⚠️ 실측 구조 — schema.prisma 주석의 {t, v, teamId} 와 다르다. TheSports 원문 키 그대로 저장돼 있다.
interface HistPoint { market_time: number; market_value: number; team_id?: string; age?: number }

async function main() {
  // ── 1. TOP 7 — bigdeals 뷰와 동일 조건 + dedup ──
  const rows = await p.footballTransfer.findMany({
    where: { league: { in: FEED_LEAGUES }, transferTime: { gte: WIN_FROM, lt: WIN_TO }, transferFee: { gt: 0 } },
    orderBy: { transferFee: "desc" },
    take: 120,
    select: { playerId: true, fromTeamName: true, toTeamName: true, fromTeamId: true, toTeamId: true, transferFee: true, transferTime: true, league: true },
  });
  const seen = new Set<string>();
  const dedup = rows.filter((r) => {
    const k = `${r.playerId}|${r.toTeamId}|${r.transferFee}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // 선수당 1건(최고액)만 — 같은 여름에 두 번 이적한 선수가 랭킹을 두 칸 먹지 않게
  const byPlayer = new Set<string>();
  const top = dedup.filter((r) => (byPlayer.has(r.playerId) ? false : (byPlayer.add(r.playerId), true))).slice(0, 7);

  // ── 2. 이강인 (TOP 7 밖 단독 코너) ──
  const lkRow = await p.footballTransfer.findFirst({
    where: { playerId: LEE_KANGIN, transferTime: { gte: WIN_FROM, lt: WIN_TO }, transferFee: { gt: 0 } },
    orderBy: { transferFee: "desc" },
    select: { playerId: true, fromTeamName: true, toTeamName: true, fromTeamId: true, toTeamId: true, transferFee: true, transferTime: true, league: true },
  });

  const targets = [...top, ...(lkRow && !top.some((t) => t.playerId === LEE_KANGIN) ? [lkRow] : [])];
  const ids = targets.map((t) => t.playerId);

  // 팀 로고 — data/team-logos.json 은 95팀뿐이라 커버리지가 얇다.
  // TeamSourceId(thesports).externalId → Team.logoUrl 경로를 1순위로 쓰고 json 은 폴백.
  const tsTeamIds = [...new Set(targets.flatMap((t) => [t.fromTeamId, t.toTeamId]).filter(Boolean) as string[])];
  const srcIds = await p.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: tsTeamIds } },
    select: { teamId: true, externalId: true },
  });
  const teamRows = await p.team.findMany({ where: { id: { in: srcIds.map((s) => s.teamId) } }, select: { id: true, logoUrl: true } });
  const logoByTeamId = new Map(teamRows.map((t) => [t.id, t.logoUrl]));
  const logoByTsId = new Map<string, string>();
  for (const s of srcIds) {
    const u = logoByTeamId.get(s.teamId);
    if (u) logoByTsId.set(s.externalId, u);
  }
  const resolveLogo = (tsId?: string | null) => (tsId ? logoByTsId.get(tsId) || TEAM_LOGOS[tsId] || "" : "");

  const players = await p.theSportsPlayer.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, nameKo: true, photoUrl: true },
  });
  const pMap = new Map(players.map((x) => [x.id, x]));
  const mvs = await p.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true, currentValue: true, history: true, age: true } });
  const mvMap = new Map(mvs.map((x) => [x.id, x]));
  // 커리어 이적 이력 — 몸값 곡선 위에 찍을 이적료 점
  const careers = await p.footballTransfer.findMany({
    where: { playerId: { in: ids } },
    orderBy: { transferTime: "asc" },
    select: {
      playerId: true, fromTeamName: true, toTeamName: true, fromTeamId: true, toTeamId: true,
      transferFee: true, transferTime: true, transferType: true,
    },
  });

  // 커리어 이적의 양쪽 팀 로고도 필요 — 그래프 이적점에 "어디서 어디로" 를 마크로 보여준다.
  // 유스·하위 리그 팀은 TeamSourceId 매핑이 없을 수 있어(폴백 없으면 팀명 텍스트만 나간다) 실패를 허용한다.
  const careerTeamIds = [...new Set(careers.flatMap((c) => [c.fromTeamId, c.toTeamId]).filter(Boolean) as string[])];
  const careerSrc = await p.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: careerTeamIds } },
    select: { teamId: true, externalId: true },
  });
  const careerTeams = await p.team.findMany({ where: { id: { in: careerSrc.map((s) => s.teamId) } }, select: { id: true, logoUrl: true } });
  const careerLogoByTeamId = new Map(careerTeams.map((t) => [t.id, t.logoUrl]));
  for (const s of careerSrc) {
    const u = careerLogoByTeamId.get(s.teamId);
    if (u && !logoByTsId.has(s.externalId)) logoByTsId.set(s.externalId, u);
  }

  const build = async (r: (typeof targets)[number], rank: number | null) => {
    const tp = pMap.get(r.playerId);
    const mv = mvMap.get(r.playerId);
    const nameKo = OV[r.playerId]?.nameKo || tp?.nameKo || tp?.name || r.playerId;
    const feeM = Math.round(((r.transferFee || 0) / 1e6) * 10) / 10;

    const photo = tp?.photoUrl || PHOTOS[r.playerId] || "";
    const photoFile = photo ? await download(photo, `lf-p-${r.playerId}.png`) : "";
    const toLogo = resolveLogo(r.toTeamId);
    const fromLogo = resolveLogo(r.fromTeamId);
    const toLogoFile = toLogo ? await download(toLogo, `lf-t-${r.toTeamId}.png`) : "";
    const fromLogoFile = fromLogo ? await download(fromLogo, `lf-t-${r.fromTeamId}.png`) : "";

    // 몸값 시계열 — {t:unix, v:€} → {d:"YYYY-MM", v:€M}
    const hist = (Array.isArray(mv?.history) ? (mv!.history as unknown as HistPoint[]) : [])
      .filter((h) => h && typeof h.market_value === "number" && h.market_value > 0 && h.market_time)
      .map((h) => ({
        d: new Date(h.market_time * 1000).toISOString().slice(0, 7),
        v: Math.round((h.market_value / 1e6) * 100) / 100,
        age: h.age ?? null,
      }));

    // 커리어 유료 이적만 점으로 (임대·자유이적 제외)
    const dealRows = careers.filter((c) => c.playerId === r.playerId && (c.transferFee || 0) > 0);
    const deals = [];
    for (const c of dealRows) {
      const fl = resolveLogo(c.fromTeamId);
      const tl = resolveLogo(c.toTeamId);
      deals.push({
        d: new Date((c.transferTime || 0) * 1000).toISOString().slice(0, 7),
        fee: Math.round(((c.transferFee || 0) / 1e6) * 10) / 10,
        from: (c.fromTeamName && toKoreanTeamName(c.fromTeamName)) || c.fromTeamName || "",
        to: (c.toTeamName && toKoreanTeamName(c.toTeamName)) || c.toTeamName || "",
        fromLogo: fl ? await download(fl, `lf-t-${c.fromTeamId}.png`) : "",
        toLogo: tl ? await download(tl, `lf-t-${c.toTeamId}.png`) : "",
      });
    }

    return {
      rank,
      playerId: r.playerId,
      name: nameKo,
      nameEn: tp?.name || "",
      age: mv?.age ?? null,
      photo: photoFile,
      // 한국 시청자용 — 사이트와 같은 사전으로 팀명 한글화, 미등재면 원문 유지
      from: (r.fromTeamName && toKoreanTeamName(r.fromTeamName)) || r.fromTeamName || "",
      to: (r.toTeamName && toKoreanTeamName(r.toTeamName)) || r.toTeamName || "",
      fromLogo: fromLogoFile,
      toLogo: toLogoFile,
      league: r.league || "",
      date: new Date((r.transferTime || 0) * 1000).toISOString().slice(0, 10),
      feeM,
      feeKrwEok: krwEok(feeM),
      marketM: mv?.currentValue ? Math.round((mv.currentValue / 1e6) * 10) / 10 : null,
      // 몸값 대비 이적료 프리미엄 — "시장가 vs 실제 지불액" 소재
      premiumPct: mv?.currentValue ? Math.round((feeM / (mv.currentValue / 1e6) - 1) * 100) : null,
      note: FEE_NOTES[r.playerId] || FEE_NOTES_BY_NAME[nameKo] || "",
      history: hist,
      deals,
    };
  };

  const ranked = [];
  for (let i = 0; i < top.length; i++) ranked.push(await build(top[i], i + 1));
  const lee = lkRow ? await build(lkRow, null) : null;

  const out = {
    compositionId: "LongformTransferTop7",
    generatedAt: new Date().toISOString(),
    props: {
      title: "2026 여름 이적시장",
      subtitle: "이적료 TOP 7",
      cta: "scorebase.kr/transfers",
      eurKrw: EUR_KRW,
      totalM: Math.round(ranked.reduce((s, r) => s + r.feeM, 0) * 10) / 10,
      ranked,
      lee,
    },
  };
  const dst = `${SHORTS}/data/longform-transfer-top7.json`;
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, JSON.stringify(out, null, 2));

  // Remotion 은 tsconfig include 가 src 뿐이고 resolveJsonModule 도 없어 data/*.json 을 직접 import 못 한다.
  // 컴포지션이 그냥 import 할 수 있도록 같은 내용을 TS 모듈로도 떨군다 (수동 편집 금지 — 빌더가 덮어씀).
  const tsDst = `${SHORTS}/src/longform-transfer-data.ts`;
  writeFileSync(
    tsDst,
    `// 자동 생성 — scripts/shorts/build-longform-transfer.ts 가 덮어쓴다. 직접 수정하지 말 것.\n` +
      `// 생성 ${out.generatedAt}\n` +
      `import type { LongformProps } from "./LongformTransferTop7";\n\n` +
      `export const LONGFORM_TRANSFER: LongformProps = ${JSON.stringify(out.props, null, 2)};\n`
  );
  console.log(`저장 ${tsDst}`);

  console.log(`저장 ${dst}`);
  console.log(`\n2026 여름 이적료 TOP 7 (합계 ${out.props.totalM}M€ / ${krwEok(out.props.totalM).toLocaleString()}억)`);
  for (const r of ranked) {
    console.log(
      `  ${r.rank}. ${r.name} ${r.feeM}M€ (${r.feeKrwEok.toLocaleString()}억) | ${r.from}→${r.to} | ${r.date}` +
        ` | 몸값 ${r.marketM ?? "?"}M${r.premiumPct !== null ? ` (${r.premiumPct > 0 ? "+" : ""}${r.premiumPct}%)` : ""}` +
        ` | hist ${r.history.length}pt deals ${r.deals.length}` +
        (r.note ? ` | ※${r.note}` : "") +
        (r.photo ? "" : " | 사진없음")
    );
  }
  if (lee) {
    console.log(
      `\n[단독] ${lee.name} ${lee.feeM}M€ (${lee.feeKrwEok.toLocaleString()}억) | ${lee.from}→${lee.to} | ${lee.date}` +
        ` | 몸값 ${lee.marketM ?? "?"}M | hist ${lee.history.length}pt deals ${lee.deals.length} | ※${lee.note}` +
        (lee.photo ? "" : " | 사진없음")
    );
  }
  await p.$disconnect();
}

main();
