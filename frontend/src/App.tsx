import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppDispatch } from './hooks/redux';
import { checkAuth } from './store/authSlice';

// Layout
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';

// Public Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import LeaderboardPage from './pages/LeaderboardPage';
import LearnPage from './pages/LearnPage';
import NotFoundPage from './pages/NotFoundPage';

// Protected Pages
import LobbyPage from './pages/LobbyPage';
import GameListPage from './pages/GameListPage';
import GamePage from './pages/GamePage';
import CreateGamePage from './pages/CreateGamePage';
import CommunityPage from './pages/CommunityPage';
import Profile from './pages/Profile';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';

// Existing Pages (Legacy)
import GameLobby from './pages/GameLobby';
import GameRoom from './pages/GameRoom';
import ComingSoon from './pages/ComingSoon';
import Dashboard from './pages/Dashboard';
import Play from './pages/Play';
import Maps from './pages/Maps';

function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(checkAuth());
  }, [dispatch]);

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
              <ComingSoon 
                title="Map Editor"
                description="Create custom maps with territories, continents, and special abilities. Draw boundaries, set adjacencies, and design your perfect battleground."
                icon="🗺️"
                features={[
                  "Interactive territory drawing",
                  "Continent management",
                  "Adjacency system",
                  "Custom map backgrounds",
                  "Territory special abilities",
                  "Map validation tools"
                ]}
              />
            </AuthGuard>
          } 
        />
        <Route 
          path="/editor/:mapId" 
          element={
            <AuthGuard>
              <ComingSoon 
                title="Map Editor"
                description="Edit and customize existing maps. Modify territories, adjust boundaries, and perfect your map designs."
                icon="✏️"
                features={[
                  "Edit existing maps",
                  "Modify territory boundaries",
                  "Update continent assignments",
                  "Adjust map settings",
                  "Version control",
                  "Collaboration tools"
                ]}
              />
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
              <ComingSoon 
                title="Map Editor"
                description="Create custom maps with territories, continents, and special abilities. Draw boundaries, set adjacencies, and design your perfect battleground."
                icon="🗺️"
                features={[
                  "Interactive territory drawing",
                  "Continent management",
                  "Adjacency system",
                  "Custom map backgrounds",
                  "Territory special abilities",
                  "Map validation tools"
                ]}
              />
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
  );
}

export default App;