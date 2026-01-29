import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession } from '../api'
import ProfileSettings from '../components/ProfileSettings'
import ChatMessages from '../components/ChatMessages'
import PasswordResetRequests from '../components/PasswordResetRequests'

const emptyManagerForm = { name: '', email: '', password: '' }
const emptyProfileForm = { name: '', phone: '', department: '', profilePicture: null }
const formatRoleLabel = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '')
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
	const [unreadMessages, setUnreadMessages] = useState(0)
	const [managerForm, setManagerForm] = useState(emptyManagerForm)
	const [submittingManager, setSubmittingManager] = useState(false)
	const [showManagerForm, setShowManagerForm] = useState(false)
	const [editingManagerId, setEditingManagerId] = useState(null)
	const [assigningTaskId, setAssigningTaskId] = useState('')
	const [assignmentSelections, setAssignmentSelections] = useState({})
	const [sendingToClientId, setSendingToClientId] = useState('')
	const [profileForm, setProfileForm] = useState(emptyProfileForm)
	const [updatingProfile, setUpdatingProfile] = useState(false)
	const [deletingManagerId, setDeletingManagerId] = useState(null)
	const teamsByManager = useMemo(()=>{
		if (!overview) return {}
		return overview.teams.reduce((acc, team)=>{
			const managerId = team.manager ? team.manager._id : 'unassigned'
			if (!acc[managerId]) acc[managerId] = []
			acc[managerId].push(team)
			return acc
		}, {})
	}, [overview])

	const managerPipeline = useMemo(()=>tasks.filter(task => [
		'Awaiting Manager Assignment',
		'Design In Progress',
		'Design Completed - Pending Manager Review',
		'Development In Progress',
		'Development Completed - Pending Manager Review',
		'Testing In Progress',
		'Testing Completed - Pending Manager Final Review',
		'Changes Requested'
	].includes(task.status)), [tasks])
	const awaitingHrReview = useMemo(()=>tasks.filter(task => task.status === 'Awaiting HR Review'), [tasks])
	const awaitingClientReview = useMemo(()=>tasks.filter(task => task.status === 'Awaiting Client Review'), [tasks])
	const completedTasks = useMemo(()=>tasks.filter(task => task.status === 'Completed'), [tasks])

	const formatManagerName = (task) => {
		if (task.manager) return task.manager.name || task.manager.email || 'Manager'
		if (task.assignedTo && task.assignedTo.role === 'manager') {
			return task.assignedTo.name || task.assignedTo.email || 'Manager'
		}
		return 'GÇö'
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
		setEditingManagerId(manager._id)
		setManagerForm({ name: manager.name, email: manager.email, password: '' })
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

	const handleProfileUpdate = async (e) => {
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
			await apiFetch('/api/hr/managers', { method: 'POST', body: managerForm })
			setManagerForm(emptyManagerForm)
			setMessage('Manager created')
			await refreshOverview()
		}catch(err){ setError(err.message) }
		finally{ setSubmittingManager(false) }
	}

	const setAssignmentSelection = (taskId, managerId) => {
		setAssignmentSelections(prev => ({ ...prev, [taskId]: { managerId } }))
	}

	const handleAssignTask = async (task) => {
		const selection = assignmentSelections[task._id] || {}
		const managerId = selection.managerId || (task.assignedTo ? task.assignedTo._id : '')
		if (!managerId) {
			setError('Choose a manager before assigning the task')
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

	const formatDeadline = (value) => value ? new Date(value).toLocaleDateString() : 'GÇö'
	const displayName = profile ? profile.name || profile.email || 'HR' : 'HR'

	const getTaskStatusStage = (status) => {
		const stages = {
			'Client Requested': { stage: 'Client Request', progress: 5, color: '#f59e0b' },
			'Awaiting Manager Assignment': { stage: 'Pending Assignment', progress: 10, color: '#f59e0b' },
			'Design In Progress': { stage: 'Design Phase', progress: 25, color: '#3b82f6' },
			'Design Completed - Pending Manager Review': { stage: 'Design Review', progress: 35, color: '#8b5cf6' },
			'Development In Progress': { stage: 'Development Phase', progress: 50, color: '#10b981' },
			'Development Completed - Pending Manager Review': { stage: 'Development Review', progress: 60, color: '#8b5cf6' },
			'Testing In Progress': { stage: 'Testing Phase', progress: 75, color: '#3b82f6' },
			'Testing Completed - Pending Manager Final Review': { stage: 'Final Review', progress: 85, color: '#8b5cf6' },
			'Awaiting HR Review': { stage: 'HR Review', progress: 90, color: '#f59e0b' },
			'Awaiting Client Review': { stage: 'Client Review', progress: 95, color: '#f59e0b' },
			'Changes Requested': { stage: 'Changes Requested', progress: 40, color: '#f59e0b' },
			'Completed': { stage: 'Completed', progress: 100, color: '#10b981' }
		}
		return stages[status] || { stage: status || 'Unknown', progress: 0, color: '#f59e0b' }
	}

	return (
		<div className="user-dashboard-fullscreen">
			<div className="user-header-row">
				<div className="user-top-bar">
					<div className="user-brand">
						<div className="user-brand-logo">T</div>
						<div className="user-brand-text">
							<h2>HR Dashboard</h2>
						</div>
					</div>
				</div>
				<div className="user-header">
					<div className="user-welcome-inline">
						<h1>Welcome, {displayName}! =ƒæï</h1>
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
							<span className="user-sidebar-icon">=ƒÅá</span>
							<span>Overview</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'managers' ? 'active' : ''}`} onClick={() => setActiveView('managers')}>
							<span className="user-sidebar-icon">=ƒæö</span>
							<span>Managers</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'requests' ? 'active' : ''}`} onClick={() => setActiveView('requests')}>
							<span className="user-sidebar-icon">=ƒô¿</span>
							<span>Requests</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'teams' ? 'active' : ''}`} onClick={() => setActiveView('teams')}>
							<span className="user-sidebar-icon">=ƒæÑ</span>
							<span>Teams</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'progress' ? 'active' : ''}`} onClick={() => setActiveView('progress')}>
							<span className="user-sidebar-icon">=ƒôè</span>
							<span>Task Progress</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'review' ? 'active' : ''}`} onClick={() => setActiveView('review')}>
							<span className="user-sidebar-icon">G£à</span>
							<span>HR Review</span>
					</button>
					<button className={`user-sidebar-item ${activeView === 'messages' ? 'active' : ''}`} onClick={() => setActiveView('messages')} style={{ position: 'relative' }}>
						<span className="user-sidebar-icon">=ƒÆ¼</span>
						<span>Messages</span>
						{unreadMessages > 0 && <span className="unread-badge">{unreadMessages}</span>}
					</button>
					<button className={`user-sidebar-item ${activeView === 'profile' ? 'active' : ''}`} onClick={() => setActiveView('profile')}>
							<span className="user-sidebar-icon">=ƒæñ</span>
							<span>Profile</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'password-requests' ? 'active' : ''}`} onClick={() => setActiveView('password-requests')}>
							<span className="user-sidebar-icon">=ƒöæ</span>
							<span>Password Requests</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')}>
							<span className="user-sidebar-icon">GÜÖn+Å</span>
							<span>Settings</span>
						</button>
					</nav>
				</div>
				<div className="user-main">
					<div className="user-content">
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
												<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>=ƒæö</div>
												<div style={{position: 'relative'}}>
													<div style={{fontSize: '48px', marginBottom: '8px'}}>=ƒæö</div>
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
												<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>=ƒôï</div>
												<div style={{position: 'relative'}}>
													<div style={{fontSize: '48px', marginBottom: '8px'}}>=ƒôï</div>
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
												<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>=ƒñ¥</div>
												<div style={{position: 'relative'}}>
													<div style={{fontSize: '48px', marginBottom: '8px'}}>=ƒñ¥</div>
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
												=ƒôè Task Pipeline Overview
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
												}}>=ƒæÑ</div>
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
												}}>=ƒñ¥</div>
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
												}}>G£à</div>
												<div>
													<div style={{fontSize: '24px', fontWeight: 800, color: '#111827'}}>{completedTasks.length}</div>
													<div style={{fontSize: '13px', color: '#6b7280', fontWeight: 600}}>Tasks Delivered</div>
												</div>
											</div>
										</div>
									</>
								)}

								{activeView === 'managers' && (
									<>
										<div className="dashboard-section">
											<div className="dashboard-section-header">
												<h3 className="dashboard-section-title">Managers</h3>
												<button className="btn" onClick={() => {
													setEditingManagerId(null)
													setManagerForm(emptyManagerForm)
													setShowManagerForm(!showManagerForm)
												}}>
													{showManagerForm ? 'Cancel' : '+ Add Manager'}
												</button>
											</div>

											{showManagerForm && (
												<form className="form" style={{marginBottom: 24, background: '#f8fafc', padding: 24, borderRadius: 12, border: '2px solid #e2e8f0'}} onSubmit={handleManagerCreate}>
													<h4 style={{margin: '0 0 16px 0', fontSize: 18, fontWeight: 600}}>
														{editingManagerId ? 'Edit Manager' : 'Create New Manager'}
													</h4>
													<label>Name<input value={managerForm.name} onChange={e=>setManagerForm(prev=>({...prev, name: e.target.value}))} required/></label>
													<label>Email
														<input 
															type="email" 
															value={managerForm.email} 
															onChange={e=>setManagerForm(prev=>({...prev, email: e.target.value}))} 
															required 
															disabled={editingManagerId !== null}
															style={{opacity: editingManagerId ? 0.6 : 1}}
														/>
														{editingManagerId && <div className="help" style={{marginTop: 4}}>Email cannot be changed</div>}
													</label>
													<label>Password {editingManagerId && '(leave blank to keep current)'}
														<input type="password" value={managerForm.password} onChange={e=>setManagerForm(prev=>({...prev, password: e.target.value}))} required={!editingManagerId}/>
													</label>
													<div className="form-row" style={{gap: 8}}>
														<button className="btn" disabled={submittingManager}>{submittingManager ? 'Saving...' : (editingManagerId ? 'Update Manager' : 'Create Manager')}</button>
														<button type="button" className="btn btn-outline" onClick={() => {
															setShowManagerForm(false)
															setEditingManagerId(null)
															setManagerForm(emptyManagerForm)
														}}>Cancel</button>
													</div>
												</form>
											)}

											{overview.managers && overview.managers.length > 0 ? (
												<div style={{display: 'grid', gap: 16}}>
													{overview.managers.map(manager => (
														<div key={manager._id} className="item-card" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
															<div style={{flex: 1}}>
																<h4 className="item-title" style={{margin: '0 0 4px 0'}}>{manager.name}</h4>
																<div className="item-meta">
																	<span>=ƒôº {manager.email}</span>
																	{teamsByManager[manager._id] && (
																		<span>=ƒæÑ {teamsByManager[manager._id].length} {teamsByManager[manager._id].length === 1 ? 'team' : 'teams'}</span>
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
									</>
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
									return (
										<li key={task._id} style={{marginBottom:8}}>
											<div><strong>{task.title}</strong> GÇö from {task.createdBy ? task.createdBy.name : 'Client'} (deadline {formatDeadline(task.deadline)})</div>
											<div className="small-row">
												<select value={assignment.managerId || ''} onChange={e=>setAssignmentSelection(task._id, e.target.value)}>
													<option value="">Select manager</option>
													{overview.managers.map(manager => (
														<option key={manager._id} value={manager._id}>{manager.name}</option>
													))}
												</select>
												<button className="btn small" onClick={()=>handleAssignTask(task)} disabled={assigningTaskId === task._id}>{assigningTaskId === task._id ? 'Assigning...' : 'Assign'}</button>
											</div>
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
																		<span>=ƒæÑ {team.members ? team.members.length : 0} Members</span>
																		{team.manager && <span>=ƒæö Manager: {team.manager.name || team.manager.email}</span>}
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
																			<span>=ƒæö {formatManagerName(task)}</span>
																			{task.assignedTeam && <span>=ƒæÑ {task.assignedTeam.name}</span>}
																			{task.assignedTo && <span>=ƒæñ {task.assignedTo.name || task.assignedTo.email}</span>}
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
																	<span>=ƒôà Deadline: {formatDeadline(task.deadline)}</span>
																	<span>=ƒöä {task.status}</span>
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
																<span>=ƒæö Manager: {formatManagerName(task)}</span>
																{task.assignedTeam && <span>=ƒæÑ Team: {task.assignedTeam.name}</span>}
																<span>=ƒôà Deadline: {formatDeadline(task.deadline)}</span>
															</div>
															{Array.isArray(task.attachments) && task.attachments.length > 0 && (
																<details style={{marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8}}>
																	<summary style={{cursor: 'pointer', fontWeight: 600, color: '#475569'}}>
																		=ƒôÄ View Deliverables ({task.attachments.length} files)
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
																{isSending ? 'Sending to Client...' : 'G£ô Approve & Send to Client'}
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

								{/* PASSWORD REQUESTS VIEW */}
								{activeView === 'password-requests' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Password Reset Requests</h3>
										</div>
										<PasswordResetRequests userRole="hr" />
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
		</div>
	)
}
