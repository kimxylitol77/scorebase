import type { VenueMeta } from "@/lib/sports/thesports/venues";

interface Props {
  venue: VenueMeta;
}

export default function SoccerVenueCard({ venue }: Props) {
  const meta: string[] = [];
  if (venue.city) meta.push(venue.city);
  if (venue.country) meta.push(venue.country);
  if (venue.capacity) meta.push(`${venue.capacity.toLocaleString()}석`);

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          경기 정보
        </h2>
        <span className="text-[11px] text-neutral-400">홈 구장</span>
      </div>
      <div className="space-y-1">
        <div className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {venue.name}
        </div>
        {meta.length > 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {meta.join(" · ")}
          </div>
        )}
      </div>
    </section>
  );
}
