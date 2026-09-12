// /admin/stats 공용 표시 컴포넌트 — 서버 페이지와 클라이언트 기간 카드(RangeStats)가 같이 쓴다. 상태 없음.

export function KpiCard({ label, value, accent, suffix, sub }: { label: string; value: number | string; accent?: boolean; suffix?: string; sub?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10" : "border-neutral-200 dark:border-neutral-800"}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
        {suffix && <span className="text-base font-bold text-neutral-500">{suffix}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-500 tabular-nums">{sub}</div>}
    </div>
  );
}

export function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <span className="text-xs text-neutral-500">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ message }: { message?: string } = {}) {
  return <div className="text-sm text-neutral-500 py-8 text-center">{message ?? "아직 데이터가 충분하지 않습니다."}</div>;
}

/** 차트 위 요약 칩 — 방문자(초록)·페이지뷰(파랑) 색을 차트 범례와 맞춘다. */
export function MiniStat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "blue" }) {
  const color = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400";
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-white/[0.04]">
      <div className="text-[11px] text-neutral-500 truncate">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

export const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** 시간대별 평균 동시 접속 — 막대 하나가 KST 한 시간. 골든타임을 눈으로 찾으라고 둔다. */
export function ConcurrentHourChart({ hours }: { hours: Array<{ hour: number; avg: number; peak: number }> }) {
  const max = Math.max(1, ...hours.map((h) => h.avg));
  return (
    <div>
      <div className="flex items-end gap-[3px] h-28">
        {hours.map((h) => (
          <div key={h.hour} className="flex-1 flex flex-col justify-end items-center group relative">
            <div className="w-full rounded-t bg-sky-500/70 group-hover:bg-sky-500 transition-colors" style={{ height: `${Math.max(2, (h.avg / max) * 100)}%` }} />
            <span className="absolute -top-5 hidden group-hover:block text-[10px] font-semibold whitespace-nowrap">
              {h.avg.toFixed(1)} / 최대 {h.peak}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1">
        {hours.map((h) => (
          <span key={h.hour} className="flex-1 text-center text-[9px] text-neutral-400 tabular-nums">{h.hour % 3 === 0 ? h.hour : ""}</span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-neutral-400 text-center">KST 시간대별 평균 (막대에 올리면 최대값)</p>
    </div>
  );
}

/** 순위 막대 목록 한 줄 — 인기 페이지·봇·도메인 카드가 같은 모양을 쓴다. */
export function RankRow({ rank, label, href, pct, value, bar = "bg-blue-500", mono, labelMax = "40%", extra }: {
  rank: number; label: string; href?: string; pct: number; value: React.ReactNode; bar?: string; mono?: boolean; labelMax?: string; extra?: React.ReactNode;
}) {
  const cls = `${mono ? "font-mono text-xs" : "font-medium"} truncate hover:underline`;
  return (
    <li className="py-2.5 flex items-center gap-3 text-sm">
      <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">{rank}</span>
      {extra}
      {href ? (
        <a href={href} target="_blank" rel="noopener" className={cls} style={{ maxWidth: labelMax }}>{label}</a>
      ) : (
        <span className={`${mono ? "font-mono text-xs" : "font-medium"} truncate`} style={{ maxWidth: labelMax }}>{label}</span>
      )}
      <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-neutral-500 font-semibold text-right whitespace-nowrap">{value}</span>
    </li>
  );
}
