import { Link } from 'react-router-dom'
import { CORE_COLORS } from '../constants/colors'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="footer">
      <div className="w-full container-padding py-6">
        {/* Use justify-between like header for proper left/right alignment */}
        <div className="flex flex-col sm:flex-row items-center text-body-sm text-muted">
          <div className="w-full flex items-center justify-between">
            {/* Copyright - Far left */}
            <div className="text-left">
              © 2025 Conquest K. All rights reserved.
            </div>
            
            {/* Version - Far right */}
            <div className="text-right">
              Beta v0.9.1
            </div>
          </div>
          
          {/* Legal Links - Centered below on mobile, between on desktop */}
          <nav className="flex gap-4 text-xs sm:text-sm justify-center mt-2 sm:mt-0 sm:absolute sm:left-1/2 sm:transform sm:-translate-x-1/2">
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
        </div>
      </div>
    </footer>
  )
}