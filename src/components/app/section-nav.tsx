"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MemberNavIcon } from "@/components/app/member-nav-icon";
import { MessageHeartIcon, messageNotificationTooltip } from "@/components/app/message-heart-icon";
import { isPathInSection, meActivePaths, navSections } from "@/components/app/nav-sections";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SectionNav({
  displayName,
  imageUrl,
  unreadCount,
}: {
  displayName: string;
  imageUrl: string;
  unreadCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {navSections.map((item) => {
        const isActive = isPathInSection(pathname, item.activePaths);
        const isMessages = item.href === "/messages";
        const messageTooltip =
          isMessages && unreadCount > 0 ? messageNotificationTooltip(unreadCount) : undefined;

        return (
          <Button
            asChild
            className={cn(
              "justify-start hover:translate-y-0 hover:shadow-none",
              isActive
                ? "bg-lipstick/10 text-lipstick hover:bg-lipstick/10"
                : "text-wine",
            )}
            key={item.href}
            variant="ghost"
          >
            <Link
              aria-current={isActive ? "page" : undefined}
              aria-label={messageTooltip ? `${item.label}. ${messageTooltip}` : undefined}
              href={item.href}
            >
              {isMessages ? (
                <MessageHeartIcon
                  className={cn("h-6 w-6", unreadCount > 0 ? "text-lipstick" : "text-current")}
                  count={unreadCount}
                  iconClassName="h-6 w-6"
                  tooltip={messageTooltip}
                />
              ) : (
                <span className="grid h-6 w-6 shrink-0 place-items-center">
                  <item.icon className="h-4 w-4" />
                </span>
              )}
              {item.label}
            </Link>
          </Button>
        );
      })}
      <Button
        asChild
        className={cn(
          "justify-start hover:translate-y-0 hover:shadow-none",
          isPathInSection(pathname, meActivePaths)
            ? "bg-lipstick/10 text-lipstick hover:bg-lipstick/10"
            : "text-wine",
        )}
        variant="ghost"
      >
        <Link
          aria-current={isPathInSection(pathname, meActivePaths) ? "page" : undefined}
          href="/my-story"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center">
            <MemberNavIcon
              className="h-5 w-5"
              displayName={displayName}
              imageUrl={imageUrl}
            />
          </span>
          My Story
        </Link>
      </Button>
    </nav>
  );
}
