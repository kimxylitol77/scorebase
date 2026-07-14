// 강점·약점 자동 요약 — 같은 포지션 선수 대비 백분위(computeStatPercentiles) 상·하위 추출.
// 데이터 있는 스탯만 pct 에 담기므로 결측 오표시 없음. WhoScored/Sofascore 식.

// 성능 관련 지표만 (징계·파울류 제외). key = computeStatPercentiles 키.
const TRAIT_LABELS: Record<string, string> = {
  goals: "득점",
  assists: "도움",
  shotAcc: "슈팅 정확도",
  keyPasses: "기회 창출",
  passAcc: "패스 정확도",
  dribbleRate: "드리블 성공률",
  duelRate: "경합 성공률",
  tackles: "태클",
  interceptions: "가로채기",
  foulsDrawn: "파울 유도",
  dribbledPast: "수비 안정",
};

interface Trait { label: string; pct: number }

function Chips({ title, items, tone, suffix }: { title: string; items: Trait[]; tone: "up" | "down"; suffix: (p: number) => string }) {
  const cls = tone === "up"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  return (
    <div>
      <div className={`text-xs font-bold mb-2 ${tone === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span key={t.label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${cls}`}>
            {t.label}
            <span className="text-[10px] font-bold opacity-70 tabular-nums">{suffix(t.pct)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PlayerTraits({ pct }: { pct: Record<string, number> }) {
  const entries: Trait[] = Object.entries(pct)
    .filter(([k]) => k in TRAIT_LABELS)
    .map(([k, p]) => ({ label: TRAIT_LABELS[k], pct: p }));
  const strengths = entries.filter((e) => e.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const weaknesses = entries.filter((e) => e.pct <= 30).sort((a, b) => a.pct - b.pct).slice(0, 3);
  if (!strengths.length && !weaknesses.length) return null;

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <h2 className="text-base font-bold tracking-tight mb-3">
        <span className="bg-gradient-to-r from-emerald-500 to-rose-500 bg-clip-text text-transparent">강점 · 약점</span>
      </h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {strengths.length > 0 && <Chips title="강점" items={strengths} tone="up" suffix={(p) => `상위 ${100 - p}%`} />}
        {weaknesses.length > 0 && <Chips title="약점" items={weaknesses} tone="down" suffix={(p) => `하위 ${p}%`} />}
      </div>
      <p className="text-[11px] text-neutral-400 mt-3">같은 포지션 선수 대비 백분위 (최소 450분 출전).</p>
    </section>
  );
}
