"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";

type NavLink = { href: string; label: string };

type NavItem =
  | { type: "link"; href: string; label: string }
  | { type: "dropdown"; label: string; children: NavLink[] };

const outreachLinks: NavLink[] = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/candidates", label: "Candidates" },
  { href: "/approvals", label: "Approvals" },
];

const adminLinks: NavLink[] = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/pipelines", label: "Pipelines" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
];

function buildNav(isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    { type: "link", href: "/", label: "Dashboard" },
    { type: "dropdown", label: "Outreach", children: outreachLinks },
  ];
  if (isAdmin) {
    items.push({ type: "dropdown", label: "Admin", children: adminLinks });
  }
  return items;
}

export function NavBar() {
  const { user, logout, isAdmin } = useAuth();
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const navItems = buildNav(isAdmin);

  return (
    <nav ref={navRef} className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-6">
            <Link href="/" className="text-xl font-bold text-gray-900">
              C2C Recruiter
            </Link>
            {navItems.map((item) =>
              item.type === "link" ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "text-blue-600"
                      : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <DropdownMenu
                  key={item.label}
                  label={item.label}
                  children={item.children}
                  pathname={pathname}
                  isOpen={openMenu === item.label}
                  onToggle={() =>
                    setOpenMenu(openMenu === item.label ? null : item.label)
                  }
                  onNavigate={() => setOpenMenu(null)}
                />
              )
            )}
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900">
              {user.name}
            </Link>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function DropdownMenu({
  label,
  children,
  pathname,
  isOpen,
  onToggle,
  onNavigate,
}: {
  label: string;
  children: NavLink[];
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const isActive = children.some((child) => pathname.startsWith(child.href));

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1 text-sm font-medium transition-colors",
          isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-900"
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && (
        <div className="absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onNavigate}
              className={cn(
                "block px-4 py-2 text-sm hover:bg-gray-50",
                pathname.startsWith(child.href)
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700"
              )}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
