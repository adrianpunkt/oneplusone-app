"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MemberNavIcon } from "@/components/app/member-nav-icon";
import { isPathInSection, meActivePaths, navSections } from "@/components/app/nav-sections";
import { Badge } from "@/components/ui/badge";
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
            <Link aria-current={isActive ? "page" : undefined} href={item.href}>
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.href === "/messages" && unreadCount > 0 ? (
                <Badge className="ml-auto px-2 py-0.5">{unreadCount}</Badge>
              ) : null}
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
          href="/me"
        >
          <MemberNavIcon className="h-4 w-4" displayName={displayName} imageUrl={imageUrl} />
          Me
        </Link>
      </Button>
    </nav>
  );
}
