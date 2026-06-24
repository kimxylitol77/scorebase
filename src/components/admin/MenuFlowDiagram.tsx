// 헤더 메뉴 트리 플로우 — nav-config 를 박스+화살표로 시각화. admin 구조 지도 ①.
// 좌→우 4단: 홈 → 대표메뉴 5 → 각 페이지 → (허브의) 하위 페이지. 박스 클릭 시 이동.
// 하위는 정적 별도 페이지(색 채움)와 동적 [param] 페이지(점선)로 구분.
import { SPORT_CATEGORIES, COMMUNITY_CATEGORY } from "@/components/nav-config";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#64748B", "#8B5CF6"]; // 메뉴 순서대로 색

// 허브 페이지가 거느린 하위 — 수동 큐레이션. dyn=true 는 동적 [param](리그·선수·글 끼움).
const SUBPAGES: Record<string, { label: string; href: string; dyn?: boolean }[]> = {
  "/world-cup": [
    { label: "오늘의 베스트XI", href: "/world-cup/team-of-day" },
    { label: "조별 베스트11", href: "/world-cup/best-xi/A" },
    { label: "48개국 목록", href: "/national-teams" },
  ],
  "/predictions": [
    { label: "적중률 보드", href: "/predictions/accuracy" },
    { label: "선발 매치업", href: "/predictions/starters" },
    { label: "우승 경쟁", href: "/predictions/title-race" },
    { label: "클럽 랭킹", href: "/predictions/club-ranking" },
    { label: "FIFA 랭킹", href: "/predictions/fifa-ranking" },
  ],
  "/analysis": [
    { label: "분석글 작성", href: "/analysis/new" },
    { label: "글 상세·댓글", href: "/analysis", dyn: true },
  ],
  "/standings": [{ label: "리그별 순위표", href: "/standings/EPL", dyn: true }],
  "/transfers": [{ label: "선수 개인 페이지", href: "/transfers", dyn: true }],
  "/injuries": [{ label: "리그별 부상자", href: "/injuries/EPL", dyn: true }],
  "/blog": [{ label: "블로그 글 상세", href: "/blog", dyn: true }],
  "/notices": [{ label: "공지 상세", href: "/notices", dyn: true }],
};

interface Node {
  label: string;
  href: string;
  y: number;
  dyn: boolean;
}

export default function MenuFlowDiagram() {
  const cats = [...SPORT_CATEGORIES, COMMUNITY_CATEGORY];
  const HX = 10, MX = 140, PX = 320, SX = 510;
  const HW = 100, MW = 140, PW = 170, SW = 170, PH = 26, GAP = 8, MGAP = 16;

  let y = 16;
  const layout = cats.map((cat, ci) => {
    const col = COLORS[ci % COLORS.length];
    const start = y;
    const items = cat.items.map((it) => {
      const subDefs = SUBPAGES[it.href.split("?")[0]] ?? [];
      if (subDefs.length > 0) {
        const subStart = y;
        const subs: Node[] = subDefs.map((s) => {
          const n = { label: s.label, href: s.href, y, dyn: s.dyn ?? false };
          y += PH + GAP;
          return n;
        });
        const pageY = (subStart + (y - PH - GAP)) / 2;
        return { label: it.label, href: it.href, y: pageY, subs };
      }
      const node = { label: it.label, href: it.href, y, subs: [] as Node[] };
      y += PH + GAP;
      return node;
    });
    const menuY = (start + (y - PH - GAP)) / 2;
    y += MGAP;
    return { label: cat.label, href: cat.href, col, menuY, items };
  });
  const H = y + 8;
  const homeY = (H - PH) / 2;

  const curve = (x1: number, y1: number, x2: number, y2: number) =>
    `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
  const cy = (boxY: number) => boxY + PH / 2;
  const boxStyle = { fontSize: 11, fontFamily: "system-ui, sans-serif" } as const;

  return (
    <svg viewBox={`0 0 690 ${H}`} width="100%" style={{ minWidth: 660 }} role="img" aria-label="헤더 메뉴 트리 (홈→메뉴→페이지→하위)">
      <defs>
        <marker id="mtfArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M2 2L8 5L2 8" fill="none" stroke="context-stroke" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {layout.map((c, i) => (
        <path key={`h${i}`} d={curve(HX + HW, cy(homeY), MX, cy(c.menuY))} fill="none" stroke={c.col} strokeWidth={1.5} opacity={0.5} markerEnd="url(#mtfArrow)" />
      ))}
      {layout.flatMap((c, ci) =>
        c.items.map((it, ii) => (
          <path key={`mp${ci}-${ii}`} d={curve(MX + MW, cy(c.menuY), PX, cy(it.y))} fill="none" stroke={c.col} strokeWidth={1.5} opacity={0.5} markerEnd="url(#mtfArrow)" />
        )),
      )}
      {layout.flatMap((c, ci) =>
        c.items.flatMap((it, ii) =>
          it.subs.map((s, si) => (
            <path key={`ps${ci}-${ii}-${si}`} d={curve(PX + PW, cy(it.y), SX, cy(s.y))} fill="none" stroke={c.col} strokeWidth={1.4} opacity={0.4} markerEnd="url(#mtfArrow)" />
          )),
        ),
      )}

      <a href="/">
        <rect x={HX} y={homeY} width={HW} height={PH} rx={5} fill="#6B7280" />
        <text x={HX + HW / 2} y={cy(homeY) + 4} textAnchor="middle" fill="#fff" {...boxStyle}>홈 (메인)</text>
      </a>
      {layout.map((c, i) => (
        <a key={`mb${i}`} href={c.href}>
          <rect x={MX} y={c.menuY} width={MW} height={PH} rx={5} fill={c.col} />
          <text x={MX + MW / 2} y={cy(c.menuY) + 4} textAnchor="middle" fill="#fff" {...boxStyle}>{c.label}</text>
        </a>
      ))}
      {layout.flatMap((c, ci) =>
        c.items.map((it, ii) => (
          <a key={`pb${ci}-${ii}`} href={it.href}>
            <rect x={PX} y={it.y} width={PW} height={PH} rx={5} fill={c.col} />
            <text x={PX + PW / 2} y={cy(it.y) + 4} textAnchor="middle" fill="#fff" {...boxStyle}>{it.label}</text>
          </a>
        )),
      )}
      {layout.flatMap((c, ci) =>
        c.items.flatMap((it, ii) =>
          it.subs.map((s, si) => (
            <a key={`sb${ci}-${ii}-${si}`} href={s.href}>
              {s.dyn ? (
                <rect x={SX} y={s.y} width={SW} height={PH} rx={5} fill="none" stroke={c.col} strokeWidth={1.2} strokeDasharray="4 2.5" />
              ) : (
                <rect x={SX} y={s.y} width={SW} height={PH} rx={5} fill={c.col} fillOpacity={0.78} />
              )}
              <text x={SX + SW / 2} y={cy(s.y) + 4} textAnchor="middle" fill={s.dyn ? c.col : "#fff"} {...boxStyle}>{s.label}</text>
            </a>
          )),
        ),
      )}
    </svg>
  );
}
