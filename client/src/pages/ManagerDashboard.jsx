import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession, resolveAssetUrl } from '../api'
import ProfileSettings from '../components/ProfileSettings'
import ChatMessages from '../components/ChatMessages'

const emptyTeamForm = { name: '', designerEmail: '', developerEmail: '', testerEmail: '' }
const emptyAssignment = { teamId: '', designerDeadline: '', developerDeadline: '', testerDeadline: '' }
const emptyProfileForm = { name: '', phone: '', department: '', profilePicture: null }
const formatRoleLabel = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '')
const formatMemberLabel = (member) => {
	if (!member) return '—'
	const name = member.name || member.email || 'Member'
	if (member.email && member.email !== name) {
		return `${name} (${member.email})`
	}
	return name
}
const AUTO_REFRESH_INTERVAL = 30000

const STATUS = {
	AWAITING_MANAGER_ASSIGNMENT: 'Awaiting Manager Assignment',
	DESIGN_IN_PROGRESS: 'Design In Progress',
	DESIGN_REVIEW: 'Design Completed - Pending Manager Review',
	DEVELOPMENT_IN_PROGRESS: 'Development In Progress',
	DEVELOPMENT_REVIEW: 'Development Completed - Pending Manager Review',
	TESTING_IN_PROGRESS: 'Testing In Progress',
	TESTING_REVIEW: 'Testing Completed - Pending Manager Final Review',
	CHANGES_REQUESTED: 'Changes Requested',
	AWAITING_HR_REVIEW: 'Awaiting HR Review',
	AWAITING_CLIENT_REVIEW: 'Awaiting Client Review',
	COMPLETED: 'Completed'
}

const REVIEW_ACTIONS = {
	[STATUS.DESIGN_REVIEW]: {
		action: 'forward-developer',
		label: 'Approve design',
		success: 'Design approved and sent to development'
	},
	[STATUS.DEVELOPMENT_REVIEW]: {
		action: 'forward-tester',
		label: 'Approve development',
		success: 'Development approved and sent to testing'
	},
	[STATUS.TESTING_REVIEW]: {
		action: 'send-hr',
		label: 'Send to HR',
		success: 'Deliverables sent to HR'
	}
}

const getReviewAction = (status) => REVIEW_ACTIONS[status] || {
	action: 'advance',
	label: 'Advance',
	success: 'Task advanced'
}

