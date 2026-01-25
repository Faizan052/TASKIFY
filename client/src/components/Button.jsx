import React from 'react'

/**
 * Reusable Button Component
 * @param {string} variant - 'primary', 'secondary', 'outline', or 'danger'
 * @param {boolean} loading - Show loading state
 * @param {boolean} disabled - Disable button
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} children - Button content
 */
export default function Button({ 
  variant = 'primary', 
  loading = false, 
  disabled = false,
  className = '',
  children,
  ...props 
}) {
  const baseClass = 'btn'
  const variantClass = variant === 'primary' ? 'btn-primary' : 
                      variant === 'secondary' ? 'btn-secondary' :
                      variant === 'outline' ? 'btn-outline' :
                      variant === 'danger' ? 'btn-danger' : ''
  
  const classes = [baseClass, variantClass, className].filter(Boolean).join(' ')

  return (
    <button 
      className={classes} 
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}
