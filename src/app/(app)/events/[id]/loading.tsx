function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-wine-burgundy/10 ${className}`} />;
}

export default function EventDetailLoading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <p className="sr-only">Loading</p>
      <section className="grid gap-3">
        <Skeleton className="h-6 w-24 rounded-md bg-lipstick-red/15" />
        <Skeleton className="h-10 w-[min(100%,28rem)]" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-5 w-36 bg-wine-burgundy/8" />
          <Skeleton className="h-5 w-28 bg-wine-burgundy/8" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="grid gap-4 rounded-lg border border-wine-burgundy/10 bg-white p-5 shadow-sm">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-5 w-full bg-wine-burgundy/8" />
          <Skeleton className="h-5 w-4/5 bg-wine-burgundy/8" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 bg-blush-pink" />
            <Skeleton className="h-24 bg-blush-pink" />
          </div>
        </div>
        <div className="grid gap-4 rounded-lg border border-wine-burgundy/10 bg-white p-5 shadow-sm">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 bg-blush-pink" />
          <Skeleton className="h-11 w-full bg-lipstick-red/12" />
        </div>
      </section>
    </div>
  );
}
