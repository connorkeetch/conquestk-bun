import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'

export default function Home() {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold mb-8">Welcome to Risk Game</h1>
      <p className="text-xl text-gray-300 mb-8">
        A multiplayer strategy board game where you conquer the world!
      </p>
      
      {isAuthenticated ? (
        <div className="space-y-4">
          <Link
            to="/lobby"
            className="block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors max-w-md mx-auto"
          >
            Enter Game Lobby
          </Link>
          <Link
            to="/map-editor"
            className="block bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors max-w-md mx-auto"
          >
            Map Editor
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-400">Please login or register to start playing</p>
          <div className="space-x-4">
            <Link
              to="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Register
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}