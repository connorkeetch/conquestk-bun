import { Link } from 'react-router-dom'
import { CORE_COLORS } from '../constants/colors'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="footer">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted">
          <div className="text-center sm:text-left">
            <div>© 2025 Conquest K. All rights reserved.</div>
            <div className="text-xs mt-1">Not affiliated with Hasbro or Risk®</div>
          </div>
          
          <nav className="flex gap-4 text-xs sm:text-sm">
            <Link 
              to="/terms" 
              className="footer-link"
            >
              Terms
            </Link>
            <span className="text-muted">|</span>
            <Link 
              to="/privacy" 
              className="footer-link"
            >
              Privacy
            </Link>
            <span className="text-muted">|</span>
            <a 
              href="mailto:support@conquestk.com" 
              className="footer-link"
            >
              Contact
            </a>
          </nav>
          
          <div className="text-xs">Beta v0.9.1</div>
        </div>
      </div>
    </footer>
  )
}