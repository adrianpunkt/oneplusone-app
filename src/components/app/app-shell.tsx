import Link from "next/link";
import { Star } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { MessageHeartIcon, messageNotificationTooltip } from "@/components/app/message-heart-icon";
import { MobileMenu } from "@/components/app/mobile-menu";
import { SectionNav } from "@/components/app/section-nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { profileImageThumbnailUrl } from "@/lib/profile-image";
import type { Member, NotificationRecord, ProfileRegistration } from "@/lib/types";
import { cn, storyValue } from "@/lib/utils";

function memberDisplayName(member: Member, profile: ProfileRegistration | null) {
  return storyValue(profile?.profile_json, "profile.first_name") || member.email || "Me";
}

function NotificationHeartLink({
  className,
  count,
  href,
  tooltip,
}: {
  className?: string;
  count: number;
  href: string;
  tooltip: string;
}) {
  return (
    <Link
      aria-label={tooltip}
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center text-lipstick transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick/30 focus-visible:ring-offset-2",
        className,
      )}
      href={href}
    >
      <MessageHeartIcon
        className="h-10 w-10 text-lipstick"
        count={count}
        iconClassName="h-9 w-9"
        tooltip={tooltip}
      />
    </Link>
  );
}

function CreditBalanceLink({
  ariaLabel,
  className,
  creditBalance,
}: {
  ariaLabel: string;
  className?: string;
  creditBalance: number;
}) {
  const creditLabel = creditBalance === 1 ? "credit" : "credits";

  return (
    <Link
      aria-label={ariaLabel}
      className={cn(
        "-ml-1.5 flex h-8 min-w-12 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-lipstick/25 bg-white py-0 pl-1.5 pr-2.5 text-sm font-semibold text-lipstick shadow-sm transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/35 focus-visible:ring-offset-2",
        className,
      )}
      href="/credits"
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-lipstick text-white">
          <Star
            className="h-2.5 w-2.5"
            fill="#ffffff"
            stroke="#ffffff"
            strokeWidth={2.4}
          />
        </span>
      </span>
      <span className="leading-none text-lipstick">
        {creditBalance} {creditLabel}
      </span>
    </Link>
  );
}

export function AppShell({
  children,
  creditBalance,
  member,
  notifications,
  profile,
}: {
  children: React.ReactNode;
  creditBalance: number;
  member: Member;
  notifications: NotificationRecord[];
  profile: ProfileRegistration | null;
}) {
  const unreadCount = notifications.length;
  const displayName = memberDisplayName(member, profile);
  const imageUrl = profileImageThumbnailUrl(profile?.profile_json);
  const notificationHref = notifications[0]?.href || "/messages";
  const creditAriaLabel = `You have ${creditBalance} ${creditBalance === 1 ? "credit" : "credits"}`;
  const notificationTooltip = unreadCount > 0 ? messageNotificationTooltip(unreadCount) : "";

  return (
    <div className="min-h-screen app-grid">
      <aside className="sticky top-0 hidden h-screen border-r border-wine/10 bg-white/84 p-4 backdrop-blur md:block">
        <div className="flex h-full flex-col gap-5">
          <Link href="/dashboard" className="rounded-lg p-2" aria-label="one plus one club dashboard">
            <BrandLogo className="w-36" priority />
          </Link>

          <div className="flex w-full items-center justify-between px-4">
            <CreditBalanceLink ariaLabel={creditAriaLabel} creditBalance={creditBalance} />
          </div>

          <SectionNav displayName={displayName} imageUrl={imageUrl} unreadCount={unreadCount} />

          <div className="mt-auto px-2">
            <SignOutButton className="w-full justify-start" size="default" />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="fixed inset-x-0 top-0 z-30 border-b border-wine/10 bg-blush/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="flex items-center"
              aria-label="one plus one club dashboard"
            >
              <BrandLogo className="w-28" priority />
            </Link>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <NotificationHeartLink
                  count={unreadCount}
                  href={notificationHref}
                  tooltip={notificationTooltip}
                />
              ) : null}
              <CreditBalanceLink ariaLabel={creditAriaLabel} creditBalance={creditBalance} />
              <MobileMenu displayName={displayName} imageUrl={imageUrl} unreadCount={unreadCount} />
            </div>
          </div>
        </header>
        <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-6 pt-24 sm:px-6 md:py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
