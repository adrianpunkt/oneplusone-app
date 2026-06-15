import Image from "next/image";

import { cn, initials } from "@/lib/utils";

export function CorrespondentAvatar({
  className,
  imageUrl,
  name,
}: {
  className?: string;
  imageUrl: string;
  name: string;
}) {
  if (imageUrl) {
    return (
      <span
        className={cn(
          "block shrink-0 overflow-hidden rounded-full bg-lipstick",
          className,
        )}
      >
        <Image
          src={imageUrl}
          alt=""
          width={64}
          height={64}
          sizes="64px"
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-lipstick text-sm font-black uppercase leading-none text-white",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
