import type { AvatarPreset } from "@/lib/avatars";

// 원형 이모지 아바타 (avatars.ts 프리셋). 리더보드 행·프로필 헤더 공용.
const SIZE = {
  sm: "w-8 h-8 text-base",
  md: "w-11 h-11 text-xl",
  lg: "w-16 h-16 text-3xl sm:w-20 sm:h-20 sm:text-4xl",
} as const;

export default function Avatar({
  avatar,
  size = "md",
}: {
  avatar: AvatarPreset;
  size?: keyof typeof SIZE;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${avatar.bg} ${SIZE[size]}`}
      aria-hidden
    >
      {avatar.emoji}
    </span>
  );
}
