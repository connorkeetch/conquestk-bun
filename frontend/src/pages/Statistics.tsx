import type React from 'react'
import UserStats from '../components/profile/UserStats'
// TODO: Migrate UserStats.css to use CSS variables

const Statistics: React.FC = () => {
  return (
    <div className="statistics-page">
      <UserStats />
    </div>
  )
}

export default Statistics
