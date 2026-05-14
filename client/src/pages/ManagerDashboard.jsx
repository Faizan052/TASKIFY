import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession, resolveAssetUrl } from '../api'
import { useUnreadMessages } from '../hooks/useUnreadMessages'
import { formatDate, formatRole, getTaskStage, formatCategories, formatRemainingDays, getRemainingDays, formatSlackDays, getSlackDays } from '../utils/helpers'
import ProfileSettings from '../components/ProfileSettings'
import ChatMessages from '../components/ChatMessages'
import DashboardWelcomeBanner from '../components/DashboardWelcomeBanner'
import '../styles/manager-assignment.css'

const emptyTeamForm = { name: '', designerId: '', developerId: '', testerId: '' }
const emptyAssignment = { mode: 'team', teamId: '', userId: '', designerDeadline: '', developerDeadline: '', testerDeadline: '' }
const emptyProfileForm = { name: '', phone: '', department: '', profilePicture: null }
const formatMemberLabel = (member) => {
	if (!member) return '—'
	const name = member.name || member.email || 'Member'
	if (member.email && member.email !== name) {
		return `${name} (${member.email})`
	}
	return name
}
const AUTO_REFRESH_INTERVAL = 30000
const FLASH_MESSAGE_MS = 1500

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
	COMPLETED: 'Completed',
	CANCELLED: 'Cancelled',
	DELAYED: 'Delayed'
}

const ACTIVE_TEAM_STATUSES = [
	STATUS.DESIGN_IN_PROGRESS,
	STATUS.DESIGN_REVIEW,
	STATUS.DEVELOPMENT_IN_PROGRESS,
	STATUS.DEVELOPMENT_REVIEW,
	STATUS.TESTING_IN_PROGRESS,
	STATUS.TESTING_REVIEW,
	STATUS.AWAITING_HR_REVIEW,
	STATUS.AWAITING_CLIENT_REVIEW,
	STATUS.CHANGES_REQUESTED,
	STATUS.DELAYED
]

