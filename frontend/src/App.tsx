// Lazy load heavy components for code splitting
import { Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import ErrorBoundary from './components/ErrorBoundary'
import GameErrorBoundary from './components/GameErrorBoundary'
// Layout
import Layout from './components/Layout'
import VerificationGuard from './components/VerificationGuard'
import { useAppDispatch, useAppSelector } from './hooks/redux'
import { useFaviconBadge } from './hooks/useFaviconBadge'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { isTokenExpired } from './utils/token'

const CommunityPage = lazyWithRetry(() => import('./pages/CommunityPage'))
const CreateGamePage = lazyWithRetry(() => import('./pages/CreateGamePage'))
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'))
const FriendsPage = lazyWithRetry(() => import('./pages/FriendsPage'))

// const ClanDirectoryPage = lazyWithRetry(() => import('./pages/ClanDirectoryPage'))
const ClanDetailPage = lazyWithRetry(() => import('./pages/ClanDetailPage'))

import ForgotPassword from './pages/ForgotPassword'

const GamePage = lazyWithRetry(() => import('./pages/GamePage'))
const GameRoom = lazyWithRetry(() => import('./pages/GameRoom'))

// Public Pages
import Home from './pages/Home'

const LearnPage = lazyWithRetry(() => import('./pages/LearnPage'))
// Protected Pages
const LobbyPage = lazyWithRetry(() => import('./pages/LobbyPage'))

import Login from './pages/Login'

const MapEditor = lazyWithRetry(() => import('./pages/MapEditor'))
const MapEditorTokens = lazyWithRetry(() => import('./pages/MapEditorTokens'))
const Maps = lazyWithRetry(() => import('./pages/Maps'))

import NotFoundPage from './pages/NotFoundPage'

const PlayModePage = lazyWithRetry(() => import('./pages/PlayModePage'))
const ProfilePage = lazyWithRetry(() => import('./components/ProfilePage'))

import ProfileRedirect from './components/ProfileRedirect'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'

const Settings = lazyWithRetry(() => import('./pages/Settings'))
const Statistics = lazyWithRetry(() => import('./pages/Statistics'))
const TutorialPage = lazyWithRetry(() => import('./pages/TutorialPage'))
const ComingSoon = lazyWithRetry(() => import('./pages/ComingSoon'))

import VerifyEmail from './pages/VerifyEmail'
import VerifyEmailToken from './pages/VerifyEmailToken'

const AdminLayout = lazyWithRetry(() => import('./components/AdminLayout'))
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'))
const AdminUsers = lazyWithRetry(() => import('./pages/AdminUsers'))
const AdminContent = lazyWithRetry(() => import('./pages/AdminContent'))
const AdminMaps = lazyWithRetry(() => import('./pages/AdminMaps'))
const AdminGames = lazyWithRetry(() => import('./pages/AdminGames'))
const AdminMapReview = lazyWithRetry(() => import('./pages/AdminMapReview'))
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'))
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'))

import { applyTheme, getStoredTheme } from './config/themes.config'
import { FEATURE_FLAGS } from './constants/featureFlags'
import { useFeatureFlag } from './hooks/useFeatureFlag'
import { checkAuth } from './store/authSlice'

const SuspenseFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="spinner"></div>
  </div>
)

const AiComingSoonRoute = () => {
  // AI preview is now available to everyone
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <ComingSoon
        title="AI Opponents"
        description="Sharpen your tactics against adaptive bots. We're teaching them the art of conquest and will roll this out soon."
        icon="🤖"
        features={[
          'Multiple difficulty tiers',
          'Scenario-based training modes',
          'Achievements for solo victories',
        ]}
      />
    </Suspense>
  )
}

const PolygonEditorRoute = () => {
  const polygonEditorEnabled = useFeatureFlag(FEATURE_FLAGS.MAP_POLYGON_EDITOR)

  if (!polygonEditorEnabled) {
    return <Navigate to="/map-editor" replace />
  }

  return (
    <Suspense fallback={<SuspenseFallback />}>
      <MapEditor />
    </Suspense>
  )
}

