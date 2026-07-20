import Image from "next/image";

import { cn } from "@/lib/utils";
import brandLogoImage from "../../public/one-plus-one-club-app-logo-transparent.webp";

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
        src={brandLogoImage}
        alt="one plus one app"
        preload={priority}
        className={cn("h-auto w-full object-contain", imageClassName)}
      />
    </span>
  );
}
