"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardList, PackageSearch, Users } from "lucide-react";
import type { ReactNode } from "react";

export function Shell({ children, locale }: { children: ReactNode; locale: string }) {
  const pathname = usePathname();
  const nav = [
    { href: `/${locale}`, label: "Stock", icon: Boxes },
    { href: `/${locale}/products`, label: "Products", icon: PackageSearch },
    { href: `/${locale}/reports`, label: "Reports", icon: ClipboardList },
    { href: `/${locale}/users`, label: "Users", icon: Users }
  ];
  const isActive = (href: string) => href === `/${locale}` ? pathname === href : pathname.startsWith(href);

  return (
    <main className="min-h-screen bg-mist lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden border-r border-zinc-200 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col px-4 py-5">
          <div className="mb-8">
            <p className="text-sm font-semibold text-leaf">SMTC Inventory</p>
            <h1 className="text-xl font-bold">Shop console</h1>
          </div>
          <nav className="grid gap-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition ${isActive(item.href) ? "bg-ink text-white" : "text-ink hover:bg-mist"}`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      <section className="mx-auto w-full max-w-md px-4 pb-24 pt-4 lg:max-w-7xl lg:px-8 lg:pb-8 lg:pt-6">{children}</section>
      <nav className="fixed bottom-0 left-1/2 grid w-full max-w-md -translate-x-1/2 grid-cols-4 border-t border-zinc-200 bg-white lg:hidden">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 px-2 py-3 text-xs ${isActive(item.href) ? "text-leaf" : "text-ink"}`}>
            <item.icon size={18} />
            {item.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
