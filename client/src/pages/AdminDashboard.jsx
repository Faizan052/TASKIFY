import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession } from '../api'
import { useUnreadMessages } from '../hooks/useUnreadMessages'
import { formatDate } from '../utils/helpers'
import ProfileSettings from '../components/ProfileSettings'
import ChatMessages from '../components/ChatMessages'
import UserManagement from '../components/UserManagement'
import DashboardWelcomeBanner from '../components/DashboardWelcomeBanner'
import UserProgressDashboard from '../components/UserProgressDashboard'

const AUTO_REFRESH_INTERVAL = 30000
const emptyHrForm = { name: '', email: '', password: '' }
const FLASH_MESSAGE_MS = 1500

export default function AdminDashboard(){
	const nav = useNavigate()
	const [profile, setProfile] = useState(null)
	const [tasks, setTasks] = useState([])
	const [teams, setTeams] = useState([])
	const [clients, setClients] = useState([])
	const [hrs, setHrs] = useState([])
	const [_loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [activeView, setActiveView] = useState('overview')
	const [message, setMessage] = useState('')
	const [hrForm, setHrForm] = useState(emptyHrForm)
	const [showHrForm, setShowHrForm] = useState(false)
	const [submittingHr, setSubmittingHr] = useState(false)
	const [editingHrId, setEditingHrId] = useState(null)
	const { unreadMessages, setUnreadMessages } = useUnreadMessages(10000)
	const [performanceReport, setPerformanceReport] = useState(null)
	const [progressFilter, setProgressFilter] = useState({ teamId: '', userId: '' })
	const [progressDetail, setProgressDetail] = useState(null)
	const [loadingProgressDetail, setLoadingProgressDetail] = useState(false)
	const refreshInFlight = useRef(false)

	const adminDetails = useMemo(() => profile && profile.admin ? profile.admin : null, [profile])
	const displayName = adminDetails && adminDetails.username ? adminDetails.username : 'Admin'

	const loadDashboard = useCallback(async (withSpinner = false) => {
		if (refreshInFlight.current) return
		refreshInFlight.current = true
		if (withSpinner) setLoading(true)
		setError(null)
		try{
			const [profileData, taskData, teamData, userData, hrData, reportData] = await Promise.all([
				apiFetch('/api/admin/profile'),
				apiFetch('/api/admin/tasks'),
				apiFetch('/api/admin/teams'),
				apiFetch('/api/admin/users'),
				apiFetch('/api/admin/hr').catch(() => []),
				apiFetch('/api/admin/performance-report')
			])
			setProfile(profileData)
			setTasks(taskData)
			setTeams(teamData)
			setClients(userData.filter(user => user.role === 'client'))
			setHrs(hrData)
			setPerformanceReport(reportData)
		}catch(err){ setError(err.message) }
		finally{ 
			if (withSpinner) setLoading(false)
			refreshInFlight.current = false
		}
	},[])

	useEffect(()=>{ loadDashboard(true) },[loadDashboard])

	useEffect(() => {
		if (!message) return
		const timer = setTimeout(() => setMessage(''), FLASH_MESSAGE_MS)
		return () => clearTimeout(timer)
	}, [message])

	useEffect(() => {
		if (!error) return
		const timer = setTimeout(() => setError(null), FLASH_MESSAGE_MS)
		return () => clearTimeout(timer)
	}, [error])

	useEffect(()=>{
		const id = setInterval(()=>{
			if (typeof document !== 'undefined' && document.hidden) return
			loadDashboard()
		}, AUTO_REFRESH_INTERVAL)
		return () => clearInterval(id)
	},[loadDashboard])

	useEffect(() => {
		if (typeof document === 'undefined') return
		const onVisibilityChange = () => {
			if (!document.hidden) {
				loadDashboard()
			}
		}
		document.addEventListener('visibilitychange', onVisibilityChange)
		return () => document.removeEventListener('visibilitychange', onVisibilityChange)
	}, [loadDashboard])

	const logout = () => {
		clearSession()
		nav('/admin/login')
	}

	const handleHrCreate = async (e) => {
		e.preventDefault()
		setSubmittingHr(true)
		setMessage('')
		setError(null)
		try {
			if (editingHrId) {
				await apiFetch(`/api/admin/hr/${editingHrId}`, { method: 'PUT', body: hrForm })
				setMessage('HR updated successfully')
			} else {
				await apiFetch('/api/admin/hr', { method: 'POST', body: hrForm })
				setMessage('HR created successfully')
			}
			setHrForm(emptyHrForm)
			setShowHrForm(false)
			setEditingHrId(null)
			await loadDashboard()
		} catch (err) {
			setError(err.message)
		} finally {
			setSubmittingHr(false)
		}
	}

	const handleEditHr = (hr) => {
		setEditingHrId(hr._id)
		setHrForm({ name: hr.name, email: hr.email, password: '' })
		setShowHrForm(true)
	}

	const deleteHr = async (hrId) => {
		if (!window.confirm('Are you sure you want to delete this HR?')) return
		try {
			await apiFetch(`/api/admin/hr/${hrId}`, { method: 'DELETE' })
			setMessage('HR deleted successfully')
			loadDashboard()
		} catch (err) {
			setError(err.message)
		}
	}

	const refreshPerformanceReport = async (nextFilter = progressFilter) => {
		try {
			const params = new URLSearchParams()
			if (nextFilter.teamId) params.set('teamId', nextFilter.teamId)
			if (nextFilter.userId) params.set('userId', nextFilter.userId)
			const query = params.toString()
			const data = await apiFetch(`/api/admin/performance-report${query ? `?${query}` : ''}`)
			setPerformanceReport(data)
		} catch (err) {
			setError(err.message)
		}
	}

	const handleProgressFilterChange = async ({ teamId, userId }) => {
		const nextFilter = { teamId: teamId || '', userId: userId || '' }
		setProgressFilter(nextFilter)
		await refreshPerformanceReport(nextFilter)
	}

	const viewUserProgress = async (userId) => {
		setLoadingProgressDetail(true)
		setActiveView('user-progress')
		try {
			const data = await apiFetch(`/api/admin/performance-report/user/${userId}`)
			setProgressDetail({
				type: 'user',
				title: data?.user?.name || data?.user?.email || 'User',
				metrics: data?.report || {}
			})
		} catch (err) {
			setError(err.message)
		} finally {
			setLoadingProgressDetail(false)
		}
	}

	const viewTeamProgress = async (teamId) => {
		setLoadingProgressDetail(true)
		setActiveView('user-progress')
		try {
			const data = await apiFetch(`/api/admin/performance-report/team/${teamId}`)
			setProgressDetail({
				type: 'team',
				title: data?.team?.name || 'Team',
				metrics: data?.report?.summary || {}
			})
		} catch (err) {
			setError(err.message)
		} finally {
			setLoadingProgressDetail(false)
		}
	}

	const renderContent = () => {
		switch(activeView){
			case 'hrs':
				return (
					<div className="admin-view">
						<div className="admin-view-header">
							<h2>HR's Overview</h2>
							<button className="btn" onClick={() => {
								setEditingHrId(null)
								setHrForm(emptyHrForm)
								setShowHrForm(!showHrForm)
							}}>
								{showHrForm ? 'Cancel' : '+ Add HR'}
							</button>
						</div>
						{message && <div className="admin-message">{message}</div>}
						{error && <div className="error-message">{error}</div>}

						<div className="admin-grid">
							{hrs && hrs.length ? hrs.map(hr => (
								<div key={hr._id} className="admin-card">
									<div className="admin-card-header">
										<h3>{hr.name || hr.email}</h3>
										<span className="status-badge status-active">HR</span>
									</div>
									<div className="admin-card-body">
										<p><strong>Email:</strong> {hr.email}</p>
										<p><strong>Joined:</strong> {formatDate(hr.createdAt)}</p>
										<div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
											<button className="btn btn-outline" onClick={() => viewUserProgress(hr._id)}>View Progress</button>
											<button className="btn btn-outline" onClick={() => handleEditHr(hr)}>Edit</button>
											<button className="btn btn-outline danger-action" onClick={() => deleteHr(hr._id)}>Delete</button>
										</div>
									</div>
								</div>
							)) : <p className="empty-state">No HR users found</p>}
						</div>
					</div>
				)

			case 'managers':
				return (
					<div className="admin-view">
						<div className="admin-view-header">
							<h2>Managers Overview</h2>
						</div>
						<div className="admin-grid">
							{profile.managers && profile.managers.length ? profile.managers.map(manager => (
								<div key={manager._id} className="admin-card">
									<div className="admin-card-header">
										<h3>{manager.name}</h3>
										<span className="status-badge status-active">Active</span>
									</div>
									<div className="admin-card-body">
										<p><strong>Email:</strong> {manager.email}</p>
										<p><strong>Role:</strong> Manager</p>
										<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
											<button className="btn small btn-outline" onClick={() => viewUserProgress(manager._id)}>View Progress</button>
										</div>
										<div className="progress-info">
											<div className="progress-label">Success Rate</div>
											<div className="progress-bar">
												<div className="progress-fill" style={{width: '85%'}}></div>
											</div>
											<span className="progress-value">85%</span>
										</div>
									</div>
								</div>
							)) : <p className="empty-state">No managers found</p>}
						</div>
					</div>
				)

			case 'teams':
				return (
					<div className="admin-view">
						<div className="admin-view-header">
							<h2>Teams Overview</h2>
						</div>
						<div className="admin-grid">
							{teams && teams.length ? teams.map(team => (
								<div key={team._id} className="admin-card">
									<div className="admin-card-header">
										<h3>{team.name}</h3>
										<span className="status-badge status-info">{team.members?.length || 0} Members</span>
									</div>
									<div className="admin-card-body">
										<p><strong>Manager:</strong> {team.manager ? team.manager.name : 'Not assigned'}</p>
										<p><strong>Members:</strong> {team.members && team.members.length ? team.members.map(m => m.name || m.email).join(', ') : 'None'}</p>
										<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
											<button className="btn small btn-outline" onClick={() => viewTeamProgress(team._id)}>View Progress</button>
										</div>
										<div className="progress-info">
											<div className="progress-label">Team Progress</div>
											<div className="progress-bar">
												<div className="progress-fill" style={{width: '70%'}}></div>
											</div>
											<span className="progress-value">70%</span>
										</div>
									</div>
								</div>
							)) : <p className="empty-state">No teams found</p>}
						</div>
					</div>
				)

			case 'clients':
				return (
					<div className="admin-view">
						<div className="admin-view-header">
							<h2>Clients Overview</h2>
						</div>
						<div className="admin-grid">
							{clients && clients.length ? clients.map(client => (
								<div key={client._id} className="admin-card">
									<div className="admin-card-header">
										<h3>{client.name || client.email}</h3>
										<span className="status-badge status-active">Client</span>
									</div>
									<div className="admin-card-body">
										<p><strong>Email:</strong> {client.email}</p>
										<p><strong>Joined:</strong> {formatDate(client.createdAt)}</p>
										<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
											<button className="btn small btn-outline" onClick={() => viewUserProgress(client._id)}>View Progress</button>
										</div>
									</div>
								</div>
							)) : <p className="empty-state">No clients found</p>}
						</div>
					</div>
				)

			case 'user-progress':
				return (
					<div className="admin-view">
						<UserProgressDashboard
							report={performanceReport}
							selectedTeamId={progressFilter.teamId}
							selectedUserId={progressFilter.userId}
							onFilterChange={handleProgressFilterChange}
							onViewUserProgress={viewUserProgress}
							onViewTeamProgress={viewTeamProgress}
							detailView={progressDetail}
							loadingDetail={loadingProgressDetail}
						/>
					</div>
				)

			case 'tasks':
				return (
					<div className="admin-view">
						<div className="admin-view-header">
							<h2>All Tasks</h2>
						</div>
						<div className="admin-table-container">
							{tasks && tasks.length ? (
								<table className="admin-table">
									<thead>
										<tr>
											<th>Title</th>
											<th>Assigned To</th>
											<th>Team</th>
											<th>Status</th>
											<th>Deadline</th>
										</tr>
									</thead>
									<tbody>
										{tasks.map(task => {
											const statusClass = task.status === 'completed' ? 'status-completed' : task.status === 'in-progress' ? 'status-in-progress' : 'status-pending';
											return (
												<tr key={task._id}>
													<td>{task.title}</td>
													<td>{task.assignedTo ? `${task.assignedTo.name} (${task.assignedTo.role})` : '—'}</td>
													<td>{task.assignedTeam ? task.assignedTeam.name : '—'}</td>
													<td><span className={`status-badge ${statusClass}`}>{task.status}</span></td>
													<td>{formatDate(task.deadline)}</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							) : <p className="empty-state">No tasks found</p>}
						</div>
					</div>
				)

			case 'profile':
				return (
					<div className="admin-view">
						<div className="admin-view-header">
							<h2>Admin Profile</h2>
						</div>
						{message && <div className="admin-message">{message}</div>}
						{error && <div className="error-message">{error}</div>}
						<div className="profile-full-width">
								<ProfileSettings
								kind="admin"
								view="profile"
									className="profile-dashboard-glass"
								profile={adminDetails}
								onProfileUpdated={async () => {
									await loadDashboard(false)
								}}
							/>
						</div>
					</div>
				)

		case 'messages':
			return (
				<div className="admin-view">
					
					<ChatMessages 
						onUnreadCountChange={setUnreadMessages}
					/>
				</div>
			)

		case 'user-management':
			return (
				<div className="admin-view">
					<div className="admin-view-header">
						<h2>User Management</h2>
						<p style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
							Manage user accounts - activate, deactivate, or remove users from the system
						</p>
					</div>
					<UserManagement />
				</div>
			)

		case 'settings':
			return (
				<div className="admin-view">					<div className="admin-view-header">
						<h2>Settings</h2>
					</div>
					{message && <div className="admin-message">{message}</div>}
					{error && <div className="error-message">{error}</div>}
						<div className="profile-full-width">
							<ProfileSettings
							kind="admin"
							view="settings"
								className="profile-dashboard-glass"
							profile={adminDetails}
							onProfileUpdated={async () => {
								await loadDashboard(false)
							}}
						/>						</div>
					</div>
				)

			default: {
				const completedTasks = tasks?.filter(t => t.status === 'Completed').length || 0
				const cancelledTasks = tasks?.filter(t => t.status === 'Cancelled').length || 0
				const activeTasks = (tasks?.length || 0) - completedTasks - cancelledTasks
				const totalForRate = (tasks?.length || 0) - cancelledTasks
				const completionRate = totalForRate > 0 ? Math.round((completedTasks / totalForRate) * 100) : 0

				return (
					<div className="admin-view">
						{/* Stats Cards Grid */}
						<div style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
							gap: '20px',
							marginBottom: '32px'
						}}>
							<div onClick={() => setActiveView('hrs')} style={{
								background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
								borderRadius: '16px',
								padding: '24px',
								cursor: 'pointer',
								transition: 'all 0.3s ease',
								boxShadow: '0 4px 16px rgba(102, 126, 234, 0.25)',
								position: 'relative',
								overflow: 'hidden'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.transform = 'translateY(-4px)'
								e.currentTarget.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.35)'
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.transform = 'translateY(0)'
								e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.25)'
							}}>
								<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>👥</div>
								<div style={{position: 'relative'}}>
									<div style={{fontSize: '48px', marginBottom: '8px'}}>👥</div>
									<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>{hrs?.length || 0}</div>
									<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>HR's</div>
									<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Human Resources Team</div>
								</div>
							</div>

							<div onClick={() => setActiveView('managers')} style={{
								background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
								borderRadius: '16px',
								padding: '24px',
								cursor: 'pointer',
								transition: 'all 0.3s ease',
								boxShadow: '0 4px 16px rgba(240, 147, 251, 0.25)',
								position: 'relative',
								overflow: 'hidden'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.transform = 'translateY(-4px)'
								e.currentTarget.style.boxShadow = '0 8px 24px rgba(240, 147, 251, 0.35)'
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.transform = 'translateY(0)'
								e.currentTarget.style.boxShadow = '0 4px 16px rgba(240, 147, 251, 0.25)'
							}}>
								<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>👔</div>
								<div style={{position: 'relative'}}>
									<div style={{fontSize: '48px', marginBottom: '8px'}}>👔</div>
									<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>{profile.managers?.length || 0}</div>
									<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Managers</div>
									<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Project Supervisors</div>
								</div>
							</div>

							<div onClick={() => setActiveView('teams')} style={{
								background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
								borderRadius: '16px',
								padding: '24px',
								cursor: 'pointer',
								transition: 'all 0.3s ease',
								boxShadow: '0 4px 16px rgba(79, 172, 254, 0.25)',
								position: 'relative',
								overflow: 'hidden'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.transform = 'translateY(-4px)'
								e.currentTarget.style.boxShadow = '0 8px 24px rgba(79, 172, 254, 0.35)'
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.transform = 'translateY(0)'
								e.currentTarget.style.boxShadow = '0 4px 16px rgba(79, 172, 254, 0.25)'
							}}>
								<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>🤝</div>
								<div style={{position: 'relative'}}>
									<div style={{fontSize: '48px', marginBottom: '8px'}}>🤝</div>
									<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>{teams?.length || 0}</div>
									<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Teams</div>
									<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Active Development Units</div>
								</div>
							</div>

							<div onClick={() => setActiveView('clients')} style={{
								background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
								borderRadius: '16px',
								padding: '24px',
								cursor: 'pointer',
								transition: 'all 0.3s ease',
								boxShadow: '0 4px 16px rgba(250, 112, 154, 0.25)',
								position: 'relative',
								overflow: 'hidden'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.transform = 'translateY(-4px)'
								e.currentTarget.style.boxShadow = '0 8px 24px rgba(250, 112, 154, 0.35)'
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.transform = 'translateY(0)'
								e.currentTarget.style.boxShadow = '0 4px 16px rgba(250, 112, 154, 0.25)'
							}}>
								<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>💼</div>
								<div style={{position: 'relative'}}>
									<div style={{fontSize: '48px', marginBottom: '8px'}}>💼</div>
									<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>{clients?.length || 0}</div>
									<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Clients</div>
									<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Business Partners</div>
								</div>
							</div>
						</div>

						{/* Task Overview Section */}
						<div style={{
							background: '#fff',
							borderRadius: '16px',
							padding: '28px',
							boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
							marginBottom: '24px'
						}}>
							<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
								<div>
									<h3 style={{margin: 0, fontSize: '22px', fontWeight: 700, color: '#111827'}}>📋 Task Overview</h3>
									<p style={{margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280'}}>Platform-wide task statistics</p>
								</div>
								<div onClick={() => setActiveView('tasks')} style={{
									cursor: 'pointer',
									padding: '10px 20px',
									background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
									color: '#fff',
									borderRadius: '10px',
									fontSize: '14px',
									fontWeight: 600,
									transition: 'all 0.2s ease',
									boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
								}}
								onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
								onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
									View All Tasks →
								</div>
							</div>

							<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px'}}>
								<div style={{padding: '20px', background: 'linear-gradient(135deg, #667eea15, #764ba215)', borderRadius: '12px', border: '2px solid #667eea30'}}>
									<div style={{fontSize: '32px', fontWeight: 800, color: '#667eea', marginBottom: '4px'}}>{tasks?.length || 0}</div>
									<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>Total Tasks</div>
								</div>
								<div style={{padding: '20px', background: 'linear-gradient(135deg, #3b82f615, #2563eb15)', borderRadius: '12px', border: '2px solid #3b82f630'}}>
									<div style={{fontSize: '32px', fontWeight: 800, color: '#3b82f6', marginBottom: '4px'}}>{activeTasks}</div>
									<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>In Progress</div>
								</div>
								<div style={{padding: '20px', background: 'linear-gradient(135deg, #22c55e15, #16a34a15)', borderRadius: '12px', border: '2px solid #22c55e30'}}>
									<div style={{fontSize: '32px', fontWeight: 800, color: '#22c55e', marginBottom: '4px'}}>{completedTasks}</div>
									<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>Completed</div>
								</div>
								<div style={{padding: '20px', background: 'linear-gradient(135deg, #f59e0b15, #d9770615)', borderRadius: '12px', border: '2px solid #f59e0b30'}}>
									<div style={{fontSize: '32px', fontWeight: 800, color: '#f59e0b', marginBottom: '4px'}}>{completionRate}%</div>
									<div style={{fontSize: '14px', color: '#4b5563', fontWeight: 600}}>Success Rate</div>
								</div>
							</div>

							{/* Progress Bar */}
							<div>
								<div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
									<span style={{fontSize: '14px', fontWeight: 600, color: '#374151'}}>Overall Progress</span>
									<span style={{fontSize: '14px', fontWeight: 700, color: '#667eea'}}>{completionRate}%</span>
								</div>
								<div style={{height: '12px', background: '#e5e7eb', borderRadius: '12px', overflow: 'hidden', position: 'relative'}}>
									<div style={{
										height: '100%',
										width: `${completionRate}%`,
										background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
										borderRadius: '12px',
										transition: 'width 0.6s ease',
										boxShadow: '0 0 12px rgba(102, 126, 234, 0.5)'
									}} />
								</div>
							</div>
						</div>

						{/* Quick Actions */}
						<div style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
							gap: '16px'
						}}>
							<div onClick={() => setActiveView('profile')} style={{
								background: '#fff',
								borderRadius: '12px',
								padding: '20px',
								cursor: 'pointer',
								transition: 'all 0.2s ease',
								boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
								border: '2px solid #e5e7eb',
								display: 'flex',
								alignItems: 'center',
								gap: '16px'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = '#667eea'
								e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.2)'
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = '#e5e7eb'
								e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
							}}>
								<div style={{fontSize: '40px'}}>👤</div>
								<div>
									<div style={{fontSize: '16px', fontWeight: 700, color: '#111827'}}>Profile</div>
									<div style={{fontSize: '13px', color: '#6b7280'}}>Manage your account</div>
								</div>
							</div>

							<div onClick={() => setActiveView('settings')} style={{
								background: '#fff',
								borderRadius: '12px',
								padding: '20px',
								cursor: 'pointer',
								transition: 'all 0.2s ease',
								boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
								border: '2px solid #e5e7eb',
								display: 'flex',
								alignItems: 'center',
								gap: '16px'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = '#667eea'
								e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.2)'
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = '#e5e7eb'
								e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
							}}>
								<div style={{fontSize: '40px'}}>⚙️</div>
								<div>
									<div style={{fontSize: '16px', fontWeight: 700, color: '#111827'}}>Settings</div>
									<div style={{fontSize: '13px', color: '#6b7280'}}>Configure preferences</div>
								</div>
							</div>
						</div>
					</div>
				)
			}
		}
	}

	// Dropdown states
	const [showManageDropdown, setShowManageDropdown] = useState(false)
	const [showUsersDropdown, setShowUsersDropdown] = useState(false)
	const [showViewDropdown, setShowViewDropdown] = useState(false)
	const [showProfileMenu, setShowProfileMenu] = useState(false)

	// Close dropdowns when clicking outside
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (!e.target.closest('.admin-nav-dropdown') && !e.target.closest('.floating-profile-wrapper')) {
				setShowManageDropdown(false)
				setShowUsersDropdown(false)
				setShowViewDropdown(false)
				setShowProfileMenu(false)
			}
		}
		document.addEventListener('click', handleClickOutside)
		return () => document.removeEventListener('click', handleClickOutside)
	}, [])

	return (
		<div className="admin-dashboard-fullscreen">
			{/* Glass-morphism Header */}
			<header className="admin-glass-header">
				<div className="admin-glass-header-content">
					{/* Left - Title */}
					<div className="admin-header-left">
						<h1 className="admin-dashboard-title">Admin Dashboard</h1>
					</div>

					{/* Center - Navigation */}
					<nav className="admin-header-nav">
						<button 
							className={`admin-nav-btn ${activeView === 'overview' ? 'active' : ''}`}
							onClick={() => setActiveView('overview')}
						>
							<span className="nav-icon">🏠</span>
							<span>Dashboard</span>
						</button>

						{/* Manage Dropdown */}
						<div 
							className="admin-nav-dropdown"
							onMouseEnter={() => setShowManageDropdown(true)}
							onMouseLeave={() => setShowManageDropdown(false)}
						>
							<button className="admin-nav-btn">
								<span className="nav-icon">⚙️</span>
								<span>Manage</span>
								<span className="dropdown-arrow">▼</span>
							</button>
							{showManageDropdown && (
								<div className="admin-dropdown-menu">
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('hrs')
											setShowManageDropdown(false)
										}}
									>
										<span className="dropdown-icon">👥</span>
										<span>Manage HRs</span>
									</button>
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('user-management')
											setShowManageDropdown(false)
										}}
									>
										<span className="dropdown-icon">👤</span>
										<span>User Management</span>
									</button>
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('settings')
											setShowManageDropdown(false)
										}}
									>
										<span className="dropdown-icon">⚙️</span>
										<span>Settings</span>
									</button>
								</div>
							)}
						</div>

						{/* Users Dropdown */}
						<div 
							className="admin-nav-dropdown"
							onMouseEnter={() => setShowUsersDropdown(true)}
							onMouseLeave={() => setShowUsersDropdown(false)}
						>
							<button className="admin-nav-btn">
								<span className="nav-icon">👥</span>
								<span>View</span>
								<span className="dropdown-arrow">▼</span>
							</button>
							{showUsersDropdown && (
								<div className="admin-dropdown-menu">
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('hrs')
											setShowUsersDropdown(false)
										}}
									>
										<span className="dropdown-icon">👥</span>
										<span>View HRs</span>
									</button>
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('managers')
											setShowUsersDropdown(false)
										}}
									>
										<span className="dropdown-icon">👔</span>
										<span>View Managers</span>
									</button>
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('clients')
											setShowUsersDropdown(false)
										}}
									>
										<span className="dropdown-icon">💼</span>
										<span>View Clients</span>
									</button>
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('teams')
											setShowUsersDropdown(false)
										}}
									>
										<span className="dropdown-icon">🤝</span>
										<span>View Teams</span>
									</button>
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('tasks')
											setShowUsersDropdown(false)
										}}
									>
										<span className="dropdown-icon">✓</span>
										<span>View Tasks</span>
									</button>
								</div>
							)}
						</div>

						<div 
							className="admin-nav-dropdown"
							onMouseEnter={() => setShowViewDropdown(true)}
							onMouseLeave={() => setShowViewDropdown(false)}
						>
							<button className={`admin-nav-btn ${activeView === 'user-progress' ? 'active' : ''}`}>
								<span className="nav-icon">👁️</span>
								<span>Progress</span>
								<span className="dropdown-arrow">▼</span>
							</button>
							{showViewDropdown && (
								<div className="admin-dropdown-menu">
									<button 
										className="dropdown-item"
										onClick={() => {
											setActiveView('user-progress')
											setShowViewDropdown(false)
										}}
									>
										<span className="dropdown-icon">📈</span>
										<span>User Progress</span>
									</button>
								</div>
							)}
						</div>

						{/* Messages Button */}
						<button 
							className={`admin-nav-btn ${activeView === 'messages' ? 'active' : ''}`}
							onClick={() => setActiveView('messages')}
							style={{ position: 'relative' }}
						>
							<span className="nav-icon">💬</span>
							<span>Messages</span>
							{unreadMessages > 0 && (
								<span className="header-badge">{unreadMessages}</span>
							)}
						</button>
					</nav>

					{/* Right - Logout Button */}
					<div className="admin-header-right">
						<button className="admin-logout-btn" onClick={logout}>
							<span className="logout-icon">🚪</span>
							<span>Logout</span>
						</button>
					</div>
				</div>
			</header>

			{/* Main Content Area */}
			<div className="admin-main-wrapper">
				{/* Floating Profile Button */}
				<div className="floating-profile-wrapper" onMouseEnter={() => setShowProfileMenu(true)} onMouseLeave={() => setShowProfileMenu(false)}>
					<button 
						className="floating-profile-btn"
						onClick={() => setShowProfileMenu(!showProfileMenu)}
					>
						<div className="floating-avatar">
							{displayName.charAt(0).toUpperCase()}
						</div>
					</button>
					
					{showProfileMenu && (
						<div className="floating-profile-menu">
							<div className="profile-menu-header">
								<div className="profile-menu-avatar">
									{displayName.charAt(0).toUpperCase()}
								</div>
								<div className="profile-menu-info">
									<div className="profile-menu-name">{displayName}</div>
									<div className="profile-menu-role">Administrator</div>
								</div>
							</div>
							<div className="profile-menu-divider"></div>
							<button 
								className="profile-menu-item"
								onClick={() => {
									setActiveView('profile')
									setShowProfileMenu(false)
								}}
							>
								<span className="menu-icon">👤</span>
								<span>Profile</span>
							</button>
							<button 
								className="profile-menu-item"
								onClick={() => {
									setActiveView('settings')
									setShowProfileMenu(false)
								}}
							>
								<span className="menu-icon">⚙️</span>
								<span>Settings</span>
							</button>
							<div className="profile-menu-divider"></div>
							<button 
								className="profile-menu-item logout"
								onClick={logout}
							>
								<span className="menu-icon">🚪</span>
								<span>Logout</span>
							</button>
						</div>
					)}
				</div>
				
				<div className="admin-content">
					{activeView === 'overview' && (
						<DashboardWelcomeBanner name={displayName} role="admin" />
					)}
					{profile ? renderContent() : null}
				</div>
			</div>


			{/* HR Modal */}
			{showHrForm && (
				<div className="modal-overlay" onClick={() => {
					setShowHrForm(false)
					setHrForm(emptyHrForm)
					setEditingHrId(null)
				}}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3 className="modal-title">{editingHrId ? 'Edit HR' : 'Create New HR'}</h3>
							<button 
								className="modal-close" 
								onClick={() => {
									setShowHrForm(false)
									setHrForm(emptyHrForm)
									setEditingHrId(null)
								}}
							>
								×
							</button>
						</div>
						<form onSubmit={handleHrCreate}>
							<div className="modal-body">
								<div className="form">
									<label>Name
										<input value={hrForm.name} onChange={e => setHrForm(prev => ({...prev, name: e.target.value}))} required />
									</label>
									<label>Email
										<input 
											type="email" 
											value={hrForm.email} 
											onChange={e => setHrForm(prev => ({...prev, email: e.target.value}))} 
											required 
											disabled={editingHrId !== null}
											style={{opacity: editingHrId ? 0.6 : 1}}
										/>
										{editingHrId && <div style={{marginTop: 4, fontSize: 12, color: 'var(--muted)'}}>Email cannot be changed</div>}
									</label>
									<label>Password {editingHrId && '(leave blank to keep current)'}
										<input 
											type="password" 
											value={hrForm.password} 
											onChange={e => setHrForm(prev => ({...prev, password: e.target.value}))} 
											required={!editingHrId} 
										/>
									</label>
								</div>
							</div>
							<div className="modal-footer">
								<button 
									type="button" 
									className="btn btn-outline" 
									onClick={() => {
										setShowHrForm(false)
										setHrForm(emptyHrForm)
										setEditingHrId(null)
									}}
								>
									Cancel
								</button>
								<button className="btn" disabled={submittingHr}>
									{submittingHr ? 'Saving...' : (editingHrId ? 'Update HR' : 'Create HR')}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	)
}
