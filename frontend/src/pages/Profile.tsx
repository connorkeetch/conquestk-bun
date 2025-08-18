import React from 'react';
import ProfileOverview from '../components/profile/ProfileOverview';
import '../components/profile/ProfileOverview.css';

const Profile: React.FC = () => {
  return (
    <div className="profile-page">
      <ProfileOverview />
    </div>
  );
};

export default Profile;