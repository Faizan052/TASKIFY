import React, { useEffect, useState } from 'react'
import { apiFetch } from '../api'

/**
 * UserManagement Component
 * Allows admin to activate, deactivate, and delete users
 */
export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [actionLoading, setActionLoading] = useState({})

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch('/api/admin/user-management')
      setUsers(data)
    } catch (err) {
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleToggleStatus = async (userId, currentStatus) => {
    if (!window.confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this user?`)) {
      return
    }

    setActionLoading(prev => ({ ...prev, [userId]: 'toggle' }))
    setError(null)
    setMessage(null)

    try {
      const result = await apiFetch(`/api/admin/users/${userId}/toggle-status`, {
        method: 'PATCH'
      })
      setMessage(result.message)
      await loadUsers()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to update user status')
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: null }))
    }
  }

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${userName}"? This action cannot be undone and will remove all related data.`)) {
      return
    }

    const confirmText = window.prompt('Type "DELETE" to confirm deletion:')
    if (confirmText !== 'DELETE') {
      setError('Deletion cancelled. You must type "DELETE" exactly to confirm.')
      setTimeout(() => setError(null), 3000)
      return
    }

    setActionLoading(prev => ({ ...prev, [userId]: 'delete' }))
    setError(null)
    setMessage(null)

    try {
      const result = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      })
      setMessage(result.message)
      await loadUsers()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to delete user')
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: null }))
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatRole = (role) => {
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : '—'
  }

  if (loading) {
    return <div className="card">Loading users...</div>
  }

  return (
    <div className="dashboard-section">
      <h3>User Management</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '14px' }}>
        Manage user accounts, activate/deactivate access, and remove users from the system.
      </p>

      {message && (
        <div className="notice notice-success" style={{ marginBottom: '16px' }}>
          {message}
        </div>
      )}

      {error && (
        <div className="notice notice-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text-muted)' }}>No users found in the system.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="user-management-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user._id}>
                  <td style={{ fontWeight: '600' }}>{user.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                  <td>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background: 'rgba(102,126,234,0.1)',
                      color: '#667eea'
                    }}>
                      {formatRole(user.role)}
                    </span>
                  </td>
                  <td>
                    <span className={`user-status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                      <span>{user.isActive ? '✓' : '✕'}</span>
                      <span>{user.isActive ? 'Active' : 'Inactive'}</span>
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    {formatDate(user.createdAt)}
                  </td>
                  <td>
                    <div className="user-actions">
                      <button
                        className={`user-action-btn ${user.isActive ? 'deactivate' : 'activate'}`}
                        onClick={() => handleToggleStatus(user._id, user.isActive)}
                        disabled={actionLoading[user._id]}
                      >
                        {actionLoading[user._id] === 'toggle' ? (
                          'Processing...'
                        ) : (
                          <>
                            <span>{user.isActive ? '⏸' : '▶'}</span>
                            <span>{user.isActive ? 'Deactivate' : 'Activate'}</span>
                          </>
                        )}
                      </button>
                      <button
                        className="user-action-btn delete"
                        onClick={() => handleDelete(user._id, user.name)}
                        disabled={actionLoading[user._id]}
                      >
                        {actionLoading[user._id] === 'delete' ? (
                          'Deleting...'
                        ) : (
                          <>
                            <span>🗑</span>
                            <span>Delete</span>
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
