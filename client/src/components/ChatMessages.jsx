import React, { useCallback, useEffect, useState, useRef } from 'react'
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

export default function ChatMessages({ onClose, onUnreadCountChange }) {
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
    const [searchTerm, setSearchTerm] = useState('')

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const loadContacts = useCallback(async () => {
        try {
            const data = await apiFetch('/api/messages/contacts')
            setContacts(data || [])
            setError(null)
        } catch (err) {
            console.error('Error loading contacts:', err)
            setError(err.message || 'Failed to load contacts')
        }
    }, [])

    const loadConversations = useCallback(async () => {
        try {
            const data = await apiFetch('/api/messages/conversations')
            setConversations(data || [])
            setError(null)
        } catch (err) {
            console.error('Error loading conversations:', err)
            setError(err.message || 'Failed to load conversations')
        }
    }, [])

    const loadUnreadCount = useCallback(async () => {
        try {
            const data = await apiFetch('/api/messages/unread-count')
            setUnreadCount(data.count || 0)
        } catch (err) {
            // Silent fail for unread count
        }
    }, [])

    const loadMessages = useCallback(async (contactId) => {
        if (!contactId) return
        try {
            const data = await apiFetch(`/api/messages/conversation/${contactId}`)
            setMessages(data || [])
            // Mark as read
            await apiFetch(`/api/messages/read/${contactId}`, { method: 'PUT' })
            loadUnreadCount()
            setTimeout(scrollToBottom, 100)
        } catch (err) {
            setError(err.message)
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
            loadMessages(selectedContact._id)
            const interval = setInterval(() => {
                loadMessages(selectedContact._id)
            }, AUTO_REFRESH_INTERVAL)
            return () => clearInterval(interval)
        }
    }, [selectedContact, loadMessages])

    useEffect(() => {
        const interval = setInterval(() => {
            loadConversations()
            loadUnreadCount()
        }, AUTO_REFRESH_INTERVAL)
        return () => clearInterval(interval)
    }, [loadConversations, loadUnreadCount])

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
            await apiFetch('/api/messages/send', {
                method: 'POST',
                body: {
                    recipientId: selectedContact._id,
                    recipientModel: selectedContact.model || 'User',
                    content: newMessage.trim()
                }
            })
            setNewMessage('')
            await loadMessages(selectedContact._id)
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
    }

    const handleBack = () => {
        setSelectedContact(null)
        setMessages([])
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

    const filteredConversations = conversations.filter(conv => 
        conv.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.user.role.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const filteredContacts = contacts.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.role.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Merge conversations and contacts - prioritize people with existing conversations
    const allPeople = []
    const seenIds = new Set()
    
    // Add people with conversations first
    filteredConversations.forEach(conv => {
        seenIds.add(conv.user._id)
        allPeople.push({
            ...conv.user,
            lastMessage: conv.lastMessage,
            lastMessageAt: conv.lastMessageAt,
            unreadCount: conv.unreadCount,
            hasConversation: true
        })
    })
    
    // Add other contacts
    filteredContacts.forEach(contact => {
        if (!seenIds.has(contact._id)) {
            allPeople.push({
                ...contact,
                hasConversation: false,
                unreadCount: 0
            })
        }
    })

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
        <div style={{
            display: 'grid',
            gridTemplateColumns: selectedContact ? '380px 1fr' : '1fr',
            height: '100%',
            width: '100%',
            background: '#fff',
            overflow: 'hidden'
        }}>
            {/* People List - Always Visible */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                borderRight: selectedContact ? '1px solid #e5e7eb' : 'none',
                background: 'linear-gradient(to bottom, #fafbfc, #f3f4f6)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Decorative background */}
                <div style={{
                    position: 'absolute',
                    top: '-100px',
                    right: '-100px',
                    width: '300px',
                    height: '300px',
                    background: 'radial-gradient(circle, rgba(102, 126, 234, 0.08) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }} />
                
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #e5e7eb',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    position: 'relative',
                    zIndex: 1
                }}>
                    <h3 style={{
                        margin: '0 0 20px 0',
                        fontSize: '24px',
                        fontWeight: 800,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        letterSpacing: '-0.5px'
                    }}>
                        <span style={{fontSize: '28px'}}>💬</span>
                        Messages
                    </h3>
                    
                    {/* Search */}
                    <div style={{position: 'relative'}}>
                        <div style={{
                            position: 'absolute',
                            left: '14px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94a3b8',
                            fontSize: '16px'
                        }}>🔍</div>
                        <input
                            type="text"
                            placeholder="Search people..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 14px 12px 42px',
                                border: '2px solid rgba(255,255,255,0.2)',
                                borderRadius: '12px',
                                fontSize: '14px',
                                outline: 'none',
                                transition: 'all 0.2s ease',
                                background: 'rgba(255,255,255,0.15)',
                                color: '#fff',
                                backdropFilter: 'blur(10px)'
                            }}
                            onFocus={(e) => {
                                e.target.style.background = 'rgba(255,255,255,0.25)'
                                e.target.style.borderColor = 'rgba(255,255,255,0.4)'
                            }}
                            onBlur={(e) => {
                                e.target.style.background = 'rgba(255,255,255,0.15)'
                                e.target.style.borderColor = 'rgba(255,255,255,0.2)'
                            }}
                        />
                        <style>{`
                            input::placeholder {
                                color: rgba(255,255,255,0.8);
                            }
                        `}</style>
                    </div>
                </div>

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
                    zIndex: 1
                }}>
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
                                        padding: '14px 20px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        background: isActive 
                                            ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)' 
                                            : 'transparent',
                                        borderLeft: isActive ? '4px solid #667eea' : '4px solid transparent',
                                        display: 'flex',
                                        gap: '14px',
                                        alignItems: 'center',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.5)'
                                            e.currentTarget.style.transform = 'translateX(2px)'
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'transparent'
                                            e.currentTarget.style.transform = 'translateX(0)'
                                        }
                                    }}
                                >
                                    {/* Avatar */}
                                    <div style={{position: 'relative', flexShrink: 0}}>
                                        <InitialAvatar name={person.name} size="medium" />
                                        {hasUnread && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '-4px',
                                                right: '-4px',
                                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                                color: '#fff',
                                                borderRadius: '12px',
                                                minWidth: '22px',
                                                height: '22px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                border: '2px solid #fff',
                                                padding: '0 5px',
                                                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                                                animation: 'pulse 2s infinite'
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
                                                fontWeight: hasUnread ? 700 : 600,
                                                color: '#111827',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {person.name}
                                            </span>
                                            {person.lastMessageAt && (
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: '#9ca3af',
                                                    fontWeight: 600,
                                                    flexShrink: 0,
                                                    marginLeft: '8px'
                                                }}>
                                                    {formatTime(person.lastMessageAt)}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {person.lastMessage ? (
                                            <div style={{
                                                fontSize: '13px',
                                                color: hasUnread ? '#4b5563' : '#9ca3af',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                fontWeight: hasUnread ? 500 : 400,
                                                marginBottom: '6px'
                                            }}>
                                                {person.lastMessage.substring(0, 35)}
                                                {person.lastMessage.length > 35 ? '...' : ''}
                                            </div>
                                        ) : (
                                            <div style={{
                                                fontSize: '13px',
                                                color: '#9ca3af',
                                                fontStyle: 'italic',
                                                marginBottom: '6px'
                                            }}>
                                                Click to start conversation
                                            </div>
                                        )}
                                        
                                        <div style={{
                                            display: 'inline-block',
                                            padding: '3px 10px',
                                            background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                                            color: '#6b7280',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            textTransform: 'capitalize',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                                        }}>
                                            {person.role}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Chat Area */}
            {selectedContact ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#fff',
                    position: 'relative'
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
                        padding: '20px 28px',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        background: 'linear-gradient(to right, #fff 0%, #fafbfc 100%)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        position: 'relative',
                        zIndex: 1
                    }}>
                        <InitialAvatar name={selectedContact.name} size="large" />
                        <div style={{flex: 1}}>
                            <div style={{
                                fontSize: '18px',
                                fontWeight: 700,
                                color: '#111827',
                                marginBottom: '3px',
                                letterSpacing: '-0.3px'
                            }}>
                                {selectedContact.name}
                            </div>
                            <div style={{
                                fontSize: '13px',
                                color: '#6b7280',
                                textTransform: 'capitalize',
                                fontWeight: 500
                            }}>
                                {selectedContact.role}
                            </div>
                        </div>
                        <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.2)',
                            animation: 'pulse 2s infinite'
                        }} />
                    </div>

                    {/* Messages */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '28px',
                        background: 'linear-gradient(to bottom, #fafbfc 0%, #f9fafb 50%, #ffffff 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        position: 'relative',
                        zIndex: 1
                    }}>
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
                                const isSent = msg.sender._id !== selectedContact._id
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
                                                padding: '12px 16px',
                                                borderRadius: isSent ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                                background: isSent 
                                                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                                                    : '#fff',
                                                color: isSent ? '#fff' : '#111827',
                                                fontSize: '14px',
                                                lineHeight: '1.6',
                                                boxShadow: isSent 
                                                    ? '0 4px 12px rgba(102, 126, 234, 0.3)'
                                                    : '0 2px 8px rgba(0,0,0,0.08)',
                                                border: isSent ? 'none' : '1px solid #e5e7eb',
                                                wordBreak: 'break-word',
                                                fontWeight: 500
                                            }}>
                                                {msg.content}
                                            </div>
                                            <div style={{
                                                fontSize: '11px',
                                                color: '#9ca3af',
                                                paddingLeft: isSent ? 0 : '6px',
                                                paddingRight: isSent ? '6px' : 0,
                                                textAlign: isSent ? 'right' : 'left',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
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
                                )
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <form 
                        onSubmit={handleSendMessage}
                        style={{
                            padding: '20px 28px',
                            background: 'linear-gradient(to right, #fafbfc 0%, #fff 100%)',
                            borderTop: '1px solid #e5e7eb',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center',
                            boxShadow: '0 -1px 3px rgba(0,0,0,0.05)',
                            position: 'relative',
                            zIndex: 1
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
                                padding: '14px 18px',
                                border: '2px solid #e5e7eb',
                                borderRadius: '14px',
                                fontSize: '14px',
                                outline: 'none',
                                transition: 'all 0.2s ease',
                                background: '#fff',
                                color: '#111827',
                                fontWeight: 500
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#667eea'
                                e.target.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)'
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#e5e7eb'
                                e.target.style.boxShadow = 'none'
                            }}
                        />
                        <button
                            type="submit"
                            disabled={sending || !newMessage.trim()}
                            style={{
                                width: '52px',
                                height: '52px',
                                background: sending || !newMessage.trim() 
                                    ? 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)' 
                                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '14px',
                                fontSize: '20px',
                                fontWeight: 'bold',
                                cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                                flexShrink: 0,
                                boxShadow: sending || !newMessage.trim() 
                                    ? 'none' 
                                    : '0 4px 12px rgba(102, 126, 234, 0.3)'
                            }}
                            onMouseEnter={(e) => {
                                if (!sending && newMessage.trim()) {
                                    e.target.style.transform = 'scale(1.05) translateY(-1px)'
                                    e.target.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)'
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!sending && newMessage.trim()) {
                                    e.target.style.transform = 'scale(1)'
                                    e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)'
                                }
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
