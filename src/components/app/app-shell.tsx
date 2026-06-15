import Link from "next/link";
import { Star } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { MobileMenu } from "@/components/app/mobile-menu";
import { SectionNav } from "@/components/app/section-nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { profileImageUrl } from "@/lib/profile-image";
import type { Member, NotificationRecord, ProfileRegistration } from "@/lib/types";
import { initials, storyValue } from "@/lib/utils";

function memberDisplayName(member: Member, profile: ProfileRegistration | null) {
  return storyValue(profile?.profile_json, "profile.first_name") || member.email || "Me";
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
  const imageUrl = profileImageUrl(profile?.profile_json);
  const notificationHref = notifications[0]?.href || "/messages";
  const notificationLabel =
    unreadCount === 1 ? notifications[0]?.title || "1 new notification" : `${unreadCount} new notifications`;
  const notificationCountLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="min-h-screen app-grid">
      <aside className="sticky top-0 hidden h-screen border-r border-wine/10 bg-white/84 p-4 backdrop-blur md:block">
        <div className="flex h-full flex-col gap-5">
          <Link href="/dashboard" className="rounded-lg p-2" aria-label="one plus one club dashboard">
            <BrandLogo className="w-36" priority />
          </Link>

          <SectionNav displayName={displayName} imageUrl={imageUrl} unreadCount={unreadCount} />

          <div className="mt-auto grid gap-4 rounded-lg border border-wine/10 bg-blush p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-wine text-xs font-black text-white">
                {initials(member.email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-wine">{member.email}</p>
                <p className="text-xs font-semibold capitalize text-muted">
                  {member.membership_status}
                </p>
              </div>
            </div>
            <SignOutButton />
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
                <Link
                  aria-label={notificationLabel}
                  className="grid h-10 w-10 place-items-center text-lipstick transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick/30 focus-visible:ring-offset-2"
                  href={notificationHref}
                  title={notificationLabel}
                >
                  <svg
                    aria-hidden="true"
                    className="h-9 w-9 drop-shadow-sm"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
                      fill="currentColor"
                    />
                    <text
                      fill="white"
                      fontSize={notificationCountLabel.length > 1 ? "8" : "8"}
                      fontWeight="900"
                      textAnchor="middle"
                      x="12"
                      y="13.4"
                    >
                      {notificationCountLabel}
                    </text>
                  </svg>
                </Link>
              ) : null}
              <Link
                aria-label={`${creditBalance} credits`}
                className="flex h-8 min-w-12 items-center justify-center gap-1.5 rounded-full border border-lipstick/25 bg-white px-1.5 text-sm font-semibold text-lipstick shadow-sm transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/35 focus-visible:ring-offset-2"
                href="/credits"
                title={`${creditBalance} credits`}
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-lipstick text-white">
                  <Star
                    className="h-2.5 w-2.5"
                    fill="#ffffff"
                    stroke="#ffffff"
                    strokeWidth={2.4}
                  />
                </span>
                <span className="leading-none text-lipstick">{creditBalance}</span>
              </Link>
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
