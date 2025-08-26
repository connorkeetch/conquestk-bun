import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import authService from '../services/authService';

const VerifyEmail: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    }
  }, [token]);

  const verifyEmail = async (verificationToken: string) => {
    try {
      const response = await authService.verifyEmail(verificationToken);
      setStatus('success');
      setMessage(response.message || 'Email verified successfully!');
      setEmail(response.email || '');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', { 
          state: { message: 'Email verified! You can now log in.' } 
        });
      }, 3000);
    } catch (error: any) {
      setStatus('error');
      const errorMessage = error.response?.data?.message || 'Verification failed';
      setMessage(errorMessage);
      setEmail(error.response?.data?.email || '');
    }
  };

  const handleResendVerification = async () => {
    if (!email) return;
    
    try {
      await authService.resendVerification(email);
      setMessage('Verification email sent! Please check your inbox.');
    } catch (error: any) {
      setMessage(error.response?.data?.message || 'Failed to resend verification email');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border border-gray-700">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Email Verification</h1>
        </div>

        {status === 'verifying' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Verifying your email...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-green-400 mb-2">Success!</h2>
            <p className="text-gray-300 mb-4">{message}</p>
            <p className="text-sm text-gray-400">Redirecting to login...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-red-400 mb-2">Verification Failed</h2>
            <p className="text-gray-300 mb-6">{message}</p>
            
            {message.includes('expired') && email && (
              <button
                onClick={handleResendVerification}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors mb-4"
              >
                Resend Verification Email
              </button>
            )}
            
            <div className="flex gap-4">
              <Link
                to="/login"
                className="flex-1 text-center bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Go to Login
              </Link>
              <Link
                to="/register"
                className="flex-1 text-center bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Register Again
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;