// 반지 0~6개 표시 — 얻은 만큼 금색, 나머지는 흐리게
import { Trophy } from "lucide-react";

export default function Rings({ count, size = 18 }: { count: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`반지 ${count}개`}>
      {Array.from({ length: 6 }, (_, i) => (
        <Trophy
          key={i}
          aria-hidden
          style={{ width: size, height: size }}
          className={i < count ? "text-amber-500" : "text-neutral-300 dark:text-neutral-700"}
        />
      ))}
    </span>
  );
}
