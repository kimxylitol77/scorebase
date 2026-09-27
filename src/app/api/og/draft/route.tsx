// GET /api/og/draft?id= — 농구 블라인드 드래프트 결과 공유 카드(1200×630)
// 카톡·스레드 URL unfurl 용 og:image (basketball/draft/result 의 generateMetadata 가 지정).
import { ImageResponse } from "next/og";
import { RING_TITLE, rankLabel, seasonLabel, signed, slotLabels } from "@/lib/draft/labels";
import { MODES } from "@/lib/draft/modes";
import { recordLabel } from "@/lib/draft/season";
import { getDraftResult } from "@/lib/draft/service";

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

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const r = id ? await getDraftResult(id).catch(() => null) : null;
  if (!r) return new Response("Not Found", { status: 404 });

  const cfg = MODES[r.mode];
  const SLOT_LABELS = slotLabels(r.mode);
  const title = recordLabel(r.season, cfg.draws);
  const sub = RING_TITLE[r.rings];
  const big = SLOT_LABELS.length > 5; // 9~11명 — 줄을 얇게
  const head = `${cfg.label} 블라인드 드래프트`;
  const top = rankLabel(r.percentile);
  const rows = SLOT_LABELS.map((label, i) => ({ label, p: r.snapshot.picks.find((x) => x.slot === i) }));
  const extra = r.snapshot.picks.filter((x) => x.slot < 0);
  extra.forEach((p) => {
    const empty = rows.find((x) => !x.p);
    if (empty) empty.p = p;
  });
  const s = r.snapshot.score;
  const bonus: [string, number][] = [["풀 라인업", s.full], ["균형", s.balance], ["내구성", s.durability], [cfg.lockdownLabel, s.lockdown]];

  const fontText =
    `${head}${title}${sub}${top}상위 점수 승무패 기여도 보너스 scorebase.kr/games 0123456789+-.%·` +
    rows.map((x) => x.label + (x.p ? x.p.name + x.p.teamName : "")).join("") +
    bonus.map(([k]) => k).join("");
  const [bold, regular] = await Promise.all([loadFont(fontText, 700), loadFont(fontText, 400)]);
  const fonts = [
    ...(bold ? [{ name: "Noto Sans KR", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: "Noto Sans KR", data: regular, weight: 400 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #0b0b12 0%, #1a1626 100%)", padding: "40px 56px", color: "#fff", fontFamily: "Noto Sans KR" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 430 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, color: "#fb7185", fontWeight: 700 }}>{head}</div>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: "#fbbf24", marginTop: 14 }}>{title}</div>
            <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", marginTop: 6 }}>{sub}</div>
            <div style={{ display: "flex", marginTop: 12 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} style={{ display: "flex", width: 36, height: 36, borderRadius: 18, marginRight: 10, border: `5px solid ${i < r.rings ? "#fbbf24" : "#3f3f46"}` }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa" }}>점수</div>
            <div style={{ display: "flex", fontSize: 104, fontWeight: 700, lineHeight: 1 }}>{signed(r.total)}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#fbbf24", fontWeight: 700, marginTop: 10 }}>{top}</div>
            <div style={{ display: "flex", fontSize: 20, color: "#71717a", marginTop: 22 }}>scorebase.kr/games</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 40, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: big ? "3px 16px" : "8px 20px", marginBottom: big ? 4 : 8, borderLeft: `8px solid ${x.p?.color ?? "#3f3f46"}` }}>
                <div style={{ display: "flex", width: big ? 96 : 84, fontSize: big ? 16 : 20, color: "#a1a1aa" }}>{x.label}</div>
                <div style={{ display: "flex", flexDirection: big ? "row" : "column", alignItems: big ? "center" : "flex-start", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: big ? 22 : 30, fontWeight: 700 }}>{x.p?.name ?? "-"}</div>
                  <div style={{ display: "flex", fontSize: big ? 15 : 18, color: "#a1a1aa", marginLeft: big ? 12 : 0 }}>{x.p ? `${seasonLabel(r.mode, x.p.season)} · ${x.p.teamName}` : ""}</div>
                </div>
                <div style={{ display: "flex", fontSize: big ? 22 : 32, fontWeight: 700, color: "#fbbf24" }}>{x.p?.stats ? signed(x.p.stats.total) : ""}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex" }}>
            {bonus.map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "8px 0", marginRight: 8 }}>
                <div style={{ display: "flex", fontSize: 16, color: "#a1a1aa" }}>{k}</div>
                <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{signed(v)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: CACHE_HEADERS },
  );
}
