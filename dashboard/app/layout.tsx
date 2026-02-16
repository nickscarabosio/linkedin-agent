import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hood Hero Recruiter',
  description: 'Automated LinkedIn recruiting agent',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-gray-900">🎯 Hood Hero Recruiter</h1>
              </div>
              <div className="flex items-center space-x-4">
                <a href="/" className="text-gray-600 hover:text-gray-900">Dashboard</a>
                <a href="/campaigns" className="text-gray-600 hover:text-gray-900">Campaigns</a>
                <a href="/candidates" className="text-gray-600 hover:text-gray-900">Candidates</a>
                <a href="/approvals" className="text-gray-600 hover:text-gray-900">Approvals</a>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  )
}
