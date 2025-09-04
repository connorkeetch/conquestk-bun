import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import ErrorBoundary from './components/ErrorBoundary'
import GameErrorBoundary from './components/GameErrorBoundary'
import VerificationGuard from './components/VerificationGuard'
// Layout
import Layout from './components/Layout'
import { useAppDispatch, useAppSelector } from './hooks/redux'
import { useFaviconBadge } from './hooks/useFaviconBadge'
import CommunityPage from './pages/CommunityPage'
import CreateGamePage from './pages/CreateGamePage'
import Dashboard from './pages/Dashboard'
import ForgotPassword from './pages/ForgotPassword'
import GameListPage from './pages/GameListPage'
import GamePage from './pages/GamePage'
import GameRoom from './pages/GameRoom'
// Public Pages
import Home from './pages/Home'
import LearnPage from './pages/LearnPage'
// Protected Pages
import LobbyPage from './pages/LobbyPage'
import Login from './pages/Login'
import MapEditor from './pages/MapEditor'
import MapEditorTokens from './pages/MapEditorTokens'
import Maps from './pages/Maps'
import NotFoundPage from './pages/NotFoundPage'
import Play from './pages/Play'
import Profile from './pages/Profile'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Settings from './pages/Settings'
import Statistics from './pages/Statistics'
import TutorialPage from './pages/TutorialPage'
import VerifyEmail from './pages/VerifyEmail'
import VerifyEmailToken from './pages/VerifyEmailToken'
import AdminPage from './pages/AdminPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import { checkAuth } from './store/authSlice'

