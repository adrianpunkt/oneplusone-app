function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-wine-burgundy/10 ${className}`} />;
}

export default function AppLoading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <p className="sr-only">Loading</p>
      <section className="grid gap-3">
        <Skeleton className="h-9 w-52 max-w-full" />
        <Skeleton className="h-5 w-80 max-w-full bg-wine-burgundy/8" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </section>

      <section className="grid gap-3 rounded-lg border border-wine-burgundy/10 bg-white p-4 shadow-sm">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </section>
    </div>
  );
}
