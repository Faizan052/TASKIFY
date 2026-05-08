import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession } from '../api'
import { formatRole } from '../utils/helpers'
import ProfileSettings from '../components/ProfileSettings'

const routeForRole = (role) => {
	switch(role){
		case 'hr':
			return '/hr'
		case 'manager':
			return '/manager'
		case 'developer':
			return '/developer'
		case 'designer':
			return '/designer'
		case 'tester':
			return '/tester'
		case 'client':
			return '/client'
		default:
			return '/'
	}
}

export default function UserProfile(){
	const nav = useNavigate()
	const [profile, setProfile] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	const roleLabel = useMemo(()=>formatRole(profile ? profile.role : ''), [profile])
	const displayName = profile && profile.name ? profile.name : (profile && profile.email ? profile.email : 'User')

	const loadProfile = async () => {
		setLoading(true); setError(null)
		try{
			const data = await apiFetch('/api/user/profile')
			setProfile(data)
		}catch(err){ setError(err.message) }
		finally{ setLoading(false) }
	}

	useEffect(()=>{ loadProfile() },[])

	const passwordDisabledMessage = useMemo(() => {
		const role = profile ? profile.role : localStorage.getItem('tm_role')
		if (role === 'hr') return 'You can\'t update your password here. Please contact the Admin who created your account to update your password.'
		if (role === 'manager') return 'You can\'t update your password here. Please contact the HR who created your account to update your password.'
		return ''
	}, [profile])

	const goBack = () => {
		const role = profile ? profile.role : localStorage.getItem('tm_role')
		nav(routeForRole(role))
	}

	const logout = () => {
		clearSession()
		nav('/user/login')
	}

	return (
		<main className="page profile-page">
			<header className="profile-page-header">
				<div className="profile-page-title">
					<h1>Profile</h1>
					<div className="profile-page-sub">
						<span>{displayName}</span>
						{roleLabel ? <span className="profile-page-role">{roleLabel}</span> : null}
					</div>
					<p>Manage your account details and preferences.</p>
				</div>
				<div className="profile-page-actions">
					<button className="btn btn-outline" onClick={goBack}>Back to dashboard</button>
					<button className="btn" onClick={logout}>Sign out</button>
				</div>
			</header>

			{loading && <div>Loading profile...</div>}
			{!loading && (
				<React.Fragment>
					{error && <div className="error" style={{marginBottom:8}}>{error}</div>}
					<ProfileSettings
						kind="user"
						profile={profile}
						passwordDisabledMessage={passwordDisabledMessage}
						onProfileUpdated={(updated) => {
							setProfile((prev) => ({ ...prev, ...(updated || {}) }))
						}}
					/>
				</React.Fragment>
			)}
		</main>
	)
}
