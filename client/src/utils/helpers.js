// ============================================
// TASKIFY - Utility Helper Functions
// ============================================

// Date formatting helper
export const formatDate = (date, includeTime = false) => {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return includeTime ? d.toLocaleString() : d.toLocaleDateString()
}

// Role formatting helper
export const formatRole = (role) => {
  if (!role) return ''
  return role.charAt(0).toUpperCase() + role.slice(1)
}

// File size formatting helper
export const formatFileSize = (bytes) => {
  if (typeof bytes !== 'number' || isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Extract user name from user object
export const getUserName = (user) => {
  if (!user) return '—'
  if (typeof user === 'string') return user
  return user.name || user.username || user.email || '—'
}

// Get user initials for avatar
export const getUserInitials = (name) => {
  if (!name) return 'U'
  return name.trim().charAt(0).toUpperCase()
}

// Resolve asset URL
export const resolveAssetUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return path.startsWith('/') ? path : `/${path}`
}

// Validate email format
export const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email?.trim())
}

// Task status stages with progress info
export const TASK_STAGES = {
  'Awaiting Manager Assignment': { label: 'Pending Assignment', progress: 10, color: '#f59e0b' },
  'Design In Progress': { label: 'Design Phase', progress: 25, color: '#3b82f6' },
  'Design Completed - Pending Manager Review': { label: 'Design Review', progress: 35, color: '#8b5cf6' },
  'Development In Progress': { label: 'Development Phase', progress: 50, color: '#10b981' },
  'Development Completed - Pending Manager Review': { label: 'Dev Review', progress: 65, color: '#8b5cf6' },
  'Testing In Progress': { label: 'Testing Phase', progress: 75, color: '#06b6d4' },
  'Testing Completed - Pending Manager Final Review': { label: 'Final Review', progress: 85, color: '#8b5cf6' },
  'Awaiting HR Review': { label: 'HR Review', progress: 90, color: '#f59e0b' },
  'Awaiting Client Review': { label: 'Client Review', progress: 95, color: '#ec4899' },
  'Completed': { label: 'Completed', progress: 100, color: '#22c55e' },
  'Changes Requested': { label: 'Revisions Needed', progress: 40, color: '#ef4444' }
}

export const getTaskStage = (status) => {
  return TASK_STAGES[status] || { label: status, progress: 0, color: '#6b7280' }
}

// Password strength checker
export const checkPasswordStrength = (password) => {
  if (!password) return null
  
  let strength = 0
  if (password.length >= 8) strength++
  if (password.length >= 12) strength++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
  if (/[0-9]/.test(password)) strength++
  if (/[^a-zA-Z0-9]/.test(password)) strength++

  if (strength <= 2) return 'weak'
  if (strength <= 3) return 'medium'
  return 'strong'
}

// Password validation requirements
export const PASSWORD_REQUIREMENTS = [
  { label: 'At least 8 characters', test: (pwd) => pwd.length >= 8 },
  { label: 'Contains uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
  { label: 'Contains lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
  { label: 'Contains a number', test: (pwd) => /[0-9]/.test(pwd) }
]

export const getPasswordRequirements = (password) => {
  return PASSWORD_REQUIREMENTS.map(req => ({
    label: req.label,
    met: req.test(password)
  }))
}