const REVIEW_ACTIONS = {
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
const toDateTimeLocal = (value) => {
	if (!value) return ''
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return ''
	const pad = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
	const [activeView, setActiveView] = useState('overview')
	const { unreadMessages } = useUnreadMessages(10000)
	const [showProfileMenu, setShowProfileMenu] = useState(false)
	const headerRef = useRef(null)
	const [editingTeamId, setEditingTeamId] = useState(null)
	const [deletingTeamId, setDeletingTeamId] = useState(null)
	const [profileForm, setProfileForm] = useState(emptyProfileForm)
	const [_updatingProfile, setUpdatingProfile] = useState(false)
	const [availableUsers, setAvailableUsers] = useState({ designers: [], developers: [], testers: [] })
	const [performanceReport, setPerformanceReport] = useState(null)
	const [decisionInputs, setDecisionInputs] = useState({})
	const [decidingTaskId, setDecidingTaskId] = useState('')
	const refreshInFlight = useRef(false)

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

	const loadDashboard = useCallback(async (withSpinner = false) => {
		if (refreshInFlight.current) return
		refreshInFlight.current = true
		if (withSpinner) setLoading(true)
		setError(null)
		try{
			const [profileData, teamData, taskData, reportData] = await Promise.all([
				apiFetch('/api/user/profile'),
				apiFetch('/api/manager/teams'),
				apiFetch('/api/manager/tasks'),
				apiFetch('/api/manager/performance-report')
			])
			setProfile(profileData)
			setTeams(teamData)
			setTasks(taskData)
			setPerformanceReport(reportData)
		}catch(err){ setError(err.message) }
		finally{ 
			if (withSpinner) setLoading(false)
			refreshInFlight.current = false
		}
	},[])

	useEffect(()=>{ loadDashboard(true) },[loadDashboard])

	useEffect(()=>{
		const id = setInterval(()=>{ 
			if (typeof document !== 'undefined' && document.hidden) return
			loadDashboard() 
		}, AUTO_REFRESH_INTERVAL)
		return ()=>clearInterval(id)
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
		nav('/user/login')
	}

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (headerRef.current && !headerRef.current.contains(e.target)) {
				setShowProfileMenu(false)
			}
		}
		document.addEventListener('click', handleClickOutside)
		return () => document.removeEventListener('click', handleClickOutside)
	}, [setShowProfileMenu])

	const loadAvailableUsers = async () => {
		try {
			const [designers, developers, testers] = await Promise.all([
				apiFetch('/api/manager/users?role=designer'),
				apiFetch('/api/manager/users?role=developer'),
				apiFetch('/api/manager/users?role=tester')
			])
			setAvailableUsers({ designers, developers, testers })
		} catch(err) {
			console.error('Failed to load available users:', err)
			setError(err.message || 'Failed to load available users')
		}
	}

	const handleEditTeam = (team) => {
		loadAvailableUsers()
		setError(null)
		setMessage('')
		setEditingTeamId(team._id)
		setTeamForm({
			name: team.name,
			designerId: team.members.find(m => m.role === 'designer')?._id || '',
			developerId: team.members.find(m => m.role === 'developer')?._id || '',
			testerId: team.members.find(m => m.role === 'tester')?._id || ''
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

	const getTaskStatusStage = (status) => {
		const stage = getTaskStage(status)
		return {
			stage: stage.label,
			progress: stage.progress,
			color: stage.color
		}
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

	const refreshPerformanceReport = async () => {
		try {
			const data = await apiFetch('/api/manager/performance-report')
			setPerformanceReport(data)
		} catch (err) {
			setError(err.message)
		}
	}

	const teamRoleLookup = useMemo(() => {
		return teams.reduce((acc, team) => {
			const roleMap = { designer: null, developer: null, tester: null }
			const members = team.members || []
			members.forEach(member => {
				if ((member.role === 'designer' || member.role === 'developer' || member.role === 'tester') && !roleMap[member.role]) {
					roleMap[member.role] = member
				}
			})
			acc[team._id] = roleMap
			return acc
		}, {})
	}, [teams])

	const managedUsers = useMemo(() => {
		const dedupe = new Map()
		teams.forEach(team => {
			const members = team.members || []
			members.forEach(member => {
				if (!dedupe.has(member._id)) {
					dedupe.set(member._id, member)
				}
			})
		})
		return Array.from(dedupe.values())
	}, [teams])

	const performanceByUserId = useMemo(() => {
		const metrics = performanceReport?.users || []
		return metrics.reduce((acc, item) => {
			acc[item.userId] = item
			return acc
		}, {})
	}, [performanceReport])

	const awaitingAssignment = useMemo(() => tasks.filter(task => [
		STATUS.AWAITING_MANAGER_ASSIGNMENT,
		STATUS.CHANGES_REQUESTED
	].includes(task.status)), [tasks])
	const inProgressTasks = useMemo(() => tasks.filter(task => [
		STATUS.DESIGN_IN_PROGRESS,
		STATUS.DEVELOPMENT_IN_PROGRESS,
		STATUS.TESTING_IN_PROGRESS,
		STATUS.DELAYED
	].includes(task.status)), [tasks])
	const reviewQueue = useMemo(() => tasks.filter(task => [
		STATUS.TESTING_REVIEW
	].includes(task.status)), [tasks])
	const _withHrOrClient = useMemo(() => tasks.filter(task => [
		STATUS.AWAITING_HR_REVIEW,
		STATUS.AWAITING_CLIENT_REVIEW
	].includes(task.status)), [tasks])
	const _completedTasks = useMemo(() => tasks.filter(task => task.status === STATUS.COMPLETED), [tasks])
	const teamTaskStats = useMemo(() => {
		const map = {}
		for (const task of tasks) {
			const teamId = task.assignedTeam?._id
			if (!teamId) continue
			if (!map[teamId]) {
				map[teamId] = { total: 0, completed: 0 }
			}
			map[teamId].total += 1
			if (task.status === STATUS.COMPLETED || task.status === STATUS.AWAITING_HR_REVIEW) {
				map[teamId].completed += 1
			}
		}
		return map
	}, [tasks])

	const teamStatusMap = useMemo(() => {
		const statusMap = {}
		teams.forEach((team) => {
			statusMap[team._id] = { activeCount: 0 }
		})

		tasks.forEach((task) => {
			const teamId = task.assignedTeam?._id
			if (!teamId || !ACTIVE_TEAM_STATUSES.includes(task.status)) return
			if (!statusMap[teamId]) {
				statusMap[teamId] = { activeCount: 0 }
			}
			statusMap[teamId].activeCount += 1
		})

		return statusMap
	}, [teams, tasks])

	const getTeamStatus = (teamId) => {
		const teamLoad = teamStatusMap[teamId] || { activeCount: 0 }
		if (teamLoad.activeCount > 0) {
			return {
				label: 'Working on a Task',
				color: '#b45309',
				background: '#fef3c7',
				border: '#f59e0b'
			}
		}
		return {
			label: 'Free',
			color: '#166534',
			background: '#dcfce7',
			border: '#4ade80'
		}
	}

	const handleTeamCreate = async (e) => {
		e.preventDefault()
		if (!teamForm.name.trim()) {
			setError('Team name is required')
			return
		}
		const requiredRoles = ['designerId', 'developerId', 'testerId']
		const missing = requiredRoles.filter(field => !(teamForm[field] || '').trim())
		if (missing.length) {
			setError('Select designer, developer, and tester for the team')
			return
		}
		setCreatingTeam(true); setMessage(''); setError(null)
		try{
			const payload = {
				name: teamForm.name.trim(),
				designerId: teamForm.designerId,
				developerId: teamForm.developerId,
				testerId: teamForm.testerId
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

	const handleAddMember = async (teamId, memberId) => {
		if (!memberId || !memberId.trim()) {
			setError('Select a member to add')
			return
		}
		setError(null); setMessage('')
		try{
			await apiFetch(`/api/manager/teams/${teamId}/members`, { method: 'POST', body: { memberId: memberId.trim() } })
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
			let nextSelection = { ...existing, [field]: value }
			if (field === 'mode') {
				nextSelection = value === 'team'
					? { ...emptyAssignment, mode: 'team' }
					: { ...emptyAssignment, mode: 'user' }
			}
			if (field === 'teamId') {
				nextSelection = { ...existing, teamId: value, userId: '' }
			}
			if (field === 'userId') {
				nextSelection = { ...existing, userId: value, teamId: '' }
			}
			return {
				...prev,
				[taskId]: nextSelection
			}
		})
	}

	const setDecisionInput = (taskId, value) => {
		setDecisionInputs(prev => ({
			...prev,
			[taskId]: value
		}))
	}

	const handleTrackTeamProgress = (teamId) => {
		if (!teamId) {
			setError('Select a team first to track progress')
			return
		}
		nav(`/manager/track/team/${teamId}`)
	}

	const handleTrackUserProgress = (userId) => {
		if (!userId) {
			setError('Select an individual user first to track progress')
			return
		}
		nav(`/manager/track/user/${userId}`)
	}

	const handleAssignTask = async (task) => {
		const taskId = task?._id
		const selection = assignmentSelections[taskId] || { ...emptyAssignment }
		const projectDeadline = task?.deadline ? new Date(task.deadline) : null
		const projectDeadlineTs = projectDeadline && !Number.isNaN(projectDeadline.getTime()) ? projectDeadline.getTime() : null
		const ensureWithinProjectDeadline = (value) => {
			if (!value || projectDeadlineTs === null) return true
			const date = new Date(value)
			if (Number.isNaN(date.getTime())) return true
			if (date.getTime() > projectDeadlineTs) {
				setError('Deadline cannot exceed project final deadline.')
				return false
			}
			return true
		}
		if (selection.mode === 'team') {
			if (!selection.teamId) {
				setError('Select a team before assigning the project')
				return
			}
			const roleMap = teamRoleLookup[selection.teamId] || {}
			const missingRoles = ['designer', 'developer', 'tester'].filter(role => !roleMap[role])
			if (missingRoles.length) {
				const labels = missingRoles.map(formatRole).join(', ')
				setError(`Selected team is missing required roles: ${labels}`)
				return
			}
			if (!selection.designerDeadline || !selection.developerDeadline || !selection.testerDeadline) {
				setError('Provide deadlines for designer, developer, and tester stages')
				return
			}
			if (!ensureWithinProjectDeadline(selection.designerDeadline)
				|| !ensureWithinProjectDeadline(selection.developerDeadline)
				|| !ensureWithinProjectDeadline(selection.testerDeadline)) {
				return
			}
			const designerDate = new Date(selection.designerDeadline)
			const developerDate = new Date(selection.developerDeadline)
			const testerDate = new Date(selection.testerDeadline)
			if (developerDate.getTime() < designerDate.getTime()) {
				setError('Developer deadline cannot be before designer deadline')
				return
			}
			if (testerDate.getTime() < developerDate.getTime()) {
				setError('Tester deadline cannot be before developer deadline')
				return
			}
		} else {
			if (!selection.userId) {
				setError('Select a user for direct assignment')
				return
			}
			const selectedUser = managedUsers.find(user => user._id === selection.userId)
			if (!selectedUser) {
				setError('Selected user is not available under your teams')
				return
			}
			if (selectedUser.role === 'designer' && !selection.designerDeadline) {
				setError('Provide a designer deadline for direct assignment')
				return
			}
			if (selectedUser.role === 'developer' && !selection.developerDeadline) {
				setError('Provide a developer deadline for direct assignment')
				return
			}
			if (selectedUser.role === 'tester' && !selection.testerDeadline) {
				setError('Provide a tester deadline for direct assignment')
				return
			}
			if (selectedUser.role === 'designer') {
				if (!ensureWithinProjectDeadline(selection.designerDeadline)) return
			}
			if (selectedUser.role === 'developer') {
				if (!ensureWithinProjectDeadline(selection.developerDeadline)) return
				const designerCompletion = selection.designerDeadline ? new Date(selection.designerDeadline) : new Date()
				const developerDate = new Date(selection.developerDeadline)
				if (developerDate.getTime() < designerCompletion.getTime()) {
					setError('Developer deadline cannot be before designer completion deadline')
					return
				}
			}
			if (selectedUser.role === 'tester') {
				if (!ensureWithinProjectDeadline(selection.testerDeadline)) return
				const developerCompletion = selection.developerDeadline ? new Date(selection.developerDeadline) : new Date()
				const testerDate = new Date(selection.testerDeadline)
				if (testerDate.getTime() < developerCompletion.getTime()) {
					setError('Tester deadline cannot be before developer deadline')
					return
				}
			}
		}
		setAssigningTaskId(taskId); setError(null); setMessage('')
		try{
			const payload = {}
			if (selection.mode === 'team') {
				payload.teamId = selection.teamId
				payload.designerDeadline = selection.designerDeadline
			} else {
				payload.userId = selection.userId
			}
			if (selection.designerDeadline) payload.designerDeadline = selection.designerDeadline
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
			await Promise.all([refreshTasks(), refreshPerformanceReport()])
		}catch(err){ setError(err.message) }
		finally{ setAssigningTaskId('') }
	}

	const handleTaskDecision = async (task, decision) => {
		const comment = (decisionInputs[task._id] || '').trim()
		if (decision === 'reject' && !comment) {
			setError('Please provide feedback before rejecting this task')
			return
		}
		setDecidingTaskId(task._id)
		setError(null)
		setMessage('')
		try {
			const updatedTask = await apiFetch(`/api/manager/tasks/${task._id}/decision`, {
				method: 'PUT',
				body: { decision, comment }
			})
			setTasks(prev => prev.map(item => item._id === updatedTask._id ? updatedTask : item))
			setDecisionInputs(prev => {
				const next = { ...prev }
				delete next[task._id]
				return next
			})
			setMessage(decision === 'accept' ? 'Task accepted. You can assign it now.' : 'Task rejected with feedback sent to workflow history.')
			await Promise.all([refreshTasks(), refreshPerformanceReport()])
		} catch (err) {
			setError(err.message)
		} finally {
			setDecidingTaskId('')
		}
	}

	const handleReviewAdvance = async (task) => {
		const { action, success } = getReviewAction(task.status)
		const payload = { action }
		setForwardingTaskId(task._id); setError(null); setMessage('')
		try{
			await apiFetch(`/api/user/tasks/${task._id}/status`, { method: 'PUT', body: payload })
			setMessage(success)
			await refreshTasks()
		}catch(err){ setError(err.message) }
		finally{ setForwardingTaskId('') }
	}

	const _displayName = profile ? profile.name || profile.email || 'Manager' : 'Manager'

	return (
		<>
			{/* Team Form Modal */}
			{showTeamForm && (
				<div className="modal-overlay" onClick={() => {
					setShowTeamForm(false)
					setEditingTeamId(null)
					setTeamForm(emptyTeamForm)
				}}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '700px'}}>
						<div className="modal-header">
							<h2 className="modal-title">{editingTeamId ? 'Edit Team' : 'Create New Team'}</h2>
							<button className="modal-close" onClick={() => {
								setShowTeamForm(false)
								setEditingTeamId(null)
								setTeamForm(emptyTeamForm)
							}}>×</button>
						</div>
						<form onSubmit={handleTeamCreate}>
							<div className="modal-body">
								{error ? (
									<div style={{
										marginBottom: 10,
										padding: '10px 12px',
										borderRadius: 8,
										background: '#fee2e2',
										border: '1px solid #fca5a5',
										color: '#b91c1c',
										fontSize: 13,
										fontWeight: 600
									}}>{error}</div>
								) : null}
								<div className="form">
									<label>Team name
										<input value={teamForm.name} onChange={e=>setTeamForm(prev=>({ ...prev, name: e.target.value }))} required />
									</label>
									<label>Designer
										<select 
											value={teamForm.designerId} 
											onChange={e=>setTeamForm(prev=>({ ...prev, designerId: e.target.value }))} 
											required
											style={{padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14}}
										>
											<option value="">Select a designer</option>
											{availableUsers.designers.map(user => (
												<option key={user._id} value={user._id}>
													{user.name} ({user.email}) • {formatCategories(user.categories || [user.category])}
												</option>
											))}
										</select>
										{availableUsers.designers.length === 0 && (
											<div style={{marginTop: 6, fontSize: 12, color: '#ef4444'}}>
												No designers available with matching categories.
											</div>
										)}
									</label>
									<label>Developer
										<select 
											value={teamForm.developerId} 
											onChange={e=>setTeamForm(prev=>({ ...prev, developerId: e.target.value }))} 
											required
											style={{padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14}}
										>
											<option value="">Select a developer</option>
											{availableUsers.developers.map(user => (
												<option key={user._id} value={user._id}>
													{user.name} ({user.email}) • {formatCategories(user.categories || [user.category])}
												</option>
											))}
										</select>
										{availableUsers.developers.length === 0 && (
											<div style={{marginTop: 6, fontSize: 12, color: '#ef4444'}}>
												No developers available with matching categories.
											</div>
										)}
									</label>
									<label>Tester
										<select 
											value={teamForm.testerId} 
											onChange={e=>setTeamForm(prev=>({ ...prev, testerId: e.target.value }))} 
											required
											style={{padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14}}
										>
											<option value="">Select a tester</option>
											{availableUsers.testers.map(user => (
												<option key={user._id} value={user._id}>
													{user.name} ({user.email}) • {formatCategories(user.categories || [user.category])}
												</option>
											))}
										</select>
										{availableUsers.testers.length === 0 && (
											<div style={{marginTop: 6, fontSize: 12, color: '#ef4444'}}>
												No testers available with matching categories.
											</div>
										)}
									</label>
								</div>
							</div>
							<div className="modal-footer">
								<button type="button" className="btn btn-outline" onClick={()=>{
									setShowTeamForm(false)
									setEditingTeamId(null)
									setTeamForm(emptyTeamForm)
								}}>Cancel</button>
								<button type="submit" className="btn" disabled={creatingTeam}>
									{creatingTeam ? 'Saving...' : (editingTeamId ? 'Update Team' : 'Create Team')}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

		<div className="admin-dashboard">
			{/* Glass-morphism Header */}
			<header className="admin-glass-header" ref={headerRef}>
				<div className="admin-glass-header-content">
					{/* Left: Dashboard Title */}
					<div className="admin-header-left">
						<h1 className="admin-dashboard-title">Manager Dashboard</h1>
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
								className={`admin-nav-btn ${['teams', 'tasks'].includes(activeView) ? 'active' : ''}`}
						>
							<span className="nav-icon">⚙️</span>
							<span>Manage</span>
							<span className="dropdown-arrow">▼</span>
						</button>
						<div className="admin-dropdown-menu">
							<button className="dropdown-item" onClick={() => setActiveView('teams')}>
								<span className="dropdown-icon">👥</span>
								My Teams
							</button>
							<button className="dropdown-item" onClick={() => setActiveView('tasks')}>
								<span className="dropdown-icon">✓</span>
								Tasks
							</button>
						</div>
					</div>

					<div className="admin-nav-dropdown" onMouseEnter={(e) => e.currentTarget.classList.add('open')} onMouseLeave={(e) => e.currentTarget.classList.remove('open')}>
						<button 
							className={`admin-nav-btn ${['review', 'progress'].includes(activeView) ? 'active' : ''}`}
						>
							<span className="nav-icon">👁️</span>
							<span>View</span>
							<span className="dropdown-arrow">▼</span>
						</button>
						<div className="admin-dropdown-menu">
							<button className="dropdown-item" onClick={() => setActiveView('review')}>
								<span className="dropdown-icon">✅</span>
								Review
							</button>
							<button className="dropdown-item" onClick={() => setActiveView('progress')}>
								<span className="dropdown-icon">📊</span>
								Task Progress
							</button>
						</div>
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

			{/* Right: Logout Button Only */}
			<div className="admin-header-right">
				<button className="admin-logout-btn" onClick={logout}>
					<span className="logout-icon">🚪</span>
					<span>Logout</span>
				</button>
		</div>
	</div>
</header>

			{/* Main Content Area */}
			<div className="admin-content">
				{message ? (
					<div className="dashboard-alert dashboard-alert-success">{message}</div>
				) : null}
				{error ? (
					<div className="dashboard-alert dashboard-alert-error">{error}</div>
				) : null}
				<div className="admin-main">
					{activeView === 'overview' && (
						<DashboardWelcomeBanner name={profile?.name} role="manager" />
					)}
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
														const stats = teamTaskStats[team._id] || { total: 0, completed: 0 }
														const teamCompletedTasks = stats.completed
														const teamProgress = stats.total > 0 ? Math.round((teamCompletedTasks / stats.total) * 100) : 0

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
																	{teamCompletedTasks} of {stats.total} tasks completed
																</div>
															</div>
														)
													})}
												</div>
											</div>
										)}

										{performanceReport?.users?.length ? (
											<div style={{
												background: '#fff',
												borderRadius: '16px',
												padding: '28px',
												boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
												marginTop: '24px'
											}}>
												<h3 style={{margin: '0 0 18px 0', fontSize: '22px', fontWeight: 700, color: '#111827'}}>📈 Team Member Performance</h3>
												<div style={{display: 'grid', gap: 12}}>
													{performanceReport.users.map(item => (
														<div key={item.userId} style={{padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc'}}>
															<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
																<div style={{fontWeight: 700, color: '#1e293b'}}>{item.name} ({formatRole(item.role)})</div>
																<div style={{fontSize: 12, color: '#475569'}}>Success {Math.round(item.successRatio)}% • Failure {Math.round(item.failureRatio)}%</div>
															</div>
															<div style={{display: 'flex', gap: 10, fontSize: 12, color: '#475569', marginBottom: 8}}>
																<span>On-time: {item.completedOnTime}</span>
																<span>Delayed: {item.delayedTasks}</span>
																<span>Failed: {item.failedTasks}</span>
															</div>
															<div style={{height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden'}}>
																<div style={{height: '100%', width: `${Math.max(0, Math.min(100, item.successRatio))}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)'}} />
															</div>
														</div>
													))}
												</div>
											</div>
										) : null}
									</>
								)}

								{/* MY TEAMS VIEW */}
								{activeView === 'teams' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<h3 className="dashboard-section-title">My Teams</h3>
											<button className="btn" onClick={()=>{
												loadAvailableUsers()
												setError(null)
												setMessage('')
												setEditingTeamId(null)
												setTeamForm(emptyTeamForm)
												setShowTeamForm(true)
											}}>
												+ Add Team
											</button>
										</div>

										{teams.length ? (
											<div style={{display: 'grid', gap: 16}}>
												{teams.map(team => {
													// Load users if not already loaded
													if (availableUsers.designers.length === 0 && availableUsers.developers.length === 0 && availableUsers.testers.length === 0) {
														loadAvailableUsers()
													}
													
													return (
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
																	className="btn small danger-action" 
																	onClick={() => handleDeleteTeam(team._id)}
																	disabled={deletingTeamId === team._id}
																	style={{minWidth: 70}}
																>
																	{deletingTeamId === team._id ? 'Deleting...' : 'Delete'}
																</button>
															</div>
														</div>
													<div className="small-row" style={{marginTop:12, gap: 8}}>
														<select 
															style={{flex:1, padding:'8px 12px', border:'1px solid var(--border)', borderRadius:6}} 
															value={memberInputs[team._id] || ''} 
															onChange={e=>setMemberInputs(prev=>({...prev, [team._id]: e.target.value}))}
														>
															<option value="">Select member to add</option>
															{[...availableUsers.designers, ...availableUsers.developers, ...availableUsers.testers]
																.filter(user => !team.members.some(m => m._id === user._id))
																.map(user => (
																	<option key={user._id} value={user._id}>
																		{user.name} ({user.role}) • {formatCategories(user.categories || [user.category])}
																	</option>
																))}
														</select>
														<button 
															className="btn small" 
															onClick={()=>{
																const memberId = memberInputs[team._id]
																if (!memberId) {
																	setError('Select a member to add')
																	return
																}
																handleAddMember(team._id, memberId)
															}}
														>
															+ Add Member
														</button>
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
														<button className="btn small btn-outline danger-action" onClick={()=>handleRemoveMember(team._id, member._id)}>Remove</button>
													</div>
												))}
											</div>
										) : <p style={{color:'var(--muted)', padding:'12px', textAlign:'center', background:'#f8fafc', borderRadius:'6px', marginTop:12}}>No members yet</p>}
													</div>
												)
											})}
											</div>
										) : <p style={{color:'var(--muted)', padding:'16px', textAlign:'center', background:'#f8fafc', borderRadius:'8px'}}>No teams created yet.</p>}
									</div>
								)}

								{/* TASKS VIEW */}
								{activeView === 'tasks' && (
									<div className="dashboard-section">
										<div className="dashboard-section-header">
											<div className="ma-title-wrap">
												<h3 className="dashboard-section-title">Tasks Awaiting Assignment</h3>
												<span className="ma-count-chip">{awaitingAssignment.length} tasks</span>
											</div>
										</div>
						{awaitingAssignment.length ? (
							<div className="ma-card-grid">
								{awaitingAssignment.map(task => {
									const selection = assignmentSelections[task._id] || { ...emptyAssignment }
									const roleMap = selection.teamId ? (teamRoleLookup[selection.teamId] || {}) : null
									const missingRoles = selection.mode === 'team' && selection.teamId ? ['designer', 'developer', 'tester'].filter(role => !roleMap || !roleMap[role]) : []
									const isAssigning = assigningTaskId === task._id
									const isDeciding = decidingTaskId === task._id
									const decisionState = task.managerDecision?.decision || 'pending'
									const pendingDecision = task.status === STATUS.AWAITING_MANAGER_ASSIGNMENT && decisionState !== 'accepted'
									const selectedUser = selection.userId ? managedUsers.find(user => user._id === selection.userId) : null
									const taskUid = `task-${task._id}`
									return (
										<div key={task._id} className="item-card ma-task-card">
											<div className="item-header ma-task-head">
												<h4 className="item-title">{task.title}</h4>
												<span className="status-badge status-pending ma-awaiting-pill">Awaiting</span>
											</div>
											<div className="help ma-decision">
												Decision: {decisionState === 'accepted' ? 'Accepted' : decisionState === 'rejected' ? 'Rejected' : 'Pending'}
											</div>
											{task.managerDecision?.comment ? <div className="help ma-feedback">Feedback: {task.managerDecision.comment}</div> : null}
											{task.description ? <div className="help ma-description">{task.description}</div> : null}
											{Array.isArray(task.attachments) && task.attachments.length ? (
												<details className="ma-files-box">
													<summary>View submitted files</summary>
													<ul>
														{task.attachments.map(file => (
															<li key={file._id || file.filename}>
																<a href={resolveAssetUrl(`/uploads/${file.filename}`)} target="_blank" rel="noreferrer" className="ma-file-link">{file.originalName || file.filename}</a>
															</li>
														))}
													</ul>
												</details>
											) : null}
											{pendingDecision ? (
												<>
													<textarea
														id={`${taskUid}-decision-comment`}
														value={decisionInputs[task._id] || ''}
														onChange={e => setDecisionInput(task._id, e.target.value)}
														placeholder="Add feedback (required for rejection)"
														className="ma-input ma-textarea"
													/>
													<div className="small-row ma-action-row">
														<button className="btn small" onClick={()=>handleTaskDecision(task, 'accept')} disabled={isDeciding}>{isDeciding ? 'Saving...' : 'Accept'}</button>
														<button className="btn small danger-action" onClick={()=>handleTaskDecision(task, 'reject')} disabled={isDeciding}>{isDeciding ? 'Saving...' : 'Reject'}</button>
													</div>
												</>
											) : (
												<>
													<div className="ma-mode-label">Choose assignment type</div>
													<div className="ma-mode-switch" role="tablist" aria-label="Assignment mode">
														<button
															type="button"
															className={`ma-mode-btn ${selection.mode === 'team' ? 'active' : ''}`}
															onClick={() => setAssignmentSelection(task._id, 'mode', 'team')}
														>
															Team
														</button>
														<button
															type="button"
															className={`ma-mode-btn ${selection.mode === 'user' ? 'active' : ''}`}
															onClick={() => setAssignmentSelection(task._id, 'mode', 'user')}
														>
															Individual
														</button>
													</div>
													{selection.mode === 'team' ? (
														<div className="small-row ma-select-row">
															<select value={selection.teamId} onChange={e=>setAssignmentSelection(task._id, 'teamId', e.target.value)} className="ma-input ma-select">
																id={`${taskUid}-team-select`}
																<option value="">Select team</option>
																{teams.map(team => (
																	<option key={team._id} value={team._id}>{team.name} — {getTeamStatus(team._id).label}</option>
																))}
															</select>
															<button
																type="button"
																className="btn small ma-track-btn"
																onClick={() => handleTrackTeamProgress(selection.teamId)}
																disabled={!selection.teamId}
															>
																Track Progress
															</button>
														</div>
													) : (
														<div className="ma-user-block">
															<div className="ma-user-label">Select individual user</div>
															<div className="small-row ma-select-row">
															<select value={selection.userId} onChange={e=>setAssignmentSelection(task._id, 'userId', e.target.value)} className="ma-input ma-select">
																id={`${taskUid}-user-select`}
																<option value="">Select individual user</option>
																{managedUsers.map(user => {
																	const metric = performanceByUserId[user._id]
																	return <option key={user._id} value={user._id}>{user.name} ({formatRole(user.role)}){metric ? ` • Success ${Math.round(metric.successRatio)}%` : ''}</option>
																})}
															</select>
															<button
																type="button"
																className="btn small ma-track-btn"
																onClick={() => handleTrackUserProgress(selection.userId)}
																disabled={!selection.userId}
															>
																Track Progress
															</button>
															</div>
														</div>
													)}
													{selection.mode === 'team' && selection.teamId ? (
														<>
															<div className="help ma-team-summary">Designer: {formatMemberLabel(roleMap?.designer)} | Developer: {formatMemberLabel(roleMap?.developer)} | Tester: {formatMemberLabel(roleMap?.tester)}</div>
															{missingRoles.length ? <div className="error" style={{marginTop:6}}>Team is missing: {missingRoles.map(formatRole).join(', ')}</div> : null}
														</>
													) : null}
													{selection.mode === 'user' && selectedUser ? <div className="help ma-selected-user">Selected: {selectedUser.name} ({formatRole(selectedUser.role)})</div> : null}
													<div className="ma-deadline-box">
														<div className="ma-deadline-title">Assignment Deadline</div>
														<div className="small-row ma-deadline-row">
															{selection.mode === 'team' ? (
																<>
																	<label className="ma-deadline-field">
																		Designer deadline
																		<input
																			id={`${taskUid}-designer-deadline`}
																			className="ma-input"
																			type="datetime-local"
																			value={selection.designerDeadline}
																			max={toDateTimeLocal(task.deadline)}
																			onChange={e=>setAssignmentSelection(task._id, 'designerDeadline', e.target.value)}
																		/>
																		<span className="help" style={getSlackStyle(selection.designerDeadline, task.deadline)}>{formatSlackDays(selection.designerDeadline, task.deadline)}</span>
																	</label>
																	<label className="ma-deadline-field">
																		Developer deadline
																		<input
																			id={`${taskUid}-developer-deadline`}
																			className="ma-input"
																			type="datetime-local"
																			value={selection.developerDeadline}
																			min={selection.designerDeadline || ''}
																			max={toDateTimeLocal(task.deadline)}
																			onChange={e=>setAssignmentSelection(task._id, 'developerDeadline', e.target.value)}
																		/>
																		<span className="help" style={getSlackStyle(selection.developerDeadline, task.deadline)}>{formatSlackDays(selection.developerDeadline, task.deadline)}</span>
																	</label>
																	<label className="ma-deadline-field">
																		Tester deadline
																		<input
																			id={`${taskUid}-tester-deadline`}
																			className="ma-input"
																			type="datetime-local"
																			value={selection.testerDeadline}
																			min={selection.developerDeadline || ''}
																			max={toDateTimeLocal(task.deadline)}
																			onChange={e=>setAssignmentSelection(task._id, 'testerDeadline', e.target.value)}
																		/>
																		<span className="help" style={getSlackStyle(selection.testerDeadline, task.deadline)}>{formatSlackDays(selection.testerDeadline, task.deadline)}</span>
																	</label>
																</>
															) : (
																<label className="ma-deadline-field ma-user-deadline-field">
																	{selectedUser ? `${formatRole(selectedUser.role)} deadline` : 'Selected user deadline'}
																	<input
																		id={`${taskUid}-user-deadline`}
																		className="ma-input"
																		type="datetime-local"
																		value={selectedUser?.role === 'designer' ? selection.designerDeadline : selectedUser?.role === 'developer' ? selection.developerDeadline : selection.testerDeadline}
																			min={selectedUser?.role === 'tester' && selection.developerDeadline ? selection.developerDeadline : toDateTimeLocal(new Date())}
																			max={toDateTimeLocal(task.deadline)}
																		onChange={e=>{
																			if (!selectedUser) return
																			const field = selectedUser.role === 'designer' ? 'designerDeadline' : selectedUser.role === 'developer' ? 'developerDeadline' : 'testerDeadline'
																			setAssignmentSelection(task._id, field, e.target.value)
																		}}
																	/>
																		<span className="help" style={getSlackStyle(
																			selectedUser?.role === 'designer'
																				? selection.designerDeadline
																				: selectedUser?.role === 'developer'
																					? selection.developerDeadline
																					: selection.testerDeadline,
																			task.deadline
																		)}>
																			{formatSlackDays(
																				selectedUser?.role === 'designer'
																					? selection.designerDeadline
																					: selectedUser?.role === 'developer'
																						? selection.developerDeadline
																					: selection.testerDeadline,
																				task.deadline
																			)}
																		</span>
																</label>
															)}
															<button className="btn small ma-assign-btn" onClick={()=>handleAssignTask(task)} disabled={isAssigning || (selection.mode === 'team' && missingRoles.length > 0)}>
																{isAssigning ? 'Assigning...' : 'Assign Task'}
															</button>
														</div>
													</div>
												</>
											)}
											<div className="item-meta ma-meta-row">
												<span><span className="item-meta-label">Due:</span> {formatDate(task.deadline)}</span>
												<span><span className="item-meta-label">Remaining:</span> <span style={getRemainingStyle(task.deadline)}>{formatRemainingDays(task.deadline)}</span></span>
												<span><span className="item-meta-label">Status:</span> {task.status}</span>
											</div>
										</div>
									)
								})}
							</div>
						) : <p className="ma-empty-state">No tasks waiting on assignment.</p>}
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
										<th style={{textAlign:'left', paddingBottom:6}}>Remaining</th>
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
											<td style={{padding:'6px 4px'}}><span style={getRemainingStyle(task.deadline)}>{formatRemainingDays(task.deadline)}</span></td>
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
									<div className="dashboard-chat-area">
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

			{/* Floating Profile Button - Bottom Right */}
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
								<div className="profile-menu-role">Manager</div>
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
</div>
		</>
	)
}
