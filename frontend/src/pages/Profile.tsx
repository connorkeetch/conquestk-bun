import React, { useState } from 'react';
import ProfileOverview from '../components/profile/ProfileOverview';
import EditableProfile from '../components/profile/EditableProfile';
import '../components/profile/ProfileOverview.css';

const Profile: React.FC = () => {
  return (
    <div className="profile-page">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ProfileOverview />
      </div>
    </div>
  );
};

export default Profile;