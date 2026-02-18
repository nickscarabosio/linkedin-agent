"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApprovalsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/candidates?filter=pending_approval");
  }, [router]);

  return (
    <div className="p-6 text-center text-gray-500">Redirecting...</div>
  );
}
