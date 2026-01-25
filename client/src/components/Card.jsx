import React from 'react'

/**
 * Reusable Card Component
 * @param {string} title - Card title
 * @param {React.ReactNode} children - Card content
 * @param {string} className - Additional CSS classes
 */
export default function Card({ title, children, className = '', ...props }) {
  return (
    <div className={`card ${className}`.trim()} {...props}>
      {title && <h3 className="card-title">{title}</h3>}
      <div className="card-body">
        {children}
      </div>
    </div>
  )
}
