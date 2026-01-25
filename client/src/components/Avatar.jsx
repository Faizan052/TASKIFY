import React from 'react'
import { getUserInitials } from '../utils/helpers'

/**
 * User Avatar Component
 * @param {string} name - User name
 * @param {string} photoUrl - Profile photo URL
 * @param {string} size - 'small', 'medium', or 'large'
 * @param {string} className - Additional CSS classes
 */
export default function Avatar({ name, photoUrl, size = 'medium', className = '' }) {
  const sizeClass = size === 'small' ? 'avatar-sm' : 
                   size === 'large' ? 'avatar-lg' : 'avatar-md'

  return (
    <div className={`avatar ${sizeClass} ${className}`.trim()}>
      {photoUrl ? (
        <img src={photoUrl} alt={name || 'User'} />
      ) : (
        <span>{getUserInitials(name)}</span>
      )}
    </div>
  )
}
