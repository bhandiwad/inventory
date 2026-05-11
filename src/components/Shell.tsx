"use client";

import Link from "next/link";
import { Boxes, ClipboardList, PackageSearch, Users } from "lucide-react";
import type { ReactNode } from "react";

export function Shell({ children, locale }: { children: ReactNode; locale: string }) {
  const nav = [
    { href: `/${locale}`, label: "Stock", icon: Boxes },
    { href: `/${locale}/products`, label: "Products", icon: PackageSearch },
    { href: `/${locale}/reports`, label: "Reports", icon: ClipboardList },
    { href: `/${locale}/users`, label: "Users", icon: Users }
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-mist">
      <section className="flex-1 px-4 pb-24 pt-4">{children}</section>
      <nav className="fixed bottom-0 left-1/2 grid w-full max-w-md -translate-x-1/2 grid-cols-4 border-t border-zinc-200 bg-white">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 px-2 py-3 text-xs text-ink">
            <item.icon size={18} />
            {item.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
