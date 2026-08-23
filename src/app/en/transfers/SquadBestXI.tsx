// 스쿼드 베스트 XI (영어판). scripts/en-mirror 로 자동 생성.
import Link from "next/link";
import Pitch, { PitchMarker } from "@/components/pitch/Pitch";
import { usedFormation, type FilledSlot } from "../../transfers/best-xi";

export { pickBestXI, slotsForFormation, usedFormation, DEFAULT_FORMATION } from "../../transfers/best-xi";
export type { XIPlayer, Slot, FilledSlot } from "../../transfers/best-xi";

const EUR_KRW = 1791.5;
const krwEok = (eurM: number) => Math.round((eurM * 1e6 * EUR_KRW) / 1e8).toLocaleString();

export default function SquadBestXI({
  slots,
  teamName,
  formation,
}: {
  slots: FilledSlot[];
  teamName: string;
  formation?: string | null;
}) {
  const filled = slots.filter((s) => s.player);
  if (filled.length < 7) return null; // 포지션 데이터 부족 팀은 미표시
  const total = filled.reduce((s, f) => s + (f.player?.value || 0), 0);
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold">⚽ Best XI by market value</h2>
        <span className="text-[11px] text-neutral-400">
          XI total <strong className="text-cyan-600 dark:text-cyan-400">€{total}M</strong> · {krwEok(total)}
        </span>
      </div>
      <Pitch
        orientation="vertical"
        aspect={3 / 4}
        stripes
        markingOpacity={0.24}
        grassFrom="#047857"
        grassTo="#064e3b"
        className="max-w-md mx-auto rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80"
      >
        {slots.map((s) =>
          s.player ? (
            <PitchMarker key={s.key} x={s.x} y={s.y} style={{ width: "88px" }}>
              <Link
                href={`/transfers/${s.player.id}`}
                className="flex flex-col items-center group"
              >
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden ring-2 ring-white/70 bg-gradient-to-br from-neutral-200 to-neutral-400 shadow-lg group-hover:ring-cyan-300 transition flex items-center justify-center">
                  {s.player.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.player.photo} alt={s.player.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-neutral-600">{s.player.name.slice(0, 1)}</span>
                  )}
                </div>
                <span className="mt-1 max-w-full truncate text-[10px] sm:text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] leading-tight">
                  {s.player.name}
                </span>
                <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-100/90 tabular-nums leading-tight">
                  {s.label} · €{s.player.value}M
                </span>
              </Link>
            </PitchMarker>
          ) : (
            <PitchMarker key={s.key} x={s.x} y={s.y} className="flex flex-col items-center" style={{ width: "88px" }}>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center" aria-hidden>
                <span className="text-[10px] font-bold text-white/40">{s.label}</span>
              </div>
            </PitchMarker>
          ),
        )}
      </Pitch>
      <p className="mt-1.5 text-[11px] text-neutral-400 text-center">
        {teamName} Best XI by market value ({usedFormation(formation)}) · Scorebase
      </p>
    </section>
  );
}