function App() {
  console.log('[APP] App component rendering...')
  const dispatch = useAppDispatch()
  const { isLoading, token } = useAppSelector((state) => state.auth)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  
  // Initialize favicon badge service
  useFaviconBadge()

  useEffect(() => {
    console.log('[APP] App useEffect running...')
    
    const initAuth = async () => {
      const token = localStorage.getItem('token')
      console.log('[APP] Token exists:', !!token)
      
      if (token) {
        console.log('[APP] Dispatching checkAuth...')
        await dispatch(checkAuth())
      }
      
      setInitialCheckDone(true)
    }
    
    initAuth()

    // Apply saved theme on app load
    const savedSettings = localStorage.getItem('userSettings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings.display?.theme) {
          document.documentElement.setAttribute('data-theme', settings.display.theme)
        }
      } catch (_error) {
        // Silently ignore theme loading errors
      }
    }
  }, [dispatch])

  // Show loading screen while initial auth check is happening
  if (!initialCheckDone && (isLoading || token)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900/20 to-black">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <div className="text-white text-lg">Connecting...</div>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary level="app">
      <Layout>
        <Routes>
        {/* Public Routes */}
        <Route
          path="/"
          element={
            <AuthGuard requireAuth={false}>
              <Home />
            </AuthGuard>
          }
        />
        <Route
          path="/login"
          element={
            <AuthGuard requireAuth={false}>
              <Login />
            </AuthGuard>
          }
        />
        <Route
          path="/register"
          element={
            <AuthGuard requireAuth={false}>
              <Register />
            </AuthGuard>
          }
        />
        <Route
          path="/verify-email/:token"
          element={
            <AuthGuard requireAuth={false}>
              <VerifyEmailToken />
            </AuthGuard>
          }
        />
        <Route
          path="/verify-email"
          element={
            <AuthGuard requireAuth={true}>
              <VerifyEmail />
            </AuthGuard>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AuthGuard requireAuth={false}>
              <ForgotPassword />
            </AuthGuard>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <AuthGuard requireAuth={false}>
              <ResetPassword />
            </AuthGuard>
          }
        />
        <Route
          path="/community"
          element={
            <AuthGuard requireAuth={false}>
              <CommunityPage />
            </AuthGuard>
          }
        />
        <Route
          path="/leaderboard"
          element={<Navigate to="/community" replace />}
        />
        <Route
          path="/tutorial"
          element={
            <AuthGuard requireAuth={false}>
              <TutorialPage />
            </AuthGuard>
          }
        />
        <Route
          path="/terms"
          element={
            <AuthGuard requireAuth={false}>
              <TermsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/privacy"
          element={
            <AuthGuard requireAuth={false}>
              <PrivacyPage />
            </AuthGuard>
          }
        />
        <Route
          path="/learn"
          element={
            <AuthGuard requireAuth={false}>
              <LearnPage />
            </AuthGuard>
          }
        />
        <Route
          path="/learn/:section"
          element={
            <AuthGuard requireAuth={false}>
              <LearnPage />
            </AuthGuard>
          }
        />

        {/* Profile Routes (Public but with user-specific content) */}
        <Route
          path="/profile/:userId"
          element={
            <AuthGuard requireAuth={false}>
              <Profile />
            </AuthGuard>
          }
        />
        <Route
          path="/profile/:userId/:section"
          element={
            <AuthGuard requireAuth={false}>
              <Profile />
            </AuthGuard>
          }
        />

        {/* Protected Routes - Main App Flow */}
        <Route
          path="/lobby"
          element={
            <AuthGuard>
              <VerificationGuard>
                <LobbyPage />
              </VerificationGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/lobby/:section"
          element={
            <AuthGuard>
              <VerificationGuard>
                <LobbyPage />
              </VerificationGuard>
            </AuthGuard>
          }
        />

        {/* Games Management */}
        <Route
          path="/games"
          element={
            <AuthGuard>
              <Navigate to="/games/active" replace />
            </AuthGuard>
          }
        />
        <Route
          path="/games/:section"
          element={
            <AuthGuard>
              <GameListPage />
            </AuthGuard>
          }
        />

        {/* Individual Game (Full-screen) */}
        <Route
          path="/game/:gameId"
          element={
            <AuthGuard>
              <GameErrorBoundary>
                <GamePage />
              </GameErrorBoundary>
            </AuthGuard>
          }
        />
        <Route
          path="/game/:gameId/:section"
          element={
            <AuthGuard>
              <GameErrorBoundary>
                <GamePage />
              </GameErrorBoundary>
            </AuthGuard>
          }
        />

        {/* Game Creation */}
        <Route
          path="/create"
          element={
            <AuthGuard>
              <CreateGamePage />
            </AuthGuard>
          }
        />
        <Route
          path="/create/:type"
          element={
            <AuthGuard>
              <CreateGamePage />
            </AuthGuard>
          }
        />

        {/* Map Editor */}
        <Route
          path="/editor"
          element={
            <AuthGuard>
              <Navigate to="/editor/new" replace />
            </AuthGuard>
          }
        />
        <Route
          path="/editor/new"
          element={
            <AuthGuard>
              <MapEditor />
            </AuthGuard>
          }
        />
        <Route
          path="/editor/:mapId"
          element={
            <AuthGuard>
              <MapEditor />
            </AuthGuard>
          }
        />
        <Route
          path="/editor/browse"
          element={
            <AuthGuard>
              <Maps />
            </AuthGuard>
          }
        />

        {/* Community */}
        <Route
          path="/community"
          element={
            <AuthGuard>
              <CommunityPage />
            </AuthGuard>
          }
        />
        <Route
          path="/community/:section"
          element={
            <AuthGuard>
              <CommunityPage />
            </AuthGuard>
          }
        />

        {/* User Profile & Stats (when authenticated) */}
        <Route
          path="/profile"
          element={
            <AuthGuard>
              <Profile />
            </AuthGuard>
          }
        />
        <Route
          path="/profile/stats"
          element={
            <AuthGuard>
              <Statistics />
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <Settings />
            </AuthGuard>
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <AuthGuard requireAdmin={true}>
              <AdminPage />
            </AuthGuard>
          }
        />

        {/* Legacy Routes - Backward Compatibility */}
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <Dashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/play"
          element={
            <AuthGuard>
              <Play />
            </AuthGuard>
          }
        />
        <Route
          path="/maps"
          element={
            <AuthGuard>
              <Maps />
            </AuthGuard>
          }
        />
        <Route
          path="/map-editor"
          element={
            <AuthGuard>
              <MapEditorTokens />
            </AuthGuard>
          }
        />
        <Route
          path="/map-editor-polygon"
          element={
            <AuthGuard>
              <MapEditor />
            </AuthGuard>
          }
        />
        <Route
          path="/room/:roomId"
          element={
            <AuthGuard>
              <GameErrorBoundary>
                <GameRoom />
              </GameErrorBoundary>
            </AuthGuard>
          }
        />

        {/* Catch-all route for 404 */}
        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}

export default App
