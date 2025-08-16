import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppDispatch } from './hooks/redux'
import { checkAuth } from './store/authSlice'
import Layout from './components/Layout'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import GameLobby from './pages/GameLobby'
import GameRoom from './pages/GameRoom'
import MapEditor from './pages/MapEditor'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(checkAuth())
  }, [dispatch])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route 
          path="/lobby" 
          element={
            <ProtectedRoute>
              <GameLobby />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/room/:roomId" 
          element={
            <ProtectedRoute>
              <GameRoom />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/map-editor" 
          element={
            <ProtectedRoute>
              <MapEditor />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Layout>
  )
}

export default App