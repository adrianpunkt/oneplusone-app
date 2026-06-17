import { Heart, Home, Utensils } from "lucide-react";

export const navSections = [
  {
    href: "/dashboard",
    label: "Welcome",
    icon: Home,
    activePaths: ["/dashboard"],
  },
  {
    href: "/going-out",
    label: "Going-out",
    icon: Utensils,
    activePaths: ["/going-out", "/events", "/credits", "/preferences"],
  },
  {
    href: "/messages",
    label: "Messages",
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
