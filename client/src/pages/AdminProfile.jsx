import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearSession } from '../api'
import { formatRole } from '../utils/helpers'
import ProfileSettings from '../components/ProfileSettings'

export default function AdminProfile(){
	const nav = useNavigate()
	const [profile, setProfile] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	const loadProfile = async () => {
		setLoading(true); setError(null)
		try{
			const data = await apiFetch('/api/admin/profile')
			const admin = data && data.admin ? data.admin : {}
			setProfile(admin)
		}catch(err){ setError(err.message) }
		finally{ setLoading(false) }
	}

	useEffect(()=>{ loadProfile() },[])

	const goBack = () => nav('/admin')

	const logout = () => {
		clearSession()
		nav('/admin/login')
	}

	const roleLabel = formatRole('admin')
	const displayName = profile && profile.username ? profile.username : 'Admin'

	return (
		<main className="page">
			<header style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:12}}>
				<div>
					<h1 style={{margin:0}}>Profile</h1>
					<p style={{margin:'6px 0 0 0'}}>Welcome {displayName} ({roleLabel})</p>
				</div>
				<div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
					<button className="btn btn-outline" onClick={goBack}>Back to dashboard</button>
					<button className="btn" onClick={logout}>Sign out</button>
				</div>
			</header>

			{loading && <div>Loading profile...</div>}
			{!loading && (
				<React.Fragment>
					{error && <div className="error" style={{marginBottom:8}}>{error}</div>}
					<ProfileSettings
						kind="admin"
						profile={profile}
						onProfileUpdated={(updated) => {
							setProfile((prev) => ({ ...prev, ...(updated || {}) }))
						}}
					/>
				</React.Fragment>
			)}
		</main>
	)
}
