import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { register, clearError } from '../store/authSlice'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const dispatch = useAppDispatch()
  const { isLoading, error, isAuthenticated } = useAppSelector((state) => state.auth)

  if (isAuthenticated) {
    return <Navigate to="/lobby" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(clearError())
    
    if (password !== confirmPassword) {
      return
    }
    
    dispatch(register({ username, email, password }))
  }

  return (
    <div className="max-w-md mx-auto bg-slate-900/90 backdrop-blur-sm rounded-xl p-8 shadow-2xl border border-slate-700">
      <h2 className="text-3xl font-bold mb-8 text-center gradient-text">Create Account</h2>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-400 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}
      
      {password !== confirmPassword && confirmPassword && (
        <div className="bg-red-500/10 border border-red-500 text-red-400 p-4 rounded-lg mb-6 text-sm">
          Passwords do not match
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="username" className="block text-sm font-medium mb-2 text-gray-200">
            Username
          </label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
            placeholder="Choose a username"
          />
        </div>
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2 text-gray-200">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
            placeholder="Enter your email"
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2 text-gray-200">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
            placeholder="Create a password"
          />
        </div>
        
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-gray-200">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
            placeholder="Confirm your password"
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading || password !== confirmPassword}
          className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-green-800 disabled:to-green-900 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed shadow-lg"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating account...
            </span>
          ) : (
            'Create Account'
          )}
        </button>
      </form>
      
      <div className="mt-6 text-center">
        <p className="text-gray-400 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium hover:underline transition-colors">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  )
}