function App() {
  const dispatch = useAppDispatch()
  const { isLoading, token } = useAppSelector((state) => state.auth)
  const [initialCheckDone, setInitialCheckDone] = useState(false)

  // Initialize favicon badge service
  useFaviconBadge()

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token')

      if (token) {
        if (isTokenExpired(token, 30)) {
          localStorage.removeItem('token')
        } else {
          await dispatch(checkAuth())
        }
      }

      setInitialCheckDone(true)
    }

    initAuth()

    // Apply saved theme on app load using centralized system
    const savedTheme = getStoredTheme()
    applyTheme(savedTheme)
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
              <AuthGuard requireAuth={true} allowUnverified={true}>
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
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <CommunityPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/community/:section"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <CommunityPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/community/friends"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <FriendsPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route path="/clans" element={<Navigate to="/community/clans" replace />} />
          <Route
            path="/clans/:slug"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <ClanDetailPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/community/clans/:slug"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <ClanDetailPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route path="/leaderboard" element={<Navigate to="/community/leaderboards" replace />} />
          <Route
            path="/tutorial"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <TutorialPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/terms"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <TermsPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/privacy"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <PrivacyPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/learn"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <LearnPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/learn/:section"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <LearnPage />
                </Suspense>
              </AuthGuard>
            }
          />

          {/* Profile Routes - Username-based */}
          <Route
            path="/profile/:username"
            element={
              <AuthGuard requireAuth={false}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <ProfilePage />
                </Suspense>
              </AuthGuard>
            }
          />

          {/* Protected Routes - Main App Flow */}
          <Route
            path="/lobby"
            element={
              <AuthGuard>
                <VerificationGuard>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        <div className="spinner"></div>
                      </div>
                    }
                  >
                    <LobbyPage />
                  </Suspense>
                </VerificationGuard>
              </AuthGuard>
            }
          />
          <Route
            path="/lobby/:section"
            element={
              <AuthGuard>
                <VerificationGuard>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        <div className="spinner"></div>
                      </div>
                    }
                  >
                    <LobbyPage />
                  </Suspense>
                </VerificationGuard>
              </AuthGuard>
            }
          />

          {/* Games Management */}
          <Route
            path="/games"
            element={
              <AuthGuard>
                <Navigate to="/lobby/my-games" replace />
              </AuthGuard>
            }
          />
          <Route
            path="/games/:section"
            element={
              <AuthGuard>
                <Navigate to="/lobby/my-games" replace />
              </AuthGuard>
            }
          />

          {/* Individual Game (Full-screen) */}
          <Route
            path="/game/:gameId"
            element={
              <AuthGuard>
                <GameErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        <div className="spinner"></div>
                      </div>
                    }
                  >
                    <GamePage />
                  </Suspense>
                </GameErrorBoundary>
              </AuthGuard>
            }
          />
          <Route
            path="/game/:gameId/:section"
            element={
              <AuthGuard>
                <GameErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        <div className="spinner"></div>
                      </div>
                    }
                  >
                    <GamePage />
                  </Suspense>
                </GameErrorBoundary>
              </AuthGuard>
            }
          />

          {/* Game Creation */}
          <Route
            path="/create"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <CreateGamePage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/create/:type"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <CreateGamePage />
                </Suspense>
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
                <PolygonEditorRoute />
              </AuthGuard>
            }
          />
          <Route
            path="/editor/:mapId"
            element={
              <AuthGuard>
                <PolygonEditorRoute />
              </AuthGuard>
            }
          />
          <Route
            path="/editor/browse"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <Maps />
                </Suspense>
              </AuthGuard>
            }
          />

          {/* Community */}
          <Route
            path="/community"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <CommunityPage />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/community/:section"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <CommunityPage />
                </Suspense>
              </AuthGuard>
            }
          />

          {/* User Profile & Stats (when authenticated) */}
          <Route
            path="/profile"
            element={
              <AuthGuard>
                <ProfileRedirect />
              </AuthGuard>
            }
          />
          <Route
            path="/profile/stats"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <Statistics />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/settings"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <Settings />
                </Suspense>
              </AuthGuard>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AuthGuard requireAdmin={true}>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <AdminLayout />
                </Suspense>
              </AuthGuard>
            }
          >
            <Route
              index
              element={
                <Suspense
                  fallback={
                    <div className="p-6">
                      <div className="text-white">Loading...</div>
                    </div>
                  }
                >
                  <AdminDashboard />
                </Suspense>
              }
            />
            <Route
              path="users"
              element={
                <Suspense
                  fallback={
                    <div className="p-6">
                      <div className="text-white">Loading...</div>
                    </div>
                  }
                >
                  <AdminUsers />
                </Suspense>
              }
            />
            <Route
              path="content"
              element={
                <Suspense
                  fallback={
                    <div className="p-6">
                      <div className="text-white">Loading...</div>
                    </div>
                  }
                >
                  <AdminContent />
                </Suspense>
              }
            />
            <Route
              path="maps"
              element={
                <Suspense
                  fallback={
                    <div className="p-6">
                      <div className="text-white">Loading...</div>
                    </div>
                  }
                >
                  <AdminMaps />
                </Suspense>
              }
            />
            <Route
              path="games"
              element={
                <Suspense
                  fallback={
                    <div className="p-6">
                      <div className="text-white">Loading...</div>
                    </div>
                  }
                >
                  <AdminGames />
                </Suspense>
              }
            />
            <Route
              path="map-review/:reviewId"
              element={
                <Suspense
                  fallback={
                    <div className="p-6">
                      <div className="text-white">Loading...</div>
                    </div>
                  }
                >
                  <AdminMapReview />
                </Suspense>
              }
            />
          </Route>

          {/* Legacy Routes - Backward Compatibility */}
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <Dashboard />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/play/casual"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <PlayModePage mode="casual" />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/play/ranked"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <PlayModePage mode="ranked" />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/play/ai"
            element={
              <AuthGuard>
                <AiComingSoonRoute />
              </AuthGuard>
            }
          />
          <Route path="/play" element={<Navigate to="/lobby" replace />} />
          <Route
            path="/maps"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <Maps />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/map-editor"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <MapEditorTokens />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/map-editor-polygon"
            element={
              <AuthGuard>
                <PolygonEditorRoute />
              </AuthGuard>
            }
          />
          <Route
            path="/room/:roomId"
            element={
              <AuthGuard>
                <GameErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        <div className="spinner"></div>
                      </div>
                    }
                  >
                    <GameRoom />
                  </Suspense>
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
