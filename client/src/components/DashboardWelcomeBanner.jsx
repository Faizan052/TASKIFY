import React, { useEffect, useMemo, useState } from 'react'
import { formatRole } from '../utils/helpers'

const ROLE_MESSAGES = {
  admin: [
    'Monitor operations, user health, and delivery flow in one place.',
    'Keep teams aligned and platform governance tight.',
    'Review system activity and resolve blockers quickly.'
  ],
  manager: [
    'Coordinate teams and keep delivery milestones on track.',
    'Prioritize reviews and move tasks smoothly across stages.',
    'Focus on execution quality and timeline confidence.'
  ],
  hr: [
    'Balance manager workload and keep assignments efficient.',
    'Ensure smooth handoffs from internal review to client delivery.',
    'Maintain pipeline quality across active requests.'
  ],
  client: [
    'Track request progress and stay informed at every milestone.',
    'Review outcomes and share feedback with confidence.',
    'Keep your delivery goals visible and actionable.'
  ],
  designer: [
    'Shape polished deliverables with clear design direction.',
    'Maintain visual consistency and user-first quality.',
    'Collaborate closely to move designs toward approval.'
  ],
  developer: [
    'Build robust solutions and keep quality high.',
    'Translate approved designs into reliable implementation.',
    'Ship stable outcomes with clear technical ownership.'
  ],
  tester: [
    'Validate quality, reliability, and release readiness.',
    'Catch issues early and protect delivery confidence.',
    'Drive final assurance before handoff.'
  ],
  default: [
    'Stay organized, focused, and delivery-ready today.'
  ]
}

const ROLE_ICONS = {
  admin: '👑',
  manager: '📊',
  hr: '👥',
  client: '🎯',
  designer: '🎨',
  developer: '💻',
  tester: '🔍',
  default: '✨'
}

const getGreeting = (hour) => {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardWelcomeBanner({ name, role }) {
  const normalizedRole = (role || 'default').toLowerCase()
  const roleLabel = formatRole(normalizedRole || 'user')
  const roleIcon = ROLE_ICONS[normalizedRole] || ROLE_ICONS.default
  const [now, setNow] = useState(() => new Date())
  const messages = useMemo(() => ROLE_MESSAGES[normalizedRole] || ROLE_MESSAGES.default, [normalizedRole])
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const clockId = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(clockId)
  }, [])

  useEffect(() => {
    const rotateId = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % messages.length)
    }, 5000)
    return () => clearInterval(rotateId)
  }, [messages.length])

  const greeting = getGreeting(now.getHours())
  const displayName = name || 'User'
  const currentMessage = messages[messageIndex] || messages[0]
  const digitalTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
  const period = now.toLocaleTimeString([], { hour: '2-digit', hour12: true }).slice(-2)
  const dateLabel = now.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })

  return (
    <div className={`welcome-widget role-${normalizedRole}`}>
      <div className="welcome-widget-gradient"></div>
      
      <div className="welcome-widget-left">
        <div className="welcome-icon-holder">
          <span className="welcome-emoji">{roleIcon}</span>
        </div>
        <div className="welcome-info">
          <div className="welcome-top-line">
            <h3 className="welcome-greeting-text">{greeting}, <strong>{displayName}</strong></h3>
            <span className="welcome-role-chip">
              <span className="pulse-indicator"></span>
              {roleLabel}
            </span>
          </div>
          <p className="welcome-insight">{currentMessage}</p>
        </div>
      </div>

      <div className="welcome-widget-right">
        <div className="welcome-time-chip">
          <span className="welcome-time-label">Local Time</span>
          <div className="welcome-time-main" aria-live="polite">
            <span className="welcome-time-digits">{digitalTime}</span>
            <span className="welcome-time-period">{period}</span>
          </div>
          <span className="welcome-time-date">{dateLabel}</span>
        </div>
      </div>
    </div>
  )
}
