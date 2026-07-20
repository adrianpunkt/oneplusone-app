import Image from "next/image";

import { cn } from "@/lib/utils";
import publicInvitationLogoImage from "../../public/non-member-invitation-logo-transparent.webp";

export function PublicInvitationLogo({
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
        src={publicInvitationLogoImage}
        alt="one plus one club"
        preload={priority}
        className={cn("h-auto w-full object-contain", imageClassName)}
      />
    </span>
  );
}
