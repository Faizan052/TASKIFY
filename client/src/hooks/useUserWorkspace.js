import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api'

const AUTO_REFRESH_INTERVAL = 30000

export const useUserWorkspace = () => {
  const [profile, setProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const hasLoadedRef = useRef(false)

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

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent || !hasLoadedRef.current) {
      setLoading(true)
    }
    setError(null)
    try {
      await Promise.all([loadProfile(), loadTasks()])
      hasLoadedRef.current = true
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
      if (typeof document !== 'undefined' && document.hidden) return
      refresh({ silent: true })
    }, AUTO_REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

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
