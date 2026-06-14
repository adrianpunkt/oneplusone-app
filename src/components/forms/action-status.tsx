"use client";

export function ActionStatus({
  error,
  ok,
}: {
  error?: string;
  ok?: boolean;
}) {
  if (!error && !ok) return null;

  return (
    <p
      className={
        error
          ? "text-sm font-semibold text-lipstick"
          : "text-sm font-semibold text-ocean"
      }
      role="status"
    >
      {error || "Saved."}
    </p>
  );
}
