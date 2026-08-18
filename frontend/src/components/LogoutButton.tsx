"use client";

import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <Button type="submit" variant="secondary" className={className}>
        Sair
      </Button>
    </form>
  );
}
