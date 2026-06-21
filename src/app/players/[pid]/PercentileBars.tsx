// Baseball Savant 스타일 Statcast 퍼센타일 슬라이더 — 0~100, 파랑(낮음)→빨강(높음).
// 모든 값은 Savant 에서 "높을수록 좋음" 으로 정규화돼 있어 그대로 그린다.

const HITTER_METRICS: { key: string; label: string }[] = [
  { key: "xwoba", label: "xwOBA" },
  { key: "xba", label: "xBA" },
  { key: "xslg", label: "xSLG" },
  { key: "exit_velocity", label: "타구 속도" },
  { key: "brl_percent", label: "배럴 %" },
  { key: "hard_hit_percent", label: "강타율" },
  { key: "bat_speed", label: "배트 스피드" },
  { key: "chase_percent", label: "유인구 참기" },
  { key: "whiff_percent", label: "컨택 (헛스윙↓)" },
  { key: "k_percent", label: "삼진 회피" },
  { key: "bb_percent", label: "볼넷" },
  { key: "sprint_speed", label: "주력" },
];

const PITCHER_METRICS: { key: string; label: string }[] = [
  { key: "xera", label: "기대 ERA" },
  { key: "xwoba", label: "xwOBA" },
  { key: "fb_velocity", label: "패스트볼 구속" },
  { key: "fb_spin", label: "패스트볼 회전" },
  { key: "k_percent", label: "삼진" },
  { key: "bb_percent", label: "제구 (볼넷↓)" },
  { key: "whiff_percent", label: "헛스윙 유도" },
  { key: "chase_percent", label: "유인구 유도" },
  { key: "brl_percent", label: "배럴 억제" },
  { key: "hard_hit_percent", label: "강타 억제" },
  { key: "exit_velocity", label: "타구 억제" },
];

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

// 0=파랑 → 50=슬레이트 → 100=빨강 (Savant diverging).
function pctColor(p: number): string {
  if (p <= 50) {
    const t = p / 50;
    return `rgb(${lerp(59, 148, t)},${lerp(130, 163, t)},${lerp(246, 184, t)})`;
  }
  const t = (p - 50) / 50;
  return `rgb(${lerp(148, 239, t)},${lerp(163, 68, t)},${lerp(184, 68, t)})`;
}

export default function PercentileBars({
  values,
  type,
  year,
}: {
  values: Record<string, number>;
  type: "batter" | "pitcher";
  year: number;
}) {
  const metrics = type === "batter" ? HITTER_METRICS : PITCHER_METRICS;
  const rows = metrics.filter((m) => values[m.key] != null);
  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-x-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-blue-500 to-rose-500 bg-clip-text text-transparent">
            Statcast 퍼센타일
          </span>
        </h2>
        <span className="text-xs text-neutral-400">{year} · MLB 전체 대비</span>
      </div>
      <div className="space-y-2">
        {rows.map((m) => {
          const p = values[m.key];
          const color = pctColor(p);
          return (
            <div key={m.key} className="flex items-center gap-3">
              <span className="w-24 sm:w-28 shrink-0 text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-300 truncate">
                {m.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${p}%`, backgroundColor: color }}
                />
                <div
                  className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-neutral-900 shadow"
                  style={{
                    left: `calc(${p}% - 6px)`,
                    backgroundColor: color,
                    transform: "translateY(-50%)",
                  }}
                />
              </div>
              <span
                className="w-6 shrink-0 text-right text-xs font-bold tabular-nums"
                style={{ color }}
              >
                {p}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-400 mt-3">
        빨강에 가까울수록 리그 상위. 출처: Baseball Savant (Statcast)
      </p>
    </section>
  );
}
