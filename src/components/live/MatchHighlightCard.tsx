// 공식 유튜브 하이라이트 임베드 카드.
// 경기 종료 매치에 highlightYoutubeId(공식 채널 풀-하이라이트 재생목록 매칭값)가 있을 때만 렌더.
// 영상은 youtube-nocookie 도메인으로 임베드 — 재생 전 쿠키 미설정, 우리 서버 부하 0.
// (재생은 https 오리진에서 정상. file:// 직접 열기만 'error 153' 발생 → 운영 도메인 무관.)

interface Props {
  videoId: string;
  homeNameKo: string;
  awayNameKo: string;
}

export default function MatchHighlightCard({ videoId, homeNameKo, awayNameKo }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <span aria-hidden className="text-base">📺</span>
        <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
          하이라이트 · 다시보기
        </h2>
        <span className="ml-auto text-xs text-neutral-400">공식 영상</span>
      </div>
      <div className="relative aspect-video w-full bg-black">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={`${homeNameKo} vs ${awayNameKo} 하이라이트`}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </section>
  );
}
