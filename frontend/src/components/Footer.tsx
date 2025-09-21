import { Link } from 'react-router-dom'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-muted">
          <div className="text-center sm:text-left">
            © {currentYear} Conquest K. All rights reserved.
          </div>

          <nav className="flex gap-3 text-xs">
            <Link to="/terms" className="footer-link">
              Terms
            </Link>
            <span className="text-muted">|</span>
            <Link to="/privacy" className="footer-link">
              Privacy
            </Link>
            <span className="text-muted">|</span>
            <a href="mailto:support@conquestk.com" className="footer-link">
              Contact
            </a>
          </nav>

          <div className="text-xs">Beta v0.9.1</div>
        </div>
      </div>
    </footer>
  )
}
