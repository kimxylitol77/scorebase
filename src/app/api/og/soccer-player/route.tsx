// GET /api/og/soccer-player?id={tsPlayerId} — 축구 선수 프로필 공유 카드(이미지). 1200×630.
// 선수 페이지(/transfers/[id])의 "공유하기 → 카드 이미지" 대상. 숫자는 페이지와 같은 소스를 읽어
// 화면과 카드가 어긋나지 않게 한다 (DB TheSportsPlayer·PlayerMarketValue + data/*.json).
// 톤은 우리 디자인 시스템 다크(#0a0a0a 계열 + rose 액센트). 한글=Noto Sans KR, 숫자=Oswald.
// satori 주의 — 모든 컨테이너에 display:flex, 고정폭 요소에 flexShrink:0 (없으면 겹친다).
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { POS_KO, type PosCode } from "@/lib/players/grid-position";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import rawSeason from "../../../../../data/player-season-stats.json";
import rawPosDetail from "../../../../../data/player-positions-detail.json";

export const runtime = "nodejs";

const CACHE = { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" };

interface SeasonStat {
  lg: string; season: string; team?: string | null;
  matches?: number | null; goals?: number | null; assists?: number | null;
  minutes?: number | null; rating?: number | null;
}
// 선수마다 있는 키가 달라(평점 없는 리그 등) 옵셔널로 읽는다.
const SEASON = rawSeason as unknown as Record<string, SeasonStat>;
const POS_DETAIL = rawPosDetail as unknown as Record<string, { primary: PosCode }>;

async function toDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// 몸값 표기 — 선수 페이지와 같은 규칙(백만 단위 반올림, 1M 미만은 k).
function fmtValue(eur: number | null | undefined): string | null {
  if (!eur || eur <= 0) return null;
  return eur >= 1e6 ? `€${Math.round(eur / 1e6)}M` : `€${Math.round(eur / 1000)}k`;
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";

  const cwd = process.cwd();
  const [notoB, notoBlack, oswaldB] = await Promise.all([
    readFile(join(cwd, "public/fonts/NotoSansKR-Bold.ttf")),
    readFile(join(cwd, "public/fonts/NotoSansKR-Black.ttf")),
    readFile(join(cwd, "public/fonts/Oswald-Bold.ttf")),
  ]);
  const fonts = [
    { name: "Noto", data: notoB, weight: 700 as const, style: "normal" as const },
    { name: "Noto", data: notoBlack, weight: 900 as const, style: "normal" as const },
    { name: "Oswald", data: oswaldB, weight: 700 as const, style: "normal" as const },
  ];

  const [tsp, mv] = id
    ? await Promise.all([
        prisma.theSportsPlayer.findUnique({ where: { id }, select: { name: true, nameKo: true, photoUrl: true } }),
        prisma.playerMarketValue.findUnique({ where: { id }, select: { currentValue: true, teamId: true, league: true } }),
      ])
    : [null, null];

  if (!tsp) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#fff", fontSize: 44, fontFamily: "Noto" }}>
          선수 프로필 | Scorebase
        </div>
      ),
      { width: 1200, height: 630, fonts, headers: CACHE },
    );
  }

  const name = tsp.nameKo || tsp.name || "";
  const stat = SEASON[id] ?? null;
  const pos = POS_DETAIL[id]?.primary ?? null;
  const posLabel = pos ? POS_KO[pos] : null;
  // 소속팀 — 몸값 피드의 ts team_id 를 우리 Team 으로 풀어 한글명·로고를 얻는다.
  const teamRow = mv?.teamId
    ? await prisma.teamSourceId.findFirst({
        where: { source: "thesports", externalId: mv.teamId },
        select: { team: { select: { name: true, logoUrl: true } } },
      })
    : null;
  const teamName = teamRow?.team?.name
    ? toKoreanTeamName(teamRow.team.name) || teamRow.team.name
    : stat?.team
      ? toKoreanTeamName(stat.team) || stat.team
      : null;

  const [photo, teamLogo] = await Promise.all([toDataUri(tsp.photoUrl), toDataUri(teamRow?.team?.logoUrl ?? null)]);
  const value = fmtValue(mv?.currentValue);

  // 하단 스탯 — 시즌 기록이 없으면(비커버 리그) 칸 자체를 안 그린다. 0 으로 채우면 부진처럼 읽힌다.
  const cells: Array<[string, string]> = stat
    ? [
        ["출전", String(stat.matches ?? 0)],
        ["골", String(stat.goals ?? 0)],
        ["도움", String(stat.assists ?? 0)],
        ["평점", stat.rating != null ? stat.rating.toFixed(2) : "-"],
      ]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a0a 0%, #161418 55%, #2a1420 100%)",
          color: "#fff",
          fontFamily: "Noto",
          padding: "52px 64px",
        }}
      >
        {/* 상단 — 사진 + 이름/소속/포지션 + 시장가치 */}
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              width={168}
              height={168}
              style={{ borderRadius: 999, border: "5px solid rgba(244,63,94,0.35)", objectFit: "cover", flexShrink: 0 }}
              alt=""
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
            {posLabel && (
              <div style={{ display: "flex", fontSize: 24, color: "#fb7185", letterSpacing: 1, fontWeight: 700 }}>
                {posLabel}
              </div>
            )}
            <div style={{ display: "flex", fontSize: 72, fontWeight: 900, lineHeight: 1.12, marginTop: 2 }}>{name}</div>
            {teamName && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                {teamLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={teamLogo} width={38} height={38} style={{ objectFit: "contain", flexShrink: 0 }} alt="" />
                )}
                <div style={{ display: "flex", fontSize: 30, color: "#d4d4d8", fontWeight: 700 }}>{teamName}</div>
              </div>
            )}
          </div>
          {value && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
              <div style={{ display: "flex", fontSize: 21, color: "#a1a1aa", letterSpacing: 1, fontWeight: 700 }}>시장가치</div>
              <div style={{ display: "flex", fontSize: 62, fontWeight: 700, fontFamily: "Oswald", color: "#22d3ee", lineHeight: 1.1 }}>
                {value}
              </div>
            </div>
          )}
        </div>

        {/* 하단 — 시즌 기록 4칸 */}
        {cells.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 36, flexGrow: 1 }}>
            <div style={{ display: "flex", fontSize: 23, color: "#a1a1aa", fontWeight: 700 }}>
              {stat!.season} {LEAGUE_DISPLAY[stat!.lg] ?? stat!.lg} 시즌 기록
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 18, flexGrow: 1 }}>
              {cells.map(([label, v]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexGrow: 1,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 22,
                  }}
                >
                  <div style={{ display: "flex", fontSize: 66, fontWeight: 700, fontFamily: "Oswald", lineHeight: 1 }}>{v}</div>
                  <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", marginTop: 8 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 브랜드 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: 22 }}>
          <div style={{ display: "flex", fontSize: 24, color: "#71717a", fontWeight: 700, letterSpacing: 2 }}>
            scorebase.kr
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: CACHE },
  );
}
