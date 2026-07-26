// GET /api/og/kbo-percentile?name=오스틴&team=LG&pid=... — KBO 타자 리그 백분위 공유 카드(이미지).
// 선수 페이지 백분위 섹션의 SNS 공유용. 데이터는 우리 DB 백분위 계산과 동일 소스 (숫자 100% 일치).
// 1200×630. Higgsfield 배경 + 선수 사진 + 5개 스탯 백분위 바. 한글=Noto Sans KR, 숫자=Oswald.
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
import { getKboHitterPercentiles } from "@/lib/sports/baseball/kbo-hitter-percentile";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";

export const runtime = "nodejs";

const CACHE = { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" };

// Savant 관례: 상위=빨강, 하위=파랑, 중간=회색
function barColor(pct: number): string {
  if (pct >= 80) return "#e11d48";
  if (pct >= 60) return "#fb7185";
  if (pct >= 40) return "#a1a1aa";
  if (pct >= 20) return "#38bdf8";
  return "#0284c7";
}

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

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const name = sp.get("name") ?? "";
  const team = sp.get("team");
  const pid = sp.get("pid");

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

  const data = name ? await getKboHitterPercentiles(name, team).catch(() => null) : null;

  const bgBuf = await readFile(join(cwd, "public/bg/kbo-percentile-card.png")).catch(() => null);
  const bg = bgBuf ? `data:image/png;base64,${bgBuf.toString("base64")}` : null;

  if (!data) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1e", color: "#fff", fontSize: 44, fontFamily: "Noto" }}>
          KBO 리그 백분위 | Scorebase
        </div>
      ),
      { width: 1200, height: 630, fonts },
    );
  }

  const photo = pid ? await toDataUri(kboPhotoUrl(pid)) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0f1e",
          color: "#fff",
          fontFamily: "Noto",
          position: "relative",
        }}
      >
        {bg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} width={1200} height={630} style={{ position: "absolute", inset: 0, objectFit: "cover" }} alt="" />
        )}
        <div style={{ position: "absolute", inset: 0, background: "rgba(6,10,22,0.45)", display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "44px 60px 36px", position: "relative", width: "100%", height: "100%" }}>
          {/* 헤더 — 선수 이름/팀 + 사진 + 브랜드 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 24, color: "#93c5fd", letterSpacing: 4, fontWeight: 700 }}>
                {data.season} KBO 리그 백분위
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 4 }}>
                <div style={{ display: "flex", fontSize: 58, fontWeight: 900, lineHeight: 1.1 }}>{data.playerName}</div>
                <div style={{ display: "flex", fontSize: 28, color: "#cbd5e1", fontWeight: 700 }}>{data.teamName}</div>
              </div>
            </div>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                width={128}
                height={128}
                style={{ borderRadius: 999, border: "4px solid rgba(255,255,255,0.25)", objectFit: "cover" }}
                alt=""
              />
            )}
          </div>

          {/* 백분위 바 5줄 — 고정폭 요소는 flexShrink:0 필수 (satori 는 기본 shrink 로 겹침 발생) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 36, flexGrow: 1 }}>
            {data.metrics.map((m) => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ display: "flex", width: 82, flexShrink: 0, fontSize: 26, fontWeight: 700, color: "#e2e8f0", lineHeight: 1 }}>
                  {m.label}
                </div>
                <div style={{ display: "flex", flexGrow: 1, flexShrink: 1, height: 20, background: "rgba(255,255,255,0.12)", borderRadius: 999 }}>
                  <div
                    style={{
                      display: "flex",
                      width: `${Math.max(m.pct, 3)}%`,
                      height: 20,
                      background: barColor(m.pct),
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 50,
                    height: 50,
                    flexShrink: 0,
                    borderRadius: 999,
                    background: barColor(m.pct),
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 700,
                    fontFamily: "Oswald",
                  }}
                >
                  {m.pct}
                </div>
                <div style={{ display: "flex", width: 100, flexShrink: 0, justifyContent: "flex-end", fontSize: 28, fontWeight: 700, fontFamily: "Oswald" }}>
                  {m.display}
                </div>
              </div>
            ))}
          </div>

          {/* 푸터 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <div style={{ display: "flex", fontSize: 20, color: "#94a3b8" }}>
              규정 표본 {data.sample}명 · {data.minGames}경기 이상 · 백분위 90 = 상위 10%
            </div>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 900, color: "#f5c542", letterSpacing: 3 }}>
              SCOREBASE.KR
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: CACHE, fonts },
  );
}
