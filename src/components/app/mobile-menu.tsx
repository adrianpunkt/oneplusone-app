"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { MemberNavIcon } from "@/components/app/member-nav-icon";
import { MessageHeartIcon } from "@/components/app/message-heart-icon";
import { isPathInSection, meActivePaths, navSections } from "@/components/app/nav-sections";
import { LanguageSwitcher } from "@/components/app/language-switcher";
import {
  SupportQuestionDialog,
  type SupportQuestionCopy,
} from "@/components/forms/support-question-dialog";
import { SignOutButton } from "@/components/app/sign-out-button";
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
  signOut: string;
};

export function MobileMenu({
  currentLocale,
  displayName,
  imageUrl,
  languageLabel,
  labels,
  messageTooltip,
  supportCopy,
  unreadCount,
}: {
  currentLocale: Locale;
  displayName: string;
  imageUrl: string;
  languageLabel: string;
  labels: NavLabels;
  messageTooltip?: string;
  supportCopy: SupportQuestionCopy;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(61);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const updateMenuTop = useCallback(() => {
    const headerBottom = triggerRef.current?.closest("header")?.getBoundingClientRect().bottom ?? 0;
    setMenuTop(headerBottom);
  }, []);

  function handleTriggerClick() {
    updateMenuTop();

    if (typeof menuRef.current?.togglePopover !== "function") {
      setOpen((current) => !current);
    }
  }

  const closeMenu = useCallback(() => {
    if (open && typeof menuRef.current?.hidePopover === "function") {
      menuRef.current.hidePopover();
    }
    setOpen(false);
  }, [open]);

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
  }, [closeMenu, open]);

  const menu = (
    <div
      aria-modal="true"
      className="fixed inset-x-0 z-[45] m-0 grid max-h-none max-w-none w-dvw grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-0 bg-white px-4 shadow-[0_18px_45px_rgba(68,10,18,0.10)] md:hidden"
      data-mobile-menu=""
      data-open={open}
      id="mobile-menu"
      onToggle={(event) => {
        setOpen(event.currentTarget.matches(":popover-open"));
      }}
      popover="auto"
      ref={menuRef}
      role="dialog"
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
      <div className="min-h-0 overflow-y-auto py-20">
        <div className="grid min-h-full place-items-center">
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
                    "flex min-h-16 items-center rounded-lg px-4 font-display text-2xl font-extrabold transition-colors hover:bg-lipstick-red/8 hover:text-lipstick-red",
                    isActive
                      ? "bg-lipstick-red/10 text-lipstick-red hover:bg-lipstick-red/10"
                      : "text-wine-burgundy",
                  )}
                  href={item.href}
                  key={item.href}
                  onClick={closeMenu}
                >
                  <span className="mx-auto flex w-48 items-center gap-3 text-left">
                    {isMessages ? (
                      <MessageHeartIcon
                        className={cn("h-10 w-10", unreadCount > 0 ? "text-lipstick-red" : "text-current")}
                        count={unreadCount}
                        iconClassName="h-8 w-8"
                      />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center">
                        <item.icon className="h-6 w-6" />
                      </span>
                    )}
                    <span>{label}</span>
                  </span>
                </Link>
              );
            })}
            <Link
              aria-current={isPathInSection(pathname, meActivePaths) ? "page" : undefined}
              className={cn(
                "flex min-h-16 items-center rounded-lg px-4 font-display text-2xl font-extrabold transition-colors hover:bg-lipstick-red/8 hover:text-lipstick-red",
                isPathInSection(pathname, meActivePaths)
                  ? "bg-lipstick-red/10 text-lipstick-red hover:bg-lipstick-red/10"
                  : "text-wine-burgundy",
              )}
              href="/my-story"
              onClick={closeMenu}
            >
              <span className="mx-auto flex w-48 items-center gap-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center">
                  <MemberNavIcon
                    className="h-7 w-7 text-xs"
                    displayName={displayName}
                    imageUrl={imageUrl}
                  />
                </span>
                <span>{labels.myStory}</span>
              </span>
            </Link>
          </nav>
        </div>
      </div>
      <div className="grid gap-5 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <SupportQuestionDialog copy={supportCopy} locale={currentLocale} />
        <div className="flex justify-center">
          <SignOutButton
            className="h-12 w-48 justify-center border-wine-burgundy/10 bg-white text-base font-black text-lipstick-red shadow-sm hover:translate-y-0 hover:bg-lipstick-red/8 hover:text-lipstick-red hover:shadow-sm"
            label={labels.signOut}
            size="lg"
            variant="secondary"
          />
        </div>
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
        onClick={handleTriggerClick}
        popoverTarget="mobile-menu"
        popoverTargetAction="toggle"
        ref={triggerRef}
        size="icon"
        type="button"
        variant="ghost"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {menu}
    </>
  );
}
