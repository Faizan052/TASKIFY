import React from 'react'
import { useNavigate } from 'react-router-dom'
import { clearSession } from '../api'
import { getUserName } from '../utils/helpers'
import Avatar from './Avatar'
import Message from './Message'

/**
 * Dashboard Layout Component
 * Provides consistent layout structure for all dashboard pages
 * 
 * @param {string} title - Page title
 * @param {object} user - User/Admin object with name, email, profilePhoto
 * @param {React.ReactNode} children - Page content
 * @param {React.ReactNode} headerActions - Additional header buttons
 * @param {string} message - Success message to display
 * @param {string} error - Error message to display
 * @param {Function} onClearMessage - Callback to clear messages
 */
export default function DashboardLayout({ 
  title, 
  user, 
  children, 
  headerActions,
  message,
  error,
  onClearMessage
}) {
  const nav = useNavigate()

  const handleLogout = () => {
    clearSession()
    nav('/user/login')
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          {user && (
            <div className="dashboard-user-info">
              <Avatar 
                name={getUserName(user)} 
                photoUrl={user.profilePhoto}
                size="medium"
              />
              <div className="dashboard-user-details">
                <h2 className="dashboard-title">{title}</h2>
                <p className="dashboard-subtitle">Welcome back, {getUserName(user)}</p>
              </div>
            </div>
          )}
          {!user && <h2 className="dashboard-title">{title}</h2>}
        </div>
        
        <div className="dashboard-header-right">
          {headerActions}
          <button className="btn btn-outline" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Messages */}
      {message && (
        <Message type="success" onClose={onClearMessage}>
          {message}
        </Message>
      )}
      {error && (
        <Message type="error" onClose={onClearMessage}>
          {error}
        </Message>
      )}

      {/* Main Content */}
      <main className="dashboard-body">
        {children}
      </main>
    </div>
  )
}
