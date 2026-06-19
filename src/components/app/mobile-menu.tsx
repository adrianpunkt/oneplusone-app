"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MemberNavIcon } from "@/components/app/member-nav-icon";
import { MessageHeartIcon } from "@/components/app/message-heart-icon";
import { isPathInSection, meActivePaths, navSections } from "@/components/app/nav-sections";
import { LanguageSwitcher } from "@/components/app/language-switcher";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

type NavLabels = {
  closeMenu: string;
  dashboard: string;
  goingOut: string;
  messages: string;
  myStory: string;
  openMenu: string;
};

export function MobileMenu({
  currentLocale,
  displayName,
  imageUrl,
  languageLabel,
  labels,
  messageTooltip,
  unreadCount,
}: {
  currentLocale: Locale;
  displayName: string;
  imageUrl: string;
  languageLabel: string;
  labels: NavLabels;
  messageTooltip?: string;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const updateMenuTop = useCallback(() => {
    const headerBottom = triggerRef.current?.closest("header")?.getBoundingClientRect().bottom ?? 0;
    setMenuTop(headerBottom);
  }, []);

  function openMenu() {
    updateMenuTop();
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    updateMenuTop();
    window.addEventListener("resize", updateMenuTop);
    window.visualViewport?.addEventListener("resize", updateMenuTop);
    return () => {
      window.removeEventListener("resize", updateMenuTop);
      window.visualViewport?.removeEventListener("resize", updateMenuTop);
    };
  }, [open, updateMenuTop]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const menu = (
    <div
      className="fixed inset-x-0 z-[45] grid w-dvw overflow-hidden bg-white px-4 shadow-[0_18px_45px_rgba(68,10,18,0.10)] md:hidden"
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      style={{ height: `calc(100dvh - ${menuTop}px)`, top: menuTop }}
    >
      <LanguageSwitcher
        activeClassName="bg-lipstick-red text-white"
        ariaLabel={languageLabel}
        buttonClassName="h-9 min-w-12 rounded-md text-sm"
        className="absolute right-5 top-5 h-10 rounded-lg border-wine-burgundy/10 bg-white shadow-sm"
        currentLocale={currentLocale}
        inactiveClassName="text-wine-burgundy hover:bg-lipstick-red/8 hover:text-lipstick-red"
      />
      <div className="grid h-full place-items-center pb-20">
        <nav className="grid w-full max-w-sm gap-3">
          {navSections.map((item) => {
            const isActive = isPathInSection(pathname, item.activePaths);
            const isMessages = item.href === "/messages";
            const label = labels[item.labelKey];
            const itemMessageTooltip = isMessages && unreadCount > 0 ? messageTooltip : undefined;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                aria-label={itemMessageTooltip ? `${label}. ${itemMessageTooltip}` : undefined}
                className={cn(
                  "flex min-h-16 items-center justify-center gap-3 rounded-lg px-4 font-display text-2xl font-extrabold transition-colors hover:bg-lipstick-red/8 hover:text-lipstick-red",
                  isActive
                    ? "bg-lipstick-red/10 text-lipstick-red hover:bg-lipstick-red/10"
                    : "text-wine-burgundy",
                )}
                href={item.href}
                key={item.href}
                onClick={closeMenu}
              >
                {isMessages ? (
                  <MessageHeartIcon
                    className={cn("h-8 w-8", unreadCount > 0 ? "text-lipstick-red" : "text-current")}
                    count={unreadCount}
                    iconClassName="h-8 w-8"
                  />
                ) : (
                  <item.icon className="h-6 w-6 shrink-0" />
                )}
                <span>{label}</span>
              </Link>
            );
          })}
          <Link
            aria-current={isPathInSection(pathname, meActivePaths) ? "page" : undefined}
            className={cn(
              "flex min-h-16 items-center justify-center gap-3 rounded-lg px-4 font-display text-2xl font-extrabold transition-colors hover:bg-lipstick-red/8 hover:text-lipstick-red",
              isPathInSection(pathname, meActivePaths)
                ? "bg-lipstick-red/10 text-lipstick-red hover:bg-lipstick-red/10"
                : "text-wine-burgundy",
            )}
            href="/my-story"
            onClick={closeMenu}
          >
            <MemberNavIcon
              className="h-7 w-7 shrink-0 text-xs"
              displayName={displayName}
              imageUrl={imageUrl}
            />
            <span>{labels.myStory}</span>
          </Link>
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <Button
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label={open ? labels.closeMenu : labels.openMenu}
        className="hover:translate-y-0 hover:shadow-none"
        onClick={open ? closeMenu : openMenu}
        ref={triggerRef}
        size="icon"
        type="button"
        variant="ghost"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {open ? createPortal(menu, document.body) : null}
    </>
  );
}
