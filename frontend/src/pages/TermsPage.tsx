import { useEffect } from 'react'

export default function TermsPage() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-surface-1/50 rounded-xl p-8 border border-gray-800">
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-muted mb-8">Last Updated: December 28, 2024</p>

          <div className="prose prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted mb-2">
                By creating an account or using Conquest K ("the Game"), you agree to these terms.
                You must be at least 13 years old to play. If you're under 18, you need parental
                permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">2. Beta Version Notice</h2>
              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 mb-4">
                <p className="text-yellow-200">
                  ⚠️ This is a beta version. Features may change, game data may be reset, and service
                  may be interrupted without notice.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">3. Account Rules</h2>
              <ul className="list-disc list-inside text-muted space-y-1">
                <li>One account per person</li>
                <li>You're responsible for your account security</li>
                <li>Don't share or sell accounts</li>
                <li>Use accurate information</li>
                <li>We can suspend or ban accounts that violate rules</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">4. Gameplay Conduct</h2>
              <p className="text-muted mb-2">Don't:</p>
              <ul className="list-disc list-inside text-muted space-y-1">
                <li>Cheat, hack, or exploit bugs</li>
                <li>Use bots or automated gameplay</li>
                <li>Harass other players</li>
                <li>Impersonate others</li>
                <li>Attempt to access others' accounts</li>
              </ul>
              <p className="text-muted mt-2">
                Violations may result in warnings, temporary suspension, or permanent ban.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">5. Intellectual Property</h2>
              <p className="text-muted mb-2">
                The Game's code and original content are owned by Conquest K. Risk® is a trademark
                of Hasbro, Inc. We are not affiliated with or endorsed by Hasbro.
              </p>
              <p className="text-muted">
                By playing, you grant us a license to use your username and any content you create
                in the game.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">6. No Warranties</h2>
              <p className="text-muted">
                The Game is provided "as is" without any guarantees. We don't promise:
              </p>
              <ul className="list-disc list-inside text-muted space-y-1 mt-2">
                <li>The game will always be available</li>
                <li>It will be error-free</li>
                <li>Your data will be preserved</li>
                <li>Any specific features or timeline</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">
                7. Limitation of Liability
              </h2>
              <p className="text-muted">
                We're not responsible for any losses from using the Game. Since the Game is
                currently free, our maximum liability to you is $0.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">8. Changes to Terms</h2>
              <p className="text-muted">
                We may update these terms. Continued use means you accept the new terms. We'll try
                to notify you of major changes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">9. Termination</h2>
              <p className="text-muted">
                Either you or we can end this agreement anytime. You can delete your account, and we
                can terminate service or ban accounts.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-100 mb-3">10. Contact</h2>
              <p className="text-muted">
                Questions? Email us at{' '}
                <a
                  href="mailto:support@conquestk.com"
                  className="text-primary-soft hover:text-primary-soft"
                >
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
