import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession, resolveAssetUrl, uploadWithProgress } from '../api'
import { useUnreadMessages } from '../hooks/useUnreadMessages'
import { formatDate, formatRole, formatFileSize, getTaskStage, formatRemainingDays, getRemainingDays, formatSlackDays, getSlackDays } from '../utils/helpers'
import { useUserWorkspace } from '../hooks/useUserWorkspace'
import ProfileSettings from '../components/ProfileSettings'
import ChatMessages from '../components/ChatMessages'
import SubmitRequestForm from '../components/SubmitRequestForm'
import DashboardWelcomeBanner from '../components/DashboardWelcomeBanner'

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
	MANAGER_REJECTED: 'Manager Rejected',
	COMPLETED: 'Completed',
	CANCELLED: 'Cancelled',
	DELAYED: 'Delayed'
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

const formatPerson = (value) => {
	if (!value) return '—'
	if (typeof value === 'string') return 'Assigned'
	if (typeof value === 'object') {
		return value.name || value.username || value.email || '—'
	}
	return '—'
}

const formatSize = (size) => formatFileSize(size)

const formatIndex = (index) => String(index + 1).padStart(2, '0')

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
		case 'completed':
			return 'Completed'
		case 'delayed':
			return 'Delayed'
		default:
			return value || 'Pending'
	}
}

const getRemainingStyle = (value) => {
	const days = getRemainingDays(value)
	if (days !== null && days < 0) {
		return { color: '#dc2626', fontWeight: 600 }
	}
	return undefined
}

const getSlackStyle = (stageDeadline, projectDeadline) => {
	const days = getSlackDays(stageDeadline, projectDeadline)
	if (days !== null && days < 0) {
		return { color: '#dc2626', fontWeight: 600 }
	}
	return undefined
}

