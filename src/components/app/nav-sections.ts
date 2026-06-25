import { BookOpen, Heart, Home, Utensils } from "lucide-react";

export const navSections = [
  {
    href: "/dashboard",
    labelKey: "dashboard",
    icon: Home,
    activePaths: ["/dashboard"],
  },
  {
    href: "/going-out",
    labelKey: "goingOut",
    icon: Utensils,
    activePaths: ["/going-out", "/events", "/credits", "/preferences"],
  },
  {
    href: "/collection",
    labelKey: "collection",
    icon: BookOpen,
    activePaths: ["/collection"],
  },
  {
    href: "/messages",
    labelKey: "messages",
    icon: Heart,
    activePaths: ["/messages"],
  },
] as const;

export const meActivePaths = [
  "/my-story",
] as const;

export function isPathInSection(
  pathname: string,
  activePaths: readonly string[],
) {
  const currentPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");

  return activePaths.some((activePath) => {
    return (
      currentPath === activePath || currentPath.startsWith(`${activePath}/`)
    );
  });
}
