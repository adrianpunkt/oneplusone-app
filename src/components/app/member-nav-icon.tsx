import Image from "next/image";

import { cn } from "@/lib/utils";

export function MemberNavIcon({
  className,
  displayName,
  imageUrl,
}: {
  className?: string;
  displayName: string;
  imageUrl: string;
}) {
  if (imageUrl) {
    return (
      <span className={cn("block overflow-hidden rounded-full bg-lipstick", className)}>
        <Image
          src={imageUrl}
          alt=""
          width={24}
          height={24}
          sizes="24px"
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid place-items-center rounded-full bg-lipstick text-[10px] font-black uppercase leading-none text-white",
        className,
      )}
    >
      {displayName.trim().charAt(0) || "M"}
    </span>
  );
}
