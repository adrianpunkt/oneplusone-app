import { Home, MessageCircle, Utensils } from "lucide-react";

export const navSections = [
  {
    href: "/dashboard",
    label: "Home",
    icon: Home,
    activePaths: ["/dashboard"],
  },
  {
    href: "/going-out",
    label: "Going out",
    icon: Utensils,
    activePaths: ["/going-out", "/events", "/credits", "/preferences"],
  },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageCircle,
    activePaths: ["/messages"],
  },
] as const;

export const meActivePaths = ["/me", "/profile", "/settings"] as const;

export function isPathInSection(pathname: string, activePaths: readonly string[]) {
  const currentPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");

  return activePaths.some((activePath) => {
    return currentPath === activePath || currentPath.startsWith(`${activePath}/`);
  });
}
