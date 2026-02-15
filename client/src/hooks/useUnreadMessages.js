import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'

const DEFAULT_REFRESH_MS = 10000

export const useUnreadMessages = (refreshMs = DEFAULT_REFRESH_MS) => {
	const [unreadMessages, setUnreadMessages] = useState(0)

	const refreshUnreadCount = useCallback(async () => {
		if (typeof document !== 'undefined' && document.hidden) return
		try {
			const data = await apiFetch('/api/messages/unread-count')
			setUnreadMessages(data.count || 0)
		} catch {
			// Silent fail for badge polling
		}
	}, [])

	useEffect(() => {
		refreshUnreadCount()
		const id = setInterval(refreshUnreadCount, refreshMs)
		const onVisibilityChange = () => {
			if (!document.hidden) {
				refreshUnreadCount()
			}
		}

		document.addEventListener('visibilitychange', onVisibilityChange)

		return () => {
			clearInterval(id)
			document.removeEventListener('visibilitychange', onVisibilityChange)
		}
	}, [refreshMs, refreshUnreadCount])

	return {
		unreadMessages,
		setUnreadMessages,
		refreshUnreadCount
	}
}