export const createUserDashboard = ({ heading, role, allowTaskRequest = false }) => {
	return function UserDashboard() {
		const FLASH_MESSAGE_MS = 1500
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
		const notificationsLoadedRef = useRef(false)
		const [_showNotifications, _setShowNotifications] = useState(false)
		const { unreadMessages } = useUnreadMessages(10000)
		const [selectedTaskCategory, setSelectedTaskCategory] = useState('all-tasks')
		const [editingTask, setEditingTask] = useState(null)
		const [showEditModal, setShowEditModal] = useState(false)

		const taskList = useMemo(() => (Array.isArray(tasks) ? tasks : []), [tasks])
		const effectiveRole = role || (profile ? profile.role : '')
		const assignmentKey = STAGE_KEY_BY_ROLE[effectiveRole] || null
		const getAssignment = useCallback((task) => {
			if (!assignmentKey) return null
			if (!task || !task.stageAssignments) return null
			return task.stageAssignments[assignmentKey] || null
		}, [assignmentKey])
		const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])
		const taskStats = useMemo(() => {
			const total = taskList.length
			let active = 0
			let completed = 0
			let cancelled = 0
			let awaitingReview = 0
			let inProgress = 0
			let pending = 0
			let submitted = 0
			let approved = 0
			const recentTasks = taskList.slice(0, 5)

			for (const task of taskList) {
				if (![STATUS.COMPLETED, STATUS.AWAITING_CLIENT_REVIEW, STATUS.CANCELLED].includes(task.status)) {
					active += 1
				}
				if (task.status === STATUS.COMPLETED) {
					completed += 1
				}
				if (task.status === STATUS.CANCELLED) {
					cancelled += 1
				}
				const assignment = getAssignment(task)
				if (assignment) {
					if (assignment.status === 'submitted') awaitingReview += 1
					if (assignment.status === 'in_progress') inProgress += 1
					if (assignment.status === 'pending') pending += 1
					if (assignment.status === 'submitted') submitted += 1
					if (assignment.status === 'completed') submitted += 1
					if (assignment.status === 'approved') approved += 1
				}
			}

			const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0
			const completionPercent = total > 0 ? (completed / total) * 100 : 0

			return {
				total,
				active,
				completed,
				cancelled,
				awaitingReview,
				inProgress,
				pending,
				submitted,
				approved,
				completionRate,
				completionPercent,
				recentTasks
			}
		}, [getAssignment, taskList])
		const getTaskStatusStage = useCallback((status) => {
			const stage = getTaskStage(status)
			return {
				stage: stage.label,
				progress: stage.progress,
				color: stage.color
			}
		}, [])

		const loadNotifications = useCallback(async ({ silent = false } = {}) => {
			try {
				if (!silent) {
					setNotificationsLoading(true)
				}
				const data = await apiFetch('/api/user/notifications?limit=50')
				const next = Array.isArray(data) ? data : []
				setNotifications((prev) => {
					if (!Array.isArray(prev) || prev.length === 0) return next
					if (prev.length !== next.length) return next
					const prevFirst = prev[0]?._id
					const prevLast = prev[prev.length - 1]?._id
					const nextFirst = next[0]?._id
					const nextLast = next[next.length - 1]?._id
					return prevFirst === nextFirst && prevLast === nextLast ? prev : next
				})
			} catch (err) {
				setError(err.message)
			} finally {
				if (!silent || !notificationsLoadedRef.current) {
					setNotificationsLoading(false)
				}
				notificationsLoadedRef.current = true
			}
		}, [setError])

		useEffect(() => {
			const refreshNotifications = (silent = false) => {
				if (typeof document !== 'undefined' && document.hidden) return
				loadNotifications({ silent })
			}

			refreshNotifications(false)
			const id = setInterval(() => {
				refreshNotifications(true)
			}, NOTIFICATION_REFRESH_MS)
			const onVisibilityChange = () => {
				if (!document.hidden) {
					refreshNotifications(true)
				}
			}

			document.addEventListener('visibilitychange', onVisibilityChange)

			return () => {
				clearInterval(id)
				document.removeEventListener('visibilitychange', onVisibilityChange)
			}
		}, [loadNotifications])

		useEffect(() => {
			if (!message) return
			const timer = setTimeout(() => setMessage(''), FLASH_MESSAGE_MS)
			return () => clearTimeout(timer)
		}, [message])

		useEffect(() => {
			if (!error) return
			const timer = setTimeout(() => setError(null), FLASH_MESSAGE_MS)
			return () => clearTimeout(timer)
		}, [error, setError])

		const logout = useCallback(() => {
			clearSession()
			nav('/user/login')
		}, [nav])

		const assignmentBelongsToUser = useCallback((assignment) => {
			if (!profile) return false
			const assignedId = toId(assignment && assignment.user)
			return assignedId && assignedId === profile._id
		}, [profile])

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
			if (action === 'end-request') {
				const confirmEnd = window.confirm('Cancel this request? This will close the project.')
				if (!confirmEnd) return
			}
			setMessage('')
			setError(null)
			setActingTaskId(taskId)
			try {
				const updated = await apiFetch(`/api/user/tasks/${taskId}/status`, { method: 'PUT', body: payload })
				updateTask(updated)
				setMessage(action === 'approve' ? 'Task approved' : action === 'end-request' ? 'Request cancelled' : 'Change request sent to HR')
			} catch (err) {
				setError(err.message)
			} finally {
				setActingTaskId('')
			}
		}, [setError, updateTask])

		const handleTesterAction = useCallback(async (taskId, action) => {
			const payload = { action }
			if (action === 'request-changes') {
				const comment = window.prompt('Add feedback for the developer')
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

		const handleManagerRejectedAction = useCallback(async (taskId, action) => {
			if (action === 'make-changes') {
				const task = taskList.find(t => t._id === taskId)
				if (task) {
					setEditingTask(task)
					setShowEditModal(true)
					setActiveView('submit')
				}
				return
			}
			
			if (action === 'cancel-project') {
				const confirmCancel = window.confirm('Are you sure you want to cancel this project?')
				if (!confirmCancel) return
			}
			
			setMessage('')
			setError(null)
			setActingTaskId(taskId)
			try {
				const updated = await apiFetch(`/api/user/tasks/${taskId}/status`, { 
					method: 'PUT', 
					body: { action } 
				})
				updateTask(updated)
				setMessage(action === 'cancel-project' ? 'Project cancelled' : 'Making changes...')
			} catch (err) {
				setError(err.message)
			} finally {
				setActingTaskId('')
			}
		}, [taskList, setError, updateTask])

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
				return ['in_progress', 'revisions', 'delayed'].includes(assignment.status)
			})
		}, [assignmentBelongsToUser, assignmentKey, getAssignment, profile, taskList])

		const awaitingManagerReview = useMemo(() => {
			if (!assignmentKey || !profile) return []
			return taskList.filter((task) => {
				const assignment = getAssignment(task)
				return assignmentBelongsToUser(assignment) && ['submitted', 'completed'].includes(assignment.status)
			})
		}, [assignmentBelongsToUser, assignmentKey, getAssignment, profile, taskList])

		const completedAssignments = useMemo(() => {
			if (!assignmentKey || !profile) return []
			return taskList.filter((task) => {
				const assignment = getAssignment(task)
				return assignmentBelongsToUser(assignment) && ['approved', 'completed'].includes(assignment.status)
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
				STATUS.DEVELOPMENT_IN_PROGRESS,
				STATUS.TESTING_IN_PROGRESS,
				STATUS.TESTING_SUBMITTED,
				STATUS.AWAITING_HR_REVIEW,
				STATUS.DELAYED
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

		const clientCancelled = useMemo(
			() => taskList.filter((task) => task.status === STATUS.CANCELLED),
			[taskList]
		)

		const clientManagerRejected = useMemo(
			() => taskList.filter((task) => task.status === STATUS.MANAGER_REJECTED),
			[taskList]
		)

		const clientAllTasks = useMemo(() => taskList.slice(), [taskList])

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
						return [STATUS.AWAITING_CLIENT_REVIEW, STATUS.COMPLETED, STATUS.CANCELLED].includes(task.status)
					}
					if (file.stage === 'development') {
						return [STATUS.AWAITING_CLIENT_REVIEW, STATUS.COMPLETED, STATUS.CANCELLED].includes(task.status)
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
		}, [effectiveRole])

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
		}, [])

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
								{info.deadline ? (
									<span style={{ marginLeft: 6, color: '#64748b' }}>
										Deadline {formatDate(info.deadline)}{' '}
										<span style={getSlackStyle(info.deadline, task.deadline)}>({formatSlackDays(info.deadline, task.deadline)})</span>
									</span>
								) : null}
							{info.submittedAt ? <span style={{ marginLeft: 6, color: '#777' }}>submitted {formatDate(info.submittedAt, true)}</span> : null}
						</li>
					)
				})
				.filter(Boolean)
			if (!rows.length) {
				return <div className="help">No stage updates yet.</div>
			}
			return <ul>{rows}</ul>
			}, [])

		const renderAssignmentSection = useCallback((title, collection, { allowUpload: allowUploadInSection = false } = {}) => {
			if (!collection.length) return null
			return (
				<div className="dashboard-section">
					<h2 className="dashboard-section-title">{title}</h2>
					<div className="items-list">
						{collection.map((task, index) => {
							const assignment = getAssignment(task) || {}
							const isUploading = uploadingTaskId === task._id
							const isActing = actingTaskId === task._id
							const isTester = effectiveRole === 'tester'
							const canReview = isTester && ['in_progress', 'revisions', 'delayed'].includes(assignment.status)
							const progress = uploadProgress[task._id]
							return (
								<div key={task._id} className="item-card task-card">
									<div className="task-card-head">
										<div className="task-card-title">
											<span className="task-index-badge">{formatIndex(index)}</span>
											<span className="item-title">{task.title}</span>
										</div>
										<div className="task-card-status">
											<span className="status-badge">{task.status}</span>
											<span className="status-badge">{stageStatusLabel(assignment.status)}</span>
										</div>
									</div>
									<div className="task-meta-grid">
										<div className="task-meta-item">
											<span className="task-meta-label">Project due</span>
											<span className="task-meta-value">
												{task.deadline ? (
													<>
														{formatDate(task.deadline)}{' '}
														<span style={getRemainingStyle(task.deadline)}>
															({formatRemainingDays(task.deadline)})
														</span>
													</>
												) : '—'}
											</span>
										</div>
										<div className="task-meta-item">
											<span className="task-meta-label">Stage due</span>
											<span className="task-meta-value">
												{assignment.deadline ? (
													<>
														{formatDate(assignment.deadline)}{' '}
														<span style={getSlackStyle(assignment.deadline, task.deadline)}>
															({formatSlackDays(assignment.deadline, task.deadline)})
														</span>
													</>
												) : '—'}
											</span>
										</div>
										<div className="task-meta-item">
											<span className="task-meta-label">Manager</span>
											<span className="task-meta-value">{formatPerson(task.manager)}</span>
										</div>
										<div className="task-meta-item">
											<span className="task-meta-label">Team</span>
											<span className="task-meta-value">{task.assignedTeam ? task.assignedTeam.name : '—'}</span>
										</div>
									</div>
									{allowUploadInSection ? (
										<div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
											{isTester ? (
												<span className="item-meta">Upload test report (optional)</span>
											) : null}
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
									{canReview ? (
										<div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
											<button className="btn small" onClick={() => handleTesterAction(task._id, 'approve')} disabled={isActing}>{isActing ? 'Processing...' : 'Approve'}</button>
											<button className="btn btn-outline small" onClick={() => handleTesterAction(task._id, 'request-changes')} disabled={isActing}>{isActing ? 'Processing...' : 'Request changes'}</button>
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
									<details className="task-details" style={{ marginTop: 12 }}>
										<summary>Attachments</summary>
										{renderAttachmentList(task)}
									</details>
									{Array.isArray(task.history) && task.history.length ? (
										<details className="task-details" style={{ marginTop: 12 }}>
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
		}, [actingTaskId, effectiveRole, getAssignment, handleTesterAction, handleUpload, renderAttachmentList, renderChangeRequests, uploadProgress, uploadingTaskId])

		const renderClientTasks = useCallback(() => (
			<>
				{selectedTaskCategory === 'all-tasks' && (
					<div className="dashboard-section">
						<div className="dashboard-section-header">
							<h2 className="dashboard-section-title">All Tasks</h2>
							<span className="info-badge">{clientAllTasks.length} total</span>
						</div>
						{clientAllTasks.length ? (
							<div className="items-list">
								{clientAllTasks.map((task, index) => (
									<div key={task._id} className="item-card task-card">
										<div className="task-card-head">
											<div className="task-card-title">
												<span className="task-index-badge">{formatIndex(index)}</span>
												<span className="item-title">{task.title}</span>
											</div>
											<span className="status-badge">{task.status}</span>
										</div>
										<div className="task-meta-grid">
											<div className="task-meta-item">
												<span className="task-meta-label">Created</span>
												<span className="task-meta-value">{formatDate(task.createdAt, true)}</span>
											</div>
											<div className="task-meta-item">
												<span className="task-meta-label">Manager</span>
												<span className="task-meta-value">{formatPerson(task.manager)}</span>
											</div>
										</div>
										{renderChangeRequests(task)}
										<details className="task-details" style={{ marginTop: 12 }}>
											<summary>Attachments</summary>
											{renderAttachmentList(task)}
										</details>
									</div>
								))}
							</div>
						) : <div className="help">No tasks created yet.</div>}
					</div>
				)}

				{/* Submitted Requests */}
				{selectedTaskCategory === 'submitted-requests' && (
					<div className="dashboard-section">
						<div className="dashboard-section-header">
							<h2 className="dashboard-section-title">Submitted Requests</h2>
							<span className="info-badge">{clientQueued.length} items</span>
						</div>
						{clientQueued.length ? (
							<div className="items-list">
								{clientQueued.map((task, index) => (
									<div key={task._id} className="item-card task-card">
										<div className="task-card-head">
											<div className="task-card-title">
												<span className="task-index-badge">{formatIndex(index)}</span>
												<span className="item-title">{task.title}</span>
											</div>
											<span className="status-badge">{task.status}</span>
										</div>
										<div className="task-meta-grid">
											<div className="task-meta-item">
												<span className="task-meta-label">Requested</span>
												<span className="task-meta-value">{formatDate(task.createdAt, true)}</span>
											</div>
											<div className="task-meta-item">
												<span className="task-meta-label">Manager</span>
												<span className="task-meta-value">{formatPerson(task.manager)}</span>
											</div>
										</div>
										{renderChangeRequests(task)}
										<details className="task-details" style={{ marginTop: 12 }}>
											<summary>Attachments</summary>
											{renderAttachmentList(task)}
										</details>
									</div>
								))}
							</div>
						) : <div className="help">No pending requests.</div>}
					</div>
				)}

				{/* In Delivery */}
				{selectedTaskCategory === 'in-delivery' && (
					<div className="dashboard-section">
						<div className="dashboard-section-header">
							<h2 className="dashboard-section-title">In Delivery</h2>
							<span className="info-badge">{clientInDelivery.length} items</span>
						</div>
						{clientInDelivery.length ? (
							<div className="items-list">
								{clientInDelivery.map((task, index) => (
									<div key={task._id} className="item-card task-card">
										<div className="task-card-head">
											<div className="task-card-title">
												<span className="task-index-badge">{formatIndex(index)}</span>
												<span className="item-title">{task.title}</span>
											</div>
											<span className="status-badge">{task.status}</span>
										</div>
										<div className="task-meta-grid">
											<div className="task-meta-item">
												<span className="task-meta-label">Manager</span>
												<span className="task-meta-value">{formatPerson(task.manager)}</span>
											</div>
										</div>
										<details className="task-details" style={{ marginTop: 12 }}>
											<summary>Stage progress</summary>
											{renderStageSnapshot(task)}
										</details>
										<details className="task-details" style={{ marginTop: 12 }}>
											<summary>Attachments</summary>
											{renderAttachmentList(task)}
										</details>
									</div>
								))}
							</div>
						) : <div className="help">No active deliveries right now.</div>}
					</div>
				)}

				{/* Awaiting Your Review */}
				{selectedTaskCategory === 'awaiting-review' && (
					<div className="dashboard-section">
						<div className="dashboard-section-header">
							<h2 className="dashboard-section-title">Awaiting Your Review</h2>
							<span className="info-badge">{clientAwaitingReview.length} items</span>
						</div>
						{clientAwaitingReview.length ? (
							<div className="items-list">
								{clientAwaitingReview.map((task, index) => {
									const isActing = actingTaskId === task._id
									const reviewOrigin = task.clientReviewOrigin || 'hr_delivery'
									const showApprove = reviewOrigin === 'hr_delivery'
									const showEndRequest = reviewOrigin === 'manager_reject'
									return (
										<div key={task._id} className="item-card task-card">
											<div className="task-card-head">
												<div className="task-card-title">
													<span className="task-index-badge">{formatIndex(index)}</span>
													<span className="item-title">{task.title}</span>
												</div>
												<span className="status-badge">Awaiting Review</span>
											</div>
											<div className="task-meta-grid">
												<div className="task-meta-item">
													<span className="task-meta-label">Delivered</span>
													<span className="task-meta-value">{formatDate(task.updatedAt || task.deadline, true)}</span>
												</div>
												<div className="task-meta-item">
													<span className="task-meta-label">Manager</span>
													<span className="task-meta-value">{formatPerson(task.manager)}</span>
												</div>
											</div>
											<div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
												{showApprove ? (
													<button className="btn small" onClick={() => handleClientAction(task._id, 'approve')} disabled={isActing}>{isActing ? 'Processing...' : 'Approve'}</button>
												) : null}
												<button className="btn btn-outline small" onClick={() => handleClientAction(task._id, 'request-changes')} disabled={isActing}>{isActing ? 'Processing...' : 'Request changes'}</button>
												{showEndRequest ? (
													<button className="btn btn-outline small danger-action" onClick={() => handleClientAction(task._id, 'end-request')} disabled={isActing}>{isActing ? 'Processing...' : 'End request'}</button>
												) : null}
											</div>
											<details className="task-details" style={{ marginTop: 12 }}>
												<summary>Stage progress</summary>
												{renderStageSnapshot(task)}
											</details>
											<details className="task-details" style={{ marginTop: 12 }}>
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
				)}

				{/* Completed Projects */}
				{selectedTaskCategory === 'completed' && (
					<div className="dashboard-section">
						<div className="dashboard-section-header">
							<h2 className="dashboard-section-title">Completed Projects</h2>
							<span className="info-badge">{clientCompleted.length} items</span>
						</div>
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
				)}

				{/* Manager Rejected */}
				{selectedTaskCategory === 'manager-rejected' && (
					<div className="dashboard-section">
						<div className="dashboard-section-header">
							<h2 className="dashboard-section-title">Manager Rejected</h2>
							<span className="info-badge">{clientManagerRejected.length} items</span>
						</div>
						{clientManagerRejected.length ? (
							<div className="items-list">
								{clientManagerRejected.map((task, index) => {
									const isActing = actingTaskId === task._id
									return (
										<div key={task._id} className="item-card task-card">
											<div className="task-card-head">
												<div className="task-card-title">
													<span className="task-index-badge">{formatIndex(index)}</span>
													<span className="item-title">{task.title}</span>
												</div>
												<span className="status-badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Rejected by Manager</span>
											</div>
											<div className="task-meta-grid">
												<div className="task-meta-item">
													<span className="task-meta-label">Rejected Date</span>
													<span className="task-meta-value">{formatDate(task.updatedAt || task.deadline, true)}</span>
												</div>
												<div className="task-meta-item">
													<span className="task-meta-label">Manager</span>
													<span className="task-meta-value">{formatPerson(task.manager)}</span>
												</div>
											</div>
											<div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
												<button 
													className="btn small" 
													onClick={() => handleManagerRejectedAction(task._id, 'make-changes')} 
													disabled={isActing}
													style={{ background: '#3b82f6', color: '#fff' }}
												>
													{isActing ? 'Processing...' : '✏️ Make Changes'}
												</button>
												<button 
													className="btn btn-outline small danger-action" 
													onClick={() => handleManagerRejectedAction(task._id, 'cancel-project')} 
													disabled={isActing}
												>
													{isActing ? 'Processing...' : '❌ Cancel Project'}
												</button>
											</div>
											{renderChangeRequests(task)}
											<details className="task-details" style={{ marginTop: 12 }}>
												<summary>Attachments</summary>
												{renderAttachmentList(task)}
											</details>
										</div>
									)
								})}
							</div>
						) : <div className="help">No rejected projects.</div>}
					</div>
				)}

				{/* Cancelled Requests */}
				{selectedTaskCategory === 'cancelled' && (
					<div className="dashboard-section">
						<div className="dashboard-section-header">
							<h2 className="dashboard-section-title">Cancelled Requests</h2>
							<span className="info-badge">{clientCancelled.length} items</span>
						</div>
						{clientCancelled.length ? (
							<div className="table-container">
								<table className="data-table">
									<thead>
										<tr>
											<th>Title</th>
											<th>Cancelled</th>
											<th>Manager</th>
										</tr>
									</thead>
									<tbody>
										{clientCancelled.map((task) => (
											<tr key={task._id}>
												<td>{task.title}</td>
												<td>{formatDate(task.updatedAt || task.deadline, true)}</td>
												<td>{formatPerson(task.manager)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : <div className="help">No cancelled requests yet.</div>}
					</div>
				)}
			</>
		), [actingTaskId, clientAllTasks, clientAwaitingReview, clientCancelled, clientCompleted, clientInDelivery, clientManagerRejected, clientQueued, handleClientAction, handleManagerRejectedAction, renderAttachmentList, renderChangeRequests, renderStageSnapshot, selectedTaskCategory])

		const renderRoleAssignments = useCallback(() => (
			<>
				{(queuedAssignments.length || activeAssignments.length || awaitingManagerReview.length || completedAssignments.length) ? (
					<>
						{renderAssignmentSection('Queued Assignments', queuedAssignments)}
						{renderAssignmentSection('Active Assignments', activeAssignments, { allowUpload: true })}
						{renderAssignmentSection('Waiting For Manager Review', awaitingManagerReview)}
						{renderAssignmentSection('Approved Deliveries', completedAssignments)}
					</>
				) : (
					<div className="dashboard-section">
						<div className="help">No tasks available in My Tasks.</div>
					</div>
				)}
			</>
		), [activeAssignments, awaitingManagerReview, completedAssignments, queuedAssignments, renderAssignmentSection])

		const roleLabel = formatRole(effectiveRole)

			const [activeView, setActiveView] = React.useState('overview')
		const [showViewDropdown, setShowViewDropdown] = useState(false)
		const [showTasksDropdown, setShowTasksDropdown] = useState(false)
		const [showProfileMenu, setShowProfileMenu] = useState(false)
		const headerRef = useRef(null)

		useEffect(() => {
			const handleClickOutside = (e) => {
				if (headerRef.current && !headerRef.current.contains(e.target)) {
					setShowViewDropdown(false)
					setShowTasksDropdown(false)
				}
			}
			document.addEventListener('click', handleClickOutside)
			return () => document.removeEventListener('click', handleClickOutside)
		}, [])

		return (
			<div className="admin-dashboard">
				{/* Glass-morphism Header */}
				<header className="admin-glass-header" ref={headerRef}>
					<div className="admin-glass-header-content">
						{/* Left: Dashboard Title */}
						<div className="admin-header-left">
							<h1 className="admin-dashboard-title">{heading}</h1>
						</div>

						{/* Center: Navigation */}
						<nav className="admin-header-nav">
							<button 
								className={`admin-nav-btn ${activeView === 'overview' ? 'active' : ''}`}
								onClick={() => setActiveView('overview')}
							>
								<span className="nav-icon">🏠</span>
								<span>Dashboard</span>
							</button>

							{effectiveRole === 'client' ? (
								<div className="admin-nav-dropdown" onMouseEnter={() => setShowTasksDropdown(true)} onMouseLeave={() => setShowTasksDropdown(false)}>
									<button 
										className={`admin-nav-btn ${activeView === 'tasks' ? 'active' : ''}`}
										onClick={() => setActiveView('tasks')}
									>
										<span className="nav-icon">✓</span>
										<span>My Tasks</span>
										<span className="dropdown-arrow">▼</span>
									</button>
									{showTasksDropdown && (
										<div className="admin-dropdown-menu">
											<button className="dropdown-item" onClick={() => { setActiveView('tasks'); setSelectedTaskCategory('all-tasks'); setShowTasksDropdown(false); }}>
												<span className="dropdown-icon">📋</span>
												All Tasks
											</button>
											<button className="dropdown-item" onClick={() => { setActiveView('tasks'); setSelectedTaskCategory('submitted-requests'); setShowTasksDropdown(false); }}>
												<span className="dropdown-icon">📤</span>
												Submitted Requests
											</button>
											<button className="dropdown-item" onClick={() => { setActiveView('tasks'); setSelectedTaskCategory('in-delivery'); setShowTasksDropdown(false); }}>
												<span className="dropdown-icon">🚚</span>
												In Delivery
											</button>
											<button className="dropdown-item" onClick={() => { setActiveView('tasks'); setSelectedTaskCategory('awaiting-review'); setShowTasksDropdown(false); }}>
												<span className="dropdown-icon">👀</span>
												Awaiting Your Review
											</button>
											<button className="dropdown-item" onClick={() => { setActiveView('tasks'); setSelectedTaskCategory('manager-rejected'); setShowTasksDropdown(false); }}>
												<span className="dropdown-icon">⚠️</span>
												Manager Rejected
											</button>
											<button className="dropdown-item" onClick={() => { setActiveView('tasks'); setSelectedTaskCategory('completed'); setShowTasksDropdown(false); }}>
												<span className="dropdown-icon">✅</span>
												Completed Projects
											</button>
											<button className="dropdown-item" onClick={() => { setActiveView('tasks'); setSelectedTaskCategory('cancelled'); setShowTasksDropdown(false); }}>
												<span className="dropdown-icon">❌</span>
												Cancelled Requests
											</button>
										</div>
									)}
								</div>
							) : (
								<button 
									className={`admin-nav-btn ${activeView === 'tasks' ? 'active' : ''}`}
									onClick={() => setActiveView('tasks')}
								>
									<span className="nav-icon">✓</span>
									<span>My Tasks</span>
								</button>
							)}

							{allowTaskRequest && (
								<button 
									className={`admin-nav-btn ${activeView === 'submit' ? 'active' : ''}`}
									onClick={() => setActiveView('submit')}
								>
									<span className="nav-icon">➕</span>
									<span>Submit Request</span>
								</button>
							)}

							<div className="admin-nav-dropdown" onMouseEnter={() => setShowViewDropdown(true)} onMouseLeave={() => setShowViewDropdown(false)}>
								<button 
									className={`admin-nav-btn ${['progress', 'notifications'].includes(activeView) ? 'active' : ''}`}
									onClick={() => setShowViewDropdown(!showViewDropdown)}
								>
									<span className="nav-icon">👁️</span>
									<span>View</span>
									<span className="dropdown-arrow">▼</span>
								</button>
								{showViewDropdown && (
									<div className="admin-dropdown-menu">
										<button className="dropdown-item" onClick={() => { setActiveView('progress'); setShowViewDropdown(false); }}>
											<span className="dropdown-icon">📊</span>
											Task Progress
										</button>
										<button className="dropdown-item" onClick={() => { setActiveView('notifications'); setShowViewDropdown(false); }}>
											<span className="dropdown-icon">🔔</span>
											Notifications {unreadCount ? `(${unreadCount})` : ''}
										</button>
									</div>
								)}
							</div>

							<button 
								className={`admin-nav-btn ${activeView === 'messages' ? 'active' : ''}`}
								onClick={() => setActiveView('messages')}
							>
								<span className="nav-icon">💬</span>
								<span>Chats</span>
								{unreadMessages > 0 && <span className="message-badge">{unreadMessages}</span>}
							</button>
						</nav>

						{/* Right: Logout Button */}
						<div className="admin-header-right">
							<button className="admin-logout-btn" onClick={logout}>
								<span className="logout-icon">🚪</span>
								<span>Logout</span>
							</button>
						</div>
					</div>
				</header>

				{/* Floating Profile Button */}
				<div className="floating-profile-wrapper" onMouseEnter={() => setShowProfileMenu(true)} onMouseLeave={() => setShowProfileMenu(false)}>
					<button 
						className="floating-profile-btn"
						onClick={() => setShowProfileMenu(!showProfileMenu)}
					>
						{profile?.profilePhoto ? (
							<img src={resolveAssetUrl(profile.profilePhoto)} alt="Profile" className="profile-avatar" />
						) : (
							<div className="profile-avatar-placeholder">
								{profile?.name?.charAt(0).toUpperCase() || 'U'}
							</div>
						)}
					</button>

					{showProfileMenu && (
						<div className="floating-profile-menu">
							<div className="profile-menu-header">
								{profile?.profilePhoto ? (
									<img src={resolveAssetUrl(profile.profilePhoto)} alt="Profile" className="profile-menu-avatar" />
								) : (
									<div className="profile-menu-avatar-placeholder">
										{profile?.name?.charAt(0).toUpperCase() || 'U'}
									</div>
								)}
								<div className="profile-menu-info">
									<div className="profile-menu-name">{profile?.name || 'User'}</div>
									<div className="profile-menu-role">{roleLabel}</div>
								</div>
							</div>
							<div className="profile-menu-divider"></div>
							<button className="profile-menu-item" onClick={() => { setActiveView('profile'); setShowProfileMenu(false); }}>
								<span className="profile-menu-icon">👤</span>
								Profile
							</button>
							<button className="profile-menu-item" onClick={() => { setActiveView('settings'); setShowProfileMenu(false); }}>
								<span className="profile-menu-icon">⚙️</span>
								Settings
							</button>
						</div>
					)}
				</div>

				{/* Main Content */}
				<div className="admin-content">
					<div className="admin-main">
						{/* OVERVIEW VIEW */}
						{activeView === 'overview' ? (
								<>
									<DashboardWelcomeBanner name={profile?.name} role={effectiveRole || 'client'} />
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
													{taskStats.total}
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
													{taskStats.active}
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
													{taskStats.awaitingReview}
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
													{taskStats.completed}
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
													{taskStats.inProgress}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Working On</div>
											</div>

											<div style={{padding: '20px', background: 'linear-gradient(135deg, #8b5cf615, #667eea15)', borderRadius: '12px', border: '2px solid #8b5cf630', textAlign: 'center'}}>
												<div style={{fontSize: '32px', fontWeight: 800, color: '#8b5cf6', marginBottom: '4px'}}>
													{taskStats.pending}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Pending</div>
											</div>

											<div style={{padding: '20px', background: 'linear-gradient(135deg, #f59e0b15, #d9770615)', borderRadius: '12px', border: '2px solid #f59e0b30', textAlign: 'center'}}>
												<div style={{fontSize: '32px', fontWeight: 800, color: '#f59e0b', marginBottom: '4px'}}>
													{taskStats.submitted}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Submitted</div>
											</div>

											<div style={{padding: '20px', background: 'linear-gradient(135deg, #22c55e15, #16a34a15)', borderRadius: '12px', border: '2px solid #22c55e30', textAlign: 'center'}}>
												<div style={{fontSize: '32px', fontWeight: 800, color: '#22c55e', marginBottom: '4px'}}>
													{taskStats.approved}
												</div>
												<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Approved</div>
											</div>
										</div>

										{/* Progress Bar */}
										<div>
											<div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
												<span style={{fontSize: '14px', fontWeight: 600, color: '#374151'}}>Task Completion Rate</span>
												<span style={{fontSize: '14px', fontWeight: 700, color: '#667eea'}}>
													{taskStats.completionRate}%
												</span>
											</div>
											<div style={{height: '12px', background: '#e5e7eb', borderRadius: '12px', overflow: 'hidden'}}>
												<div style={{
													height: '100%',
													width: `${taskStats.completionPercent}%`,
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
												{taskStats.recentTasks.map(task => {
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
																<strong>Deadline:</strong> {formatDate(task.deadline)}{' '}
																<span style={getRemainingStyle(task.deadline)}>({formatRemainingDays(task.deadline)})</span>
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
								<div className="profile-full-width">
									<ProfileSettings
										kind="user"
										view="profile"
										className="profile-dashboard-glass"
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
								<div className="profile-full-width">
									<ProfileSettings
										kind="user"
										view="settings"
										className="profile-dashboard-glass"
										profile={profile}
										onProfileUpdated={async () => {
											await refresh()
										}}
									/>
								</div>
							</div>
						) : null}

						{activeView === 'submit' && allowTaskRequest ? (
							<div className="dashboard-section" style={{ padding: '32px', background: 'transparent' }}>
							{editingTask && (
								<button 
									onClick={() => { setEditingTask(null); setShowEditModal(false); setActiveView('tasks'); setSelectedTaskCategory('manager-rejected'); }}
									style={{ 
										marginBottom: '16px', 
										padding: '8px 16px', 
										background: '#e5e7eb', 
										border: 'none',
										borderRadius: '8px',
										cursor: 'pointer',
										fontSize: '14px',
										fontWeight: 600
									}}
								>
									← Back to Manager Rejected
								</button>
							)}
							<SubmitRequestForm 
								editingTask={editingTask}
								onSuccess={() => {
									setMessage(editingTask ? 'Changes submitted successfully!' : 'Request submitted successfully!')
									setEditingTask(null)
									setShowEditModal(false)
									setActiveView('tasks')
									if (editingTask) {
										setSelectedTaskCategory('submitted-requests')
									}
									refresh()
								}}
								onCancel={() => {
									setEditingTask(null)
									setShowEditModal(false)
									setActiveView('tasks')
									setSelectedTaskCategory('manager-rejected')
								}}
							/>
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
								{message ? <div className="dashboard-alert dashboard-alert-success">{message}</div> : null}
								{error ? <div className="dashboard-alert dashboard-alert-error">{error}</div> : null}
								{loading ? <div>Loading workspace...</div> : null}

								{!loading && profile ? (
									effectiveRole === 'client' ? renderClientTasks() : renderRoleAssignments()
								) : null}
							</>
						) : null}

						{/* MESSAGES VIEW */}
						{activeView === 'messages' ? (
							<div className="dashboard-chat-area">
								<ChatMessages />
							</div>
						) : null}
					</div>
				</div>
				</div>
			)
	}
}

export default createUserDashboard
