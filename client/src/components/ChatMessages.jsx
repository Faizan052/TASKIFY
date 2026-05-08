import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { apiFetch } from '../api'

const AUTO_REFRESH_INTERVAL = 5000 // 5 seconds for chat

// Generate color from name for consistent avatar colors
const getColorFromName = (name) => {
    const colors = [
        { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)', text: '#fff' },
        { bg: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', text: '#333' },
        { bg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', text: '#333' },
        { bg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', text: '#333' },
        { bg: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)', text: '#fff' },
    ]
    const charCode = name.charCodeAt(0) + (name.length > 1 ? name.charCodeAt(1) : 0)
    return colors[charCode % colors.length]
}

// Get initials from name
const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
}

// Avatar component with initials
const InitialAvatar = ({ name, size = 'medium' }) => {
    const sizes = {
        small: { width: 36, height: 36, fontSize: 14 },
        medium: { width: 44, height: 44, fontSize: 16 },
        large: { width: 56, height: 56, fontSize: 20 }
    }
    const dimensions = sizes[size] || sizes.medium
    const colorScheme = getColorFromName(name)
    
    return (
        <div style={{
            width: dimensions.width,
            height: dimensions.height,
            borderRadius: '50%',
            background: colorScheme.bg,
            color: colorScheme.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: dimensions.fontSize,
            fontWeight: 700,
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            border: '2px solid #fff'
        }}>
            {getInitials(name)}
        </div>
    )
}

export default function ChatMessages({ onClose: _onClose, onUnreadCountChange }) {
    const QUICK_EMOJIS = ['😀', '😊', '👍', '🔥', '🎉', '✅', '🙏', '💡', '🚀', '❤️']
    const [contacts, setContacts] = useState([])
    const [conversations, setConversations] = useState([])
    const [selectedContact, setSelectedContact] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState(null)
    const [unreadCount, setUnreadCount] = useState(0)
    const messagesEndRef = useRef(null)
    const messagesContainerRef = useRef(null)
    const messagesRef = useRef([])
    const inFlightRef = useRef({ contacts: false, conversations: false, unread: false, messages: false })
    const autoScrollRef = useRef(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)

    const getEntityId = (entity) => {
        if (!entity) return ''
        if (typeof entity === 'string') return entity
        if (typeof entity._id === 'string') return entity._id
        if (entity._id && typeof entity._id.toString === 'function') return entity._id.toString()
        return ''
    }

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const handleMessagesScroll = () => {
        const container = messagesContainerRef.current
        if (!container) return
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
        autoScrollRef.current = distanceToBottom < 120
    }

    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    const loadContacts = useCallback(async () => {
        if (inFlightRef.current.contacts) return
        inFlightRef.current.contacts = true
        try {
            const data = await apiFetch('/api/messages/contacts')
            setContacts(data || [])
            setError(null)
        } catch (err) {
            console.error('Error loading contacts:', err)
            setError(err.message || 'Failed to load contacts')
        } finally {
            inFlightRef.current.contacts = false
        }
    }, [])

    const loadConversations = useCallback(async () => {
        if (inFlightRef.current.conversations) return
        inFlightRef.current.conversations = true
        try {
            const data = await apiFetch('/api/messages/conversations')
            setConversations(data || [])
            setError(null)
        } catch (err) {
            console.error('Error loading conversations:', err)
            setError(err.message || 'Failed to load conversations')
        } finally {
            inFlightRef.current.conversations = false
        }
    }, [])

    const loadUnreadCount = useCallback(async () => {
        if (inFlightRef.current.unread) return
        inFlightRef.current.unread = true
        try {
            const data = await apiFetch('/api/messages/unread-count')
            const nextCount = data.count || 0
            setUnreadCount((prev) => (prev === nextCount ? prev : nextCount))
        } catch (err) {
            // Silent fail for unread count
        } finally {
            inFlightRef.current.unread = false
        }
    }, [])

    const loadMessages = useCallback(async (contactId, { forceScroll = false } = {}) => {
        if (!contactId) return
        if (inFlightRef.current.messages) return
        inFlightRef.current.messages = true
        try {
            const shouldKeepBottom = forceScroll
            const data = await apiFetch(`/api/messages/conversation/${contactId}`)
            const nextMessages = data || []
            const prevMessages = messagesRef.current || []
            const changed =
                prevMessages.length !== nextMessages.length ||
                prevMessages[prevMessages.length - 1]?._id !== nextMessages[nextMessages.length - 1]?._id
            setMessages((prev) => {
                if (!prev || prev.length === 0) return nextMessages
                if (prev.length !== nextMessages.length) return nextMessages
                const prevLast = prev[prev.length - 1]?._id
                const nextLast = nextMessages[nextMessages.length - 1]?._id
                return prevLast === nextLast ? prev : nextMessages
            })
            if (changed || forceScroll) {
                await apiFetch(`/api/messages/read/${contactId}`, { method: 'PUT' })
                loadUnreadCount()
            }
            if (shouldKeepBottom || autoScrollRef.current) {
                setTimeout(scrollToBottom, 100)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            inFlightRef.current.messages = false
        }
    }, [loadUnreadCount])

    useEffect(() => {
        const init = async () => {
            setLoading(true)
            await Promise.all([loadContacts(), loadConversations(), loadUnreadCount()])
            setLoading(false)
        }
        init()
    }, [loadContacts, loadConversations, loadUnreadCount])

    useEffect(() => {
        if (selectedContact) {
            loadMessages(selectedContact._id, { forceScroll: true })
            const interval = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return
                loadMessages(selectedContact._id)
            }, AUTO_REFRESH_INTERVAL)
            return () => clearInterval(interval)
        }
    }, [selectedContact, loadMessages])

    useEffect(() => {
        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            loadConversations()
            loadUnreadCount()
        }, AUTO_REFRESH_INTERVAL)
        return () => clearInterval(interval)
    }, [loadConversations, loadUnreadCount])

    useEffect(() => {
        if (typeof document === 'undefined') return

        const onVisibilityChange = () => {
            if (document.hidden) return
            loadConversations()
            loadUnreadCount()
            if (selectedContact?._id) {
                loadMessages(selectedContact._id)
            }
        }

        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => document.removeEventListener('visibilitychange', onVisibilityChange)
    }, [loadConversations, loadMessages, loadUnreadCount, selectedContact])

    useEffect(() => {
        if (onUnreadCountChange) {
            onUnreadCountChange(unreadCount)
        }
    }, [unreadCount, onUnreadCountChange])

    const handleSendMessage = async (e) => {
        e.preventDefault()
        if (!newMessage.trim() || !selectedContact) return

        setSending(true)
        setError(null)
        try {
            const sentMessage = await apiFetch('/api/messages/send', {
                method: 'POST',
                body: {
                    recipientId: selectedContact._id,
                    recipientModel: selectedContact.model || 'User',
                    content: newMessage.trim()
                }
            })
            setNewMessage('')
            if (sentMessage && sentMessage._id) {
                setMessages((prev) => [...prev, sentMessage])
                setTimeout(scrollToBottom, 50)
                await apiFetch(`/api/messages/read/${selectedContact._id}`, { method: 'PUT' })
                await loadUnreadCount()
            } else {
                await loadMessages(selectedContact._id, { forceScroll: true })
            }
            await loadConversations()
        } catch (err) {
            setError(err.message)
        } finally {
            setSending(false)
        }
    }

    const handleSelectContact = (contact) => {
        setSelectedContact(contact)
        setMessages([])
        setShowEmojiPicker(false)
    }

    const handleBack = () => {
        setSelectedContact(null)
        setMessages([])
        setShowEmojiPicker(false)
        loadConversations()
    }

    const formatTime = (date) => {
        if (!date) return ''
        const d = new Date(date)
        const now = new Date()
        const diff = now - d
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)

        if (minutes < 1) return 'Just now'
        if (minutes < 60) return `${minutes}m ago`
        if (hours < 24) return `${hours}h ago`
        if (days < 7) return `${days}d ago`
        return d.toLocaleDateString()
    }

    const formatLastSeen = (person) => {
        if (!person) return ''
        if (person.isOnline) return 'Online'
        if (!person.lastSeen) return 'Offline'

        const seen = new Date(person.lastSeen)
        if (Number.isNaN(seen.getTime())) return 'Offline'
        const diffMs = Date.now() - seen.getTime()
        const mins = Math.max(1, Math.floor(diffMs / 60000))
        if (mins < 60) return `Online ${mins} minute${mins === 1 ? '' : 's'} ago`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `Online ${hours} hour${hours === 1 ? '' : 's'} ago`
        const days = Math.floor(hours / 24)
        return `Online ${days} day${days === 1 ? '' : 's'} ago`
    }

    const normalizedSearch = useMemo(() => searchTerm.toLowerCase(), [searchTerm])

    const filteredConversations = useMemo(() => {
        return conversations.filter((conv) => {
            const userName = (conv?.user?.name || '').toLowerCase()
            const userRole = (conv?.user?.role || '').toLowerCase()
            return userName.includes(normalizedSearch) || userRole.includes(normalizedSearch)
        })
    }, [conversations, normalizedSearch])

    const filteredContacts = useMemo(() => {
        return contacts.filter((contact) => {
            const contactName = (contact?.name || '').toLowerCase()
            const contactRole = (contact?.role || '').toLowerCase()
            return contactName.includes(normalizedSearch) || contactRole.includes(normalizedSearch)
        })
    }, [contacts, normalizedSearch])

    const allPeople = useMemo(() => {
        const merged = []
        const seenIds = new Set()

        filteredConversations.forEach((conv) => {
            if (!conv?.user?._id) return
            const conversationUserId = conv.user._id.toString()
            seenIds.add(conversationUserId)
            merged.push({
                ...conv.user,
                _id: conversationUserId,
                name: conv.user.name || 'Unknown User',
                role: conv.user.role || 'user',
                lastMessage: conv.lastMessage,
                lastMessageAt: conv.lastMessageAt,
                unreadCount: conv.unreadCount,
                hasConversation: true
            })
        })

        filteredContacts.forEach((contact) => {
            if (!contact?._id) return
            const contactId = contact._id.toString()
            if (!seenIds.has(contactId)) {
                merged.push({
                    ...contact,
                    _id: contactId,
                    name: contact.name || 'Unknown User',
                    role: contact.role || 'user',
                    hasConversation: false,
                    unreadCount: 0
                })
            }
        })

        return merged
    }, [filteredConversations, filteredContacts])

    if (loading) {
        return (
            <div style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }}>
                <div style={{textAlign: 'center', color: '#fff'}}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        border: '4px solid rgba(255,255,255,0.3)',
                        borderTop: '4px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        margin: '0 auto 16px'
                    }} />
                    <div style={{fontSize: '16px', fontWeight: 600}}>Loading messages...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="chat-messages-shell" style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '520px',
            height: '72vh',
            maxHeight: '72vh',
            width: '100%',
            background: 'var(--card)',
            overflow: 'hidden',
            borderRadius: '16px',
            boxShadow: '0 18px 38px rgba(2, 39, 74, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.18)'
        }}>
            {/* People List */}
            {!selectedContact && (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                borderRight: 'none',
                background: 'var(--card)',
                position: 'relative',
                overflow: 'hidden',
                flex: 1,
                minHeight: 0
            }}>
                
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                    background: 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '70px',
                    boxShadow: '0 8px 20px rgba(14, 116, 199, 0.25)'
                }}>
                    <h3 style={{
                        margin: '0',
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        letterSpacing: '-0.3px'
                    }}>
                        <span style={{fontSize: '24px'}}>💬</span>
                        Chats & Users
                    </h3>
                    
                </div>

                {/* Search Bar */}
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.96)',
                    borderBottom: '1px solid var(--border)',
                    position: 'sticky',
                    top: '70px',
                    zIndex: 5,
                    backdropFilter: 'blur(8px)'
                }}>
                    <div style={{position: 'relative'}}>
                        <div style={{
                            position: 'absolute',
                            left: '14px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-tertiary)',
                            fontSize: '18px',
                            zIndex: 1
                        }}>🔍</div>
                        <input
                            type="text"
                            placeholder="Search chats or users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px 10px 42px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                fontSize: '14px',
                                outline: 'none',
                                transition: 'var(--transition)',
                                background: 'var(--bg)',
                                color: 'var(--text-primary)'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = 'var(--accent)'
                                e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'var(--border)'
                                e.target.style.boxShadow = 'none'
                            }}
                        />
                    </div>
                </div>
                <div style={{height: '1px', background: '#e9edef'}}></div>

                {/* Error Message */}
                {error && (
                    <div style={{
                        padding: '12px 20px',
                        background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                        color: '#dc2626',
                        fontSize: '13px',
                        fontWeight: 500,
                        borderLeft: '4px solid #ef4444',
                        margin: '12px',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.15)'
                    }}>
                        {error}
                    </div>
                )}

                {/* People List */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    position: 'relative',
                    zIndex: 1,
                    minHeight: 0,
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch'
                }} className="custom-scrollbar">
                    {allPeople.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '80px 24px',
                            color: '#9ca3af'
                        }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                margin: '0 auto 20px',
                                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '40px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                            }}>👥</div>
                            <p style={{
                                fontSize: '16px',
                                fontWeight: 600,
                                margin: '0 0 6px 0',
                                color: '#6b7280'
                            }}>
                                {searchTerm ? 'No one found' : 'No contacts available'}
                            </p>
                            <p style={{fontSize: '14px', margin: 0, color: '#9ca3af'}}>
                                {searchTerm ? 'Try a different search' : 'Check back later'}
                            </p>
                        </div>
                    ) : (
                        allPeople.map((person) => {
                            const isActive = selectedContact?._id === person._id
                            const hasUnread = person.unreadCount > 0
                            
                            return (
                                <div
                                    key={person._id}
                                    onClick={() => handleSelectContact(person)}
                                    style={{
                                        padding: '12px 16px',
                                        cursor: 'pointer',
                                        transition: 'var(--transition)',
                                        background: isActive ? 'var(--surface-active)' : 'transparent',
                                        borderBottom: '1px solid var(--border)',
                                        display: 'flex',
                                        gap: '12px',
                                        alignItems: 'center',
                                        position: 'relative'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'var(--surface-hover)'
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'transparent'
                                        }
                                    }}
                                >
                                    {/* Avatar */}
                                    <div style={{position: 'relative', flexShrink: 0}}>
                                        <InitialAvatar name={person.name} size="medium" />
                                        {hasUnread && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '-2px',
                                                right: '-2px',
                                                background: 'var(--gradient-error)',
                                                color: '#fff',
                                                borderRadius: '10px',
                                                minWidth: '20px',
                                                height: '20px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                border: '2px solid var(--card)',
                                                padding: '0 4px',
                                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)'
                                            }}>
                                                {person.unreadCount > 99 ? '99+' : person.unreadCount}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Info */}
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '4px'
                                        }}>
                                            <span style={{
                                                fontSize: '15px',
                                                fontWeight: hasUnread ? 600 : 500,
                                                color: 'var(--text-primary)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {person.name}
                                            </span>
                                            {person.lastMessageAt && (
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: hasUnread ? 'var(--accent)' : 'var(--text-tertiary)',
                                                    fontWeight: 500,
                                                    flexShrink: 0,
                                                    marginLeft: '8px'
                                                }}>
                                                    {formatTime(person.lastMessageAt)}
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}>
                                            {person.lastMessage ? (
                                                <div style={{
                                                    fontSize: '13px',
                                                    color: hasUnread ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    fontWeight: hasUnread ? 500 : 400,
                                                    flex: 1
                                                }}>
                                                    {person.lastMessage.substring(0, 35)}
                                                    {person.lastMessage.length > 35 ? '...' : ''}
                                                </div>
                                            ) : (
                                                <div style={{
                                                    fontSize: '13px',
                                                    color: person.isOnline ? '#16a34a' : 'var(--text-tertiary)',
                                                    fontStyle: person.isOnline ? 'normal' : 'italic',
                                                    flex: 1
                                                }}>
                                                    {formatLastSeen(person)}
                                                </div>
                                            )}
                                            <div style={{
                                                padding: '3px 8px',
                                                background: 'var(--surface-active)',
                                                color: 'var(--text-secondary)',
                                                borderRadius: '6px',
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                textTransform: 'capitalize',
                                                flexShrink: 0
                                            }}>
                                                {person.role}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
            )}

            {/* Chat Area */}
            {selectedContact ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#fff',
                    position: 'relative',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden'
                }}>
                    {/* Decorative background pattern */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: 0.03,
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23667eea' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                        pointerEvents: 'none'
                    }} />
                    
                    {/* Chat Header */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        background: 'var(--card)',
                        minHeight: '70px',
                        position: 'sticky',
                        top: 0,
                        zIndex: 6,
                        boxShadow: '0 8px 20px rgba(2, 39, 74, 0.12)',
                        backdropFilter: 'blur(8px)'
                    }}>
                        <button
                            type="button"
                            onClick={handleBack}
                            style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--card)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            aria-label="Back to chats"
                        >
                            ←
                        </button>
                        <InitialAvatar name={selectedContact.name} size="medium" />
                        <div style={{flex: 1}}>
                            <div style={{
                                fontSize: '17px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: '3px'
                            }}>
                                {selectedContact.name}
                            </div>
                            <div style={{
                                fontSize: '13px',
                                color: 'var(--text-secondary)',
                                fontWeight: 500
                            }}>
                                {formatLastSeen(selectedContact)}
                            </div>
                        </div>
                        <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: selectedContact?.isOnline ? 'var(--color-success)' : '#94a3b8',
                            boxShadow: selectedContact?.isOnline ? '0 0 0 3px var(--color-success-light)' : '0 0 0 3px rgba(148, 163, 184, 0.15)'
                        }} />
                    </div>

                    {/* Messages */}
                    <div
                        ref={messagesContainerRef}
                        onScroll={handleMessagesScroll}
                        style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '20px',
                        background: 'var(--bg)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        position: 'relative',
                        zIndex: 1,
                        minHeight: 0,
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch'
                    }} className="custom-scrollbar">
                        {messages.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '80px 24px'
                            }}>
                                <div style={{
                                    width: '100px',
                                    height: '100px',
                                    margin: '0 auto 24px',
                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '50px',
                                    boxShadow: '0 10px 30px rgba(102, 126, 234, 0.3)',
                                    animation: 'float 3s ease-in-out infinite'
                                }}>💬</div>
                                <p style={{
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    margin: '0 0 8px 0',
                                    color: '#111827'
                                }}>
                                    No messages yet
                                </p>
                                <p style={{fontSize: '14px', margin: 0, color: '#9ca3af'}}>
                                    Send a message to start the conversation
                                </p>
                            </div>
                        ) : (
                            messages.map((msg) => {
                                const senderId = getEntityId(msg.sender)
                                const selectedId = getEntityId(selectedContact)
                                const isSent = senderId !== selectedId
                                return (
                                    <div
                                        key={msg._id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: isSent ? 'flex-end' : 'flex-start',
                                            animation: 'fadeInUp 0.3s ease'
                                        }}
                                    >
                                        <div style={{
                                            maxWidth: '70%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{
                                                padding: '10px 14px',
                                                borderRadius: isSent ? 'var(--radius) var(--radius) 4px var(--radius)' : 'var(--radius) var(--radius) var(--radius) 4px',
                                                background: isSent ? 'var(--gradient-primary)' : 'var(--card)',
                                                color: isSent ? '#fff' : 'var(--text-primary)',
                                                fontSize: '14px',
                                                lineHeight: '1.5',
                                                boxShadow: isSent ? '0 2px 8px rgba(102, 126, 234, 0.25)' : '0 1px 3px rgba(0,0,0,0.1)',
                                                wordBreak: 'break-word',
                                                fontWeight: 400,
                                                position: 'relative',
                                                border: isSent ? 'none' : '1px solid var(--border)',
                                                paddingBottom: '6px'
                                            }}>
                                                {msg.content}
                                                <div style={{
                                                    fontSize: '10px',
                                                    color: isSent ? 'rgba(255,255,255,0.8)' : 'var(--text-tertiary)',
                                                    marginTop: '4px',
                                                    fontWeight: 500,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    justifyContent: isSent ? 'flex-end' : 'flex-start'
                                                }}>
                                                {formatTime(msg.createdAt)}
                                                {isSent && (
                                                    <svg 
                                                        width="14" 
                                                        height="14" 
                                                        viewBox="0 0 14 14" 
                                                        style={{
                                                            flexShrink: 0,
                                                            transition: 'all 0.3s ease'
                                                        }}
                                                    >
                                                        <circle 
                                                            cx="7" 
                                                            cy="7" 
                                                            r="6" 
                                                            fill={msg.read ? '#3b82f6' : 'none'}
                                                            stroke={msg.read ? '#3b82f6' : '#cbd5e1'}
                                                            strokeWidth="1.5"
                                                            style={{
                                                                transition: 'all 0.3s ease'
                                                            }}
                                                        />
                                                        {msg.read && (
                                                            <path 
                                                                d="M4.5 7l2 2 3.5-3.5" 
                                                                stroke="#fff" 
                                                                strokeWidth="1.5" 
                                                                fill="none" 
                                                                strokeLinecap="round" 
                                                                strokeLinejoin="round"
                                                                style={{
                                                                    animation: 'checkmark 0.3s ease'
                                                                }}
                                                            />
                                                        )}
                                                    </svg>
                                                )}
                                            </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <form 
                        onSubmit={handleSendMessage}
                        style={{
                            padding: '16px 20px',
                            background: 'rgba(255, 255, 255, 0.98)',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center',
                            position: 'relative',
                            zIndex: 1,
                            boxShadow: '0 -8px 18px rgba(2, 39, 74, 0.08)',
                            backdropFilter: 'blur(6px)'
                        }}
                    >
                        <input
                            type="text"
                            placeholder="Type a message..."
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            disabled={sending}
                            style={{
                                flex: 1,
                                padding: '11px 16px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                fontSize: '14px',
                                outline: 'none',
                                background: 'var(--bg)',
                                color: 'var(--text-primary)',
                                transition: 'var(--transition)'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = 'var(--accent)'
                                e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'var(--border)'
                                e.target.style.boxShadow = 'none'
                            }}
                        />
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                onClick={() => setShowEmojiPicker((prev) => !prev)}
                                style={{
                                    width: '44px',
                                    height: '44px',
                                    background: 'var(--surface-active)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius)',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'var(--transition)',
                                    flexShrink: 0
                                }}
                                aria-label="Add emoji"
                            >
                                😊
                            </button>
                            {showEmojiPicker && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '52px',
                                    right: 0,
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                    padding: '8px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(5, 1fr)',
                                    gap: '6px',
                                    zIndex: 12
                                }}>
                                    {QUICK_EMOJIS.map((emoji) => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => {
                                                setNewMessage((prev) => `${prev}${emoji}`)
                                                setShowEmojiPicker(false)
                                            }}
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                fontSize: '20px',
                                                cursor: 'pointer',
                                                padding: '4px'
                                            }}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={sending || !newMessage.trim()}
                            style={{
                                width: '44px',
                                height: '44px',
                                background: sending || !newMessage.trim() ? 'var(--border)' : 'var(--gradient-primary)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 'var(--radius)',
                                fontSize: '18px',
                                cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'var(--transition)',
                                flexShrink: 0,
                                boxShadow: sending || !newMessage.trim() ? 'none' : '0 2px 8px rgba(102, 126, 234, 0.25)'
                            }}
                            onMouseEnter={(e) => {
                                if (!sending && newMessage.trim()) {
                                    e.target.style.transform = 'scale(1.05)'
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.transform = 'scale(1)'
                            }}
                        >
                            {sending ? '⏳' : '➤'}
                        </button>
                    </form>
                </div>
            ) : null}

            <style>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { 
                        opacity: 1;
                        transform: scale(1);
                    }
                    50% { 
                        opacity: 0.8;
                        transform: scale(1.05);
                    }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(-5deg); }
                    50% { transform: translateY(-20px) rotate(-5deg); }
                }
                @keyframes checkmark {
                    from {
                        stroke-dasharray: 10;
                        stroke-dashoffset: 10;
                    }
                    to {
                        stroke-dasharray: 10;
                        stroke-dashoffset: 0;
                    }
                }
            `}</style>
        </div>
    )
}
