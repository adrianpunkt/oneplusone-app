"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function EventRoundBoundary({
  boundaryAt,
  copy,
}: {
  boundaryAt: string;
  copy: {
    availableFor: string;
    refreshing: string;
  };
}) {
  const router = useRouter();
  const boundary = useMemo(() => new Date(boundaryAt).getTime(), [boundaryAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(boundary) || now < boundary) return;
    router.refresh();
  }, [boundary, now, router]);

  const remaining = Math.max(0, boundary - now);
  if (!Number.isFinite(boundary) || remaining === 0) {
    return <span>{copy.refreshing}</span>;
  }

  return (
    <span>
      {copy.availableFor} {formatRemaining(remaining)}
    </span>
  );
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}
