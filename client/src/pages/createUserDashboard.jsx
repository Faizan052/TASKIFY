import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession, resolveAssetUrl, uploadWithProgress } from '../api'
import { useUserWorkspace } from '../hooks/useUserWorkspace'
import ProfileSettings from '../components/ProfileSettings'
import ChatMessages from '../components/ChatMessages'

const STATUS = {
	CLIENT_REQUESTED: 'Client Requested',
	AWAITING_MANAGER_ASSIGNMENT: 'Awaiting Manager Assignment',
	DESIGN_IN_PROGRESS: 'Design In Progress',
	DESIGN_SUBMITTED: 'Design Completed - Pending Manager Review',
	DEVELOPMENT_IN_PROGRESS: 'Development In Progress',
	DEVELOPMENT_SUBMITTED: 'Development Completed - Pending Manager Review',
	TESTING_IN_PROGRESS: 'Testing In Progress',
	TESTING_SUBMITTED: 'Testing Completed - Pending Manager Final Review',
	AWAITING_HR_REVIEW: 'Awaiting HR Review',
	AWAITING_CLIENT_REVIEW: 'Awaiting Client Review',
	CHANGES_REQUESTED: 'Changes Requested',
	COMPLETED: 'Completed'
}

const STAGE_KEY_BY_ROLE = {
	designer: 'designer',
	developer: 'developer',
	tester: 'tester'
}

const STAGE_LABEL_BY_KEY = {
	designer: 'Designer',
	developer: 'Developer',
	tester: 'Tester'
}

const ATTACHMENT_STAGE_LABEL = {
	'client-request': 'Client Request',
	design: 'Design',
	development: 'Development',
	testing: 'Testing',
	manager: 'Manager',
	hr: 'HR',
	'client-feedback': 'Client Feedback'
}

const NOTIFICATION_REFRESH_MS = 60000

const toId = (value) => {
	if (!value) return ''
	if (typeof value === 'string') return value
	if (typeof value === 'object' && value !== null) {
		return value._id || value.id || value.value || ''
	}
	return ''
}

const formatRole = (role) => (role ? role.charAt(0).toUpperCase() + role.slice(1) : '')

const formatPerson = (value) => {
	if (!value) return '—'
	if (typeof value === 'string') return 'Assigned'
	if (typeof value === 'object') {
		return value.name || value.username || value.email || '—'
	}
	return '—'
}

