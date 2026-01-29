import React, { useState } from 'react'
import { apiFetch } from '../api'

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

export default function SubmitRequestForm({ onSuccess, onCancel }) {
	const [form, setForm] = useState({ 
		title: '', 
		description: '', 
		deadline: '', 
		category: '' 
	})
	const [files, setFiles] = useState([])
	const [submitting, setSubmitting] = useState(false)
	const [analyzing, setAnalyzing] = useState(false)
	const [error, setError] = useState(null)
	const [aiAnalysis, setAiAnalysis] = useState(null)
	const [aiApproved, setAiApproved] = useState(false)

	const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

	const handleFileChange = (event) => {
		const selected = Array.from(event.target.files || [])
		setFiles(selected)
		setAiAnalysis(null)
		setAiApproved(false)
	}

	const analyzeDocument = async () => {
		if (!files.length) {
			setError('Please upload a document first')
			return
		}

		const docFile = files.find(f => 
			f.name.endsWith('.pdf') || 
			f.name.endsWith('.doc') || 
			f.name.endsWith('.docx') ||
			f.name.endsWith('.txt')
		)

		if (!docFile) {
			setError('Please upload a PDF, Word document, or text file for AI analysis')
			return
		}

		if (!form.deadline) {
			setError('Please set a deadline first')
			return
		}

		setAnalyzing(true)
		setError(null)
		
		try {
			const formData = new FormData()
			formData.append('document', docFile)
			formData.append('deadline', form.deadline)
			formData.append('category', form.category)
				formData.append('title', form.title)
				formData.append('description', form.description)

				const result = await apiFetch('/api/user/analyze-request', {
					method: 'POST',
					body: formData,
					skipJson: true
				})

				setAiAnalysis(result)
				setAiApproved(result.feasible && result.allowSubmit)
		} catch (err) {
			setError(err.message || 'Failed to analyze document')
		} finally {
			setAnalyzing(false)
		}
	}

	const submit = async (e) => {
		e.preventDefault()
		
		if (!form.category) {
			setError('Please select a request category')
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
			
			if (aiAnalysis) {
				payload.append('aiAnalysis', JSON.stringify(aiAnalysis))
			}
			
			files.forEach(file => payload.append('attachments', file))
			
			await apiFetch('/api/user/tasks', { 
				method: 'POST', 
				body: payload, 
				skipJson: true 
			})
			
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
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
		return diffDays
	}

	return (
		<div style={{
			background: '#fff',
			borderRadius: '16px',
			padding: '32px',
			boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
			maxWidth: '900px',
			margin: '0 auto'
		}}>
			<div style={{
				display: 'flex',
				justifyContent: 'space-between',
				alignItems: 'center',
				marginBottom: '24px'
			}}>
				<h2 style={{
					margin: 0,
					fontSize: '28px',
					fontWeight: 800,
					background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
					backgroundClip: 'text'
				}}>
					✨ Submit New Request
				</h2>
				{onCancel && (
					<button 
						onClick={onCancel}
						style={{
							background: 'transparent',
							border: 'none',
							fontSize: '28px',
							cursor: 'pointer',
							padding: '8px',
							lineHeight: 1,
							opacity: 0.6,
							transition: 'all 0.2s ease'
						}}
						onMouseEnter={(e) => e.target.style.opacity = '1'}
						onMouseLeave={(e) => e.target.style.opacity = '0.6'}
					>
						×
					</button>
				)}
			</div>

			{error && (
				<div style={{
					background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
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
				{/* Title */}
				<div style={{ marginBottom: '20px' }}>
					<label style={{
						display: 'block',
						fontSize: '15px',
						fontWeight: 700,
						color: '#1f2937',
						marginBottom: '8px'
					}}>
						Project Title *
					</label>
					<input
						type="text"
						value={form.title}
						onChange={e => handleChange('title', e.target.value)}
						required
						placeholder="e.g., E-commerce Website Development"
						style={{
							width: '100%',
							padding: '14px 16px',
							fontSize: '15px',
							border: '2px solid #e5e7eb',
							borderRadius: '10px',
							transition: 'all 0.2s ease',
							outline: 'none'
						}}
						onFocus={(e) => e.target.style.borderColor = '#667eea'}
						onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
					/>
				</div>

				{/* Description */}
				<div style={{ marginBottom: '20px' }}>
					<label style={{
						display: 'block',
						fontSize: '15px',
						fontWeight: 700,
						color: '#1f2937',
						marginBottom: '8px'
					}}>
						Description *
					</label>
					<textarea
						value={form.description}
						onChange={e => handleChange('description', e.target.value)}
						required
						placeholder="Provide detailed requirements..."
						rows="5"
						style={{
							width: '100%',
							padding: '14px 16px',
							fontSize: '15px',
							border: '2px solid #e5e7eb',
							borderRadius: '10px',
							transition: 'all 0.2s ease',
							outline: 'none',
							fontFamily: 'inherit',
							resize: 'vertical'
						}}
						onFocus={(e) => e.target.style.borderColor = '#667eea'}
						onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
					/>
				</div>

				{/* Category Selection */}
				<div style={{ marginBottom: '20px' }}>
					<label style={{
						display: 'block',
						fontSize: '15px',
						fontWeight: 700,
						color: '#1f2937',
						marginBottom: '8px'
					}}>
						Request Category *
					</label>
					<div style={{ position: 'relative' }}>
						<select
							value={form.category}
							onChange={e => handleChange('category', e.target.value)}
							required
							style={{
								width: '100%',
								padding: '14px 16px',
								fontSize: '15px',
								border: '2px solid #e5e7eb',
								borderRadius: '10px',
								transition: 'all 0.2s ease',
								outline: 'none',
								background: '#fff',
								cursor: 'pointer',
								appearance: 'none',
								WebkitAppearance: 'none',
								MozAppearance: 'none',
								paddingRight: '40px',
								color: form.category ? '#1f2937' : '#9ca3af',
								fontWeight: 500
							}}
							onFocus={(e) => e.target.style.borderColor = '#667eea'}
							onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
						>
							<option value="" disabled>Select a category...</option>
							{REQUEST_CATEGORIES.map(cat => (
								<option key={cat.value} value={cat.value}>
									{cat.label}
								</option>
							))}
						</select>
						<div style={{
							position: 'absolute',
							right: '16px',
							top: '50%',
							transform: 'translateY(-50%)',
							pointerEvents: 'none',
							color: '#667eea',
							fontSize: '12px'
						}}>
							▼
						</div>
					</div>
					{form.category && (
						<div style={{
							marginTop: '8px',
							padding: '10px 14px',
							background: 'linear-gradient(135deg, #667eea15, #764ba215)',
							borderRadius: '8px',
							border: '2px solid #667eea30',
							fontSize: '14px',
							color: '#667eea',
							fontWeight: 600,
							display: 'flex',
							alignItems: 'center',
							gap: '8px'
						}}>
							<span style={{ fontSize: '18px' }}>
								{REQUEST_CATEGORIES.find(c => c.value === form.category)?.icon}
							</span>
							<span>Selected: {REQUEST_CATEGORIES.find(c => c.value === form.category)?.label.replace(REQUEST_CATEGORIES.find(c => c.value === form.category)?.icon + ' ', '')}</span>
						</div>
					)}
				</div>

				{/* Deadline */}
				<div style={{ marginBottom: '20px' }}>
					<label style={{
						display: 'block',
						fontSize: '15px',
						fontWeight: 700,
						color: '#1f2937',
						marginBottom: '8px'
					}}>
						Desired Deadline *
					</label>
					<input
						type="date"
						value={form.deadline}
						onChange={e => handleChange('deadline', e.target.value)}
						required
						min={new Date().toISOString().split('T')[0]}
						style={{
							width: '100%',
							padding: '14px 16px',
							fontSize: '15px',
							border: '2px solid #e5e7eb',
							borderRadius: '10px',
							transition: 'all 0.2s ease',
							outline: 'none'
						}}
						onFocus={(e) => e.target.style.borderColor = '#667eea'}
						onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
					/>
					{form.deadline && (
						<div style={{
							marginTop: '8px',
							fontSize: '13px',
							color: getDaysUntilDeadline() < 7 ? '#dc2626' : '#059669',
							fontWeight: 600
						}}>
							⏰ {getDaysUntilDeadline()} days from now
						</div>
					)}
				</div>

				{/* File Upload */}
				<div style={{ marginBottom: '24px' }}>
					<label style={{
						display: 'block',
						fontSize: '15px',
						fontWeight: 700,
						color: '#1f2937',
						marginBottom: '8px'
					}}>
						Attachments (optional)
					</label>
					<input
						type="file"
						multiple
						onChange={handleFileChange}
						accept=".zip,.rar,.pdf,.doc,.docx,.txt,.json,.xml,.png,.jpg,.jpeg,.css,.html,.htm,.js"
						style={{
							width: '100%',
							padding: '14px 16px',
							fontSize: '14px',
							border: '2px dashed #d1d5db',
							borderRadius: '10px',
							cursor: 'pointer',
							background: '#f9fafb'
						}}
					/>
					{files.length > 0 && (
						<div style={{ marginTop: '12px' }}>
							{files.map((file, idx) => (
								<div key={idx} style={{
									fontSize: '13px',
									color: '#6b7280',
									padding: '8px 12px',
									background: '#f3f4f6',
									borderRadius: '6px',
									marginBottom: '6px'
								}}>
									📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
								</div>
							))}
						</div>
					)}
				</div>

				{/* AI Analysis Button */}
				{files.length > 0 && form.deadline && (
					<div style={{ marginBottom: '24px' }}>
						<button
							type="button"
							onClick={analyzeDocument}
							disabled={analyzing}
							style={{
								width: '100%',
								padding: '16px',
								background: analyzing 
									? 'linear-gradient(135deg, #9ca3af, #6b7280)'
									: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
								color: '#fff',
								border: 'none',
								borderRadius: '10px',
								fontSize: '15px',
								fontWeight: 700,
								cursor: analyzing ? 'not-allowed' : 'pointer',
								transition: 'all 0.2s ease',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								gap: '10px'
							}}
							onMouseEnter={(e) => {
								if (!analyzing) {
									e.target.style.transform = 'translateY(-2px)'
									e.target.style.boxShadow = '0 8px 20px rgba(139, 92, 246, 0.4)'
								}
							}}
							onMouseLeave={(e) => {
								if (!analyzing) {
									e.target.style.transform = 'translateY(0)'
									e.target.style.boxShadow = 'none'
								}
							}}
						>
							<span style={{ fontSize: '20px' }}>🤖</span>
							{analyzing ? 'Analyzing Document...' : 'AI Analysis: Check Feasibility'}
						</button>
					</div>
				)}

				{/* AI Analysis Result */}
				{aiAnalysis && (
					<div style={{
						marginBottom: '24px',
						padding: '20px',
						background: aiAnalysis.feasible 
							? 'linear-gradient(135deg, #d1fae5, #a7f3d0)'
							: 'linear-gradient(135deg, #fee2e2, #fecaca)',
						borderRadius: '12px',
						border: aiAnalysis.feasible 
							? '2px solid #10b981'
							: '2px solid #ef4444'
					}}>
						<div style={{
							fontSize: '18px',
							fontWeight: 700,
							marginBottom: '12px',
							color: aiAnalysis.feasible ? '#065f46' : '#991b1b',
							display: 'flex',
							alignItems: 'center',
							gap: '8px'
						}}>
							<span style={{ fontSize: '24px' }}>
								{aiAnalysis.feasible ? '✅' : '⚠️'}
							</span>
							{aiAnalysis.feasible ? 'Project Feasible!' : 'Timeline Concern'}
						</div>
						<div style={{
							fontSize: '14px',
							color: aiAnalysis.feasible ? '#047857' : '#dc2626',
							lineHeight: '1.6',
							marginBottom: '12px'
						}}>
							{aiAnalysis.message}
						</div>
						{aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
							<div>
								<div style={{
									fontSize: '13px',
									fontWeight: 700,
									color: '#374151',
									marginBottom: '8px'
								}}>
									💡 Recommendations:
								</div>
								<ul style={{
									margin: 0,
									paddingLeft: '20px',
									fontSize: '13px',
									color: '#4b5563'
								}}>
									{aiAnalysis.recommendations.map((rec, idx) => (
										<li key={idx} style={{ marginBottom: '4px' }}>{rec}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}

{/* Submit Button - Only show if AI approved */}
			{aiApproved && (
				<div style={{
					marginBottom: '20px',
					padding: '16px',
					background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
					borderRadius: '12px',
					border: '2px solid #10b981',
					textAlign: 'center'
				}}>
					<div style={{ fontSize: '16px', fontWeight: 700, color: '#065f46', marginBottom: '8px' }}>
						✅ AI Approved - Ready to Submit!
					</div>
					<div style={{ fontSize: '14px', color: '#047857' }}>
						Your project timeline is feasible. You can now submit your request.
					</div>
				</div>
			)}

			<div style={{
				display: 'flex',
				gap: '12px',
				marginTop: '28px'
			}}>
				{aiApproved && (
					<button
						type="submit"
						disabled={submitting}
						style={{
							flex: 1,
							padding: '18px',
							background: submitting 
								? 'linear-gradient(135deg, #9ca3af, #6b7280)'
								: 'linear-gradient(135deg, #10b981, #059669)',
							color: '#fff',
							border: 'none',
							borderRadius: '12px',
							fontSize: '17px',
							fontWeight: 700,
							cursor: submitting ? 'not-allowed' : 'pointer',
							transition: 'all 0.3s ease',
							boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)'
						}}
						onMouseEnter={(e) => {
							if (!submitting) {
								e.target.style.transform = 'translateY(-2px)'
								e.target.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.4)'
							}
						}}
						onMouseLeave={(e) => {
							if (!submitting) {
								e.target.style.transform = 'translateY(0)'
								e.target.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.3)'
							}
						}}
					>
						{submitting ? '⏳ Submitting...' : '🚀 Submit Request'}
					</button>
				)}
					
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
								cursor: 'pointer',
								transition: 'all 0.2s ease'
							}}
							onMouseEnter={(e) => {
								e.target.style.background = '#f3f4f6'
								e.target.style.borderColor = '#d1d5db'
							}}
							onMouseLeave={(e) => {
								e.target.style.background = 'transparent'
								e.target.style.borderColor = '#e5e7eb'
							}}
						>
							Cancel
						</button>
					)}
				</div>
			</form>

		</div>
	)
}
