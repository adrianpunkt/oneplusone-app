function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-wine/10 ${className}`} />;
}

export default function ConversationLoading() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[81px] z-10 px-0 pb-0 md:left-[260px] md:top-0 md:px-6 md:py-6 lg:px-8"
      aria-busy="true"
    >
      <p className="sr-only">Loading</p>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-0 md:gap-2">
        <section className="flex min-h-[3.25rem] min-w-0 shrink-0 items-center gap-2 border-b border-wine/10 bg-white/95 px-4 py-1.5 shadow-[0_8px_22px_rgba(68,10,18,0.05)] backdrop-blur sm:px-6 md:rounded-lg md:border md:px-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-7 w-44 max-w-[55vw]" />
        </section>

        <div className="min-h-0 flex-1 overflow-hidden rounded-none border border-wine/10 bg-white md:rounded-lg">
          <div className="h-full min-h-0 overflow-hidden bg-blush p-3">
            <div className="grid gap-3">
              <Skeleton className="h-20 w-4/5 bg-white" />
              <Skeleton className="ml-auto h-20 w-3/4 bg-lipstick/12" />
              <Skeleton className="h-20 w-2/3 bg-white" />
              <Skeleton className="ml-auto h-20 w-4/5 bg-lipstick/12" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
