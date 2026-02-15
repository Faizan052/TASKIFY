import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession, resolveAssetUrl } from '../api'
import { useUnreadMessages } from '../hooks/useUnreadMessages'
import { formatDate, getTaskStage, formatCategory, formatCategories, CATEGORY_OPTIONS } from '../utils/helpers'
import ProfileSettings from '../components/ProfileSettings'
import ChatMessages from '../components/ChatMessages'

const emptyManagerForm = { name: '', email: '', password: '', categories: [] }
const emptyProfileForm = { name: '', phone: '', department: '', profilePicture: null }
const AUTO_REFRESH_INTERVAL = 30000

export default function HRDashboard(){
	const nav = useNavigate()
	const [profile, setProfile] = useState(null)
	const [overview, setOverview] = useState(null)
	const [tasks, setTasks] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [message, setMessage] = useState('')
	const [activeView, setActiveView] = useState('overview')
	const { unreadMessages } = useUnreadMessages(10000)
	const [showProfileMenu, setShowProfileMenu] = useState(false)
	const headerRef = useRef(null)
	const [managerForm, setManagerForm] = useState(emptyManagerForm)
	const [submittingManager, setSubmittingManager] = useState(false)
	const [showManagerForm, setShowManagerForm] = useState(false)
	const [editingManagerId, setEditingManagerId] = useState(null)
	const [assigningTaskId, setAssigningTaskId] = useState('')
	const [assignmentSelections, setAssignmentSelections] = useState({})
	const [sendingToClientId, setSendingToClientId] = useState('')
	const [profileForm, setProfileForm] = useState(emptyProfileForm)
	const [_updatingProfile, setUpdatingProfile] = useState(false)
	const [deletingManagerId, setDeletingManagerId] = useState(null)

	const teamsByManager = useMemo(() => {
		if (!overview) return {}
		return overview.teams.reduce((acc, team) => {
			const managerId = team.manager ? team.manager._id : 'unassigned'
			if (!acc[managerId]) acc[managerId] = []
			acc[managerId].push(team)
			return acc
		}, {})
	}, [overview])

	const managerPipeline = useMemo(() => tasks.filter(task => [
		'Awaiting Manager Assignment',
		'Design In Progress',
		'Design Completed - Pending Manager Review',
		'Development In Progress',
		'Development Completed - Pending Manager Review',
		'Testing In Progress',
		'Testing Completed - Pending Manager Final Review',
		'Changes Requested'
	].includes(task.status)), [tasks])
	const awaitingHrReview = useMemo(() => tasks.filter(task => task.status === 'Awaiting HR Review'), [tasks])
	const awaitingClientReview = useMemo(() => tasks.filter(task => task.status === 'Awaiting Client Review'), [tasks])
	const completedTasks = useMemo(() => tasks.filter(task => task.status === 'Completed'), [tasks])

	const formatManagerName = (task) => {
		if (task.manager) return task.manager.name || task.manager.email || 'Manager'
		if (task.assignedTo && task.assignedTo.role === 'manager') {
			return task.assignedTo.name || task.assignedTo.email || 'Manager'
		}
		return '—'
	}

	const loadDashboard = useCallback(async (withSpinner = false) => {
		if (withSpinner) setLoading(true)
		setError(null)
		try{
			const [profileData, overviewData, taskData] = await Promise.all([
				apiFetch('/api/user/profile'),
				apiFetch('/api/hr/overview'),
				apiFetch('/api/hr/tasks')
			])
			setProfile(profileData)
			setOverview(overviewData)
			setTasks(taskData)
		}catch(err){ setError(err.message) }
		finally{ if (withSpinner) setLoading(false) }
	},[])

	useEffect(()=>{ loadDashboard(true) },[loadDashboard])

	useEffect(()=>{
		const id = setInterval(()=>{ loadDashboard() }, AUTO_REFRESH_INTERVAL)
		return ()=>clearInterval(id)
	},[loadDashboard])

	const logout = () => {
		clearSession()
		nav('/user/login')
	}

	const handleEditManager = (manager) => {
		const managerCategories = Array.isArray(manager.categories) && manager.categories.length > 0
			? manager.categories
			: (manager.category ? [manager.category] : [])
		setEditingManagerId(manager._id)
		setManagerForm({ name: manager.name, email: manager.email, password: '', categories: managerCategories })
		setShowManagerForm(true)
	}

	const handleDeleteManager = async (managerId) => {
		if (!confirm('Are you sure you want to delete this manager?')) return
		setDeletingManagerId(managerId)
		try {
			await apiFetch(`/api/hr/managers/${managerId}`, { method: 'DELETE' })
			setMessage('Manager deleted successfully')
			await refreshOverview()
		} catch(err) {
			setError(err.message)
		} finally {
			setDeletingManagerId(null)
		}
	}

	const _handleProfileUpdate = async (e) => {
		e.preventDefault()
		setUpdatingProfile(true)
		setError(null)
		try {
			const formData = new FormData()
			formData.append('name', profileForm.name || '')
			formData.append('phone', profileForm.phone || '')
			formData.append('department', profileForm.department || '')
			if (profileForm.profilePicture) formData.append('profilePhoto', profileForm.profilePicture)
			
			const updated = await apiFetch('/api/user/profile/basic', {
				method: 'PUT',
				body: formData,
				headers: {}
			})
			setProfile(updated)
			setMessage('Profile updated successfully')
		} catch(err) {
			setError(err.message)
		} finally {
			setUpdatingProfile(false)
		}
	}

	useEffect(() => {
		if (profile) {
			setProfileForm({
				name: profile.name || '',
				phone: profile.phone || '',
				department: profile.department || '',
				profilePicture: null
			})
		}
	}, [profile])

	const refreshOverview = async () => {
		try{
			const data = await apiFetch('/api/hr/overview')
			setOverview(data)
		}catch(err){ setError(err.message) }
	}

	const refreshTasks = async () => {
		try{
			const data = await apiFetch('/api/hr/tasks')
			setTasks(data)
		}catch(err){ setError(err.message) }
	}

	const handleManagerCreate = async (e) => {
		e.preventDefault()
		setSubmittingManager(true); setMessage(''); setError(null)
		try{
			if (!Array.isArray(managerForm.categories) || managerForm.categories.length === 0) {
				setError('Select at least one category for manager')
				return
			}
			const endpoint = editingManagerId ? `/api/hr/managers/${editingManagerId}` : '/api/hr/managers'
			const method = editingManagerId ? 'PUT' : 'POST'
			await apiFetch(endpoint, { method, body: managerForm })
			setManagerForm(emptyManagerForm)
			setEditingManagerId(null)
			setShowManagerForm(false)
			setMessage(editingManagerId ? 'Manager updated' : 'Manager created')
			await refreshOverview()
		}catch(err){ setError(err.message) }
		finally{ setSubmittingManager(false) }
	}

	const setAssignmentSelection = (taskId, managerId) => {
		setAssignmentSelections(prev => ({ ...prev, [taskId]: { managerId } }))
	}

	const getUserCategories = (user) => {
		if (!user) return []
		if (Array.isArray(user.categories) && user.categories.length > 0) return user.categories
		if (user.category) return [user.category]
		return []
	}

	const toggleManagerCategory = (categoryValue) => {
		setManagerForm((prev) => {
			const current = Array.isArray(prev.categories) ? prev.categories : []
			if (current.includes(categoryValue)) {
				return { ...prev, categories: current.filter(item => item !== categoryValue) }
			}
			return { ...prev, categories: [...current, categoryValue] }
		})
	}

	const getCategoryMatchedManagers = (task) => {
		if (!overview?.managers) return []
		if (!task?.category) return overview.managers
		return overview.managers.filter(manager => getUserCategories(manager).includes(task.category))
	}

	const handleAssignTask = async (task) => {
		const selection = assignmentSelections[task._id] || {}
		const managerId = selection.managerId || (task.assignedTo ? task.assignedTo._id : '')
		if (!managerId) {
			setError('Choose a manager before assigning the task')
			return
		}
		const selectedManager = (overview?.managers || []).find(manager => manager._id === managerId)
		const selectedManagerCategories = getUserCategories(selectedManager)
		if (task.category && selectedManager && !selectedManagerCategories.includes(task.category)) {
			setError(`Selected manager categories (${formatCategories(selectedManagerCategories)}) do not include task category (${formatCategory(task.category)})`)
			return
		}
		setAssigningTaskId(task._id); setError(null); setMessage('')
		try{
			await apiFetch(`/api/hr/tasks/${task._id}/assign`, { method: 'PUT', body: { managerId } })
			setMessage('Task assigned to manager')
			setAssignmentSelections(prev => {
				const next = { ...prev }
				delete next[task._id]
				return next
			})
			await Promise.all([refreshTasks(), refreshOverview()])
		}catch(err){ setError(err.message) }
		finally{ setAssigningTaskId('') }
	}

	const handleSendToClient = async (taskId) => {
		setSendingToClientId(taskId); setError(null); setMessage('')
		try{
			await apiFetch(`/api/hr/tasks/${taskId}/send-client`, { method: 'PUT' })
			setMessage('Task forwarded to client')
			await refreshTasks()
		}catch(err){ setError(err.message) }
		finally{ setSendingToClientId('') }
	}

	const getTaskStatusStage = (status) => {
		const stage = getTaskStage(status)
		const hrOverrides = {
			'Awaiting Client Review': { color: '#f59e0b' },
			'Changes Requested': { label: 'Changes Requested', color: '#f59e0b' }
		}
		const override = hrOverrides[status] || {}
		return {
			stage: override.label || stage.label || status || 'Unknown',
			progress: stage.progress,
			color: override.color || stage.color || '#f59e0b'
		}
	}

	return (
		<>
		<div className="admin-dashboard">
			{/* Glass-morphism Header */}
			<header className="admin-glass-header" ref={headerRef}>
				<div className="admin-glass-header-content">
					{/* Left: Dashboard Title */}
					<div className="admin-header-left">
						<h1 className="admin-dashboard-title">HR Dashboard</h1>
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

						<div className="admin-nav-dropdown" onMouseEnter={(e) => e.currentTarget.classList.add('open')} onMouseLeave={(e) => e.currentTarget.classList.remove('open')}>
							<button 
								className={`admin-nav-btn ${['managers', 'requests', 'teams'].includes(activeView) ? 'active' : ''}`}
						>
							<span className="nav-icon">⚙️</span>
							<span>Manage</span>
							<span className="dropdown-arrow">▼</span>
						</button>
						<div className="admin-dropdown-menu">
							<button className="dropdown-item" onClick={() => setActiveView('managers')}>
								<span className="dropdown-icon">👔</span>
								Managers
							</button>
							<button className="dropdown-item" onClick={() => setActiveView('requests')}>
								<span className="dropdown-icon">📨</span>
								Requests
							</button>
							<button className="dropdown-item" onClick={() => setActiveView('teams')}>
								<span className="dropdown-icon">👥</span>
								Teams
							</button>
						</div>
					</div>

					<div className="admin-nav-dropdown" onMouseEnter={(e) => e.currentTarget.classList.add('open')} onMouseLeave={(e) => e.currentTarget.classList.remove('open')}>
						<button 
							className={`admin-nav-btn ${['progress', 'review'].includes(activeView) ? 'active' : ''}`}
						>
							<span className="nav-icon">👁️</span>
							<span>View</span>
							<span className="dropdown-arrow">▼</span>
						</button>
						<div className="admin-dropdown-menu">
							<button className="dropdown-item" onClick={() => setActiveView('progress')}>
								<span className="dropdown-icon">📊</span>
								Task Progress
							</button>
							<button className="dropdown-item" onClick={() => setActiveView('review')}>
								<span className="dropdown-icon">✅</span>
								HR Review
							</button>
						</div>
				</div>

				<button 
					className={`admin-nav-btn ${activeView === 'messages' ? 'active' : ''}`}
					onClick={() => setActiveView('messages')}
				>
					<span className="nav-icon">💬</span>
					<span>Messages</span>
					{unreadMessages > 0 && <span className="message-badge">{unreadMessages}</span>}
				</button>
			</nav>

			{/* Right: Logout */}
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
		<button className="floating-profile-btn" onClick={() => setShowProfileMenu(!showProfileMenu)}>
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
						<div className="profile-menu-role">HR</div>
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

			<div className="admin-content">
				<div className="admin-main">
					{loading && <div>Loading HR data...</div>}
					{message && <div style={{background:'#e6f7ef', color:'#106433', padding:'12px 16px', borderRadius:8, marginBottom:16, border:'1px solid #c6f6d5'}}>{message}</div>}
					{error && <div className="error">{error}</div>}
					{!loading && profile && overview && (
							<>
								{/* OVERVIEW */}
								{activeView === 'overview' && (
									<>
										{/* Stats Cards Grid */}
										<div style={{
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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
												<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>👔</div>
												<div style={{position: 'relative'}}>
													<div style={{fontSize: '48px', marginBottom: '8px'}}>👔</div>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
														{overview.managers ? overview.managers.length : 0}
													</div>
													<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Managers</div>
													<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Created by you</div>
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
												<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>📋</div>
												<div style={{position: 'relative'}}>
													<div style={{fontSize: '48px', marginBottom: '8px'}}>📋</div>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
														{overview.pendingClientRequests ? overview.pendingClientRequests.length : 0}
													</div>
													<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Pending Requests</div>
													<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Needs assignment</div>
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
												<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>🤝</div>
												<div style={{position: 'relative'}}>
													<div style={{fontSize: '48px', marginBottom: '8px'}}>🤝</div>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
														{overview.teams ? overview.teams.length : 0}
													</div>
													<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Teams</div>
													<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Active teams</div>
												</div>
											</div>
										</div>

										{/* Task Progress Overview */}
										<div style={{
											background: '#fff',
											borderRadius: '16px',
											padding: '28px',
											boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
											marginBottom: '24px'
										}}>
											<h3 style={{margin: '0 0 24px 0', fontSize: '22px', fontWeight: 700, color: '#111827'}}>
												📊 Task Pipeline Overview
											</h3>

											<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px'}}>
												<div style={{padding: '20px', background: 'linear-gradient(135deg, #3b82f615, #2563eb15)', borderRadius: '12px', border: '2px solid #3b82f630', textAlign: 'center'}}>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#3b82f6', marginBottom: '4px'}}>{managerPipeline.length}</div>
													<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>In Pipeline</div>
													<div style={{fontSize: '12px', color: '#9ca3af', marginTop: '4px'}}>Design/Dev/Test</div>
												</div>

												<div style={{padding: '20px', background: 'linear-gradient(135deg, #f59e0b15, #d9770615)', borderRadius: '12px', border: '2px solid #f59e0b30', textAlign: 'center'}}>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#f59e0b', marginBottom: '4px'}}>{awaitingHrReview.length}</div>
													<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>Awaiting Review</div>
													<div style={{fontSize: '12px', color: '#9ca3af', marginTop: '4px'}}>Ready to send</div>
												</div>

												<div style={{padding: '20px', background: 'linear-gradient(135deg, #8b5cf615, #667eea15)', borderRadius: '12px', border: '2px solid #8b5cf630', textAlign: 'center'}}>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#8b5cf6', marginBottom: '4px'}}>{awaitingClientReview.length}</div>
													<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>With Client</div>
													<div style={{fontSize: '12px', color: '#9ca3af', marginTop: '4px'}}>Awaiting feedback</div>
												</div>

												<div style={{padding: '20px', background: 'linear-gradient(135deg, #22c55e15, #16a34a15)', borderRadius: '12px', border: '2px solid #22c55e30', textAlign: 'center'}}>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#22c55e', marginBottom: '4px'}}>{completedTasks.length}</div>
													<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>Completed</div>
													<div style={{fontSize: '12px', color: '#9ca3af', marginTop: '4px'}}>Successfully delivered</div>
												</div>
											</div>

											{/* Progress Visualization */}
											<div style={{marginTop: '24px'}}>
												<div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
													<span style={{fontSize: '14px', fontWeight: 600, color: '#374151'}}>Overall Completion Rate</span>
													<span style={{fontSize: '14px', fontWeight: 700, color: '#667eea'}}>
														{tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
													</span>
												</div>
												<div style={{height: '12px', background: '#e5e7eb', borderRadius: '12px', overflow: 'hidden'}}>
													<div style={{
														height: '100%',
														width: `${tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0}%`,
														background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
														borderRadius: '12px',
														transition: 'width 0.6s ease',
														boxShadow: '0 0 12px rgba(34, 197, 94, 0.5)'
													}} />
												</div>
											</div>
										</div>

										{/* Quick Stats Row */}
										<div style={{
											display: 'grid',
											gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
											gap: '16px'
										}}>
											<div style={{
												background: '#fff',
												borderRadius: '12px',
												padding: '20px',
												boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
												border: '2px solid #e5e7eb',
												display: 'flex',
												alignItems: 'center',
												gap: '16px'
											}}>
												<div style={{
													width: '56px',
													height: '56px',
													borderRadius: '12px',
													background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													fontSize: '28px',
													flexShrink: 0
												}}>👥</div>
												<div>
													<div style={{fontSize: '24px', fontWeight: 800, color: '#111827'}}>{overview.managers?.length || 0}</div>
													<div style={{fontSize: '13px', color: '#6b7280', fontWeight: 600}}>Total Managers</div>
												</div>
											</div>

											<div style={{
												background: '#fff',
												borderRadius: '12px',
												padding: '20px',
												boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
												border: '2px solid #e5e7eb',
												display: 'flex',
												alignItems: 'center',
												gap: '16px'
											}}>
												<div style={{
													width: '56px',
													height: '56px',
													borderRadius: '12px',
													background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													fontSize: '28px',
													flexShrink: 0
												}}>🤝</div>
												<div>
													<div style={{fontSize: '24px', fontWeight: 800, color: '#111827'}}>{overview.teams?.length || 0}</div>
													<div style={{fontSize: '13px', color: '#6b7280', fontWeight: 600}}>Active Teams</div>
												</div>
											</div>

											<div style={{
												background: '#fff',
												borderRadius: '12px',
												padding: '20px',
												boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
												border: '2px solid #e5e7eb',
												display: 'flex',
												alignItems: 'center',
												gap: '16px'
											}}>
												<div style={{
													width: '56px',
													height: '56px',
													borderRadius: '12px',
													background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													fontSize: '28px',
													flexShrink: 0
												}}>✅</div>
												<div>
													<div style={{fontSize: '24px', fontWeight: 800, color: '#111827'}}>{completedTasks.length}</div>
													<div style={{fontSize: '13px', color: '#6b7280', fontWeight: 600}}>Tasks Delivered</div>
												</div>
											</div>
										</div>
										</>
										)}

								{activeView === 'managers' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Managers</h3>
											<button
												className="btn"
												onClick={() => {
													setEditingManagerId(null)
													setManagerForm(emptyManagerForm)
													setShowManagerForm(true)
												}}
											>
												+ Add Manager
											</button>
										</div>

											{overview.managers && overview.managers.length > 0 ? (
												<div style={{display: 'grid', gap: 16}}>
													{overview.managers.map(manager => (
														<div key={manager._id} className="item-card" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
															<div style={{flex: 1}}>
																<h4 className="item-title" style={{margin: '0 0 4px 0'}}>{manager.name}</h4>
																<div className="item-meta">
																	<span>📧 {manager.email}</span>
																	<span>🏷️ {formatCategories(getUserCategories(manager))}</span>
																	{teamsByManager[manager._id] && (
																		<span>👥 {teamsByManager[manager._id].length} {teamsByManager[manager._id].length === 1 ? 'team' : 'teams'}</span>
																	)}
																</div>
															</div>
															<div style={{display: 'flex', gap: 8}}>
																<button 
																	className="btn small btn-outline" 
																	onClick={() => handleEditManager(manager)}
																	style={{minWidth: 80}}
																>
																	Edit
																</button>
																<button 
																	className="btn small" 
																	onClick={() => handleDeleteManager(manager._id)}
																	disabled={deletingManagerId === manager._id}
																	style={{background: '#ef4444', minWidth: 80}}
																>
																	{deletingManagerId === manager._id ? 'Deleting...' : 'Delete'}
																</button>
															</div>
														</div>
													))}
												</div>
											) : (
												<p style={{color:'var(--muted)', padding:'32px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>
													No managers found. Create your first manager to get started.
												</p>
											)}
										</div>
							)}

								{/* CLIENT REQUESTS VIEW */}
								{activeView === 'requests' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Pending Client Requests</h3>
										</div>
									{overview.pendingClientRequests && overview.pendingClientRequests.length ? (
										<ul>
											{overview.pendingClientRequests.map(task => {
												const assignment = assignmentSelections[task._id] || {}
												const availableManagers = getCategoryMatchedManagers(task)
												const clientName = task.createdBy ? task.createdBy.name : 'Client'
												const deadlineLabel = formatDate(task.deadline)
												return (
													<li key={task._id} style={{marginBottom: 8}}>
														<div>
															<strong>{task.title}</strong>
															<span>{` — from ${clientName} (deadline ${deadlineLabel})`}</span>
															<span>{` • Category: ${formatCategory(task.category)}`}</span>
														</div>
														<div className="small-row">
															<select value={assignment.managerId || ''} onChange={e=>setAssignmentSelection(task._id, e.target.value)}>
																<option value="">Select manager</option>
																{availableManagers.map(manager => (
																	<option key={manager._id} value={manager._id}>{manager.name} ({formatCategories(getUserCategories(manager))})</option>
																))}
															</select>
															<button className="btn small" onClick={()=>handleAssignTask(task)} disabled={assigningTaskId === task._id || availableManagers.length === 0}>
																{assigningTaskId === task._id ? 'Assigning...' : 'Assign'}
															</button>
														</div>
														{availableManagers.length === 0 && (
															<div style={{marginTop: 6, fontSize: 12, color: '#ef4444'}}>
																No managers found for category {formatCategory(task.category)}.
															</div>
														)}
													</li>
												)
											})}
										</ul>
									) : (
										<p style={{color:'var(--muted)', padding:'32px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>
											No pending client requests at the moment.
										</p>
									)}
									</div>
								)}

								{/* TEAMS VIEW */}
								{activeView === 'teams' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Teams Overview</h3>
											<span className="status-badge status-active">{overview.teams ? overview.teams.length : 0} Teams</span>
										</div>
										{overview.teams && overview.teams.length > 0 ? (
											<div style={{display: 'grid', gap: 16}}>
												{overview.teams.map(team => {
													const teamTasks = tasks.filter(t => t.assignedTeam && t.assignedTeam._id === team._id)
													const completedCount = teamTasks.filter(t => t.status === 'Completed').length
													const progressPercent = teamTasks.length > 0 ? Math.round((completedCount / teamTasks.length) * 100) : 0
													
													return (
														<div key={team._id} className="item-card">
															<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12}}>
																<div>
																	<h4 className="item-title" style={{margin: '0 0 4px 0'}}>{team.name}</h4>
																	<div className="item-meta">
																		<span>👥 {team.members ? team.members.length : 0} Members</span>
																		{team.manager && <span>👔 Manager: {team.manager.name || team.manager.email}</span>}
																	</div>
																</div>
																<div style={{textAlign: 'right'}}>
																	<div style={{fontSize: 24, fontWeight: 700, color: progressPercent === 100 ? '#22c55e' : '#3b82f6'}}>
																		{progressPercent}%
																	</div>
																	<div style={{fontSize: 12, color: '#64748b'}}>Completion</div>
																</div>
															</div>

															{/* Progress Bar */}
															<div style={{marginBottom: 12}}>
																<div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4}}>
																	<span>{completedCount} / {teamTasks.length} tasks completed</span>
																</div>
																<div style={{height: 8, background: '#e2e8f0', borderRadius: 8, overflow: 'hidden'}}>
																	<div style={{
																		height: '100%',
																		width: `${progressPercent}%`,
																		background: `linear-gradient(90deg, #3b82f6, #8b5cf6)`,
																		transition: 'width 0.3s ease',
																		borderRadius: 8
																	}} />
																</div>
															</div>

															{/* Team Members */}
															{team.members && team.members.length > 0 && (
																<details style={{marginTop: 12}}>
																	<summary style={{cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#475569'}}>
																		View Team Members
																	</summary>
																	<div style={{marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0'}}>
																		{team.members.map(member => (
																			<div key={member._id} style={{padding: '6px 0', display: 'flex', justifyContent: 'space-between'}}>
																				<span style={{fontSize: 14}}>{member.name}</span>
																				<span className="status-badge status-in-progress" style={{fontSize: 11}}>{member.role}</span>
																			</div>
																		))}
																	</div>
																</details>
															)}
														</div>
													)
												})}
											</div>
										) : (
											<p style={{color:'var(--muted)', padding:'32px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>
												No teams created yet.
											</p>
										)}
									</div>
								)}

								{/* TASK PROGRESS VIEW */}
								{activeView === 'progress' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Task Progress Tracking</h3>
											<span className="status-badge status-in-progress">{managerPipeline.length} In Progress</span>
										</div>
										{managerPipeline.length > 0 ? (
											<div style={{display: 'grid', gap: 16}}>
												{managerPipeline.map(task => {
													const statusInfo = getTaskStatusStage(task.status)
													return (
														<div key={task._id} className="item-card" style={{position: 'relative', overflow: 'hidden'}}>
															{/* Animated Background */}
															<div style={{
																position: 'absolute',
																top: 0,
																left: 0,
																height: '100%',
																width: `${statusInfo.progress}%`,
																background: `linear-gradient(90deg, ${statusInfo.color}15, ${statusInfo.color}05)`,
																transition: 'width 0.5s ease',
																zIndex: 0
															}} />

															<div style={{position: 'relative', zIndex: 1}}>
																<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12}}>
																	<div style={{flex: 1}}>
																		<h4 className="item-title" style={{margin: '0 0 8px 0'}}>{task.title}</h4>
																		<div className="item-meta">
																			<span>👔 {formatManagerName(task)}</span>
																			{task.assignedTeam && <span>👥 {task.assignedTeam.name}</span>}
																			{task.assignedTo && <span>👤 {task.assignedTo.name || task.assignedTo.email}</span>}
																		</div>
																	</div>
																	<div style={{textAlign: 'right'}}>
																		<div style={{
																			fontSize: 20,
																			fontWeight: 700,
																			color: statusInfo.color,
																			marginBottom: 4
																		}}>
																			{statusInfo.progress}%
																		</div>
																		<span className="status-badge" style={{
																			background: `${statusInfo.color}20`,
																			color: statusInfo.color,
																			border: `1px solid ${statusInfo.color}40`
																		}}>
																			{statusInfo.stage}
																		</span>
																	</div>
																</div>

																{/* Progress Bar */}
																<div style={{marginBottom: 8}}>
																	<div style={{height: 6, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden'}}>
																		<div style={{
																			height: '100%',
																			width: `${statusInfo.progress}%`,
																			background: statusInfo.color,
																			transition: 'width 0.5s ease',
																			borderRadius: 6,
																			boxShadow: `0 0 8px ${statusInfo.color}40`
																		}} />
																	</div>
																</div>

																<div style={{display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b'}}>
																	<span>📅 Deadline: {formatDate(task.deadline)}</span>
																	<span>🔄 {task.status}</span>
																</div>
															</div>
														</div>
													)
												})}
											</div>
										) : (
											<p style={{color:'var(--muted)', padding:'32px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>
												No tasks currently in progress.
											</p>
										)}
									</div>
								)}

								{/* HR REVIEW VIEW */}
								{activeView === 'review' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">HR Review & Approval</h3>
											<span className="status-badge status-pending">{awaitingHrReview.length} Awaiting Review</span>
										</div>
										{awaitingHrReview.length > 0 ? (
											<div style={{display: 'grid', gap: 16}}>
												{awaitingHrReview.map(task => {
													const isSending = sendingToClientId === task._id
													return (
														<div key={task._id} className="item-card">
															<div className="item-header">
																<h4 className="item-title">{task.title}</h4>
																<span className="status-badge status-pending">Awaiting HR Review</span>
															</div>
															{task.description && <p className="help" style={{marginTop: 8, marginBottom: 0}}>{task.description}</p>}
															<div className="item-meta" style={{marginTop: 12}}>
																<span>👔 Manager: {formatManagerName(task)}</span>
																{task.assignedTeam && <span>👥 Team: {task.assignedTeam.name}</span>}
																<span>📅 Deadline: {formatDate(task.deadline)}</span>
															</div>
															{Array.isArray(task.attachments) && task.attachments.length > 0 && (
																<details style={{marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8}}>
																	<summary style={{cursor: 'pointer', fontWeight: 600, color: '#475569'}}>
																		📎 View Deliverables ({task.attachments.length} files)
																	</summary>
																	<ul style={{marginTop: 8, paddingLeft: 20}}>
																		{task.attachments.map(file => (
																			<li key={file._id || file.filename} style={{marginTop: 4}}>
																				<a 
																					href={`${window.location.origin}/uploads/${file.filename}`}
																					target="_blank" 
																					rel="noreferrer"
																					style={{color: '#3b82f6', textDecoration: 'none'}}
																				>
																					{file.originalName || file.filename}
																				</a>
																			</li>
																		))}
																	</ul>
																</details>
															)}
															<button 
																className="btn" 
																style={{marginTop: 16, width: '100%', background: '#22c55e'}} 
																onClick={()=>handleSendToClient(task._id)} 
																disabled={isSending}
															>
																{isSending ? 'Sending to Client...' : '✓ Approve & Send to Client'}
															</button>
														</div>
													)
												})}
											</div>
										) : (
											<p style={{color:'var(--muted)', padding:'32px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>
												No tasks are waiting for HR review. Great job keeping up!
											</p>
										)}
									</div>
								)}

								{/* MESSAGES VIEW */}
								{activeView === 'messages' && (
									<div className="dashboard-section">
										<ChatMessages />
									</div>
								)}

								{/* PROFILE VIEW */}
								{activeView === 'profile' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">My Profile</h3>
										</div>
										<div style={{maxWidth: 720, margin: '0 auto'}}>
											<ProfileSettings
												kind="user"
												view="profile"
												profile={profile}
												passwordDisabledMessage="You can't update your password here. Please contact the Admin who created your account to update your password."
												onProfileUpdated={(updated) => {
													setProfile((prev) => ({ ...prev, ...(updated || {}) }))
												}}
											/>
										</div>
									</div>
								)}


								{/* SETTINGS VIEW */}
								{activeView === 'settings' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Settings</h3>
										</div>
										<div style={{maxWidth: 720, margin: '0 auto'}}>
											<ProfileSettings
												kind="user"
												view="settings"
												profile={profile}
												passwordDisabledMessage="You can't update your password here. Please contact the Admin who created your account to update your password."
												onProfileUpdated={(updated) => {
													setProfile((prev) => ({ ...prev, ...(updated || {}) }))
												}}
											/>
										</div>
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</div>

			{/* Manager Modal */}
			{showManagerForm && (
				<div className="modal-overlay" onClick={() => {
					setShowManagerForm(false)
					setManagerForm(emptyManagerForm)
					setEditingManagerId(null)
				}}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3 className="modal-title">{editingManagerId ? 'Edit Manager' : 'Create New Manager'}</h3>
							<button 
								className="modal-close" 
								onClick={() => {
									setShowManagerForm(false)
									setManagerForm(emptyManagerForm)
									setEditingManagerId(null)
								}}
							>
								×
							</button>
						</div>
						<form onSubmit={handleManagerCreate}>
							<div className="modal-body">
								<div className="form">
									<label>Name
										<input value={managerForm.name} onChange={e => setManagerForm(prev => ({...prev, name: e.target.value}))} required />
									</label>
									<label>Email
										<input 
											type="email" 
											value={managerForm.email} 
											onChange={e => setManagerForm(prev => ({...prev, email: e.target.value}))} 
											required 
											disabled={editingManagerId !== null}
											style={{opacity: editingManagerId ? 0.6 : 1}}
										/>
										{editingManagerId && <div style={{marginTop: 4, fontSize: 12, color: 'var(--muted)'}}>Email cannot be changed</div>}
									</label>
									<label>Password {editingManagerId && '(leave blank to keep current)'}
										<input 
											type="password" 
											value={managerForm.password} 
											onChange={e => setManagerForm(prev => ({...prev, password: e.target.value}))} 
											required={!editingManagerId} 
										/>
									</label>
									<label>Categories (multiple)
										<div style={{
											marginTop: 8,
											border: '1px solid #d1d5db',
											borderRadius: 8,
											padding: 10,
											display: 'grid',
											gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
											gap: 8
										}}>
											{CATEGORY_OPTIONS.map(option => (
												<label key={option.value} style={{display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500}}>
													<input
														type="checkbox"
														checked={(managerForm.categories || []).includes(option.value)}
														onChange={() => toggleManagerCategory(option.value)}
													/>
													{option.label}
												</label>
											))}
										</div>
										<div style={{marginTop: 6, fontSize: 12, color: '#475569'}}>
											Selected: {formatCategories(managerForm.categories || [])}
										</div>
									</label>
								</div>
							</div>
							<div className="modal-footer">
								<button 
									type="button" 
									className="btn btn-outline" 
									onClick={() => {
										setShowManagerForm(false)
										setManagerForm(emptyManagerForm)
										setEditingManagerId(null)
									}}
								>
									Cancel
								</button>
								<button className="btn" disabled={submittingManager}>
									{submittingManager ? 'Saving...' : (editingManagerId ? 'Update Manager' : 'Create Manager')}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</>
	)}