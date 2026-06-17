import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions/auth";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SignOutButton({
  className,
  size = "sm",
}: {
  className?: string;
  size?: ButtonProps["size"];
}) {
  return (
    <form action={signOutAction}>
      <Button className={className} variant="ghost" size={size}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </form>
  );
}
