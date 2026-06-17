import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions/auth";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SignOutButton({
  className,
  label = "Sign out",
  size = "sm",
  variant = "ghost",
}: {
  className?: string;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  return (
    <form action={signOutAction}>
      <Button className={className} variant={variant} size={size}>
        <LogOut className="h-4 w-4" />
        {label}
      </Button>
    </form>
  );
}
