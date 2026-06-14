import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  imageClassName,
  priority = false,
}: {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/one-plus-one-club-app-logo-transparent.webp"
        alt="one plus one club app"
        width={720}
        height={367}
        priority={priority}
        className={cn("h-auto w-full object-contain", imageClassName)}
      />
    </span>
  );
}
