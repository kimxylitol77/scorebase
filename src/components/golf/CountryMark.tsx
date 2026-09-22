// 골프 선수 국가 마크 — 팀 로고 자리에 두는 48px 원형 국기(flagcdn, ISO 3166-1 alpha-2). 영국 구성국은 gb-eng 등 하위 코드.
const GB_SUBDIVISION: Record<string, string> = {
  England: "gb-eng",
  Scotland: "gb-sct",
  Wales: "gb-wls",
  "Northern Ireland": "gb-nir",
};

/** ISO2 코드(없으면 나라명으로 영국 구성국 판정) → flagcdn 코드. 못 정하면 null. */
export function flagCode(code2: string | null | undefined, country: string): string | null {
  if (GB_SUBDIVISION[country]) return GB_SUBDIVISION[country];
  if (code2 && /^[A-Za-z]{2}$/.test(code2)) return code2.toLowerCase();
  return null;
}

export default function CountryMark({ code2, country }: { code2: string | null | undefined; country: string }) {
  const code = flagCode(code2, country);
  return (
    <span
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-800"
      title={country}
    >
      {code ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://flagcdn.com/w80/${code}.png`} alt={country} width={48} height={48} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-neutral-500">{country.slice(0, 2)}</span>
      )}
    </span>
  );
}
