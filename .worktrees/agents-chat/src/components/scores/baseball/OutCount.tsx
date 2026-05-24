// 아웃 카운트 — 3개 원 가로 (●○○).
// outs == null → 모두 빈 원으로 표시.

interface Props {
  outs: 0 | 1 | 2 | 3 | null | undefined;
}

export default function OutCount({ outs }: Props) {
  const n = outs ?? 0;
  return (
    <div
      style={{ display: "inline-flex", gap: 5, alignItems: "center" }}
      aria-label={`아웃 ${n}`}
    >
      {[0, 1, 2].map((i) => {
        const on = i < n;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: on ? "#ef4444" : "rgba(255,255,255,.1)",
              border: on ? "none" : "1px solid rgba(255,255,255,.15)",
              boxShadow: on ? "0 0 6px rgba(239,68,68,.5)" : "none",
              transition: "background .2s",
            }}
          />
        );
      })}
    </div>
  );
}
