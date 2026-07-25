// 돈 랭킹(연봉·상금·몸값) 행 공용 원형 선수 사진 — photoUrl 없으면 이름 첫 글자 이니셜 아바타.
// 서버 컴포넌트라 onError fallback 불가 → 사진 URL 은 수집 시점에 실존 검증된 것만 저장하는 전제.

export default function PlayerPhoto({
  photo,
  name,
  className = "h-7 w-7 lg:h-9 lg:w-9",
}: {
  photo?: string | null;
  name: string;
  className?: string;
}) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photo}
        alt=""
        loading="lazy"
        className={`${className} rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover object-top shrink-0`}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[11px] font-bold text-neutral-500 dark:text-neutral-300 shrink-0`}
    >
      {initial}
    </span>
  );
}
