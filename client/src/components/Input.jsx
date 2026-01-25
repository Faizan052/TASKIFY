import React from 'react'

/**
 * Reusable Input Component
 * @param {string} label - Input label
 * @param {string} error - Error message
 * @param {string} type - Input type
 * @param {string} className - Additional CSS classes
 */
export default function Input({ 
  label, 
  error, 
  type = 'text',
  className = '',
  ...props 
}) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input 
        type={type}
        className={`form-input ${error ? 'error' : ''} ${className}`.trim()}
        {...props}
      />
      {error && <div className="form-error">{error}</div>}
    </div>
  )
}
