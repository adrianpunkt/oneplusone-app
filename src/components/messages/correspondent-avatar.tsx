import Image from "next/image";

import { cn, initials } from "@/lib/utils";

export function CorrespondentAvatar({
  className,
  imageSize = 64,
  imageSizes = "64px",
  imageUrl,
  initialsClassName,
  name,
}: {
  className?: string;
  imageSize?: number;
  imageSizes?: string;
  imageUrl: string;
  initialsClassName?: string;
  name: string;
}) {
  if (imageUrl) {
    return (
      <span
        className={cn(
          "block aspect-square shrink-0 overflow-hidden rounded-xl border-2 border-lipstick/70 bg-mist shadow-inner",
          className,
        )}
      >
        <Image
          src={imageUrl}
          alt=""
          width={imageSize}
          height={imageSize}
          sizes={imageSizes}
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-lipstick/70 bg-mist shadow-inner",
        className,
      )}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(229,58,62,0.18),transparent_32%),linear-gradient(135deg,rgba(197,135,50,0.18),rgba(38,66,107,0.10))]" />
      <span
        className={cn(
          "absolute inset-0 grid place-items-center bg-white/80 text-xl font-black uppercase leading-none text-wine",
          initialsClassName,
        )}
      >
        {initials(name)}
      </span>
    </span>
  );
}
