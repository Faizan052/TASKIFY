import React, { useState } from 'react'
import { apiFetch } from '../api'
import FeasibilityLoadingSequence from './FeasibilityLoadingSequence'

const REQUEST_CATEGORIES = [
	{ value: 'website', label: '🌐 Website Development', icon: '🌐' },
	{ value: 'mobile-app', label: '📱 Mobile App', icon: '📱' },
	{ value: 'desktop-app', label: '💻 Desktop Application', icon: '💻' },
	{ value: 'testing', label: '🧪 Testing & QA', icon: '🧪' },
	{ value: 'updation', label: '🔄 Update/Maintenance', icon: '🔄' },
	{ value: 'design', label: '🎨 UI/UX Design', icon: '🎨' },
	{ value: 'api', label: '⚙️ API Development', icon: '⚙️' },
	{ value: 'database', label: '🗄️ Database Work', icon: '🗄️' },
	{ value: 'other', label: '📦 Other', icon: '📦' }
]

export default function SubmitRequestForm({ onSuccess, onCancel, editingTask }) {
	const [form, setForm] = useState({
		title: editingTask?.title || '',
		description: editingTask?.description || '',
		deadline: editingTask?.deadline ? new Date(editingTask.deadline).toISOString().split('T')[0] : '',
		category: editingTask?.category || ''
	})
	const [files, setFiles] = useState([])
	const [submitting, setSubmitting] = useState(false)
	const [analyzing, setAnalyzing] = useState(false)
	const [showLoadingSequence, setShowLoadingSequence] = useState(false)
	const [error, setError] = useState(null)
	const [aiAnalysis, setAiAnalysis] = useState(null)
	const [aiApproved, setAiApproved] = useState(editingTask ? true : false)
	const [showFeasibilityModal, setShowFeasibilityModal] = useState(false)

	const resetFeasibility = () => {
		setAiAnalysis(null)
		setAiApproved(false)
		setShowFeasibilityModal(false)
	}

	const handleChange = (field, value) => {
		setForm(prev => ({ ...prev, [field]: value }))
		resetFeasibility()
	}

	const handleFileChange = (event) => {
		const selected = Array.from(event.target.files || [])
		setFiles(selected)
		resetFeasibility()
	}

	const analyzeDocument = async () => {
		if (!form.deadline) {
			setError('Please set a deadline first')
			return
		}

		if (!form.title) {
			setError('Please provide title before feasibility check')
			return
		}

		if (!files.length) {
			setError('Please upload at least one attachment before feasibility check')
			return
		}

		setAnalyzing(true)
		setShowLoadingSequence(true)
		setError(null)
		setShowFeasibilityModal(false)

		try {
			const payload = new FormData()
			if (files[0]) {
				payload.append('document', files[0])
			}
			payload.append('deadline', form.deadline)
			payload.append('category', form.category)
			payload.append('title', form.title)
			payload.append('description', form.description)

			const minimumAnimation = new Promise(resolve => setTimeout(resolve, 4300))
			const [result] = await Promise.all([
				apiFetch('/api/user/analyze-request', {
					method: 'POST',
					body: payload,
					skipJson: true
				}),
				minimumAnimation
			])

			setAiAnalysis(result)
			setAiApproved(Boolean(result.feasible && result.allowSubmit))
			setShowFeasibilityModal(true)
		} catch (err) {
			setError(err.message || 'Failed to check feasibility')
			setAiApproved(false)
			setAiAnalysis(null)
		} finally {
			setAnalyzing(false)
			setShowLoadingSequence(false)
		}
	}

	const getRiskTone = () => {
		const risk = aiAnalysis?.analysis?.riskLevel || 'medium'
		if (risk === 'low') {
			return { bg: '#dcfce7', color: '#166534', label: 'Low Risk' }
		}
		if (risk === 'high') {
			return { bg: '#fee2e2', color: '#991b1b', label: 'High Risk' }
		}
		return { bg: '#fef3c7', color: '#92400e', label: 'Medium Risk' }
	}

	const formatEstimatedEffort = () => {
		if (!aiAnalysis) return '—'
		const hours = Number(aiAnalysis.estimatedHours || 0)
		const days = Number(aiAnalysis.estimatedDays || 0)
		const resolvedDays = days > 0 ? days : Math.max(1, Math.ceil(hours / 8))
		return `${resolvedDays} days`
	}

	const submit = async (e) => {
		e.preventDefault()

		if (!form.category) {
			setError('Please select a request category')
			return
		}

		if (!editingTask && !aiApproved) {
			setError('Please run feasibility check and ensure it is approved before submitting')
			return
		}

		if (!files.length) {
			setError('Please upload at least one attachment before submitting')
			return
		}

		setSubmitting(true)
		setError(null)

		try {
			const payload = new FormData()
			payload.append('title', form.title)
			payload.append('description', form.description)
			payload.append('deadline', form.deadline)
			payload.append('category', form.category)

			files.forEach(file => payload.append('attachments', file))

			if (editingTask) {
				// Update existing task
				await apiFetch(`/api/user/tasks/${editingTask._id}`, {
					method: 'PUT',
					body: payload,
					skipJson: true
				})
			} else {
				// Create new task
				await apiFetch('/api/user/tasks', {
					method: 'POST',
					body: payload,
					skipJson: true
				})
			}

			if (onSuccess) onSuccess()
		} catch (err) {
			setError(err.message)
		} finally {
			setSubmitting(false)
		}
	}

	const getDaysUntilDeadline = () => {
		if (!form.deadline) return 0
		const deadlineDate = new Date(form.deadline)
		const today = new Date()
		const diffTime = deadlineDate - today
		return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
	}

	return (
		<>
			<style>{`
				@keyframes feasibilityFadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				@keyframes feasibilitySlideUp {
					from { opacity: 0; transform: translateY(18px) scale(0.96); }
					to { opacity: 1; transform: translateY(0) scale(1); }
				}
				@keyframes shimmer {
					0% { background-position: -120% 0; }
					100% { background-position: 220% 0; }
				}
			`}</style>
		<div style={{
			background: '#fff',
			borderRadius: '16px',
			padding: '32px',
			boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
			maxWidth: '900px',
			margin: '0 auto'
		}}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
				<h2 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#1f2937' }}>
					{editingTask ? '✏️ Make Changes to Request' : '📝 Submit New Request'}
				</h2>
				{onCancel && (
					<button onClick={onCancel} style={{ background: 'transparent', border: 'none', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}>
						×
					</button>
				)}
			</div>

			{error && (
				<div style={{
					background: '#fee2e2',
					color: '#991b1b',
					padding: '14px 18px',
					borderRadius: '10px',
					marginBottom: '20px',
					fontSize: '14px',
					fontWeight: 600,
					border: '2px solid #fca5a5'
				}}>
					⚠️ {error}
				</div>
			)}

			<form onSubmit={submit}>
				<div style={{ marginBottom: '20px' }}>
					<label style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
						Project Title *
					</label>
					<input
						type="text"
						value={form.title}
						onChange={e => handleChange('title', e.target.value)}
						required
						style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e5e7eb', borderRadius: '10px', outline: 'none' }}
					/>
				</div>

				<div style={{ marginBottom: '20px' }}>
					<label style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
						Description (optional)
					</label>
					<textarea
						value={form.description}
						onChange={e => handleChange('description', e.target.value)}
						rows="5"
						style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e5e7eb', borderRadius: '10px', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
					/>
				</div>

				<div style={{ marginBottom: '20px' }}>
					<label style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
						Request Category *
					</label>
					<select
						value={form.category}
						onChange={e => handleChange('category', e.target.value)}
						required
						style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e5e7eb', borderRadius: '10px', outline: 'none' }}
					>
						<option value="" disabled>Select a category...</option>
						{REQUEST_CATEGORIES.map(cat => (
							<option key={cat.value} value={cat.value}>{cat.label}</option>
						))}
					</select>
				</div>

				<div style={{ marginBottom: '20px' }}>
					<label style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
						Desired Deadline *
					</label>
					<input
						type="date"
						value={form.deadline}
						onChange={e => handleChange('deadline', e.target.value)}
						required
						min={new Date().toISOString().split('T')[0]}
						style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e5e7eb', borderRadius: '10px', outline: 'none' }}
					/>
					{form.deadline && (
						<div style={{ marginTop: '8px', fontSize: '13px', color: getDaysUntilDeadline() < 7 ? '#dc2626' : '#059669', fontWeight: 600 }}>
							⏰ {getDaysUntilDeadline()} days from now
						</div>
					)}
				</div>

				<div style={{ marginBottom: '24px' }}>
					<label style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
						Attachments (required)
					</label>
					<input
						type="file"
						multiple
						onChange={handleFileChange}
						accept=".zip,.rar,.pdf,.doc,.docx,.txt,.json,.xml,.png,.jpg,.jpeg,.css,.html,.htm,.js"
						required
						style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px dashed #d1d5db', borderRadius: '10px', cursor: 'pointer', background: '#f9fafb' }}
					/>
				</div>

{form.deadline && form.title && !editingTask && (
				<div style={{ marginBottom: '24px' }}>
					<button
						type="button"
						onClick={analyzeDocument}
						disabled={analyzing}
						style={{
							width: '100%',
							padding: '16px 18px',
							background: analyzing ? '#6b7280' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
							color: '#fff',
							border: 'none',
							borderRadius: '12px',
							fontSize: '15px',
							fontWeight: 700,
							cursor: analyzing ? 'not-allowed' : 'pointer',
							boxShadow: analyzing ? 'none' : '0 10px 24px rgba(102, 126, 234, 0.30)',
							transition: 'transform 0.25s ease, box-shadow 0.25s ease'
						}}
						onMouseEnter={(e) => {
							if (!analyzing) {
								e.currentTarget.style.transform = 'translateY(-2px)'
								e.currentTarget.style.boxShadow = '0 14px 28px rgba(102, 126, 234, 0.38)'
							}
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.transform = 'translateY(0)'
							e.currentTarget.style.boxShadow = analyzing ? 'none' : '0 10px 24px rgba(102, 126, 234, 0.30)'
						}}
					>
						{analyzing ? 'Checking Feasibility...' : `✨ Check Feasibility${files.length ? ' (with attachment)' : ''}`}
					</button>
				</div>
			)}

			{editingTask && (
				<div style={{ marginBottom: '20px', padding: '16px', background: '#dbeafe', borderRadius: '12px', border: '2px solid #3b82f6', textAlign: 'center', fontWeight: 700, color: '#1e40af', animation: 'feasibilityFadeIn 0.35s ease' }}>
					📝 Ready to Submit Changes
				</div>
			)}

			{aiApproved && !editingTask && (
					<div style={{ marginBottom: '20px', padding: '16px', background: '#d1fae5', borderRadius: '12px', border: '2px solid #10b981', textAlign: 'center', fontWeight: 700, color: '#065f46', animation: 'feasibilityFadeIn 0.35s ease' }}>
						✅ Feasibility Approved — Ready to Submit
					</div>
				)}

				<div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
					<button
						type="submit"
					disabled={submitting || (!editingTask && !aiApproved)}
					style={{
						flex: 1,
						padding: '18px',
						background: (submitting || (!editingTask && !aiApproved)) ? '#6b7280' : '#059669',
						color: '#fff',
						border: 'none',
						borderRadius: '12px',
						fontSize: '17px',
						fontWeight: 700,
						cursor: (submitting || (!editingTask && !aiApproved)) ? 'not-allowed' : 'pointer'
					}}
				>
					{submitting ? '⏳ Processing...' : editingTask ? '✏️ Submit Changes' : (aiApproved ? '🚀 Submit Request' : 'Run Feasibility Check First')}
				</button>

				{onCancel && (
					<button
						type="button"
						onClick={onCancel}
						style={{
							padding: '16px 32px',
							background: 'transparent',
							color: '#6b7280',
							border: '2px solid #e5e7eb',
							borderRadius: '10px',
							fontSize: '15px',
							fontWeight: 600,
							cursor: 'pointer'
						}}
					>
						Cancel
					</button>
				)}
			</div>
		</form>
	</div>
		
		{/* Animated Loading Sequence */}
		<FeasibilityLoadingSequence isVisible={showLoadingSequence} />

		{/* Feasibility Results Modal */}
		{showFeasibilityModal && aiAnalysis && (
			<div
				onClick={() => setShowFeasibilityModal(false)}
				style={{
					position: 'fixed',
					inset: 0,
					background: 'radial-gradient(circle at 20% 20%, rgba(102,126,234,0.20), rgba(17,24,39,0.75) 55%)',
					backdropFilter: 'blur(8px)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: '24px',
					zIndex: 9999,
					animation: 'feasibilityFadeIn 0.28s ease'
				}}
			>
				<div
					onClick={(e) => e.stopPropagation()}
					style={{
						width: '100%',
						maxWidth: '640px',
						background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 100%)',
						borderRadius: '20px',
						padding: '26px',
						border: '1px solid rgba(148, 163, 184, 0.25)',
						boxShadow: '0 30px 70px rgba(15, 23, 42, 0.42)',
						animation: 'feasibilitySlideUp 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)'
					}}
				>
					<div style={{
						height: '5px',
						borderRadius: '999px',
						marginBottom: '16px',
						background: 'linear-gradient(90deg, #667eea, #764ba2, #4f46e5)',
						backgroundSize: '220% 100%',
						animation: 'shimmer 2.8s linear infinite'
					}} />

					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
						<div style={{ fontSize: '20px', fontWeight: 800, color: aiAnalysis.feasible ? '#065f46' : '#991b1b' }}>
							{aiAnalysis.feasible ? '✅ Feasibility Approved' : '⚠️ Feasibility Review'}
						</div>
						<button
							type="button"
							onClick={() => setShowFeasibilityModal(false)}
							style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
						>
							×
						</button>
					</div>

					<div style={{ fontSize: '14px', color: '#374151', marginBottom: '14px', lineHeight: 1.6 }}>
						{aiAnalysis.message}
					</div>

					{/* Document Summary Section */}
					{aiAnalysis.documentSummary && (
						<div style={{ 
							background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', 
							borderRadius: '12px', 
							padding: '16px', 
							marginBottom: '16px',
							border: '2px solid #bae6fd'
						}}>
							<div style={{ 
								fontSize: '13px', 
								fontWeight: 700, 
								color: '#0369a1', 
								marginBottom: '8px',
								display: 'flex',
								alignItems: 'center',
								gap: '6px'
							}}>
								<span>📄</span>
								<span>Document Summary</span>
							</div>
							<div style={{ 
								fontSize: '13px', 
								color: '#075985', 
								lineHeight: 1.6,
								fontStyle: 'italic'
							}}>
								{aiAnalysis.documentSummary}
							</div>
							{aiAnalysis.analysis?.wordCount && (
								<div style={{
									fontSize: '11px',
									color: '#0284c7',
									marginTop: '8px',
									fontWeight: 600
								}}>
									📊 Document contains {aiAnalysis.analysis.wordCount} words
								</div>
							)}
						</div>
					)}

					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '14px' }}>
						<div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px' }}>
							<div style={{ fontSize: '12px', color: '#64748b' }}>Estimated</div>
							<div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{formatEstimatedEffort()}</div>
						</div>
						<div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px' }}>
							<div style={{ fontSize: '12px', color: '#64748b' }}>Deadline Window</div>
							<div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{aiAnalysis.daysUntilDeadline} days</div>
						</div>
						<div style={{ background: getRiskTone().bg, borderRadius: '10px', padding: '10px 12px' }}>
							<div style={{ fontSize: '12px', color: '#64748b' }}>Risk</div>
							<div style={{ fontSize: '15px', fontWeight: 700, color: getRiskTone().color }}>{getRiskTone().label}</div>
						</div>
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '14px' }}>
						<div style={{ background: '#eef2ff', borderRadius: '10px', padding: '10px 12px', border: '1px solid #c7d2fe' }}>
							<div style={{ fontSize: '12px', color: '#4338ca' }}>Confidence</div>
							<div style={{ fontSize: '15px', fontWeight: 700, color: '#312e81' }}>{(aiAnalysis.analysis?.confidence || 'medium').toUpperCase()}</div>
						</div>
						<div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '10px 12px', border: '1px solid #bbf7d0' }}>
							<div style={{ fontSize: '12px', color: '#15803d' }}>Req. Quality</div>
							<div style={{ fontSize: '15px', fontWeight: 700, color: '#166534' }}>{(aiAnalysis.analysis?.requirementQuality || 'medium').toUpperCase()}</div>
						</div>
						<div style={{ background: '#ecfeff', borderRadius: '10px', padding: '10px 12px', border: '1px solid #a5f3fc' }}>
							<div style={{ fontSize: '12px', color: '#0e7490' }}>Quality Score</div>
							<div style={{ fontSize: '15px', fontWeight: 700, color: '#155e75' }}>{aiAnalysis.analysis?.requirementQualityScore ?? '—'}/10</div>
						</div>
					</div>

					{Array.isArray(aiAnalysis.recommendations) && aiAnalysis.recommendations.length > 0 && (
						<div style={{ marginBottom: '16px' }}>
							<div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>Recommendations</div>
							<ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#4b5563', lineHeight: 1.5 }}>
								{aiAnalysis.recommendations.map((rec, idx) => (
									<li key={idx}>{rec}</li>
								))}
							</ul>
						</div>
					)}

					<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
						<button
							type="button"
							onClick={() => setShowFeasibilityModal(false)}
							style={{
								padding: '10px 16px',
								borderRadius: '10px',
								border: '1px solid #e5e7eb',
								background: '#fff',
								color: '#374151',
								fontWeight: 600,
								cursor: 'pointer'
							}}
						>
							Close
						</button>
					</div>
				</div>
			</div>
		)}
		</>
	)
}
