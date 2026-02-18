"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getApiClient } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Approval } from "@/lib/types";

type NavLink = { href: string; label: string };

type NavItem =
  | { type: "link"; href: string; label: string }
  | { type: "dropdown"; label: string; children: NavLink[] };

const campaignsLinks: NavLink[] = [
  { href: "/campaigns", label: "All Campaigns" },
  { href: "/admin/templates", label: "Snippets" },
  { href: "/admin/pipelines", label: "Pipelines" },
];

const adminLinks: NavLink[] = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
];

function buildNav(isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    { type: "link", href: "/", label: "Dashboard" },
    { type: "link", href: "/candidates", label: "Candidates" },
    { type: "dropdown", label: "Campaigns", children: campaignsLinks },
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
  const api = getApiClient();

  const { data: pendingApprovals } = useQuery<Approval[]>({
    queryKey: ["approvals-pending"],
    queryFn: () => api.get("/api/approvals", { params: { status: "pending" } }).then((r) => r.data),
    enabled: !!user,
  });

  const pendingCount = pendingApprovals?.length ?? 0;

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
                    "text-sm font-medium transition-colors inline-flex items-center",
                    pathname === item.href
                      ? "text-blue-600"
                      : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  {item.label}
                  {item.href === "/candidates" && pendingCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-500 text-white text-xs font-bold px-1.5">
                      {pendingCount}
                    </span>
                  )}
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
