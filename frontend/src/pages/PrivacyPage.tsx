import { useEffect } from 'react'

export default function PrivacyPage() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-surface-1/50 rounded-xl p-8 border border-gray-800">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted mb-8">Last Updated: December 28, 2024</p>
          
          <div className="prose prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">1. Information We Collect</h2>
              <p className="text-muted mb-2">When you play Conquest K, we collect:</p>
              <ul className="list-disc list-inside text-muted space-y-1">
                <li><strong>Account Info:</strong> Username, email, hashed password</li>
                <li><strong>Game Data:</strong> Stats, match history, game settings</li>
                <li><strong>Technical Info:</strong> IP address, browser type (for security)</li>
                <li><strong>Cookies:</strong> Session cookies to keep you logged in</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">2. How We Use Your Information</h2>
              <p className="text-muted">We use your data to:</p>
              <ul className="list-disc list-inside text-muted space-y-1 mt-2">
                <li>Provide the game service</li>
                <li>Save your game progress</li>
                <li>Show your stats and rankings</li>
                <li>Prevent cheating and abuse</li>
                <li>Send game notifications (if you opt in)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">3. Data Sharing</h2>
              <p className="text-muted mb-2">
                <strong>We do NOT sell your personal data.</strong>
              </p>
              <p className="text-muted mb-2">We may share data with:</p>
              <ul className="list-disc list-inside text-muted space-y-1">
                <li><strong>Railway:</strong> Our hosting provider</li>
                <li><strong>Other players:</strong> Only your username and game stats</li>
                <li><strong>Law enforcement:</strong> If legally required</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">4. Cookies</h2>
              <p className="text-muted">We use cookies for:</p>
              <ul className="list-disc list-inside text-muted space-y-1 mt-2">
                <li>Keeping you logged in</li>
                <li>Remembering your game preferences</li>
                <li>Security and fraud prevention</li>
              </ul>
              <p className="text-muted mt-2">
                You can disable cookies in your browser, but the game might not work properly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">5. Data Security</h2>
              <p className="text-muted">We protect your data with:</p>
              <ul className="list-disc list-inside text-muted space-y-1 mt-2">
                <li>Encrypted passwords (bcrypt)</li>
                <li>HTTPS connections</li>
                <li>Secure hosting on Railway</li>
              </ul>
              <p className="text-muted mt-2">
                However, no system is 100% secure. Use a unique password for your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">6. Your Rights</h2>
              <p className="text-muted">You can:</p>
              <ul className="list-disc list-inside text-muted space-y-1 mt-2">
                <li>Access your data (in your profile)</li>
                <li>Update your information</li>
                <li>Delete your account</li>
                <li>Request data export (email us)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">7. Children's Privacy</h2>
              <p className="text-muted">
                Users must be 13+ to play. We don't knowingly collect data from children under 13. 
                If you're a parent and believe your child under 13 has created an account, contact us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">8. Data Retention</h2>
              <p className="text-muted">
                We keep your data as long as your account is active. 
                When you delete your account, we remove your personal info within 30 days. 
                Some data may be kept anonymized for statistics.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">9. International Users</h2>
              <p className="text-muted">
                The game is hosted in the United States. 
                By playing, you agree to data transfer to the US.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">10. Changes to Privacy Policy</h2>
              <p className="text-muted">
                We may update this policy. We'll notify you of major changes via email or in-game notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">11. Contact Us</h2>
              <p className="text-muted">
                Privacy questions? Email{' '}
                <a href="mailto:privacy@conquestk.com" className="text-primary-soft hover:text-primary-soft">
                  privacy@conquestk.com
                </a>
              </p>
              <p className="text-muted mt-2">
                For general support:{' '}
                <a href="mailto:support@conquestk.com" className="text-primary-soft hover:text-primary-soft">
                  support@conquestk.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}