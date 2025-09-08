import { Link } from 'react-router-dom'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="mt-auto border-t border-white/10 bg-black/50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Use justify-between like header for proper left/right alignment */}
        <div className="flex flex-col sm:flex-row items-center text-sm text-white/60">
          <div className="w-full flex items-center justify-between">
            {/* Copyright - Far left */}
            <div className="text-left">
              © 2025 Conquest K. All rights reserved.
            </div>
            
            {/* Version - Far right */}
            <div className="text-xs text-right">
              Beta v0.9.1
            </div>
          </div>
          
          {/* Legal Links - Centered below on mobile, between on desktop */}
          <nav className="flex gap-4 text-xs sm:text-sm justify-center mt-2 sm:mt-0 sm:absolute sm:left-1/2 sm:transform sm:-translate-x-1/2">
            <Link 
              to="/terms" 
              className="hover:text-white transition-colors"
            >
              Terms
            </Link>
            <span className="text-white/20">|</span>
            <Link 
              to="/privacy" 
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <span className="text-white/20">|</span>
            <a 
              href="mailto:support@conquestk.com" 
              className="hover:text-white transition-colors"
            >
              Contact
            </a>
          </nav>
        </div>
      </div>
    </footer>
  )
}