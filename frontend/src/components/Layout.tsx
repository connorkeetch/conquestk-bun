import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Footer from './Footer'
import Header from './Header'

interface LayoutProps {
  children: ReactNode
}
export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const isGameRoom = location.pathname.startsWith('/room/')
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 relative">
        {/* Keep page content responsible for its own background styling */}
        {children}
      </main>
      {!isGameRoom && <Footer />}
    </div>
  )
}
