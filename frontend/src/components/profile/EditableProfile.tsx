import React, { useState, useEffect } from 'react';
import { useAppSelector } from '../../hooks/redux';

interface ProfileData {
  username: string;
  email: string;
}

const EditableProfile: React.FC = () => {
  const user = useAppSelector(state => state.auth.user);
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    username: '',
    email: ''
  });
  const [editedProfile, setEditedProfile] = useState<ProfileData>({
    username: '',
    email: ''
  });
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProfile({
          username: data.username,
          email: data.email
        });
        setEditedProfile({
          username: data.username,
          email: data.email
        });
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  const checkUsernameAvailability = async (username: string) => {
    if (username === profile.username) {
      setUsernameAvailable(true);
      return;
    }

    if (username.length < 3) {
      setUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    try {
      const token = localStorage.getItem('authToken');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/users/check-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username })
      });
      
      const data = await response.json();
      setUsernameAvailable(data.available);
    } catch (error) {
      console.error('Failed to check username:', error);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value;
    setEditedProfile(prev => ({ ...prev, username: newUsername }));
    
    // Debounce username checking
    const timeoutId = setTimeout(() => {
      checkUsernameAvailability(newUsername);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    
    // Validate
    if (editedProfile.username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    
    if (!editedProfile.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError('Invalid email format');
      return;
    }
    
    if (usernameAvailable === false) {
      setError('Username is not available');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editedProfile)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setProfile(editedProfile);
        setIsEditing(false);
        setSuccess('Profile updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to update profile');
      }
    } catch (error) {
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setError(null);
    
    if (passwords.new !== passwords.confirm) {
      setError('New passwords do not match');
      return;
    }
    
    if (passwords.new.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/users/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess('Password changed successfully');
        setShowPasswordChange(false);
        setPasswords({ current: '', new: '', confirm: '' });
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (error) {
      setError('Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedProfile(profile);
    setIsEditing(false);
    setError(null);
    setUsernameAvailable(null);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-white mb-6">Account Settings</h2>
      
      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-500/20 border border-green-500 text-green-300 px-4 py-3 rounded-lg mb-4">
          {success}
        </div>
      )}

      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
        <div className="space-y-6">
          {/* Username Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                value={isEditing ? editedProfile.username : profile.username}
                onChange={handleUsernameChange}
                disabled={!isEditing}
                className={`w-full px-4 py-2 bg-gray-900/50 border rounded-lg text-white transition-all duration-200 ${
                  isEditing 
                    ? 'border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500' 
                    : 'border-gray-700 cursor-not-allowed opacity-75'
                }`}
              />
              {isEditing && editedProfile.username !== profile.username && (
                <div className="absolute right-3 top-2.5">
                  {checkingUsername ? (
                    <span className="text-gray-400">⏳</span>
                  ) : usernameAvailable === true ? (
                    <span className="text-green-400">✓</span>
                  ) : usernameAvailable === false ? (
                    <span className="text-red-400">✗</span>
                  ) : null}
                </div>
              )}
            </div>
            {isEditing && usernameAvailable === false && (
              <p className="text-red-400 text-sm mt-1">Username is already taken</p>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={isEditing ? editedProfile.email : profile.email}
              onChange={(e) => setEditedProfile(prev => ({ ...prev, email: e.target.value }))}
              disabled={!isEditing}
              className={`w-full px-4 py-2 bg-gray-900/50 border rounded-lg text-white transition-all duration-200 ${
                isEditing 
                  ? 'border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500' 
                  : 'border-gray-700 cursor-not-allowed opacity-75'
              }`}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4">
            {!isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
                >
                  Change Password
                </button>
              </>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || checkingUsername || usernameAvailable === false}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Password Change Section */}
        {showPasswordChange && !isEditing && (
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Change Password</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwords.current}
                  onChange={(e) => setPasswords(prev => ({ ...prev, current: e.target.value }))}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-blue-500 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwords.new}
                  onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-blue-500 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords(prev => ({ ...prev, confirm: e.target.value }))}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-blue-500 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPasswordChange(false);
                    setPasswords({ current: '', new: '', confirm: '' });
                    setError(null);
                  }}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordChange}
                  disabled={saving || !passwords.current || !passwords.new || !passwords.confirm}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200"
                >
                  {saving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableProfile;