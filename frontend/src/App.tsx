import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
// Layout
import Layout from './components/Layout'
import { useAppDispatch } from './hooks/redux'
import CommunityPage from './pages/CommunityPage'
import CreateGamePage from './pages/CreateGamePage'
import Dashboard from './pages/Dashboard'
import ForgotPassword from './pages/ForgotPassword'
import GameListPage from './pages/GameListPage'
import GamePage from './pages/GamePage'
import GameRoom from './pages/GameRoom'
// Public Pages
import Home from './pages/Home'
import LeaderboardPage from './pages/LeaderboardPage'
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
import VerifyEmail from './pages/VerifyEmail'
import { checkAuth } from './store/authSlice'

function App() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(checkAuth())

    // Apply saved theme on app load
    const savedSettings = localStorage.getItem('userSettings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings.display?.theme) {
          document.documentElement.setAttribute('data-theme', settings.display.theme)
        }
      } catch (_error) {}
    }
  }, [dispatch])

  return (
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
          path="/leaderboard"
          element={
            <AuthGuard requireAuth={false}>
              <LeaderboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/leaderboard/:type"
          element={
            <AuthGuard requireAuth={false}>
              <LeaderboardPage />
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
              <LobbyPage />
            </AuthGuard>
          }
        />
        <Route
          path="/lobby/:section"
          element={
            <AuthGuard>
              <LobbyPage />
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
              <GamePage />
            </AuthGuard>
          }
        />
        <Route
          path="/game/:gameId/:section"
          element={
            <AuthGuard>
              <GamePage />
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
              <GameRoom />
            </AuthGuard>
          }
        />

        {/* Catch-all route for 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}

export default App
