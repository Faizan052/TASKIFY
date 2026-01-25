import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'

export default function SubmitRequest(){
  const nav = useNavigate()
  const [form, setForm] = useState({ title: '', description: '', deadline: '' })
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleFileChange = (event) => {
    const selected = Array.from(event.target.files || [])
    setFiles(selected)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true); setError(null); setMessage('')
    try{
      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('description', form.description)
      payload.append('deadline', form.deadline)
      files.forEach(file => payload.append('attachments', file))
      await apiFetch('/api/user/tasks', { method: 'POST', body: payload, skipJson: true })
      setMessage('Request submitted')
      // navigate back to client dashboard
      nav('/client')
    }catch(err){
      setError(err.message)
    }finally{
      setSubmitting(false)
    }
  }

  return (
    <main className="page">
      <div style={{marginBottom:8}}>
        <button className="btn btn-ghost" onClick={()=>nav('/client')} style={{fontSize:18}}>←</button>
      </div>
      <h1>Submit New Request</h1>

      {message && <div style={{background:'#e6f7ef', color:'#106433', padding:'8px 10px', borderRadius:6, marginBottom:8}}>{message}</div>}
      {error && <div className="error">{error}</div>}

      <form className="form" onSubmit={submit}>
        <label>Title<input value={form.title} onChange={e=>handleChange('title', e.target.value)} required/></label>
        <label>Description<input value={form.description} onChange={e=>handleChange('description', e.target.value)} required/></label>
        <label>Desired deadline<input type="date" value={form.deadline} onChange={e=>handleChange('deadline', e.target.value)} required/></label>
  <label>Attachments (optional)<input type="file" multiple onChange={handleFileChange} accept=".zip,.rar,.pdf,.doc,.docx,.json,.xml,.png,.jpg,.jpeg,.css,.html,.htm,.js,.map,.scss,.less,.txt"/></label>
        <div className="form-row"><button className="btn" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit request'}</button></div>
      </form>
    </main>
  )
}
