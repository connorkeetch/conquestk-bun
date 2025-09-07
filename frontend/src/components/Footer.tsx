import { Link } from 'react-router-dom'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="mt-auto border-t border-white/10 bg-black/50">
      <div className="container mx-auto px-4 py-6">
        {/* Updated layout: copyright left, links center, version right */}
        <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-white/60">
          {/* Copyright - Left aligned */}
          <div className="flex-1 text-left">
            © 2025 Conquest K. All rights reserved.
          </div>
          
          {/* Legal Links - Perfectly centered */}
          <nav className="flex gap-4 text-xs sm:text-sm justify-center">
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
          
          {/* Version - Right aligned */}
          <div className="flex-1 text-xs text-right">
            Beta v0.9.1
          </div>
        </div>
      </div>
    </footer>
  )
}