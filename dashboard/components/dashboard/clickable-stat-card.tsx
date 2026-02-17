"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface ClickableStatCardProps {
  label: string;
  value: string | number;
  color: "blue" | "green" | "yellow" | "purple";
  href: string;
}

const colorStyles = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  yellow: "bg-yellow-50 text-yellow-600",
  purple: "bg-purple-50 text-purple-600",
} as const;

export function ClickableStatCard({ label, value, color, href }: ClickableStatCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative rounded-lg p-4 transition-all duration-150 hover:shadow-md hover:scale-[1.02]",
        colorStyles[color]
      )}
    >
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </Link>
  );
}
