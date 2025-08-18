import React from 'react';
import UserStats from '../components/profile/UserStats';
import '../components/profile/UserStats.css';

const Statistics: React.FC = () => {
  return (
    <div className="statistics-page">
      <UserStats />
    </div>
  );
};

export default Statistics;