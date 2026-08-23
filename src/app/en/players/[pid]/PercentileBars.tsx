// PercentileBars (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

const HITTER_METRICS: { key: string; label: string }[] = [
  { key: "xwoba", label: "xwOBA" },
  { key: "xba", label: "xBA" },
  { key: "xslg", label: "xSLG" },
  { key: "exit_velocity", label: "Exit velocity" },
  { key: "brl_percent", label: "Barrel %" },
  { key: "hard_hit_percent", label: "Hard-hit %" },
  { key: "bat_speed", label: "Bat speed" },
  { key: "chase_percent", label: "Chase avoided" },
  { key: "whiff_percent", label: "Contact (fewer whiffs)" },
  { key: "k_percent", label: "Strikeout avoidance" },
  { key: "bb_percent", label: "BB" },
  { key: "sprint_speed", label: "Pace" },
];

const PITCHER_METRICS: { key: string; label: string }[] = [
  { key: "xera", label: "xERA" },
  { key: "xwoba", label: "xwOBA" },
  { key: "fb_velocity", label: "Fastball velocity" },
  { key: "fb_spin", label: "Fastball spin" },
  { key: "k_percent", label: "SO" },
  { key: "bb_percent", label: "Command (fewer BB)" },
  { key: "whiff_percent", label: "Whiff rate" },
  { key: "chase_percent", label: "Chase induced" },
  { key: "brl_percent", label: "Barrel suppression" },
  { key: "hard_hit_percent", label: "Hard-hit suppression" },
  { key: "exit_velocity", label: "Contact suppression" },
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
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-x-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-blue-500 to-rose-500 bg-clip-text text-transparent">
            Statcast percentiles
          </span>
        </h2>
        <span className="text-xs text-neutral-400">{year} · vs all of MLB</span>
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
        Redder means higher in the league. Source: Baseball Savant (Statcast)
      </p>
    </section>
  );
}
