import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NavBar } from "@/components/nav-bar";
import { AuthGate } from "@/components/auth-gate";

export const metadata: Metadata = {
  title: "Hood Hero Recruiter",
  description: "Automated LinkedIn recruiting agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <Providers>
          <AuthGate>
            <NavBar />
            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
              {children}
            </main>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
