import Image from "next/image";

import { cn, initials } from "@/lib/utils";

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
      <span
        aria-hidden="true"
        className={cn(
          "block overflow-hidden rounded-md border border-current bg-mist",
          className,
        )}
      >
        <Image
          src={imageUrl}
          alt=""
          width={24}
          height={24}
          loading="eager"
          sizes="24px"
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid place-items-center rounded-md border border-current bg-mist text-[10px] font-black uppercase leading-none text-current",
        className,
      )}
    >
      {initials(displayName)}
    </span>
  );
}
