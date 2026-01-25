import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'

const AUTO_REFRESH_INTERVAL = 30000

export const useUserWorkspace = () => {
  const [profile, setProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadProfile = useCallback(async () => {
    const data = await apiFetch('/api/user/profile')
    setProfile(data)
    return data
  }, [])

  const loadTasks = useCallback(async () => {
    const data = await apiFetch('/api/user/tasks')
    setTasks(data)
    return data
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadProfile(), loadTasks()])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loadProfile, loadTasks])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const id = setInterval(() => {
      Promise.all([loadProfile(), loadTasks()]).catch(err => {
        setError(err.message)
      })
    }, AUTO_REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [loadProfile, loadTasks])

  return {
    profile,
    tasks,
    loading,
    error,
    setError,
    refresh,
    setTasks,
    loadTasks,
    loadProfile,
  }
}
