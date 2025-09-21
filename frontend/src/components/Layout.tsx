import type { ReactNode } from 'react'
import Footer from './Footer'
import Header from './Header'

interface LayoutProps {
  children: ReactNode
}
export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 relative">
        {/* Keep page content responsible for its own background styling */}
        {children}
      </main>
      <Footer />
    </div>
  )
}
