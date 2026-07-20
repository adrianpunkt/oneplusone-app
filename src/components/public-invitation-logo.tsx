import Image from "next/image";

import { cn } from "@/lib/utils";
import publicInvitationLogoImage from "../../public/non-member-invitation-logo-transparent.webp";

export function PublicInvitationLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src={publicInvitationLogoImage}
        alt="one plus one club"
        preload={priority}
        className="h-auto w-full object-contain"
      />
    </span>
  );
}
