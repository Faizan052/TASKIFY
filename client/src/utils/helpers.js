// ============================================
// TASKIFY - Utility Helper Functions
// ============================================

// Date formatting helper
export const formatDate = (date, includeTime = false) => {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const dateStr = `${day}/${month}/${year}`
  if (!includeTime) return dateStr
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${dateStr} ${hours}:${minutes}`
}

const DAY_MS = 1000 * 60 * 60 * 24

export const getRemainingDays = (deadline) => {
  if (!deadline) return null
  const target = new Date(deadline)
  if (isNaN(target.getTime())) return null
  const diff = target.getTime() - Date.now()
  return Math.ceil(diff / DAY_MS)
}

export const formatRemainingDays = (deadline) => {
  const days = getRemainingDays(deadline)
  if (days === null) return '—'
  if (days < 0) {
    const overdue = Math.abs(days)
    return `Overdue by ${overdue} day${overdue === 1 ? '' : 's'}`
  }
  return `${days} day${days === 1 ? '' : 's'} remaining`
}

export const getSlackDays = (stageDeadline, projectDeadline) => {
  if (!stageDeadline || !projectDeadline) return null
  const stage = new Date(stageDeadline)
  const project = new Date(projectDeadline)
  if (isNaN(stage.getTime()) || isNaN(project.getTime())) return null
  const diff = project.getTime() - stage.getTime()
  return Math.ceil(diff / DAY_MS)
}

export const formatSlackDays = (stageDeadline, projectDeadline) => {
  const days = getSlackDays(stageDeadline, projectDeadline)
  if (days === null) return '—'
  if (days < 0) {
    const over = Math.abs(days)
    return `Exceeds project by ${over} day${over === 1 ? '' : 's'}`
  }
  return `${days} day${days === 1 ? '' : 's'} left`
}

// Role formatting helper
export const formatRole = (role) => {
  if (!role) return ''
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export const CATEGORY_OPTIONS = [
  { value: 'website', label: 'Website' },
  { value: 'mobile-app', label: 'Mobile App' },
  { value: 'desktop-app', label: 'Desktop App' },
  { value: 'testing', label: 'Testing' },
  { value: 'updation', label: 'Updation' },
  { value: 'design', label: 'Design' },
  { value: 'api', label: 'API' },
  { value: 'database', label: 'Database' },
  { value: 'other', label: 'Other' }
]

export const formatCategory = (category) => {
  if (!category) return 'Unassigned'
  const matched = CATEGORY_OPTIONS.find(item => item.value === category)
  if (matched) return matched.label
  return category.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export const formatCategories = (categories) => {
  if (!Array.isArray(categories) || categories.length === 0) return 'Unassigned'
  return categories.map((category) => formatCategory(category)).join(', ')
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
  'Client Requested': { label: 'Client Request', progress: 5, color: '#f59e0b' },
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
  'Cancelled': { label: 'Cancelled', progress: 0, color: '#94a3b8' },
  'Changes Requested': { label: 'Revisions Needed', progress: 40, color: '#ef4444' },
  'Delayed': { label: 'Delayed', progress: 30, color: '#f97316' }
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
