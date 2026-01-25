import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'

const emptyForm = { name: '', email: '', password: '' }

export default function ManageHrs(){
	const nav = useNavigate()
	const [hrs, setHrs] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [message, setMessage] = useState('')
	const [createForm, setCreateForm] = useState(emptyForm)
	const [saving, setSaving] = useState(false)
	const [editingId, setEditingId] = useState(null)
	const [editForm, setEditForm] = useState(emptyForm)
	const [updating, setUpdating] = useState(false)
	const [deletingId, setDeletingId] = useState('')

	const loadHrs = async () => {
		setLoading(true); setError(null)
		try{
			const data = await apiFetch('/api/admin/hr')
			setHrs(data)
		}catch(err){ setError(err.message) }
		finally{ setLoading(false) }
	}

	useEffect(()=>{ loadHrs() },[])

	const handleCreateChange = (field, value) => {
		setCreateForm(prev => ({ ...prev, [field]: value }))
	}

	const handleCreate = async (e) => {
		e.preventDefault()
		setSaving(true); setMessage(''); setError(null)
		try{
			await apiFetch('/api/admin/hr', { method: 'POST', body: createForm })
			setCreateForm(emptyForm)
			setMessage('HR added successfully')
			await loadHrs()
		}catch(err){ setError(err.message) }
		finally{ setSaving(false) }
	}

	const startEdit = (hr) => {
		setEditingId(hr._id)
		setEditForm({ name: hr.name || '', email: hr.email || '', password: '' })
		setMessage('')
		setError(null)
	}

	const cancelEdit = () => {
		setEditingId(null)
		setEditForm(emptyForm)
	}

	const handleEditChange = (field, value) => {
		setEditForm(prev => ({ ...prev, [field]: value }))
	}

	const saveEdit = async () => {
		if (!editingId) return
		setUpdating(true); setMessage(''); setError(null)
		const payload = { name: editForm.name, email: editForm.email }
		if (editForm.password) payload.password = editForm.password
		try{
			await apiFetch(`/api/admin/hr/${editingId}`, { method: 'PUT', body: payload })
			setMessage('HR updated successfully')
			await loadHrs()
			cancelEdit()
		}catch(err){ setError(err.message) }
		finally{ setUpdating(false) }
	}

	const removeHr = async (id) => {
		if (!window.confirm('Remove this HR?')) return
		setDeletingId(id); setMessage(''); setError(null)
		try{
			await apiFetch(`/api/admin/hr/${id}`, { method: 'DELETE' })
			setMessage('HR removed successfully')
			await loadHrs()
		}catch(err){ setError(err.message) }
		finally{ setDeletingId('') }
	}

	return (
		<main className="page">
			<div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
				<h1 style={{margin:0}}>Manage HRs</h1>
				<button className="btn btn-outline" onClick={()=>nav('/admin')}>Back to Dashboard</button>
			</div>

			{message && <div style={{background:'#e6f7ef', color:'#106433', padding:'8px 10px', borderRadius:6, marginBottom:8}}>{message}</div>}
			{error && <div className="error" style={{marginBottom:8}}>{error}</div>}
			{loading && <div>Loading HR records...</div>}

			{!loading && (
				<React.Fragment>
					<section style={{marginBottom:12}}>
						<h2>Add HR</h2>
						<form className="form" onSubmit={handleCreate}>
							<label>Name<input value={createForm.name} onChange={e=>handleCreateChange('name', e.target.value)} required/></label>
							<label>Email<input type="email" value={createForm.email} onChange={e=>handleCreateChange('email', e.target.value)} required/></label>
							<label>Password<input type="password" value={createForm.password} onChange={e=>handleCreateChange('password', e.target.value)} required/></label>
							<div className="form-row"><button className="btn" disabled={saving}>{saving ? 'Saving...' : 'Add HR'}</button></div>
						</form>
					</section>

					<section>
						<h2>Existing HRs</h2>
						{hrs && hrs.length ? (
							<table style={{width:'100%', borderCollapse:'collapse'}}>
								<thead>
									<tr>
										<th style={{textAlign:'left', paddingBottom:6}}>Name</th>
										<th style={{textAlign:'left', paddingBottom:6}}>Email</th>
										<th style={{textAlign:'left', paddingBottom:6}}>Actions</th>
									</tr>
								</thead>
								<tbody>
									{hrs.map(hr => (
										<tr key={hr._id} style={{borderTop:'1px solid #eee'}}>
											<td style={{padding:'6px 4px'}}>
												{editingId === hr._id ? (
													<input value={editForm.name} onChange={e=>handleEditChange('name', e.target.value)} required />
												) : (
													hr.name
												)}
											</td>
											<td style={{padding:'6px 4px'}}>
												{editingId === hr._id ? (
													<input type="email" value={editForm.email} onChange={e=>handleEditChange('email', e.target.value)} required />
												) : (
													hr.email
												)}
											</td>
											<td style={{padding:'6px 4px', display:'flex', gap:8}}>
												{editingId === hr._id ? (
													<React.Fragment>
														<button className="btn small" type="button" onClick={saveEdit} disabled={updating}>{updating ? 'Saving...' : 'Save'}</button>
														<button className="btn btn-outline small" type="button" onClick={cancelEdit} disabled={updating}>Cancel</button>
														<input type="password" placeholder="New password" value={editForm.password} onChange={e=>handleEditChange('password', e.target.value)} style={{flex:1, minWidth:140}} />
													</React.Fragment>
												) : (
													<React.Fragment>
														<button className="btn small" type="button" onClick={()=>startEdit(hr)}>Edit</button>
														<button className="btn btn-outline small" type="button" onClick={()=>removeHr(hr._id)} disabled={deletingId === hr._id}>{deletingId === hr._id ? 'Removing...' : 'Delete'}</button>
													</React.Fragment>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						) : <p>No HR users yet.</p>}
					</section>
				</React.Fragment>
			)}
		</main>
	)
}
