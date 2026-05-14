import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { formatDate, formatRole, getTaskStage } from '../utils/helpers'

const normalizeId = (value) => {
	if (!value) return ''
	if (typeof value === 'string') return value
	if (typeof value === 'object' && value._id) return value._id.toString()
	return value.toString()
}

const getEntityPalette = (mode) => {
	if (mode === 'team') {
		return {
			hero: 'linear-gradient(125deg, #0f172a 0%, #0c4a6e 50%, #0e7490 100%)',
			accent: '#0e7490',
			secondary: '#14b8a6'
		}
	}
	return {
		hero: 'linear-gradient(125deg, #312e81 0%, #1d4ed8 50%, #0f766e 100%)',
		accent: '#2563eb',
		secondary: '#14b8a6'
	}
}

const CircularProgress = ({ successRatio = 0, failureRatio = 0 }) => {
	const clampedSuccess = Math.max(0, Math.min(100, Math.round(successRatio)))
	const clampedFailure = Math.max(0, Math.min(100, Math.round(failureRatio)))
	const background = `conic-gradient(#16a34a 0 ${clampedSuccess}%, #ef4444 ${clampedSuccess}% ${Math.min(100, clampedSuccess + clampedFailure)}%, #cbd5e1 0)`
	return (
		<div className="mtp-chart-card">
			<h4>Outcome Ratio</h4>
			<div className="mtp-donut-wrap">
				<div className="mtp-donut" style={{ background }}>
					<div className="mtp-donut-center">
						<div className="mtp-donut-main">{clampedSuccess}%</div>
						<div className="mtp-donut-sub">Success</div>
					</div>
				</div>
			</div>
			<div className="mtp-legend-row">
				<span><i style={{ background: '#16a34a' }} /> Successful: {clampedSuccess}%</span>
				<span><i style={{ background: '#ef4444' }} /> Failed: {clampedFailure}%</span>
			</div>
		</div>
	)
}

