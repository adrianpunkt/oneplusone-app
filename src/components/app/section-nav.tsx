"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MemberNavIcon } from "@/components/app/member-nav-icon";
import { MessageHeartIcon } from "@/components/app/message-heart-icon";
import { isPathInSection, meActivePaths, navSections } from "@/components/app/nav-sections";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavLabels = {
  dashboard: string;
  goingOut: string;
  messages: string;
  myStory: string;
};

export function SectionNav({
  displayName,
  imageUrl,
  labels,
  messageTooltip,
  unreadCount,
}: {
  displayName: string;
  imageUrl: string;
  labels: NavLabels;
  messageTooltip?: string;
  unreadCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {navSections.map((item) => {
        const isActive = isPathInSection(pathname, item.activePaths);
        const isMessages = item.href === "/messages";
        const label = labels[item.labelKey];
        const itemMessageTooltip = isMessages && unreadCount > 0 ? messageTooltip : undefined;

        return (
          <Button
            asChild
            className={cn(
              "justify-center whitespace-nowrap hover:translate-y-0 hover:shadow-none",
              isActive
                ? "bg-lipstick-red/10 text-lipstick-red hover:bg-lipstick-red/10"
                : "text-wine-burgundy",
            )}
            key={item.href}
            variant="ghost"
          >
            <Link
              aria-current={isActive ? "page" : undefined}
              aria-label={itemMessageTooltip ? `${label}. ${itemMessageTooltip}` : undefined}
              href={item.href}
            >
              <span className="flex w-36 items-center gap-2 text-left">
                {isMessages ? (
                  <MessageHeartIcon
                    className={cn("h-6 w-6", unreadCount > 0 ? "text-lipstick-red" : "text-current")}
                    count={unreadCount}
                    iconClassName="h-6 w-6"
                    tooltip={itemMessageTooltip}
                  />
                ) : (
                  <span className="grid h-6 w-6 shrink-0 place-items-center">
                    <item.icon className="h-4 w-4" />
                  </span>
                )}
                <span>{label}</span>
              </span>
            </Link>
          </Button>
        );
      })}
      <Button
        asChild
        className={cn(
          "justify-center whitespace-nowrap hover:translate-y-0 hover:shadow-none",
          isPathInSection(pathname, meActivePaths)
            ? "bg-lipstick-red/10 text-lipstick-red hover:bg-lipstick-red/10"
            : "text-wine-burgundy",
        )}
        variant="ghost"
      >
        <Link
          aria-current={isPathInSection(pathname, meActivePaths) ? "page" : undefined}
          href="/my-story"
        >
          <span className="flex w-36 items-center gap-2 text-left">
            <span className="grid h-6 w-6 shrink-0 place-items-center">
              <MemberNavIcon
                className="h-5 w-5"
                displayName={displayName}
                imageUrl={imageUrl}
              />
            </span>
            <span>{labels.myStory}</span>
          </span>
        </Link>
      </Button>
    </nav>
  );
}
