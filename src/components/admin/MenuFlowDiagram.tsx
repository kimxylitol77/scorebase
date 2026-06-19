// 헤더 메뉴 트리 플로우 — nav-config 를 박스+화살표로 시각화(홈→메뉴→페이지). admin 구조 지도 ①.
// 좌→우 3단: 홈 → 대표메뉴 5 → 각 메뉴의 페이지. 박스 클릭 시 해당 라우트로 이동.
import { SPORT_CATEGORIES, COMMUNITY_CATEGORY } from "@/components/nav-config";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#64748B", "#8B5CF6"]; // 메뉴 순서대로 색

export default function MenuFlowDiagram() {
  const cats = [...SPORT_CATEGORIES, COMMUNITY_CATEGORY];
  const HX = 14, MX = 190, PX = 430;
  const HW = 120, MW = 160, PW = 200, PH = 26, GAP = 8, MGAP = 16;

  let y = 16;
  const layout = cats.map((cat, ci) => {
    const col = COLORS[ci % COLORS.length];
    const start = y;
    const items = cat.items.map((it) => {
      const node = { label: it.label, href: it.href, y };
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

  return (
    <svg viewBox={`0 0 650 ${H}`} width="100%" style={{ minWidth: 600 }} role="img" aria-label="헤더 메뉴 트리 (홈→메뉴→페이지)">
      <defs>
        <marker id="mtfArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M2 2L8 5L2 8" fill="none" stroke="context-stroke" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {layout.map((c, i) => (
        <path key={`h${i}`} d={curve(HX + HW, homeY + PH / 2, MX, c.menuY + PH / 2)} fill="none" stroke={c.col} strokeWidth={1.5} opacity={0.5} markerEnd="url(#mtfArrow)" />
      ))}
      {layout.flatMap((c, ci) =>
        c.items.map((it, ii) => (
          <path key={`l${ci}-${ii}`} d={curve(MX + MW, c.menuY + PH / 2, PX, it.y + PH / 2)} fill="none" stroke={c.col} strokeWidth={1.5} opacity={0.5} markerEnd="url(#mtfArrow)" />
        )),
      )}

      <a href="/">
        <rect x={HX} y={homeY} width={HW} height={PH} rx={5} fill="#6B7280" />
        <text x={HX + HW / 2} y={homeY + PH / 2 + 4} textAnchor="middle" fill="#fff" fontSize={11.5} fontFamily="system-ui, sans-serif">홈 (메인)</text>
      </a>
      {layout.map((c, i) => (
        <a key={`m${i}`} href={c.href}>
          <rect x={MX} y={c.menuY} width={MW} height={PH} rx={5} fill={c.col} />
          <text x={MX + MW / 2} y={c.menuY + PH / 2 + 4} textAnchor="middle" fill="#fff" fontSize={11.5} fontFamily="system-ui, sans-serif">{c.label}</text>
        </a>
      ))}
      {layout.flatMap((c, ci) =>
        c.items.map((it, ii) => (
          <a key={`pg${ci}-${ii}`} href={it.href}>
            <rect x={PX} y={it.y} width={PW} height={PH} rx={5} fill={c.col} />
            <text x={PX + PW / 2} y={it.y + PH / 2 + 4} textAnchor="middle" fill="#fff" fontSize={11.5} fontFamily="system-ui, sans-serif">{it.label}</text>
          </a>
        )),
      )}
    </svg>
  );
}
