// LoL RECAP — Quote of the Match (헤드라인 직후 강조 카드)

interface Props {
  emoji: string;
  body: string;
}

export default function QuoteOfMatch({ emoji, body }: Props) {
  return (
    <section
      aria-label="매치 한 줄 요약"
      className="my-6 rounded-2xl border border-amber-300 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 via-yellow-50 to-rose-50 dark:from-amber-500/10 dark:via-yellow-500/5 dark:to-rose-500/10 px-5 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none flex-shrink-0" aria-hidden>
          {emoji}
        </span>
        <p className="text-base sm:text-lg font-bold leading-snug text-neutral-900 dark:text-white">
          {body}
        </p>
      </div>
    </section>
  );
}
