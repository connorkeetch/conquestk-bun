// Lazy load heavy components for code splitting
import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import ErrorBoundary from './components/ErrorBoundary'
import GameErrorBoundary from './components/GameErrorBoundary'
// Layout
import Layout from './components/Layout'
import VerificationGuard from './components/VerificationGuard'
import { useAppDispatch, useAppSelector } from './hooks/redux'
import { useFaviconBadge } from './hooks/useFaviconBadge'

const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const CreateGamePage = lazy(() => import('./pages/CreateGamePage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))

import ForgotPassword from './pages/ForgotPassword'

const GameListPage = lazy(() => import('./pages/GameListPage'))
const GamePage = lazy(() => import('./pages/GamePage'))
const GameRoom = lazy(() => import('./pages/GameRoom'))

// Public Pages
import Home from './pages/Home'

const LearnPage = lazy(() => import('./pages/LearnPage'))
// Protected Pages
const LobbyPage = lazy(() => import('./pages/LobbyPage'))

import Login from './pages/Login'

const MapEditor = lazy(() => import('./pages/MapEditor'))
const MapEditorTokens = lazy(() => import('./pages/MapEditorTokens'))
const Maps = lazy(() => import('./pages/Maps'))

import NotFoundPage from './pages/NotFoundPage'

const Play = lazy(() => import('./pages/Play'))
const ProfilePage = lazy(() => import('./components/ProfilePage'))

import ProfileRedirect from './components/ProfileRedirect'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'

const Settings = lazy(() => import('./pages/Settings'))
const Statistics = lazy(() => import('./pages/Statistics'))
const TutorialPage = lazy(() => import('./pages/TutorialPage'))

import VerifyEmail from './pages/VerifyEmail'
import VerifyEmailToken from './pages/VerifyEmailToken'

const AdminLayout = lazy(() => import('./components/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminMaps = lazy(() => import('./pages/AdminMaps'))
const AdminGames = lazy(() => import('./pages/AdminGames'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const AdminMapReview = lazy(() => import('./pages/AdminMapReview'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))

import { applyTheme, getStoredTheme } from './config/themes.config'
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
          <Route path="/leaderboard" element={<Navigate to="/community" replace />} />
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
                <Navigate to="/games/active" replace />
              </AuthGuard>
            }
          />
          <Route
            path="/games/:section"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <GameListPage />
                </Suspense>
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
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <MapEditor />
                </Suspense>
              </AuthGuard>
            }
          />
          <Route
            path="/editor/:mapId"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <MapEditor />
                </Suspense>
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
              path="settings"
              element={
                <Suspense
                  fallback={
                    <div className="p-6">
                      <div className="text-white">Loading...</div>
                    </div>
                  }
                >
                  <AdminSettings />
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
            path="/play"
            element={
              <AuthGuard>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <Play />
                </Suspense>
              </AuthGuard>
            }
          />
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
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      <div className="spinner"></div>
                    </div>
                  }
                >
                  <MapEditor />
                </Suspense>
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
