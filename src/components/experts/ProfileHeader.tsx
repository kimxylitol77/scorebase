import type { UserProfile } from "@/lib/analysis/profile";
import { displayGrade } from "@/lib/user-level";
import Avatar from "./Avatar";
import StreakBadge from "./StreakBadge";
import UserName from "@/components/UserName";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-neutral-50 dark:bg-neutral-900/40 py-3">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
    </div>
  );
}

// 분석가 프로필 헤더 — 아바타·닉·연승·분석관칩 + 통계3종 + 적중률 + 소개글.
export default function ProfileHeader({ p }: { p: UserProfile }) {
  const g = displayGrade(p.level, p.badge);
  return (
    <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <Avatar avatar={p.avatar} size="lg" frame={p.avatarFrame} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold truncate">
              <UserName name={p.nickname} nameColor={p.nameColor} />
            </h1>
            <StreakBadge streak={p.streak} />
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-xs text-neutral-400" title={g.name}>
              {g.emoji} {g.name}
            </span>
            <span className="text-sm text-neutral-500">
              적중률 <strong className="text-rose-500">{p.rate}%</strong>
              {p.best > 0 && <span className="text-neutral-400"> · 최고 {p.best}연승</span>}
            </span>
          </div>
        </div>
      </div>

      {/* 통계 3종 */}
      <div className="grid grid-cols-3 gap-2 mt-5 text-center">
        <Stat label="적중 / 전체" value={`${p.hit} / ${p.total}`} />
        <Stat label="Fans" value={p.fans} />
        <Stat label="순위" value={p.rank ? `${p.rank}위` : "—"} />
      </div>

      {/* 소개 */}
      <p className="mt-5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{p.intro}</p>
    </div>
  );
}
