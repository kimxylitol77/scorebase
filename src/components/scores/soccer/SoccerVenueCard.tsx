// 경기 정보 카드 — 구장(venue) + 날씨(TheSportsMatchCache.environment). 둘 중 있는 것만 표시.
import type { VenueMeta } from "@/lib/sports/thesports/venues";
import { venueKo, cityKo } from "@/lib/venue-ko";

export interface MatchWeather {
  temperature?: string; // "27°C"
  humidity?: string; // "89%"
  wind?: string; // "1.1m/s"
}

interface Props {
  venue: VenueMeta | null;
  weather?: MatchWeather | null;
}

export default function SoccerVenueCard({ venue, weather }: Props) {
  const meta: string[] = [];
  if (venue?.city) meta.push(cityKo(venue.city)!);
  if (venue?.country) meta.push(venue.country);
  if (venue?.capacity) meta.push(`${venue.capacity.toLocaleString()}석`);

  const w: string[] = [];
  if (weather?.temperature) w.push(weather.temperature);
  if (weather?.humidity) w.push(`습도 ${weather.humidity}`);
  if (weather?.wind) w.push(`바람 ${weather.wind}`);

  if (!venue && w.length === 0) return null;

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          경기 정보
        </h2>
        {venue && <span className="text-[11px] text-neutral-400">홈 구장</span>}
      </div>
      <div className="space-y-1">
        {venue && (
          <>
            <div className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              {venueKo(venue.name)}
            </div>
            {meta.length > 0 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {meta.join(" · ")}
              </div>
            )}
          </>
        )}
        {w.length > 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-semibold text-neutral-600 dark:text-neutral-300">날씨</span> {w.join(" · ")}
          </div>
        )}
      </div>
    </section>
  );
}
