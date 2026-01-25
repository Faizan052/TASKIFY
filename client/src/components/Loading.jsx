import React from 'react'

/**
 * Loading Spinner Component
 * Displays a loading indicator
 */
export default function Loading({ message = 'Loading...' }) {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p className="loading-message">{message}</p>
    </div>
  )
}