const formatSize = (size) => {
	if (typeof size !== 'number' || Number.isNaN(size)) return ''
	if (size < 1024) return `${size} B`
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
	return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const formatSpeed = (bytesPerSecond) => {
	if (typeof bytesPerSecond !== 'number' || Number.isNaN(bytesPerSecond) || !Number.isFinite(bytesPerSecond)) {
		return ''
	}
	if (bytesPerSecond <= 0) return ''
	return `${formatSize(bytesPerSecond)}/s`
}

const stageStatusLabel = (value) => {
	switch (value) {
		case 'pending':
			return 'Pending'
		case 'in_progress':
			return 'In progress'
		case 'submitted':
			return 'Submitted'
		case 'approved':
			return 'Approved'
		case 'revisions':
			return 'Needs revisions'
		default:
			return value || 'Pending'
	}
}

export const createUserDashboard = ({ heading, role, allowTaskRequest = false }) => {
	return function UserDashboard() {
		const nav = useNavigate()
		const {
			profile,
			tasks,
			loading,
			error,
			setError,
			refresh,
			setTasks
		} = useUserWorkspace()

		const [message, setMessage] = useState('')
		const [uploadingTaskId, setUploadingTaskId] = useState('')
		const [actingTaskId, setActingTaskId] = useState('')
		const [uploadProgress, setUploadProgress] = useState({})
		const [notifications, setNotifications] = useState([])
		const [notificationsLoading, setNotificationsLoading] = useState(true)
		const [showNotifications, setShowNotifications] = useState(false)
		const [unreadMessages, setUnreadMessages] = useState(0)

		const taskList = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks])
		const effectiveRole = role || (profile ? profile.role : '')
		const assignmentKey = STAGE_KEY_BY_ROLE[effectiveRole] || null
		const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])
	const getTaskStatusStage = (status) => {
		const stages = {
			'Awaiting Manager Assignment': { stage: 'Pending Assignment', progress: 10, color: '#f59e0b' },
			'Design In Progress': { stage: 'Design Phase', progress: 25, color: '#3b82f6' },
			'Design Completed - Pending Manager Review': { stage: 'Design Review', progress: 35, color: '#8b5cf6' },
			'Development In Progress': { stage: 'Development Phase', progress: 50, color: '#10b981' },
			'Development Completed - Pending Manager Review': { stage: 'Dev Review', progress: 65, color: '#8b5cf6' },
			'Testing In Progress': { stage: 'Testing Phase', progress: 75, color: '#06b6d4' },
			'Testing Completed - Pending Manager Final Review': { stage: 'Final Review', progress: 85, color: '#8b5cf6' },
			'Awaiting HR Review': { stage: 'HR Review', progress: 90, color: '#f59e0b' },
			'Awaiting Client Review': { stage: 'Client Review', progress: 95, color: '#ec4899' },
			'Completed': { stage: 'Completed', progress: 100, color: '#22c55e' },
			'Changes Requested': { stage: 'Revisions Needed', progress: 40, color: '#ef4444' }
		}
		return stages[status] || { stage: status, progress: 0, color: '#6b7280' }
	}
		const formatDate = useCallback((value, withTime = false) => {
			if (!value) return '—'
			const date = new Date(value)
			if (Number.isNaN(date.getTime())) return '—'
			return withTime ? date.toLocaleString() : date.toLocaleDateString()
		}, [])

		const loadNotifications = useCallback(async () => {
			try {
				setNotificationsLoading(true)
				const data = await apiFetch('/api/user/notifications?limit=50')
				setNotifications(Array.isArray(data) ? data : [])
			} catch (err) {
				setError(err.message)
			} finally {
				setNotificationsLoading(false)
			}
		}, [setError])

		useEffect(() => {
			loadNotifications()
			const id = setInterval(() => {
				loadNotifications()
			}, NOTIFICATION_REFRESH_MS)
			return () => clearInterval(id)
		}, [loadNotifications])

		useEffect(() => {
			const loadUnreadCount = async () => {
				try {
					const data = await apiFetch('/api/messages/unread-count')
					setUnreadMessages(data.count || 0)
				} catch (err) {
					// Silent fail
				}
			}
			loadUnreadCount()
			const id = setInterval(loadUnreadCount, 10000) // Check every 10 seconds
			return () => clearInterval(id)
		}, [])

		const logout = useCallback(() => {
			clearSession()
			nav('/user/login')
		}, [nav])

		const goProfile = useCallback(() => {
			nav('/profile')
		}, [nav])

		const goSubmitRequest = useCallback(() => {
			nav('/request/new')
		}, [nav])

		const assignmentBelongsToUser = useCallback((assignment) => {
			if (!profile) return false
			const assignedId = toId(assignment && assignment.user)
			return assignedId && assignedId === profile._id
		}, [profile])

		const getAssignment = useCallback((task) => {
			if (!assignmentKey) return null
			if (!task || !task.stageAssignments) return null
			return task.stageAssignments[assignmentKey] || null
		}, [assignmentKey])

		const updateTask = useCallback((updatedTask) => {
			setTasks((prev) => {
				const list = Array.isArray(prev) ? prev : []
				return list.map((task) => (task._id === updatedTask._id ? updatedTask : task))
			})
		}, [setTasks])

		const handleUpload = useCallback(async (taskId, file) => {
			if (!file) {
				setError('Choose a file before uploading')
				return
			}
			setMessage('')
			setError(null)
			setUploadingTaskId(taskId)
			const startedAt = Date.now()
			setUploadProgress(prev => ({
				...prev,
				[taskId]: {
					percent: 0,
					loaded: 0,
					total: file.size || 0,
					speed: 0
				}
			}))
			try {
				const formData = new FormData()
				formData.append('file', file)
				const data = await uploadWithProgress(`/api/user/tasks/${taskId}/attachments`, {
					body: formData,
					onProgress: (event) => {
						if (!event || !event.lengthComputable) return
						const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
						const percent = Math.min(100, Math.round((event.loaded / event.total) * 100))
						setUploadProgress(prev => ({
							...prev,
							[taskId]: {
								percent,
								loaded: event.loaded,
								total: event.total,
								speed: event.loaded / elapsedSeconds
							}
						}))
					}
				})
				if (data && data.task) {
					updateTask(data.task)
					setMessage('File uploaded successfully')
				} else {
					await refresh()
					setMessage('Upload finished')
				}
			} catch (err) {
				setError(err.message)
			} finally {
				setUploadProgress(prev => {
					const next = { ...prev }
					delete next[taskId]
					return next
				})
				setUploadingTaskId('')
			}
		}, [refresh, setError, updateTask])

		const handleClientAction = useCallback(async (taskId, action) => {
			const payload = { action }
			if (action === 'request-changes') {
				const comment = window.prompt('Describe the requested changes')
				if (!comment || !comment.trim()) return
				payload.comment = comment.trim()
			}
			setMessage('')
			setError(null)
			setActingTaskId(taskId)
			try {
				const updated = await apiFetch(`/api/user/tasks/${taskId}/status`, { method: 'PUT', body: payload })
				updateTask(updated)
				setMessage(action === 'approve' ? 'Task approved' : 'Change request sent')
			} catch (err) {
				setError(err.message)
			} finally {
				setActingTaskId('')
			}
		}, [setError, updateTask])

		const markNotificationRead = useCallback(async (id) => {
			try {
				await apiFetch(`/api/user/notifications/${id}/read`, { method: 'PUT' })
				setNotifications((prev) => prev.map((item) => (item._id === id ? { ...item, read: true } : item)))
			} catch (err) {
				setError(err.message)
			}
		}, [setError])

		const markAllNotificationsRead = useCallback(async () => {
			if (!notifications.length) return
			try {
				await apiFetch('/api/user/notifications/read', { method: 'PUT', body: { markAll: true } })
				setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
			} catch (err) {
				setError(err.message)
			}
		}, [notifications.length, setError])

		const queuedAssignments = useMemo(() => {
			if (!assignmentKey || !profile) return []
			return taskList.filter((task) => {
				const assignment = getAssignment(task)
				return assignmentBelongsToUser(assignment) && assignment.status === 'pending'
			})
		}, [assignmentBelongsToUser, assignmentKey, getAssignment, profile, taskList])

		const activeAssignments = useMemo(() => {
			if (!assignmentKey || !profile) return []
			return taskList.filter((task) => {
				const assignment = getAssignment(task)
				if (!assignmentBelongsToUser(assignment)) return false
				return ['in_progress', 'revisions'].includes(assignment.status)
			})
		}, [assignmentBelongsToUser, assignmentKey, getAssignment, profile, taskList])

		const awaitingManagerReview = useMemo(() => {
			if (!assignmentKey || !profile) return []
			return taskList.filter((task) => {
				const assignment = getAssignment(task)
				return assignmentBelongsToUser(assignment) && assignment.status === 'submitted'
			})
		}, [assignmentBelongsToUser, assignmentKey, getAssignment, profile, taskList])

		const completedAssignments = useMemo(() => {
			if (!assignmentKey || !profile) return []
			return taskList.filter((task) => {
				const assignment = getAssignment(task)
				return assignmentBelongsToUser(assignment) && assignment.status === 'approved'
			})
		}, [assignmentBelongsToUser, assignmentKey, getAssignment, profile, taskList])

		const clientQueued = useMemo(
			() => taskList.filter((task) => [
				STATUS.CLIENT_REQUESTED,
				STATUS.AWAITING_MANAGER_ASSIGNMENT,
				STATUS.CHANGES_REQUESTED
			].includes(task.status)),
			[taskList]
		)

		const clientInDelivery = useMemo(
			() => taskList.filter((task) => [
				STATUS.DESIGN_IN_PROGRESS,
				STATUS.DESIGN_SUBMITTED,
				STATUS.DEVELOPMENT_IN_PROGRESS,
				STATUS.DEVELOPMENT_SUBMITTED,
				STATUS.TESTING_IN_PROGRESS,
				STATUS.TESTING_SUBMITTED,
				STATUS.AWAITING_HR_REVIEW
			].includes(task.status)),
			[taskList]
		)

		const clientAwaitingReview = useMemo(
			() => taskList.filter((task) => task.status === STATUS.AWAITING_CLIENT_REVIEW),
			[taskList]
		)

		const clientCompleted = useMemo(
			() => taskList.filter((task) => task.status === STATUS.COMPLETED),
			[taskList]
		)

		const renderAttachmentList = useCallback((task) => {
			let files = Array.isArray(task.attachments) ? [...task.attachments] : []
			// For clients, only show files that are delivered as final results:
			// - files uploaded by HR (stage === 'hr')
			// - files uploaded during testing (stage === 'testing') but only when the task is awaiting client review or completed
			if (effectiveRole === 'client') {
				files = files.filter((file) => {
					if (!file || !file.stage) return false
					if (file.stage === 'hr') return true
					if (file.stage === 'testing') {
						return [STATUS.AWAITING_CLIENT_REVIEW, STATUS.COMPLETED].includes(task.status)
					}
					return false
				})
			}
			if (!files.length) return <div className="help">No files available for download</div>
			files.sort((a, b) => {
				const aTime = new Date(a.uploadedAt || a.createdAt || 0).getTime()
				const bTime = new Date(b.uploadedAt || b.createdAt || 0).getTime()
				return bTime - aTime
			})
			return (
				<ul style={{ marginTop: 6 }}>
					{files.map((file) => (
						<li key={file._id || file.filename}>
							<a href={resolveAssetUrl(`/uploads/${file.filename}`)} target="_blank" rel="noreferrer">{file.originalName}</a>
							{formatSize(file.size) ? <span style={{ marginLeft: 6, color: '#555' }}>{formatSize(file.size)}</span> : null}
							<span style={{ marginLeft: 6, color: '#555' }}>— {ATTACHMENT_STAGE_LABEL[file.stage] || file.stage}</span>
							<span style={{ marginLeft: 6, color: '#999', fontSize: 12 }}>{formatDate(file.uploadedAt || file.createdAt, true)}</span>
							{file.uploadedBy ? <span style={{ marginLeft: 6, color: '#777', fontSize: 12 }}>by {formatPerson(file.uploadedBy)}</span> : null}
						</li>
					))}
				</ul>
			)
		}, [formatDate, formatPerson])

		const renderChangeRequests = useCallback((task) => {
			const changes = Array.isArray(task.changeRequests) ? task.changeRequests : []
			if (!changes.length) return null
			return (
				<details style={{ marginTop: 10 }}>
					<summary>Change requests</summary>
					<ul>
						{changes.slice().reverse().map((item, idx) => (
							<li key={idx} style={{ fontSize: 13 }}>
								{item.comment}
								<span style={{ marginLeft: 6, color: '#777' }}>{formatDate(item.createdAt, true)}</span>
							</li>
						))}
					</ul>
				</details>
			)
		}, [formatDate])

			const renderStageSnapshot = useCallback((task) => {
			const stageAssignments = task && task.stageAssignments ? task.stageAssignments : {}
			const rows = Object.entries(STAGE_LABEL_BY_KEY)
				.map(([key, label]) => {
					const info = stageAssignments[key] || {}
					const hasData = info.user || info.status || info.submittedAt
					if (!hasData) return null
					return (
						<li key={key} style={{ fontSize: 13 }}>
							<strong>{label}</strong>: {formatPerson(info.user)} — {stageStatusLabel(info.status)}
							{info.submittedAt ? <span style={{ marginLeft: 6, color: '#777' }}>submitted {formatDate(info.submittedAt, true)}</span> : null}
						</li>
					)
				})
				.filter(Boolean)
			if (!rows.length) {
				return <div className="help">No stage updates yet.</div>
			}
			return <ul>{rows}</ul>
			}, [formatDate, formatPerson, stageStatusLabel])

		const renderAssignmentSection = useCallback((title, collection, { allowUpload: allowUploadInSection = false } = {}) => {
			if (!collection.length) return null
			return (
				<div className="dashboard-section">
					<h2 className="dashboard-section-title">{title}</h2>
					<div className="items-list">
						{collection.map((task) => {
							const assignment = getAssignment(task) || {}
							const isUploading = uploadingTaskId === task._id
							const progress = uploadProgress[task._id]
							return (
								<div key={task._id} className="item-card">
									<div className="item-title">{task.title}</div>
									<div className="item-meta">Project status: <span className="status-badge">{task.status}</span></div>
									<div className="item-meta">Stage status: <span className="status-badge">{stageStatusLabel(assignment.status)}</span></div>
									<div className="item-meta">Project due: {formatDate(task.deadline)}{assignment.deadline ? ` — Stage due: ${formatDate(assignment.deadline)}` : ''}</div>
									<div className="item-meta">Manager: {formatPerson(task.manager)} | Team: {task.assignedTeam ? task.assignedTeam.name : '—'}</div>
									{allowUploadInSection ? (
										<div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
											<input
												type="file"
												onChange={(e) => {
													const file = e.target.files && e.target.files[0]
													if (file) {
														handleUpload(task._id, file)
													}
													e.target.value = ''
												}}
												disabled={isUploading}
											/>
											{assignment.submittedAt ? <span className="item-meta">Last submitted {formatDate(assignment.submittedAt, true)}</span> : null}
											{isUploading && !progress ? <span className="item-meta">Uploading...</span> : null}
										</div>
									) : null}
									{progress ? (
										<div style={{ width: '100%', marginTop: 12 }}>
											<div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
												<div style={{ width: `${progress.percent}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease', borderRadius: 4 }} />
											</div>
											<div className="item-meta" style={{ marginTop: 8 }}>
												Uploaded {formatSize(progress.loaded)} of {formatSize(progress.total)} ({progress.percent || 0}%)
												{progress.speed ? ` — ${formatSpeed(progress.speed)}` : ''}
											</div>
										</div>
									) : null}
									{renderChangeRequests(task)}
									<details style={{ marginTop: 12 }}>
										<summary>Attachments</summary>
										{renderAttachmentList(task)}
									</details>
									{Array.isArray(task.history) && task.history.length ? (
										<details style={{ marginTop: 12 }}>
											<summary>History</summary>
											<ul>
												{task.history.slice().reverse().map((entry, idx) => (
													<li key={idx} style={{ fontSize: 13 }}>
														<span style={{ fontWeight: 'bold' }}>{entry.status || ''}</span>
														{entry.note ? <span style={{ marginLeft: 6 }}>{entry.note}</span> : null}
														<span style={{ marginLeft: 6, color: '#777' }}>{formatDate(entry.createdAt, true)}</span>
													</li>
												))}
											</ul>
										</details>
									) : null}
								</div>
							)
						})}
					</div>
				</div>
			)
		}, [formatDate, formatPerson, formatSpeed, getAssignment, handleUpload, renderAttachmentList, renderChangeRequests, stageStatusLabel, uploadProgress, uploadingTaskId])

		const renderClientTasks = useCallback(() => (
			<>
				<div className="dashboard-section">
					<h2 className="dashboard-section-title">Submitted Requests</h2>
					{clientQueued.length ? (
						<div className="items-list">
							{clientQueued.map((task) => (
								<div key={task._id} className="item-card">
									<div className="item-title">{task.title}</div>
									<div className="item-meta">Status: <span className="status-badge">{task.status}</span> — Requested {formatDate(task.createdAt, true)}</div>
									<div className="item-meta">Manager: {formatPerson(task.manager)}</div>
									{renderChangeRequests(task)}
									<details style={{ marginTop: 12 }}>
										<summary>Attachments</summary>
										{renderAttachmentList(task)}
									</details>
								</div>
							))}
						</div>
					) : <div className="help">No pending requests.</div>}
				</div>

				<div className="dashboard-section">
					<h2 className="dashboard-section-title">In Delivery</h2>
					{clientInDelivery.length ? (
						<div className="items-list">
							{clientInDelivery.map((task) => (
								<div key={task._id} className="item-card">
									<div className="item-title">{task.title}</div>
									<div className="item-meta">Current status: <span className="status-badge">{task.status}</span> — Manager {formatPerson(task.manager)}</div>
									<details style={{ marginTop: 12 }}>
										<summary>Stage progress</summary>
										{renderStageSnapshot(task)}
									</details>
									<details style={{ marginTop: 12 }}>
										<summary>Attachments</summary>
										{renderAttachmentList(task)}
									</details>
								</div>
							))}
						</div>
					) : <div className="help">No active deliveries right now.</div>}
				</div>

				<div className="dashboard-section">
					<h2 className="dashboard-section-title">Awaiting Your Review</h2>
					{clientAwaitingReview.length ? (
						<div className="items-list">
							{clientAwaitingReview.map((task) => {
								const isActing = actingTaskId === task._id
								return (
									<div key={task._id} className="item-card">
										<div className="item-title">{task.title}</div>
										<div className="item-meta">Delivered {formatDate(task.updatedAt || task.deadline, true)} — Manager {formatPerson(task.manager)}</div>
										<div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
											<button className="btn small" onClick={() => handleClientAction(task._id, 'approve')} disabled={isActing}>{isActing ? 'Processing...' : 'Approve'}</button>
											<button className="btn btn-outline small" onClick={() => handleClientAction(task._id, 'request-changes')} disabled={isActing}>{isActing ? 'Processing...' : 'Request changes'}</button>
										</div>
										<details style={{ marginTop: 12 }}>
											<summary>Stage progress</summary>
											{renderStageSnapshot(task)}
										</details>
										<details style={{ marginTop: 12 }}>
											<summary>Deliverables</summary>
											{renderAttachmentList(task)}
										</details>
										{renderChangeRequests(task)}
									</div>
								)
							})}
						</div>
					) : <div className="help">No tasks need your approval.</div>}
				</div>

				<div className="dashboard-section">
					<h2 className="dashboard-section-title">Completed Projects</h2>
					{clientCompleted.length ? (
						<div className="table-container">
							<table className="data-table">
								<thead>
									<tr>
										<th>Title</th>
										<th>Completed</th>
										<th>Manager</th>
									</tr>
								</thead>
								<tbody>
									{clientCompleted.map((task) => (
										<tr key={task._id}>
											<td>{task.title}</td>
											<td>{formatDate(task.updatedAt || task.deadline, true)}</td>
											<td>{formatPerson(task.manager)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : <div className="help">No completed projects yet.</div>}
				</div>
			</>
		), [actingTaskId, clientAwaitingReview, clientCompleted, clientInDelivery, clientQueued, formatDate, formatPerson, handleClientAction, renderAttachmentList, renderChangeRequests, renderStageSnapshot])

		const renderRoleAssignments = useCallback(() => (
			<>
				{renderAssignmentSection('Queued Assignments', queuedAssignments)}
				{renderAssignmentSection('Active Assignments', activeAssignments, { allowUpload: true })}
				{renderAssignmentSection('Waiting For Manager Review', awaitingManagerReview)}
				{renderAssignmentSection('Approved Deliveries', completedAssignments)}
			</>
		), [activeAssignments, awaitingManagerReview, completedAssignments, queuedAssignments, renderAssignmentSection])

		const displayName = profile ? profile.name || profile.email || 'User' : 'User'
		const roleLabel = formatRole(effectiveRole)

		const [activeView, setActiveView] = React.useState('tasks')

		return (
			<div className="user-dashboard-fullscreen">
				<div className="user-header-row">
					<div className="user-top-bar">
						<div className="user-brand">
							<div className="user-brand-logo">T</div>
							<div className="user-brand-text">
								<h2>{roleLabel || role} Dashboard</h2>
							</div>
						</div>
					</div>
					<div className="user-header">
						<div className="user-welcome-inline">
							<h1>Welcome, {displayName}! 👋</h1>
							<p style={{fontSize: '15px', color: '#64748b', marginTop: '8px', fontWeight: 500}}>
								Ready to make great things happen today! Let's turn your tasks into achievements.
							</p>
						</div>
						<div className="user-header-actions">
							<button className="btn" onClick={logout}>Sign out</button>
						</div>
					</div>
				</div>
				<div className="user-layout-wrapper">
					<div className="user-sidebar">
						<nav className="user-sidebar-nav">
							<button className={`user-sidebar-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => setActiveView('overview')}>
								<span className="user-sidebar-icon">🏠</span>
								<span>Overview</span>
							</button>
							<button className={`user-sidebar-item ${activeView === 'tasks' ? 'active' : ''}`} onClick={() => setActiveView('tasks')}>
								<span className="user-sidebar-icon">✓</span>
								<span>My Tasks</span>
							</button>
							{allowTaskRequest && (
								<button className={`user-sidebar-item ${activeView === 'submit' ? 'active' : ''}`} onClick={() => setActiveView('submit')}>
									<span className="user-sidebar-icon">➕</span>
									<span>Submit Request</span>
								</button>
							)}
							<button className={`user-sidebar-item ${activeView === 'progress' ? 'active' : ''}`} onClick={() => setActiveView('progress')}>
								<span className="user-sidebar-icon">📊</span>
								<span>Task Progress</span>
							</button>
							<button className={`user-sidebar-item ${activeView === 'notifications' ? 'active' : ''}`} onClick={() => setActiveView('notifications')}>
								<span className="user-sidebar-icon">🔔</span>
								<span>Notifications{unreadCount ? ` (${unreadCount})` : ''}</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'messages' ? 'active' : ''}`} onClick={() => setActiveView('messages')} style={{ position: 'relative' }}>
							<span className="user-sidebar-icon">💬</span>
							<span>Messages</span>
							{unreadMessages > 0 && (
								<span className="chat-icon-btn-badge" style={{ position: 'absolute', top: '8px', right: '8px' }}>
									{unreadMessages}
								</span>
							)}
						</button>
						<button className={`user-sidebar-item ${activeView === 'profile' ? 'active' : ''}`} onClick={() => setActiveView('profile')}>
								<span className="user-sidebar-icon">👤</span>
								<span>Profile</span>
							</button>
							<button className={`user-sidebar-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')}>
								<span className="user-sidebar-icon">⚙️</span>
								<span>Settings</span>
							</button>
						</nav>
					</div>
					<div className="user-main">
						<div className="user-content">
							{/* OVERVIEW VIEW */}
							{activeView === 'overview' ? (
								<>
									{/* Stats Cards Grid */}
									<div style={{
										display: 'grid',
										gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
										gap: '20px',
										marginBottom: '32px'
									}}>
										<div style={{
											background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
											borderRadius: '16px',
											padding: '24px',
											boxShadow: '0 4px 16px rgba(102, 126, 234, 0.25)',
											position: 'relative',
											overflow: 'hidden',
											transition: 'all 0.3s ease'
										}}
										onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
										onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
											<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>📋</div>
											<div style={{position: 'relative'}}>
												<div style={{fontSize: '48px', marginBottom: '8px'}}>📋</div>
												<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
													{taskList.length}
												</div>
												<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Total Tasks</div>
												<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>All assigned tasks</div>
											</div>
										</div>

										<div style={{
											background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
											borderRadius: '16px',
											padding: '24px',
											boxShadow: '0 4px 16px rgba(79, 172, 254, 0.25)',
											position: 'relative',
											overflow: 'hidden',
											transition: 'all 0.3s ease'
										}}
										onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
										onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
											<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>⚡</div>
											<div style={{position: 'relative'}}>
												<div style={{fontSize: '48px', marginBottom: '8px'}}>⚡</div>
												<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
													{taskList.filter(t => t.status !== STATUS.COMPLETED && t.status !== STATUS.AWAITING_CLIENT_REVIEW).length}
												</div>
												<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Active</div>
												<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Currently in progress</div>
											</div>
										</div>

										<div style={{
											background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
											borderRadius: '16px',
											padding: '24px',
											boxShadow: '0 4px 16px rgba(240, 147, 251, 0.25)',
											position: 'relative',
											overflow: 'hidden',
											transition: 'all 0.3s ease'
										}}
										onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
										onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
											<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>👁️</div>
											<div style={{position: 'relative'}}>
												<div style={{fontSize: '48px', marginBottom: '8px'}}>👁️</div>
												<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
													{taskList.filter(t => {
														const assignment = getAssignment(t)
														return assignment && assignment.status === 'submitted'
													}).length}
												</div>
												<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Awaiting Review</div>
												<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Submitted for review</div>
											</div>
										</div>

										<div style={{
											background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
											borderRadius: '16px',
											padding: '24px',
											boxShadow: '0 4px 16px rgba(34, 197, 94, 0.25)',
											position: 'relative',
											overflow: 'hidden',
											transition: 'all 0.3s ease'
										}}
										onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
										onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
											<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>✅</div>
											<div style={{position: 'relative'}}>
												<div style={{fontSize: '48px', marginBottom: '8px'}}>✅</div>
												<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
													{taskList.filter(t => t.status === STATUS.COMPLETED).length}
												</div>
												<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Completed</div>
												<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Successfully finished</div>
											</div>
										</div>
									</div>

									{/* Progress Overview */}
									<div style={{
										background: '#fff',
										borderRadius: '16px',
										padding: '28px',
										boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
										marginBottom: '24px'
									}}>
										<h3 style={{margin: '0 0 24px 0', fontSize: '22px', fontWeight: 700, color: '#111827'}}>
											📊 My Performance
										</h3>

										<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px'}}>
											<div style={{padding: '20px', background: 'linear-gradient(135deg, #3b82f615, #2563eb15)', borderRadius: '12px', border: '2px solid #3b82f630', textAlign: 'center'}}>
												<div style={{fontSize: '32px', fontWeight: 800, color: '#3b82f6', marginBottom: '4px'}}>
													{taskList.filter(t => {
														const assignment = getAssignment(t)
														return assignment && assignment.status === 'in_progress'
													}).length}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Working On</div>
											</div>

											<div style={{padding: '20px', background: 'linear-gradient(135deg, #8b5cf615, #667eea15)', borderRadius: '12px', border: '2px solid #8b5cf630', textAlign: 'center'}}>
												<div style={{fontSize: '32px', fontWeight: 800, color: '#8b5cf6', marginBottom: '4px'}}>
													{taskList.filter(t => {
														const assignment = getAssignment(t)
														return assignment && assignment.status === 'pending'
													}).length}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Pending</div>
											</div>

											<div style={{padding: '20px', background: 'linear-gradient(135deg, #f59e0b15, #d9770615)', borderRadius: '12px', border: '2px solid #f59e0b30', textAlign: 'center'}}>
												<div style={{fontSize: '32px', fontWeight: 800, color: '#f59e0b', marginBottom: '4px'}}>
													{taskList.filter(t => {
														const assignment = getAssignment(t)
														return assignment && assignment.status === 'submitted'
													}).length}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Submitted</div>
											</div>

											<div style={{padding: '20px', background: 'linear-gradient(135deg, #22c55e15, #16a34a15)', borderRadius: '12px', border: '2px solid #22c55e30', textAlign: 'center'}}>
												<div style={{fontSize: '32px', fontWeight: 800, color: '#22c55e', marginBottom: '4px'}}>
													{taskList.filter(t => {
														const assignment = getAssignment(t)
														return assignment && assignment.status === 'approved'
													}).length}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Approved</div>
											</div>
										</div>

										{/* Progress Bar */}
										<div>
											<div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
												<span style={{fontSize: '14px', fontWeight: 600, color: '#374151'}}>Task Completion Rate</span>
												<span style={{fontSize: '14px', fontWeight: 700, color: '#667eea'}}>
													{taskList.length > 0 ? Math.round((taskList.filter(t => t.status === STATUS.COMPLETED).length / taskList.length) * 100) : 0}%
												</span>
											</div>
											<div style={{height: '12px', background: '#e5e7eb', borderRadius: '12px', overflow: 'hidden'}}>
												<div style={{
													height: '100%',
													width: `${taskList.length > 0 ? (taskList.filter(t => t.status === STATUS.COMPLETED).length / taskList.length) * 100 : 0}%`,
													background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
													borderRadius: '12px',
													transition: 'width 0.6s ease',
													boxShadow: '0 0 12px rgba(34, 197, 94, 0.5)'
												}} />
											</div>
										</div>
									</div>

									{/* Recent Activity */}
									{taskList.length > 0 && (
										<div style={{
											background: '#fff',
											borderRadius: '16px',
											padding: '28px',
											boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
										}}>
											<h3 style={{margin: '0 0 20px 0', fontSize: '22px', fontWeight: 700, color: '#111827'}}>
												🎯 Recent Tasks
											</h3>
											<div style={{display: 'grid', gap: '12px'}}>
												{taskList.slice(0, 5).map(task => {
													const assignment = getAssignment(task)
													const statusColor = assignment?.status === 'approved' ? '#22c55e' : 
																	   assignment?.status === 'submitted' ? '#f59e0b' : 
																	   assignment?.status === 'in_progress' ? '#3b82f6' : '#9ca3af'
													
													return (
														<div key={task._id} style={{
															padding: '16px',
															background: '#f9fafb',
															borderRadius: '10px',
															border: '2px solid #e5e7eb',
															display: 'flex',
															justifyContent: 'space-between',
															alignItems: 'center'
														}}>
															<div style={{flex: 1}}>
																<div style={{fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '4px'}}>
																	{task.title}
																</div>
																<div style={{fontSize: '13px', color: '#6b7280'}}>
																	{assignment ? stageStatusLabel(assignment.status) : 'Pending'}
																</div>
															</div>
															<div style={{
																padding: '6px 12px',
																background: `${statusColor}20`,
																color: statusColor,
																borderRadius: '8px',
																fontSize: '12px',
																fontWeight: 600
															}}>
																{assignment ? stageStatusLabel(assignment.status) : 'Pending'}
															</div>
														</div>
													)
												})}
											</div>
										</div>
									)}
								</>
							) : null}

							{/* TASK PROGRESS VIEW */}
							{activeView === 'progress' ? (
								<div className="dashboard-section">
									<div className="dashboard-section-header">
										<h3 className="dashboard-section-title">My Task Progress</h3>
										<span style={{fontSize: 14, color: '#64748b', fontWeight: 500}}>
									{taskList.length} Total Tasks
								</span>
							</div>
							{taskList.length > 0 ? (
								<div style={{display: 'grid', gap: 20}}>
									{taskList.map(task => {
										const stageInfo = getTaskStatusStage(task.status)
										return (
											<div 
												key={task._id} 
												className="item-card" 
												style={{
													position: 'relative',
													overflow: 'hidden',
													background: '#fff',
													border: '2px solid #e2e8f0'
												}}
											>
												<div 
													style={{
														position: 'absolute',
														top: 0,
														left: 0,
														bottom: 0,
														width: `${stageInfo.progress}%`,
														background: `linear-gradient(90deg, ${stageInfo.color}15, ${stageInfo.color}05)`,
														transition: 'width 1s ease-in-out'
													}}
												/>
												<div style={{position: 'relative', zIndex: 1}}>
													<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16}}>
														<h4 className="item-title" style={{margin: 0, flex: 1}}>{task.title}</h4>
														<span 
															className="status-badge" 
															style={{
																background: `${stageInfo.color}20`,
																color: stageInfo.color,
																border: `2px solid ${stageInfo.color}`,
																fontWeight: 600,
																fontSize: 13
															}}
														>
															{stageInfo.stage}
														</span>
															</div>
															<div style={{
																padding: 12,
																background: '#f8fafc',
																borderRadius: 8,
																marginBottom: 12,
																border: '1px solid #e2e8f0'
															}}>
																<div style={{fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 6}}>
																	Current Status
																</div>
																<div style={{fontSize: 14, color: '#475569', fontWeight: 500}}>
																	{task.status}
																</div>
															</div>
															<div style={{marginBottom: 12}}>
																<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
																	<span style={{fontSize: 13, fontWeight: 600, color: '#475569'}}>Progress</span>
																	<span style={{fontSize: 13, fontWeight: 700, color: stageInfo.color}}>{stageInfo.progress}%</span>
																</div>
																<div style={{
																	width: '100%',
																	height: 10,
																	background: '#e2e8f0',
																	borderRadius: 20,
																	overflow: 'hidden',
																	boxShadow: `0 0 0 2px ${stageInfo.color}20`
																}}>
																	<div style={{
																		width: `${stageInfo.progress}%`,
																		height: '100%',
																		background: `linear-gradient(90deg, ${stageInfo.color}, ${stageInfo.color}dd)`,
																		borderRadius: 20,
																		transition: 'width 1s ease-in-out',
																		boxShadow: `0 0 10px ${stageInfo.color}80`
																	}} />
																</div>
															</div>
															{task.deadline && (
																<div style={{
																	padding: 12,
																	background: '#f8fafc',
																	borderRadius: 8,
																	fontSize: 13,
																	color: '#64748b'
																}}>
																	<strong>Deadline:</strong> {formatDate(task.deadline)}
																</div>
															)}
														</div>
													</div>
												)
											})}
										</div>
									) : (
										<p style={{color: 'var(--muted)', padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px'}}>
											No tasks to track.
										</p>
									)}
								</div>
							) : null}

							{/* PROFILE VIEW */}
							{activeView === 'profile' ? (
								<div className="dashboard-section">
									<div className="dashboard-section-header">
										<h3 className="dashboard-section-title">My Profile</h3>
									</div>
									<div style={{maxWidth: 720, margin: '0 auto'}}>
										<ProfileSettings
											kind="user"
											view="profile"
											profile={profile}
											onProfileUpdated={async () => {
												await refresh()
											}}
										/>
									</div>
								</div>
							) : null}

							{/* SETTINGS VIEW */}
							{activeView === 'settings' ? (
								<div className="dashboard-section">
									<div className="dashboard-section-header">
										<h3 className="dashboard-section-title">Settings</h3>
									</div>
									<div style={{maxWidth: 720, margin: '0 auto'}}>
										<ProfileSettings
											kind="user"
											view="settings"
											profile={profile}
											onProfileUpdated={async () => {
												await refresh()
											}}
										/>
									</div>
								</div>
							) : null}

							{activeView === 'submit' && allowTaskRequest ? (
								<div className="dashboard-section">
									<h2 className="dashboard-section-title">Submit New Project Request</h2>
									<button className="btn" onClick={goSubmitRequest}>Create Request</button>
								</div>
							) : null}

							{activeView === 'notifications' ? (
								<div className="dashboard-section">
									<div className="dashboard-section-header">
										<h2 className="dashboard-section-title">Notifications</h2>
										<button className="btn small" onClick={markAllNotificationsRead} disabled={notificationsLoading || !notifications.length}>Mark all read</button>
									</div>
									{notificationsLoading ? <div>Loading notifications...</div> : (
										notifications.length ? (
											<div className="items-list">
												{notifications.map((item) => (
													<div key={item._id} className="item-card" style={{ opacity: item.read ? 0.7 : 1 }}>
														<div className="item-title">{item.message}</div>
														<div className="item-meta">
															{item.task && item.task.title ? `Task: ${item.task.title}` : ''}
															{item.stage ? ` ${item.stage}` : ''}
															<span style={{ marginLeft: 6 }}>{formatDate(item.createdAt, true)}</span>
														</div>
														{!item.read ? (
															<button className="btn small" style={{ marginTop: 6 }} onClick={() => markNotificationRead(item._id)}>Mark read</button>
														) : null}
													</div>
												))}
											</div>
										) : <div className="help">No notifications</div>
									)}
								</div>
							) : null}

							{activeView === 'tasks' ? (
								<>
									{message ? <div className="success-message">{message}</div> : null}
									{error ? <div className="error">{error}</div> : null}
									{loading ? <div>Loading workspace...</div> : null}

									{!loading && profile ? (
										effectiveRole === 'client' ? renderClientTasks() : renderRoleAssignments()
									) : null}
								</>
							) : null}

							{/* MESSAGES VIEW */}
							{activeView === 'messages' ? (
								<div className="dashboard-section">
									<ChatMessages />
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
		)
	}
}

export default createUserDashboard
