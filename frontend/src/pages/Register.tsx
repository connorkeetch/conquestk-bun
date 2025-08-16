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
    <div className="max-w-md mx-auto bg-gray-800 rounded-lg p-8">
      <h2 className="text-2xl font-bold mb-6 text-center">Register</h2>
      
      {error && (
        <div className="bg-red-600 text-white p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {password !== confirmPassword && confirmPassword && (
        <div className="bg-red-600 text-white p-3 rounded mb-4">
          Passwords do not match
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium mb-2">
            Username
          </label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
          />
        </div>
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
          />
        </div>
        
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading || password !== confirmPassword}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          {isLoading ? 'Creating account...' : 'Register'}
        </button>
      </form>
      
      <p className="mt-4 text-center text-gray-400">
        Already have an account?{' '}
        <Link to="/login" className="text-blue-400 hover:text-blue-300">
          Login here
        </Link>
      </p>
    </div>
  )
}