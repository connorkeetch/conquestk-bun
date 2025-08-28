import { Link } from 'react-router-dom'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="mt-auto border-t border-white/10 bg-black/50">
      <div className="container mx-auto px-4 py-6">
        {/* Simple two-row layout */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-white/60">
          {/* Copyright */}
          <div className="text-center sm:text-left">
            © {currentYear} Conquest K. All rights reserved.
            <div className="text-xs mt-1">
              Not affiliated with Hasbro or Risk®
            </div>
          </div>
          
          {/* Legal Links */}
          <nav className="flex gap-4 text-xs sm:text-sm">
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
          
          {/* Version */}
          <div className="text-xs">
            Beta v0.9.1
          </div>
        </div>
      </div>
    </footer>
  )
}