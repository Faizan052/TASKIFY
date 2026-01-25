import React from 'react'
import { Link } from 'react-router-dom'

/**
 * Home/Landing Page Component
 * Displays welcome message and action buttons for login/register
 */
export default function Home() {
	return (
		<main className="home-page">
			<div className="home-card">
				{/* Logo */}
				<div className="home-logo" aria-label="Taskify Logo">T</div>
				
				{/* Title and Description */}
				<h1 className="home-title">TASKIFY</h1>
				<p className="home-subtitle">Transform the way your team works together</p>
				<p className="home-description">
					Streamline project management, enhance collaboration,
					and track every task from start to finish.
				</p>
				
				{/* Action Buttons */}
				<div className="home-actions">
										<Link
											className="btn btn-primary btn-signin"
											to="/user/login"
											aria-label="Sign in to Taskify"
										>
											<span className="signin-content">
												Sign In
												<svg className="btn-icon-inline" aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
													<path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
												</svg>
											</span>
										</Link>
					<Link className="btn btn-secondary" to="/register">
						<span>Create Account</span>
					</Link>
				</div>

				{/* Admin Registration Section */}
				<div style={{ 
					marginTop: '2.5rem', 
					paddingTop: '2rem',
					borderTop: '1px solid rgba(102, 126, 234, 0.15)'
				}}>
					<div style={{ 
						textAlign: 'center',
						marginBottom: '0.75rem'
					}}>
						<span style={{ 
							fontSize: '0.75rem',
							textTransform: 'uppercase',
							letterSpacing: '1.5px',
							color: '#9ca3af',
							fontWeight: '600'
						}}>
							System Administration
						</span>
					</div>
					<Link 
						to="/admin/register" 
						className="admin-register-link"
						style={{ 
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.5rem',
							padding: '0.875rem 1.75rem',
							background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
							border: '1.5px solid rgba(102, 126, 234, 0.3)',
							borderRadius: '12px',
							color: '#667eea',
							textDecoration: 'none',
							fontSize: '0.9rem',
							fontWeight: '600',
							transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
							boxShadow: '0 2px 8px rgba(102, 126, 234, 0.1)',
							position: 'relative',
							overflow: 'hidden'
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
							e.currentTarget.style.color = '#ffffff'
							e.currentTarget.style.transform = 'translateY(-2px)'
							e.currentTarget.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.3)'
							e.currentTarget.style.borderColor = 'transparent'
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)'
							e.currentTarget.style.color = '#667eea'
							e.currentTarget.style.transform = 'translateY(0)'
							e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.1)'
							e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.3)'
						}}
					>
						<svg 
							width="18" 
							height="18" 
							viewBox="0 0 24 24" 
							fill="none" 
							stroke="currentColor" 
							strokeWidth="2.5" 
							strokeLinecap="round" 
							strokeLinejoin="round"
						>
							<path d="M12 2L2 7l10 5 10-5-10-5z"/>
							<path d="M2 17l10 5 10-5"/>
							<path d="M2 12l10 5 10-5"/>
						</svg>
						<span>Register as Admin</span>
						<svg 
							width="16" 
							height="16" 
							viewBox="0 0 24 24" 
							fill="none" 
							stroke="currentColor" 
							strokeWidth="2.5" 
							strokeLinecap="round" 
							strokeLinejoin="round"
							style={{ marginLeft: '-0.25rem' }}
						>
							<polyline points="9 18 15 12 9 6"/>
						</svg>
					</Link>
				</div>
			</div>
		</main>
	)
}
