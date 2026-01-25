import React from 'react'

/**
 * Message/Alert Component
 * @param {string} type - 'success', 'error', 'info', or 'warning'
 * @param {React.ReactNode} children - Message content
 * @param {Function} onClose - Close handler (optional)
 */
export default function Message({ type = 'info', children, onClose, className = '' }) {
  if (!children) return null

  const typeClass = type === 'success' ? 'notice-success' :
                   type === 'error' ? 'notice-error' :
                   type === 'warning' ? 'notice-warning' : 'notice-info'

  return (
    <div className={`notice ${typeClass} ${className}`.trim()}>
      <span>{children}</span>
      {onClose && (
        <button 
          onClick={onClose} 
          className="notice-close"
          aria-label="Close"
        >
          ×
        </button>
      )}
    </div>
  )
}
