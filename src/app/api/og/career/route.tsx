// GET /api/og/career?... — 커리어 시뮬 결과 공유 카드(1200×630)
// 게임이 서버를 안 쓰므로 결과는 URL 쿼리로 들어온다. 값 검증은 share.ts 가 한다.
// 카톡·스레드 URL unfurl 용 og:image (career/result 의 generateMetadata 가 지정).
import { ImageResponse } from "next/og";
import { parseShareParams, positionLabel } from "@/lib/career/share";
import { NATION_BY_CODE } from "@/lib/career/nations";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

// satori 는 시스템 폰트가 없다 → 카드에 쓰는 글자만 Google Fonts 에서 subset 해 버퍼로 받는다.
async function loadFont(text: string, weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(api)).text();
    const url = css.match(/src:\s*url\(([^)]+?)\)\s*format/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function ovrTone(ovr: number): { bg: string; fg: string } {
  if (ovr >= 85) return { bg: "#fbbf24", fg: "#451a03" };
  if (ovr >= 75) return { bg: "#10b981", fg: "#022c22" };
  if (ovr >= 65) return { bg: "#0ea5e9", fg: "#082f49" };
  return { bg: "#71717a", fg: "#ffffff" };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const d = parseShareParams(sp);
  if (!d) return new Response("Bad Request", { status: 400 });

  const nat = NATION_BY_CODE[d.nation];
  const tone = ovrTone(d.peakOvr);
  const posLabel = positionLabel(d.position);
  const value = d.peakValue >= 1 ? `€${d.peakValue}M` : "€1M 미만";

  const stats: [string, string][] = [
    ["통산 경기", String(d.apps)],
    ["골", String(d.goals)],
    ["도움", String(d.assists)],
    ["우승", String(d.titles)],
  ];
  const subStats: [string, string][] = [
    ["최고 몸값", value],
    ["거쳐간 구단", `${d.clubs}팀`],
    ["대표팀", `${d.caps}경기`],
  ];

  const fontText =
    "축구선수 인생 살아보기 스코어베이스 최고 능력치 몸값 거쳐간 구단 대표팀 통산 경기 골 도움 우승 팀 미만 " +
    `${nat?.label ?? ""}${posLabel}${d.topClub}${value}scorebase.kr/career0123456789€M· ` +
    stats.map(([k, v]) => k + v).join("") +
    subStats.map(([k, v]) => k + v).join("");
  const [bold, regular] = await Promise.all([loadFont(fontText, 700), loadFont(fontText, 400)]);

  const fonts = [
    ...(bold ? [{ name: "Noto Sans KR", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: "Noto Sans KR", data: regular, weight: 400 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0b0b12 0%, #17172a 100%)",
          padding: "56px 64px",
          fontFamily: "Noto Sans KR",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa", fontWeight: 400 }}>
            축구선수 인생 살아보기
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#71717a", fontWeight: 400 }}>
            scorebase.kr/career
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 150,
              height: 150,
              borderRadius: 28,
              background: tone.bg,
              color: tone.fg,
              fontSize: 76,
              fontWeight: 700,
            }}
          >
            {d.peakOvr}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", fontWeight: 400 }}>
              {`${nat?.label ?? d.nation} · ${posLabel} · 최고 능력치`}
            </div>
            <div style={{ display: "flex", fontSize: 62, fontWeight: 700 }}>
              {d.topClub || "무소속"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {stats.map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
                padding: "20px 24px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", fontWeight: 400 }}>{k}</div>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 40 }}>
          {subStats.map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ display: "flex", fontSize: 22, color: "#71717a", fontWeight: 400 }}>{k}</div>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: CACHE_HEADERS, fonts: fonts.length ? fonts : undefined },
  );
}