export default function ManagerDashboard(){
	const nav = useNavigate()
	const [profile, setProfile] = useState(null)
	const [teams, setTeams] = useState([])
	const [tasks, setTasks] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [message, setMessage] = useState('')
	const [teamForm, setTeamForm] = useState(emptyTeamForm)
	const [memberInputs, setMemberInputs] = useState({})
	const [creatingTeam, setCreatingTeam] = useState(false)
	const [assignmentSelections, setAssignmentSelections] = useState({})
	const [assigningTaskId, setAssigningTaskId] = useState('')
	const [forwardingTaskId, setForwardingTaskId] = useState('')
	const [showTeamForm, setShowTeamForm] = useState(false)
	const [reviewInputs, setReviewInputs] = useState({})
	const [activeView, setActiveView] = useState('overview')
	const [unreadMessages, setUnreadMessages] = useState(0)
	const [editingTeamId, setEditingTeamId] = useState(null)
	const [deletingTeamId, setDeletingTeamId] = useState(null)
	const [profileForm, setProfileForm] = useState(emptyProfileForm)
	const [updatingProfile, setUpdatingProfile] = useState(false)

	const loadDashboard = useCallback(async (withSpinner = false) => {
		if (withSpinner) setLoading(true)
		setError(null)
		try{
			const [profileData, teamData, taskData] = await Promise.all([
				apiFetch('/api/user/profile'),
				apiFetch('/api/manager/teams'),
				apiFetch('/api/manager/tasks')
			])
			setProfile(profileData)
			setTeams(teamData)
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

	const handleEditTeam = (team) => {
		setEditingTeamId(team._id)
		setTeamForm({
			name: team.name,
			designerEmail: team.members.find(m => m.role === 'designer')?.email || '',
			developerEmail: team.members.find(m => m.role === 'developer')?.email || '',
			testerEmail: team.members.find(m => m.role === 'tester')?.email || ''
		})
		setShowTeamForm(true)
	}

	const handleDeleteTeam = async (teamId) => {
		if (!confirm('Are you sure you want to delete this team?')) return
		setDeletingTeamId(teamId)
		try {
			await apiFetch(`/api/manager/teams/${teamId}`, { method: 'DELETE' })
			setMessage('Team deleted successfully')
			await loadDashboard()
		} catch(err) {
			setError(err.message)
		} finally {
			setDeletingTeamId(null)
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

	const refreshTeams = async () => {
		try{
			const data = await apiFetch('/api/manager/teams')
			setTeams(data)
		}catch(err){ setError(err.message) }
	}

	const refreshTasks = async () => {
		try{
			const data = await apiFetch('/api/manager/tasks')
			setTasks(data)
		}catch(err){ setError(err.message) }
	}

	const teamRoleLookup = useMemo(() => {
		return teams.reduce((acc, team) => {
			const roleMap = { designer: null, developer: null, tester: null }
			;(team.members || []).forEach(member => {
				if ((member.role === 'designer' || member.role === 'developer' || member.role === 'tester') && !roleMap[member.role]) {
					roleMap[member.role] = member
				}
			})
			acc[team._id] = roleMap
			return acc
		}, {})
	}, [teams])

	const awaitingAssignment = useMemo(() => tasks.filter(task => [
		STATUS.AWAITING_MANAGER_ASSIGNMENT,
		STATUS.CHANGES_REQUESTED
	].includes(task.status)), [tasks])
	const inProgressTasks = useMemo(() => tasks.filter(task => [
		STATUS.DESIGN_IN_PROGRESS,
		STATUS.DEVELOPMENT_IN_PROGRESS,
		STATUS.TESTING_IN_PROGRESS
	].includes(task.status)), [tasks])
	const reviewQueue = useMemo(() => tasks.filter(task => [
		STATUS.DESIGN_REVIEW,
		STATUS.DEVELOPMENT_REVIEW,
		STATUS.TESTING_REVIEW
	].includes(task.status)), [tasks])
	const withHrOrClient = useMemo(() => tasks.filter(task => [
		STATUS.AWAITING_HR_REVIEW,
		STATUS.AWAITING_CLIENT_REVIEW
	].includes(task.status)), [tasks])
	const completedTasks = useMemo(() => tasks.filter(task => task.status === STATUS.COMPLETED), [tasks])

	const handleTeamCreate = async (e) => {
		e.preventDefault()
		if (!teamForm.name.trim()) {
			setError('Team name is required')
			return
		}
		const requiredRoles = ['designerEmail', 'developerEmail', 'testerEmail']
		const missing = requiredRoles.filter(field => !(teamForm[field] || '').trim())
		if (missing.length) {
			setError('Enter emails for designer, developer, and tester')
			return
		}
		setCreatingTeam(true); setMessage(''); setError(null)
		try{
			const payload = {
				name: teamForm.name.trim(),
				designerEmail: teamForm.designerEmail.trim(),
				developerEmail: teamForm.developerEmail.trim(),
				testerEmail: teamForm.testerEmail.trim()
			}
			if (editingTeamId) {
				await apiFetch(`/api/manager/teams/${editingTeamId}`, { method: 'PUT', body: payload })
				setMessage('Team updated successfully')
				setEditingTeamId(null)
			} else {
				await apiFetch('/api/manager/teams', { method: 'POST', body: payload })
				setMessage('Team created with assigned members')
			}
			setTeamForm(emptyTeamForm)
			setShowTeamForm(false)
			await refreshTeams()
		}catch(err){ setError(err.message) }
		finally{ setCreatingTeam(false) }
	}

	const handleAddMember = async (teamId) => {
		const payload = memberInputs[teamId]
		if (!payload || !payload.trim()) {
			setError('Enter member email to add')
			return
		}
		setError(null); setMessage('')
		try{
			await apiFetch(`/api/manager/teams/${teamId}/members`, { method: 'POST', body: { memberEmail: payload.trim() } })
			setMemberInputs(prev => ({ ...prev, [teamId]: '' }))
			setMessage('Member added to team')
			await refreshTeams()
		}catch(err){ setError(err.message) }
	}

	const handleRemoveMember = async (teamId, memberId) => {
		if (!window.confirm('Remove this member from the team?')) return
		setError(null); setMessage('')
		try{
			await apiFetch(`/api/manager/teams/${teamId}/members/${memberId}`, { method: 'DELETE' })
			setMessage('Member removed')
			await refreshTeams()
		}catch(err){ setError(err.message) }
	}

	const setAssignmentSelection = (taskId, field, value) => {
		setAssignmentSelections(prev => {
			const existing = prev[taskId] ? { ...prev[taskId] } : { ...emptyAssignment }
			const nextSelection = field === 'teamId'
				? { ...emptyAssignment, teamId: value }
				: { ...existing, [field]: value }
			return {
				...prev,
				[taskId]: nextSelection
			}
		})
	}

	const setReviewInput = (taskId, field, value) => {
		setReviewInputs(prev => ({
			...prev,
			[taskId]: {
				...(prev[taskId] || {}),
				[field]: value
			}
		}))
	}

	const handleAssignTask = async (taskId) => {
		const selection = assignmentSelections[taskId]
		if (!selection || !selection.teamId) {
			setError('Select a team before assigning the project')
			return
		}
		const roleMap = teamRoleLookup[selection.teamId] || {}
		const missingRoles = ['designer', 'developer', 'tester'].filter(role => !roleMap[role])
		if (missingRoles.length) {
			const labels = missingRoles.map(formatRoleLabel).join(', ')
			setError(`Selected team is missing required roles: ${labels}`)
			return
		}
		if (!selection.designerDeadline) {
			setError('Provide a deadline for the designer stage')
			return
		}
		setAssigningTaskId(taskId); setError(null); setMessage('')
		try{
			const payload = {
				teamId: selection.teamId,
				designerDeadline: selection.designerDeadline
			}
			if (selection.developerDeadline) payload.developerDeadline = selection.developerDeadline
			if (selection.testerDeadline) payload.testerDeadline = selection.testerDeadline
			await apiFetch(`/api/manager/tasks/${taskId}/assign`, {
				method: 'PUT',
				body: payload
			})
			setAssignmentSelections(prev => {
				const next = { ...prev }
				delete next[taskId]
				return next
			})
			setMessage('Team assigned. Design phase is now in progress.')
			await refreshTasks()
		}catch(err){ setError(err.message) }
		finally{ setAssigningTaskId('') }
	}

	const handleReviewAdvance = async (task) => {
		const { action, success } = getReviewAction(task.status)
		const payload = { action }
		if (task.status === STATUS.DESIGN_REVIEW) {
			const deadline = (reviewInputs[task._id] || {}).developerDeadline
			if (!deadline) {
				setError('Provide a developer deadline before forwarding to development')
				return
			}
			payload.developerDeadline = deadline
		} else if (task.status === STATUS.DEVELOPMENT_REVIEW) {
			const deadline = (reviewInputs[task._id] || {}).testerDeadline
			if (!deadline) {
				setError('Provide a tester deadline before forwarding to testing')
				return
			}
			payload.testerDeadline = deadline
		}
		setForwardingTaskId(task._id); setError(null); setMessage('')
		try{
			await apiFetch(`/api/user/tasks/${task._id}/status`, { method: 'PUT', body: payload })
			setReviewInputs(prev => {
				const next = { ...prev }
				delete next[task._id]
				return next
			})
			setMessage(success)
			await refreshTasks()
		}catch(err){ setError(err.message) }
		finally{ setForwardingTaskId('') }
	}

	const formatDate = (value) => value ? new Date(value).toLocaleDateString() : '—'
	const displayName = profile ? profile.name || profile.email || 'Manager' : 'Manager'

	return (
		<div className="user-dashboard-fullscreen">
			<div className="user-header-row">
				<div className="user-top-bar">
					<div className="user-brand">
						<div className="user-brand-logo">T</div>
						<div className="user-brand-text">
							<h2>Manager Dashboard</h2>
						</div>
					</div>
				</div>
				<div className="user-header">
					<div className="user-welcome-inline">
						<h1>Welcome, {displayName}! 👋</h1>
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
						<button className={`user-sidebar-item ${activeView === 'teams' ? 'active' : ''}`} onClick={() => setActiveView('teams')}>
							<span className="user-sidebar-icon">👥</span>
							<span>My Teams</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'tasks' ? 'active' : ''}`} onClick={() => setActiveView('tasks')}>
							<span className="user-sidebar-icon">✓</span>
							<span>Tasks</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'review' ? 'active' : ''}`} onClick={() => setActiveView('review')}>
							<span className="user-sidebar-icon">✅</span>
							<span>Review</span>
						</button>
						<button className={`user-sidebar-item ${activeView === 'progress' ? 'active' : ''}`} onClick={() => setActiveView('progress')}>
							<span className="user-sidebar-icon">📊</span>
							<span>Task Progress</span>
					</button>
					<button className={`user-sidebar-item ${activeView === 'messages' ? 'active' : ''}`} onClick={() => setActiveView('messages')} style={{ position: 'relative' }}>
						<span className="user-sidebar-icon">💬</span>
						<span>Messages</span>
						{unreadMessages > 0 && <span className="unread-badge">{unreadMessages}</span>}
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
						{loading && <div>Loading manager data...</div>}
						{message && <div style={{background:'#e6f7ef', color:'#106433', padding:'12px 16px', borderRadius:8, marginBottom:16, border:'1px solid #c6f6d5'}}>{message}</div>}
						{error && <div className="error">{error}</div>}
						{!loading && profile && (
							<>
								{/* OVERVIEW - Stats Only */}
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
												<div style={{position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.1}}>🤝</div>
												<div style={{position: 'relative'}}>
													<div style={{fontSize: '48px', marginBottom: '8px'}}>🤝</div>
													<div style={{fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '4px'}}>
														{teams ? teams.length : 0}
													</div>
													<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Your Teams</div>
													<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Teams managed</div>
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
														{awaitingAssignment ? awaitingAssignment.length : 0}
													</div>
													<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Awaiting Assignment</div>
													<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Needs team assignment</div>
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
														{inProgressTasks ? inProgressTasks.length : 0}
													</div>
													<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>In Progress</div>
													<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Active tasks</div>
												</div>
											</div>

											<div style={{
												background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
												borderRadius: '16px',
												padding: '24px',
												boxShadow: '0 4px 16px rgba(250, 112, 154, 0.25)',
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
														{reviewQueue ? reviewQueue.length : 0}
													</div>
													<div style={{fontSize: '16px', color: 'rgba(255,255,255,0.9)', fontWeight: 600}}>Review Queue</div>
													<div style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '8px'}}>Awaiting your review</div>
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
												📊 Task Distribution
											</h3>

											<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px'}}>
												<div style={{padding: '20px', background: 'linear-gradient(135deg, #f59e0b15, #d9770615)', borderRadius: '12px', border: '2px solid #f59e0b30', textAlign: 'center'}}>
													<div style={{fontSize: '32px', fontWeight: 800, color: '#f59e0b', marginBottom: '4px'}}>
														{awaitingAssignment?.length || 0}
													</div>
													<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Unassigned</div>
												</div>

												<div style={{padding: '20px', background: 'linear-gradient(135deg, #3b82f615, #2563eb15)', borderRadius: '12px', border: '2px solid #3b82f630', textAlign: 'center'}}>
													<div style={{fontSize: '32px', fontWeight: 800, color: '#3b82f6', marginBottom: '4px'}}>
														{inProgressTasks?.length || 0}
													</div>
													<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Active</div>
												</div>

												<div style={{padding: '20px', background: 'linear-gradient(135deg, #8b5cf615, #667eea15)', borderRadius: '12px', border: '2px solid #8b5cf630', textAlign: 'center'}}>
													<div style={{fontSize: '32px', fontWeight: 800, color: '#8b5cf6', marginBottom: '4px'}}>
														{reviewQueue?.length || 0}
													</div>
													<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>In Review</div>
												</div>

												<div style={{padding: '20px', background: 'linear-gradient(135deg, #22c55e15, #16a34a15)', borderRadius: '12px', border: '2px solid #22c55e30', textAlign: 'center'}}>
													<div style={{fontSize: '32px', fontWeight: 800, color: '#22c55e', marginBottom: '4px'}}>
														{tasks.filter(t => t.status === STATUS.AWAITING_HR_REVIEW).length}
													</div>
													<div style={{fontSize: '13px', color: '#4b5563', fontWeight: 600}}>Sent to HR</div>
												</div>
											</div>

											{/* Progress Bar */}
											<div>
												<div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
													<span style={{fontSize: '14px', fontWeight: 600, color: '#374151'}}>Task Completion Progress</span>
													<span style={{fontSize: '14px', fontWeight: 700, color: '#667eea'}}>
														{tasks.length > 0 ? Math.round(((tasks.length - (awaitingAssignment?.length || 0) - (inProgressTasks?.length || 0)) / tasks.length) * 100) : 0}%
													</span>
												</div>
												<div style={{height: '12px', background: '#e5e7eb', borderRadius: '12px', overflow: 'hidden'}}>
													<div style={{
														height: '100%',
														width: `${tasks.length > 0 ? ((tasks.length - (awaitingAssignment?.length || 0) - (inProgressTasks?.length || 0)) / tasks.length) * 100 : 0}%`,
														background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
														borderRadius: '12px',
														transition: 'width 0.6s ease',
														boxShadow: '0 0 12px rgba(102, 126, 234, 0.5)'
													}} />
												</div>
											</div>
										</div>

										{/* Team Performance Cards */}
										{teams && teams.length > 0 && (
											<div style={{
												background: '#fff',
												borderRadius: '16px',
												padding: '28px',
												boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
											}}>
												<h3 style={{margin: '0 0 20px 0', fontSize: '22px', fontWeight: 700, color: '#111827'}}>
													👥 Team Performance
												</h3>
												<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px'}}>
													{teams.slice(0, 4).map(team => {
														const teamTasks = tasks.filter(t => t.assignedTeam && t.assignedTeam._id === team._id)
														const teamCompletedTasks = teamTasks.filter(t => t.status === STATUS.COMPLETED || t.status === STATUS.AWAITING_HR_REVIEW).length
														const teamProgress = teamTasks.length > 0 ? Math.round((teamCompletedTasks / teamTasks.length) * 100) : 0

														return (
															<div key={team._id} style={{
																padding: '20px',
																background: '#f9fafb',
																borderRadius: '12px',
																border: '2px solid #e5e7eb'
															}}>
																<div style={{fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '12px'}}>
																	{team.name}
																</div>
																<div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
																	<span style={{fontSize: '13px', color: '#6b7280'}}>Progress</span>
																	<span style={{fontSize: '14px', fontWeight: 700, color: '#667eea'}}>{teamProgress}%</span>
																</div>
																<div style={{height: '8px', background: '#e5e7eb', borderRadius: '8px', overflow: 'hidden'}}>
																	<div style={{
																		height: '100%',
																		width: `${teamProgress}%`,
																		background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
																		borderRadius: '8px',
																		transition: 'width 0.4s ease'
																	}} />
																</div>
																<div style={{marginTop: '12px', fontSize: '12px', color: '#9ca3af'}}>
																	{teamCompletedTasks} of {teamTasks.length} tasks completed
																</div>
															</div>
														)
													})}
												</div>
											</div>
										)}
									</>
								)}

								{/* MY TEAMS VIEW */}
								{activeView === 'teams' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">My Teams</h3>
											<button className="btn" onClick={()=>{
												setEditingTeamId(null)
												setTeamForm(emptyTeamForm)
												setShowTeamForm(!showTeamForm)
											}}>
												{showTeamForm ? 'Cancel' : '+ Add Team'}
											</button>
										</div>

										{showTeamForm && (
											<form className="form" style={{marginBottom: 24, background: '#f8fafc', padding: 24, borderRadius: 12, border: '2px solid #e2e8f0'}} onSubmit={handleTeamCreate}>
												<h4 style={{margin: '0 0 16px 0', fontSize: 18, fontWeight: 600}}>
													{editingTeamId ? 'Edit Team' : 'Create New Team'}
												</h4>
												<label>Team name
													<input value={teamForm.name} onChange={e=>setTeamForm(prev=>({ ...prev, name: e.target.value }))} required />
												</label>
												<label>Designer email
													<input value={teamForm.designerEmail} onChange={e=>setTeamForm(prev=>({ ...prev, designerEmail: e.target.value }))} required />
												</label>
												<label>Developer email
													<input value={teamForm.developerEmail} onChange={e=>setTeamForm(prev=>({ ...prev, developerEmail: e.target.value }))} required />
												</label>
												<label>Tester email
													<input value={teamForm.testerEmail} onChange={e=>setTeamForm(prev=>({ ...prev, testerEmail: e.target.value }))} required />
												</label>
												<div className="form-row" style={{gap: 8}}>
													<button className="btn" disabled={creatingTeam}>
														{creatingTeam ? 'Saving...' : (editingTeamId ? 'Update Team' : 'Create Team')}
													</button>
													<button type="button" className="btn btn-outline" onClick={()=>{
														setShowTeamForm(false)
														setEditingTeamId(null)
														setTeamForm(emptyTeamForm)
													}}>Cancel</button>
												</div>
											</form>
										)}

										{teams.length ? (
											<div style={{display: 'grid', gap: 16}}>
												{teams.map(team => (
													<div key={team._id} className="item-card">
														<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12}}>
															<div style={{flex: 1}}>
																<h4 className="item-title" style={{margin: '0 0 8px 0'}}>{team.name}</h4>
																<span className="status-badge status-active">{team.members.length} Members</span>
															</div>
															<div style={{display: 'flex', gap: 8}}>
																<button 
																	className="btn small btn-outline" 
																	onClick={() => handleEditTeam(team)}
																	style={{minWidth: 70}}
																>
																	Edit
																</button>
																<button 
																	className="btn small" 
																	onClick={() => handleDeleteTeam(team._id)}
																	disabled={deletingTeamId === team._id}
																	style={{background: '#ef4444', minWidth: 70}}
																>
																	{deletingTeamId === team._id ? 'Deleting...' : 'Delete'}
																</button>
															</div>
														</div>
										<div className="small-row" style={{marginTop:12}}>
											<input style={{flex:1, padding:'8px 12px', border:'1px solid var(--border)', borderRadius:6}} placeholder="Member email" value={memberInputs[team._id] || ''} onChange={e=>setMemberInputs(prev=>({...prev, [team._id]: e.target.value}))}/>
											<button className="btn small" onClick={()=>handleAddMember(team._id)}>+ Add Member</button>
										</div>
										{team.members.length ? (
											<div style={{marginTop:16, paddingTop:16, borderTop:'2px solid #e2e8f0'}}>
												{team.members.map(member => (
													<div key={member._id} style={{padding:'10px 0', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #f1f5f9'}}>
														<div>
															<div style={{fontSize:15, fontWeight:600, color:'#1e293b'}}>{member.name}</div>
															<div className="item-meta" style={{marginTop:4}}>
																<span>{member.email}</span>
																<span className="status-badge status-in-progress" style={{padding:'3px 8px', fontSize:11}}>{member.role}</span>
															</div>
														</div>
														<button className="btn small btn-outline" onClick={()=>handleRemoveMember(team._id, member._id)}>Remove</button>
													</div>
												))}
											</div>
										) : <p style={{color:'var(--muted)', padding:'12px', textAlign:'center', background:'#f8fafc', borderRadius:'6px', marginTop:12}}>No members yet</p>}
									</div>
								))}
							</div>
						) : <p style={{color:'var(--muted)', padding:'16px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>No teams created yet.</p>}
									</div>
								)}

								{/* TASKS VIEW */}
								{activeView === 'tasks' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Tasks Awaiting Assignment</h3>
										</div>
						{awaitingAssignment.length ? (
							<div>
								{awaitingAssignment.map(task => {
									const selection = assignmentSelections[task._id] || { ...emptyAssignment }
									const roleMap = selection.teamId ? (teamRoleLookup[selection.teamId] || {}) : null
									const missingRoles = selection.teamId ? ['designer', 'developer', 'tester'].filter(role => !roleMap || !roleMap[role]) : []
									const isAssigning = assigningTaskId === task._id
									return (
										<div key={task._id} className="item-card">
											<div className="item-header">
												<h4 className="item-title">{task.title}</h4>
												<span className="status-badge status-pending">Awaiting</span>
											</div>
											{task.description ? <div className="help" style={{marginTop:4}}>{task.description}</div> : null}
											{Array.isArray(task.attachments) && task.attachments.length ? (
												<details style={{marginTop:4}}>
													<summary>View submitted files</summary>
													<ul style={{marginTop:4}}>
														{task.attachments.map(file => (
															<li key={file._id || file.filename}>
																<a href={resolveAssetUrl(`/uploads/${file.filename}`)} target="_blank" rel="noreferrer">{file.originalName || file.filename}</a>
															</li>
														))}
													</ul>
												</details>
											) : null}
											<div className="small-row" style={{marginTop:4, alignItems:'center', gap:6}}>
												<select value={selection.teamId} onChange={e=>setAssignmentSelection(task._id, 'teamId', e.target.value)}>
													<option value="">Select team</option>
													{teams.map(team => (
														<option key={team._id} value={team._id}>{team.name}</option>
													))}
												</select>
											</div>
											{selection.teamId ? (
												<>
													<div className="help" style={{marginTop:4}}>
														Designer: {formatMemberLabel(roleMap?.designer)} | Developer: {formatMemberLabel(roleMap?.developer)} | Tester: {formatMemberLabel(roleMap?.tester)}
													</div>
													{missingRoles.length ? <div className="error" style={{marginTop:6}}>Team is missing: {missingRoles.map(formatRoleLabel).join(', ')}</div> : null}
													<div className="small-row" style={{marginTop:6, gap:6, alignItems:'center', flexWrap:'wrap'}}>
														<label style={{display:'flex', flexDirection:'column', fontSize:12}}>
															Designer deadline
															<input type="datetime-local" value={selection.designerDeadline} onChange={e=>setAssignmentSelection(task._id, 'designerDeadline', e.target.value)} />
														</label>
														<button className="btn small" onClick={()=>handleAssignTask(task._id)} disabled={isAssigning || missingRoles.length > 0}>
															{isAssigning ? 'Assigning...' : 'Start design'}
														</button>
													</div>
												</>
											) : <div className="help" style={{marginTop:4}}>Choose a team to see role assignments.</div>}
											<div className="item-meta" style={{marginTop:12, paddingTop:12, borderTop:'1px solid #e2e8f0'}}>
												<span><span className="item-meta-label">Due:</span> {formatDate(task.deadline)}</span>
												<span><span className="item-meta-label">Status:</span> {task.status}</span>
											</div>
										</div>
									)
								})}
							</div>
						) : <p style={{color:'var(--muted)', padding:'16px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>No tasks waiting on assignment.</p>}
									</div>
								)}

								{activeView === 'tasks' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">In-Progress Work</h3>
										</div>
						{inProgressTasks.length ? (
							<table style={{width:'100%', borderCollapse:'collapse'}}>
								<thead>
									<tr>
										<th style={{textAlign:'left', paddingBottom:6}}>Title</th>
										<th style={{textAlign:'left', paddingBottom:6}}>Current Owner</th>
										<th style={{textAlign:'left', paddingBottom:6}}>Team</th>
										<th style={{textAlign:'left', paddingBottom:6}}>Status</th>
										<th style={{textAlign:'left', paddingBottom:6}}>Deadline</th>
									</tr>
								</thead>
								<tbody>
									{inProgressTasks.map(task => (
										<tr key={task._id} style={{borderTop:'1px solid #eee'}}>
											<td style={{padding:'6px 4px'}}>{task.title}</td>
											<td style={{padding:'6px 4px'}}>{formatMemberLabel(task.assignedTo)}</td>
											<td style={{padding:'6px 4px'}}>{task.assignedTeam ? task.assignedTeam.name : '—'}</td>
											<td style={{padding:'6px 4px'}}>{task.status}</td>
											<td style={{padding:'6px 4px'}}>{formatDate(task.deadline)}</td>
										</tr>
									))}
								</tbody>
							</table>
						) : <p style={{color:'var(--muted)'}}>No tasks currently in development, design, or testing.</p>}
									</div>
								)}

								{/* REVIEW VIEW */}
								{activeView === 'review' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Awaiting Manager Review</h3>
										</div>
						{reviewQueue.length ? (
							<ul>
								{reviewQueue.map(task => {
									const isForwarding = forwardingTaskId === task._id
									const { label } = getReviewAction(task.status)
									const reviewInput = reviewInputs[task._id] || {}
									const needsDeveloperDeadline = task.status === STATUS.DESIGN_REVIEW
									const needsTesterDeadline = task.status === STATUS.DEVELOPMENT_REVIEW
									return (
										<li key={task._id} style={{marginBottom:8}}>
											<div><strong>{task.title}</strong> — team {task.assignedTeam ? task.assignedTeam.name : '—'} (deadline {formatDate(task.deadline)})</div>
											{Array.isArray(task.attachments) && task.attachments.length ? (
												<details style={{marginTop:4}}>
													<summary>Review files</summary>
													<ul style={{marginTop:4}}>
														{task.attachments.map(file => (
															<li key={file._id || file.filename}>
																<a href={resolveAssetUrl(`/uploads/${file.filename}`)} target="_blank" rel="noreferrer">{file.originalName || file.filename}</a>
															</li>
														))}
													</ul>
												</details>
											) : null}
											{needsDeveloperDeadline ? (
												<label style={{display:'inline-flex', flexDirection:'column', fontSize:12, marginTop:6}}>
													Developer deadline
													<input type="datetime-local" value={reviewInput.developerDeadline || ''} onChange={e=>setReviewInput(task._id, 'developerDeadline', e.target.value)} />
												</label>
											) : null}
											{needsTesterDeadline ? (
												<label style={{display:'inline-flex', flexDirection:'column', fontSize:12, marginTop:6}}>
													Tester deadline
													<input type="datetime-local" value={reviewInput.testerDeadline || ''} onChange={e=>setReviewInput(task._id, 'testerDeadline', e.target.value)} />
												</label>
											) : null}
											<button className="btn small" style={{marginTop:6}} onClick={()=>handleReviewAdvance(task)} disabled={isForwarding}>
												{isForwarding ? 'Sending...' : label}
											</button>
										</li>
									)
								})}
							</ul>
						) : <p style={{color:'var(--muted)'}}>No tasks require your review.</p>}
									</div>
								)}

								{/* TASK PROGRESS VIEW */}
								{activeView === 'progress' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">All Tasks Progress</h3>
											<span style={{fontSize: 14, color: '#64748b', fontWeight: 500}}>
												{tasks.length} Total Tasks
											</span>
										</div>
										{tasks.length > 0 ? (
											<div style={{display: 'grid', gap: 20}}>
												{tasks.map(task => {
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
																<div className="item-meta" style={{marginBottom: 12, gap: 8}}>
																	<span><strong>Manager:</strong> {profile.name}</span>
																	<span><strong>Team:</strong> {task.assignedTeam?.name || '—'}</span>
																	<span><strong>Assigned To:</strong> {formatMemberLabel(task.assignedTo)}</span>
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
																<div style={{
																	padding: 12,
																	background: '#f8fafc',
																	borderRadius: 8,
																	fontSize: 13,
																	color: '#64748b'
																}}>
																	<strong>Deadline:</strong> {formatDate(task.deadline)}
																</div>
															</div>
														</div>
													)
												})}
											</div>
										) : (
											<p style={{color: 'var(--muted)', padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px'}}>
												No active tasks to track.
											</p>
										)}
									</div>
								)}

								{/* PROFILE VIEW */}
								{activeView === 'profile' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">Manager Profile</h3>
										</div>
										<div style={{maxWidth: 720, margin: '0 auto'}}>
											<ProfileSettings
												kind="user"
												view="profile"
												profile={profile}
												passwordDisabledMessage="You can't update your password here. Please contact the HR who created your account to update your password."
												onProfileUpdated={(updated) => {
													setProfile((prev) => ({ ...prev, ...(updated || {}) }))
												}}
											/>
										</div>
									</div>
								)}

								{/* MESSAGES VIEW */}
								{activeView === 'messages' && (
									<div className="dashboard-section">
										<ChatMessages />
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
												passwordDisabledMessage="You can't update your password here. Please contact the HR who created your account to update your password."
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