const StatusBars = ({ tasks = [] }) => {
	const buckets = useMemo(() => {
		const map = {}
		tasks.forEach((task) => {
			map[task.status] = (map[task.status] || 0) + 1
		})
		return Object.entries(map)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 6)
	}, [tasks])

	const max = Math.max(...buckets.map((item) => item[1]), 1)

	return (
		<div className="mtp-chart-card">
			<h4>Task Status Distribution</h4>
			{buckets.length === 0 ? (
				<p className="mtp-empty">No task records available.</p>
			) : (
				<div className="mtp-bars">
					{buckets.map(([status, count]) => {
						const stage = getTaskStage(status)
						const width = `${Math.max(8, Math.round((count / max) * 100))}%`
						return (
							<div key={status} className="mtp-bar-row">
								<div className="mtp-bar-label">{stage.label}</div>
								<div className="mtp-bar-track">
									<div className="mtp-bar-fill" style={{ width, background: stage.color }} />
								</div>
								<div className="mtp-bar-value">{count}</div>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

export default function ManagerTrackProgress() {
	const nav = useNavigate()
	const { mode, id } = useParams()
	const safeMode = mode === 'team' ? 'team' : mode === 'user' ? 'user' : ''
	const [report, setReport] = useState(null)
	const [tasks, setTasks] = useState([])
	const [teams, setTeams] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	useEffect(() => {
		if (!safeMode || !id) {
			setError('Invalid tracking URL.')
			setLoading(false)
			return
		}

		const load = async () => {
			setLoading(true)
			setError('')
			try {
				const [reportData, taskData, teamData] = await Promise.all([
					apiFetch('/api/manager/performance-report'),
					apiFetch('/api/manager/tasks'),
					apiFetch('/api/manager/teams')
				])
				setReport(reportData)
				setTasks(Array.isArray(taskData) ? taskData : [])
				setTeams(Array.isArray(teamData) ? teamData : [])
			} catch (err) {
				setError(err.message || 'Failed to load progress data')
			} finally {
				setLoading(false)
			}
		}

		load()
	}, [safeMode, id])

	const selectedMetric = useMemo(() => {
		if (!report || !id || !safeMode) return null
		if (safeMode === 'team') {
			return (report.teams || []).find((item) => normalizeId(item.teamId) === id) || null
		}
		return (report.users || []).find((item) => normalizeId(item.userId) === id) || null
	}, [report, safeMode, id])

	const selectedEntityName = useMemo(() => {
		if (safeMode === 'team') {
			return selectedMetric?.teamName || 'Team Progress'
		}
		if (selectedMetric?.name) return selectedMetric.name
		for (const team of teams) {
			for (const member of team.members || []) {
				if (normalizeId(member._id) === id) {
					return member.name || member.email || 'Individual Progress'
				}
			}
		}
		return 'Individual Progress'
	}, [safeMode, selectedMetric, teams, id])

	const filteredTasks = useMemo(() => {
		if (!id || !safeMode) return []
		if (safeMode === 'team') {
			return tasks.filter((task) => normalizeId(task.assignedTeam) === id)
		}

		return tasks.filter((task) => {
			if (normalizeId(task.assignedTo) === id) return true
			const stages = task.stageAssignments || {}
			return ['designer', 'developer', 'tester'].some((role) => normalizeId(stages?.[role]?.user) === id)
		})
	}, [tasks, safeMode, id])

	const taskSummary = useMemo(() => {
		return filteredTasks.reduce((acc, task) => {
			acc.total += 1
			if (task.status === 'Completed') acc.completed += 1
			if (task.status === 'Cancelled') acc.cancelled += 1
			if (task.status === 'Changes Requested') acc.revision += 1
			if ((task.status.includes('In Progress') || task.status === 'Delayed') && task.status !== 'Cancelled') acc.active += 1
			return acc
		}, { total: 0, completed: 0, cancelled: 0, revision: 0, active: 0 })
	}, [filteredTasks])

	const palette = getEntityPalette(safeMode)
	const successRatio = selectedMetric?.successRatio || 0
	const failureRatio = selectedMetric?.failureRatio || 0

	if (loading) {
		return (
			<div className="mtp-page">
				<div className="mtp-shell">
					<div className="mtp-loading">Loading progress dashboard...</div>
				</div>
			</div>
		)
	}

	return (
		<div className="mtp-page">
			<div className="mtp-shell">
				<header className="mtp-hero" style={{ background: palette.hero }}>
					<div>
						<div className="mtp-kicker">Manager Tracking Portal</div>
						<h1>{safeMode === 'team' ? 'Team Progress Tracking' : 'Individual Progress Tracking'}</h1>
						<p>Live progress, workload, outcomes, and delivery details for {selectedEntityName}.</p>
					</div>
					<div className="mtp-actions">
						<button type="button" className="mtp-btn mtp-btn-light" onClick={() => nav('/manager')}>Back to Manager Dashboard</button>
					</div>
				</header>

				{error ? <div className="mtp-error">{error}</div> : null}
				{!selectedMetric ? <div className="mtp-error">No progress data found for this selection.</div> : null}

				<div className="mtp-stat-grid">
					<div className="mtp-stat-card">
						<div className="mtp-stat-label">{safeMode === 'team' ? 'Team Name' : 'Member Name'}</div>
						<div className="mtp-stat-value">{selectedEntityName}</div>
					</div>
					<div className="mtp-stat-card">
						<div className="mtp-stat-label">Total Assigned</div>
						<div className="mtp-stat-value">{selectedMetric?.totalAssigned || taskSummary.total}</div>
					</div>
					<div className="mtp-stat-card">
						<div className="mtp-stat-label">Completed On Time</div>
						<div className="mtp-stat-value">{selectedMetric?.completedOnTime || 0}</div>
					</div>
					<div className="mtp-stat-card">
						<div className="mtp-stat-label">Delayed / Failed</div>
						<div className="mtp-stat-value">{selectedMetric?.delayedTasks || 0} / {selectedMetric?.failedTasks || 0}</div>
					</div>
				</div>

				<div className="mtp-charts-grid">
					<CircularProgress successRatio={successRatio} failureRatio={failureRatio} />
					<StatusBars tasks={filteredTasks} />
				</div>

				<div className="mtp-task-panel">
					<div className="mtp-task-panel-head">
						<h3>{safeMode === 'team' ? 'Team Tasks' : 'Individual Tasks'}</h3>
						<div className="mtp-chip-row">
							<span className="mtp-chip" style={{ borderColor: palette.accent }}>Active: {taskSummary.active}</span>
							<span className="mtp-chip" style={{ borderColor: palette.secondary }}>Completed: {taskSummary.completed}</span>
							<span className="mtp-chip" style={{ borderColor: '#f97316' }}>Revision: {taskSummary.revision}</span>
						</div>
					</div>
					{filteredTasks.length === 0 ? (
						<p className="mtp-empty">No matching tasks found for this selection.</p>
					) : (
						<div className="mtp-table-wrap">
							<table className="mtp-table">
								<thead>
									<tr>
										<th>Task</th>
										<th>Current Owner</th>
										<th>Status</th>
										<th>Role Stage</th>
										<th>Deadline</th>
									</tr>
								</thead>
								<tbody>
									{filteredTasks.map((task) => {
										const stageMeta = getTaskStage(task.status)
										return (
											<tr key={task._id}>
												<td>{task.title}</td>
												<td>{task.assignedTo?.name || task.assignedTo?.email || 'Unassigned'}</td>
												<td>
													<span className="mtp-status" style={{ background: stageMeta.color }}>{task.status}</span>
												</td>
												<td>{formatRole(task.assignedTo?.role || task.currentStage || 'N/A')}</td>
												<td>{formatDate(task.deadline, true)}</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
