import React, { useCallback, useRef } from 'react'
import '../styles/hr-progress.css'

const palette = {
	success: '#16a34a',
	fail: '#dc2626',
	rejected: '#ea580c',
	delayed: '#d97706',
	assigned: '#4338ca',
	onTime: '#0284c7'
}

const StatCard = ({ label, value, tone }) => (
	<div className={`hrup-stat-card ${tone || ''}`}>
		<div className="hrup-stat-label">{label}</div>
		<div className="hrup-stat-value">{value}</div>
	</div>
)

const ProgressLine = ({ label, value, max, color, suffix = '' }) => {
	const safeMax = max > 0 ? max : 1
	const width = Math.max(4, Math.min(100, (value / safeMax) * 100))

	return (
		<div className="hrup-line-row">
			<div className="hrup-line-head">
				<span>{label}</span>
				<strong>{value}{suffix}</strong>
			</div>
			<div className="hrup-line-track">
				<div className="hrup-line-fill" style={{ width: `${width}%`, background: color }} />
			</div>
		</div>
	)
}

const ComparisonBars = ({ title, series = [] }) => {
	const maxValue = Math.max(...series.map(item => item.value || 0), 1)

	return (
		<div className="hrup-panel hrup-chart-panel">
			<div className="hrup-panel-title">{title}</div>
			<div className="hrup-compare-bars">
				{series.map(item => (
					<div className="hrup-compare-item" key={item.label}>
						<div className="hrup-compare-meta">
							<span>{item.label}</span>
							<strong>{item.value || 0}</strong>
						</div>
						<div className="hrup-compare-track">
							<div
								className="hrup-compare-fill"
								style={{ width: `${Math.max(4, ((item.value || 0) / maxValue) * 100)}%`, background: item.color }}
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

const DonutChart = ({ successRatio = 0, failureRatio = 0 }) => {
	const safeSuccess = Math.max(0, Math.min(100, Number(successRatio) || 0))
	const safeFailure = Math.max(0, Math.min(100, Number(failureRatio) || 0))
	const remainder = Math.max(0, 100 - safeSuccess - safeFailure)
	const chartStyle = {
		background: `conic-gradient(
			${palette.success} 0 ${safeSuccess}%,
			${palette.fail} ${safeSuccess}% ${safeSuccess + safeFailure}%,
			#cbd5e1 ${safeSuccess + safeFailure}% ${safeSuccess + safeFailure + remainder}%
		)`
	}

	return (
		<div className="hrup-panel hrup-chart-panel">
			<div className="hrup-panel-title">Performance Ratio</div>
			<div className="hrup-donut-wrap">
				<div className="hrup-donut" style={chartStyle}>
					<div className="hrup-donut-center">
						<div className="hrup-donut-main">{Math.round(safeSuccess)}%</div>
						<div className="hrup-donut-sub">Success Rate</div>
					</div>
				</div>
			</div>
			<div className="hrup-legend">
				<span><i style={{ background: palette.success }} />Success {Math.round(safeSuccess)}%</span>
				<span><i style={{ background: palette.fail }} />Failure {Math.round(safeFailure)}%</span>
			</div>
		</div>
	)
}

function UserProgressDashboard({
	report,
	selectedTeamId,
	selectedUserId,
	onFilterChange,
	onViewUserProgress,
	onViewTeamProgress,
	detailView,
	loadingDetail
}) {
	const exportRef = useRef(null)
	const users = report?.users || []
		const handleExportPdf = useCallback(() => {
			const node = exportRef.current
			if (!node) return
			const clone = node.cloneNode(true)
			clone.querySelectorAll('[data-export-ignore]')
				.forEach((el) => el.remove())
			const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
				.map((el) => el.outerHTML)
				.join('\n')
			const win = window.open('', '_blank')
			if (!win) return
			win.document.open()
			win.document.write(`<!DOCTYPE html><html><head><title>User Progress Report</title>${styles}
	<style>body{margin:24px;font-family:Arial,sans-serif;background:#fff;} .dashboard-section{box-shadow:none;}</style>
	</head><body>${clone.outerHTML}</body></html>`)
			win.document.close()
			win.focus()
			setTimeout(() => win.print(), 300)
		}, [])
	const teams = report?.teams || []
	const summary = report?.summary || {}
	const filterUsers = report?.filters?.users || []
	const filterTeams = report?.filters?.teams || []
	const maxUserAssigned = Math.max(...users.map(item => item.totalAssigned || 0), 1)
	const maxTeamAssigned = Math.max(...teams.map(item => item.totalAssigned || 0), 1)
	const detailMetrics = detailView?.metrics || {}
	const completionRate = summary.totalAssigned
		? Math.round(((summary.successfulTasks || 0) / Math.max(summary.totalAssigned, 1)) * 100)
		: 0

	return (
		<div className="dashboard-section hrup-wrap" ref={exportRef}>
			<div className="hrup-hero">
				<div>
					<p className="hrup-kicker">HR Analytics</p>
					<h3 className="dashboard-section-title">User And Team Progress</h3>
					<p className="hrup-subtitle">Track assignment quality, delivery speed, and detailed outcome trends across teams and individuals.</p>
				</div>
				<div className="hrup-hero-pill">
					<span>Completion</span>
					<strong>{completionRate}%</strong>
				</div>
				<button className="btn small btn-outline" onClick={handleExportPdf} data-export-ignore>
					Export as PDF
				</button>
			</div>

			<div className="hrup-stat-grid">
				<StatCard label="Success Ratio" value={`${summary.successRatio || 0}%`} tone="success" />
				<StatCard label="Failure Ratio" value={`${summary.failureRatio || 0}%`} tone="fail" />
				<StatCard label="Completed On Time" value={summary.completedOnTime || 0} tone="ontime" />
				<StatCard label="Delayed Or Rejected" value={`${summary.delayedTasks || 0} / ${summary.rejectedTasks || 0}`} tone="warning" />
			</div>

			<div className="hrup-panel hrup-filter-panel">
				<div className="hrup-filter-grid">
					<label className="hrup-filter-label">
						Filter by Team
						<select
							value={selectedTeamId}
							onChange={(e) => onFilterChange({ teamId: e.target.value, userId: selectedUserId })}
							className="hrup-select"
						>
							<option value="">All Teams</option>
							{filterTeams.map(team => (
								<option key={team._id} value={team._id}>{team.name}</option>
							))}
						</select>
					</label>
					<label className="hrup-filter-label">
						Filter by User
						<select
							value={selectedUserId}
							onChange={(e) => onFilterChange({ teamId: selectedTeamId, userId: e.target.value })}
							className="hrup-select"
						>
							<option value="">All Users</option>
							{filterUsers.map(user => (
								<option key={user._id} value={user._id}>{user.name} ({user.role})</option>
							))}
						</select>
					</label>
				</div>
			</div>

			<div className="hrup-charts-grid">
				<DonutChart successRatio={summary.successRatio || 0} failureRatio={summary.failureRatio || 0} />
				<ComparisonBars
					title="Outcome Distribution"
					series={[
						{ label: 'Successful', value: summary.successfulTasks || 0, color: palette.success },
						{ label: 'Failed', value: summary.failedTasks || 0, color: palette.fail },
						{ label: 'Rejected', value: summary.rejectedTasks || 0, color: palette.rejected },
						{ label: 'Delayed', value: summary.delayedTasks || 0, color: palette.delayed },
						{ label: 'On Time', value: summary.completedOnTime || 0, color: palette.onTime }
					]}
				/>
			</div>

			<div className="hrup-lists-grid">
				<div className="hrup-panel hrup-list-panel">
					<div className="hrup-panel-title">Users Progress Graph</div>
					{users.length === 0 ? <p className="hrup-empty">No user data for selected filters.</p> : users.map(user => (
						<div key={user.userId} className="hrup-item-card">
							<div className="hrup-item-head">
								<div className="hrup-item-name">{user.name}</div>
								<button className="btn small btn-outline" onClick={() => onViewUserProgress(user.userId)}>View Progress</button>
							</div>
							<ProgressLine label="Assigned" value={user.totalAssigned} max={maxUserAssigned} color={palette.assigned} />
							<ProgressLine label="Successful" value={user.successfulTasks} max={Math.max(user.totalAssigned, 1)} color={palette.success} />
							<ProgressLine label="Failed" value={user.failedTasks} max={Math.max(user.totalAssigned, 1)} color={palette.fail} />
							<ProgressLine label="Rejected" value={user.rejectedTasks || 0} max={Math.max(user.totalAssigned, 1)} color={palette.rejected} />
						</div>
					))}
				</div>

				<div className="hrup-panel hrup-list-panel">
					<div className="hrup-panel-title">Teams Progress Graph</div>
					{teams.length === 0 ? <p className="hrup-empty">No team data for selected filters.</p> : teams.map(team => (
						<div key={team.teamId} className="hrup-item-card">
							<div className="hrup-item-head">
								<div className="hrup-item-name">{team.teamName}</div>
								<button className="btn small btn-outline" onClick={() => onViewTeamProgress(team.teamId)}>View Progress</button>
							</div>
							<ProgressLine label="Assigned" value={team.totalAssigned} max={maxTeamAssigned} color={palette.assigned} />
							<ProgressLine label="Successful" value={team.successfulTasks} max={Math.max(team.totalAssigned, 1)} color={palette.success} />
							<ProgressLine label="Failed" value={team.failedTasks} max={Math.max(team.totalAssigned, 1)} color={palette.fail} />
							<ProgressLine label="Rejected" value={team.rejectedTasks || 0} max={Math.max(team.totalAssigned, 1)} color={palette.rejected} />
						</div>
					))}
				</div>
			</div>

			<div className="hrup-panel hrup-detail-panel">
				<div className="hrup-panel-title">Detailed Progress Dashboard</div>
				{loadingDetail ? (
					<p className="hrup-empty">Loading detail...</p>
				) : detailView ? (
					<>
						<div className="hrup-detail-title">
							{detailView.type === 'user' ? `User: ${detailView.title}` : `Team: ${detailView.title}`}
						</div>
						<div className="hrup-stat-grid">
							<StatCard label="Completed Or Successful" value={detailView.metrics.successfulTasks || 0} tone="success" />
							<StatCard label="Failed" value={detailView.metrics.failedTasks || 0} tone="fail" />
							<StatCard label="Rejected" value={detailView.metrics.rejectedTasks || 0} tone="warning" />
							<StatCard label="On Time Or Delayed" value={`${detailView.metrics.completedOnTime || 0} / ${detailView.metrics.delayedTasks || 0}`} tone="ontime" />
						</div>
						<div className="hrup-charts-grid">
							<ComparisonBars
								title="Detail Outcome Graph"
								series={[
									{ label: 'Successful', value: detailMetrics.successfulTasks || 0, color: palette.success },
									{ label: 'Failed', value: detailMetrics.failedTasks || 0, color: palette.fail },
									{ label: 'Rejected', value: detailMetrics.rejectedTasks || 0, color: palette.rejected },
									{ label: 'Delayed', value: detailMetrics.delayedTasks || 0, color: palette.delayed }
								]}
							/>
							<ComparisonBars
								title="Detail Ratio Graph"
								series={[
									{ label: 'Success %', value: Math.round(detailMetrics.successRatio || 0), color: palette.success },
									{ label: 'Failure %', value: Math.round(detailMetrics.failureRatio || 0), color: palette.fail },
									{ label: 'On Time', value: detailMetrics.completedOnTime || 0, color: palette.onTime },
									{ label: 'Assigned', value: detailMetrics.totalAssigned || 0, color: palette.assigned }
								]}
							/>
						</div>
					</>
				) : (
					<p className="hrup-empty">Use View Progress on a user or team to open detailed metrics.</p>
				)}
			</div>
		</div>
	)
}

export default React.memo(UserProgressDashboard)
