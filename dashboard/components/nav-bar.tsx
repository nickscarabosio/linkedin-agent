"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/candidates", label: "Candidates" },
  { href: "/approvals", label: "Approvals" },
];

const adminLinks = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/settings", label: "Settings" },
];

export function NavBar() {
  const { user, logout, isAdmin } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const allLinks = isAdmin ? [...navLinks, ...adminLinks] : navLinks;

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-6">
            <Link href="/" className="text-xl font-bold text-gray-900">
              C2C Recruiter
            </Link>
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                {link.label}
              </Link>
            ))}
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
