// 선수 국가 마크(골프·F1·테니스 공용) — 팀 로고 자리에 두는 48px 원형 국기. 골프는 flagcdn(ISO2, 영국 구성국 gb-eng 등), F1·테니스는 ESPN 국기 URL.
const GB_SUBDIVISION: Record<string, string> = {
  England: "gb-eng",
  Scotland: "gb-sct",
  Wales: "gb-wls",
  "Northern Ireland": "gb-nir",
};

/** ISO2 코드(없으면 나라명으로 영국 구성국 판정) → flagcdn 코드. 못 정하면 null. */
export function flagCode(code2: string | null | undefined, country: string | null): string | null {
  if (country && GB_SUBDIVISION[country]) return GB_SUBDIVISION[country];
  if (code2 && /^[A-Za-z]{2}$/.test(code2)) return code2.toLowerCase();
  return null;
}

/**
 * code2 → flagcdn 국기(골프). src 를 주면 그 이미지를 그대로 쓴다(F1·테니스는 ESPN 국기 URL 을 이미 갖고 있어 매핑 불필요).
 */
export default function CountryMark({
  code2,
  country,
  src,
}: {
  code2?: string | null;
  country: string | null;
  src?: string | null;
}) {
  const code = src ? null : flagCode(code2, country);
  const url = src ?? (code ? `https://flagcdn.com/w80/${code}.png` : null);
  return (
    <span
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-800"
      title={country ?? undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={country ?? ""} width={48} height={48} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-neutral-500">{(country ?? "").slice(0, 2)}</span>
      )}
    </span>
  );
}
