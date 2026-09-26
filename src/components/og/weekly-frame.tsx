// 주간 리뷰 인포그래픽 카드(1080×1350) 공용 프레임 — 축구 weekly-card·야구 baseball-weekly-card 가 같이 쓴다.
// satori(next/og) 전용: 모든 컨테이너 display:flex, 고정폭 요소 flexShrink:0. 브랜드 헤더·칩·아바타·로고·폰트 로더.
import { readFile } from "fs/promises";
import { join } from "path";

export const CARD_W = 1080;
export const CARD_H = 1350;
// 주간 창이 닫힌 뒤엔 값이 안 변한다 — CDN 하루, 브라우저 1시간.
export const CARD_CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" };

export async function loadCardFonts() {
  const cwd = process.cwd();
  const [notoB, notoBlack, oswaldB] = await Promise.all([
    readFile(join(cwd, "public/fonts/NotoSansKR-Bold.ttf")),
    readFile(join(cwd, "public/fonts/NotoSansKR-Black.ttf")),
    readFile(join(cwd, "public/fonts/Oswald-Bold.ttf")),
  ]);
  return [
    { name: "Noto", data: notoB, weight: 700 as const, style: "normal" as const },
    { name: "Noto", data: notoBlack, weight: 900 as const, style: "normal" as const },
    { name: "Oswald", data: oswaldB, weight: 700 as const, style: "normal" as const },
  ];
}

export async function toDataUri(url: string | null | undefined): Promise<string | null> {
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

/** "2026-09-16","2026-09-22" → "9.16 ~ 9.22" */
export const fmtRange = (from: string, to: string) => {
  const f = from.split("-");
  const t = to.split("-");
  return `${Number(f[1])}.${Number(f[2])} ~ ${Number(t[1])}.${Number(t[2])}`;
};

export function Frame({ grad, leagueKo, range, title, sub, children }: {
  grad: [string, string]; leagueKo: string; range: string; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "52px 56px", background: `linear-gradient(160deg, ${grad[0]} 0%, ${grad[1]} 55%, #020617 100%)`, color: "white", fontFamily: "Noto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "30px", fontWeight: 900, letterSpacing: "-0.02em" }}>
          <BarMark />
          <span>Scorebase</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Chip>{leagueKo}</Chip>
          <Chip>{range}</Chip>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "26px" }}>
        <span style={{ fontSize: "64px", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{title}</span>
        <span style={{ display: "flex", fontSize: "23px", opacity: 0.72, marginTop: "8px" }}>{sub}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: "26px" }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "18px", fontSize: "19px", opacity: 0.55 }}>
        <span>scorebase.kr · 데이터 기반 주간 리뷰</span>
        <span>수치는 경기 종료 시점 집계</span>
      </div>
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", fontSize: "21px", fontWeight: 700, padding: "7px 18px", borderRadius: "999px", background: "rgba(255,255,255,0.14)" }}>{children}</div>
  );
}

export function BarMark() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "36px" }}>
      <div style={{ width: "7px", height: "14px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "22px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "30px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
    </div>
  );
}

export function Avatar({ src, size, ring }: { src: string | null; size: number; ring: string }) {
  return (
    <div style={{ display: "flex", width: size, height: size, borderRadius: "999px", overflow: "hidden", flexShrink: 0, border: `4px solid ${ring}`, background: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} style={{ objectFit: "cover", width: size, height: size }} alt="" />
      ) : (
        <span style={{ fontSize: size * 0.4, opacity: 0.4 }}>?</span>
      )}
    </div>
  );
}

export function Logo({ src, size }: { src: string | null; size: number }) {
  return (
    <div style={{ display: "flex", width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} style={{ objectFit: "contain", width: size, height: size }} alt="" />
      ) : (
        <div style={{ width: size, height: size, borderRadius: "999px", background: "rgba(255,255,255,0.12)" }} />
      )}
    </div>
  );
}

/** 통계 타일 한 줄 — [라벨, 값][] */
export function StatTiles({ items, accent }: { items: [string, string][]; accent?: string }) {
  return (
    <div style={{ display: "flex", width: "100%", gap: "14px" }}>
      {items.map(([k, v], i) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 0", borderRadius: "18px", background: "rgba(255,255,255,0.08)", alignItems: "center", border: i === 0 && accent ? `2px solid ${accent}` : "2px solid transparent" }}>
          <span style={{ fontSize: "19px", opacity: 0.65 }}>{k}</span>
          <span style={{ fontSize: "46px", fontFamily: "Oswald", fontWeight: 700, color: i === 0 && accent ? accent : "white", lineHeight: 1.1, marginTop: "4px" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
