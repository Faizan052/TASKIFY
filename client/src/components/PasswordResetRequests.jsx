import { useState, useEffect, useCallback, useRef } from 'react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';

export default function PasswordResetRequests({ userRole }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const inFlightRef = useRef(false);
    const hasLoadedRef = useRef(false);

    const fetchRequests = useCallback(async ({ silent = false } = {}) => {
        if (inFlightRef.current) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        inFlightRef.current = true;
        if (!silent || !hasLoadedRef.current) {
            setLoading(true);
        }
        setError('');
        
        try {
            const token = localStorage.getItem('tm_token');
            const endpoint = userRole === 'admin' 
                ? '/api/admin/password-requests' 
                : '/api/hr/password-requests';
            
            const response = await fetch(`http://localhost:5000${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch password reset requests');
            }

            const data = await response.json();
            setRequests((prev) => {
                if (!Array.isArray(prev) || prev.length === 0) return data;
                if (!Array.isArray(data)) return prev;
                if (prev.length !== data.length) return data;
                const prevFirst = prev[0]?._id;
                const prevLast = prev[prev.length - 1]?._id;
                const nextFirst = data[0]?._id;
                const nextLast = data[data.length - 1]?._id;
                return prevFirst === nextFirst && prevLast === nextLast ? prev : data;
            });
        } catch (err) {
            setError(err.message);
        } finally {
            if (!silent || !hasLoadedRef.current) {
                setLoading(false);
            }
            hasLoadedRef.current = true;
            inFlightRef.current = false;
        }
    }, [userRole]);

    useEffect(() => {
        fetchRequests({ silent: false });
        
        // Auto-refresh every 30 seconds
        const interval = setInterval(() => fetchRequests({ silent: true }), 30000);
        const onVisibilityChange = () => {
            if (!document.hidden) {
                fetchRequests({ silent: true });
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [fetchRequests]);

    const handleResetPassword = async (requestId) => {
        if (!newPassword || newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setProcessing(requestId);
        setError('');
        setSuccess('');

        try {
            const token = localStorage.getItem('tm_token');
            const endpoint = userRole === 'admin'
                ? '/api/admin/reset-hr-password'
                : '/api/hr/reset-manager-password';

            const response = await fetch(`http://localhost:5000${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ requestId, newPassword })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to reset password');
            }

            setSuccess(data.message);
            setSelectedRequest(null);
            setNewPassword('');
            
            // Refresh the list
            fetchRequests({ silent: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setProcessing(null);
        }
    };

    if (loading && requests.length === 0) {
        return (
            <Card style={{ padding: '20px', textAlign: 'center' }}>
                <div>Loading password reset requests...</div>
            </Card>
        );
    }

    return (
        <div style={{ marginTop: '20px' }}>
            <Card>
                <div style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, color: '#667eea' }}>
                            🔑 Password Reset Requests
                        </h3>
                        <Button
                            onClick={fetchRequests}
                            variant="secondary"
                            size="small"
                            disabled={loading}
                        >
                            🔄 Refresh
                        </Button>
                    </div>

                    {error && (
                        <div style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '15px',
                            border: '1px solid #fecaca'
                        }}>
                            {error}
                        </div>
                    )}

                    {success && (
                        <div style={{
                            background: '#d1fae5',
                            color: '#059669',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '15px',
                            border: '1px solid #a7f3d0'
                        }}>
                            {success}
                        </div>
                    )}

                    {requests.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px',
                            color: '#6b7280'
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '10px' }}>✅</div>
                            <p>No pending password reset requests</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {requests.map((request) => (
                                <Card key={request._id} style={{ background: '#f9fafb' }}>
                                    <div style={{ padding: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                                            <div>
                                                <h4 style={{ margin: '0 0 5px 0', color: '#1f2937' }}>
                                                    {request.requestedBy?.name}
                                                </h4>
                                                <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                                                    {request.requestedBy?.email}
                                                </p>
                                            </div>
                                            <span style={{
                                                background: '#fef3c7',
                                                color: '#92400e',
                                                padding: '4px 12px',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: 'bold'
                                            }}>
                                                {request.role?.toUpperCase()}
                                            </span>
                                        </div>

                                        <p style={{ margin: '10px 0', fontSize: '13px', color: '#6b7280' }}>
                                            Requested: {new Date(request.createdAt).toLocaleString()}
                                        </p>

                                        {selectedRequest === request._id ? (
                                            <div style={{ marginTop: '15px' }}>
                                                <Input
                                                    label="New Password"
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder="Enter new password (min 8 characters)"
                                                    disabled={processing === request._id}
                                                />
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                                    <Button
                                                        onClick={() => handleResetPassword(request._id)}
                                                        loading={processing === request._id}
                                                        size="small"
                                                    >
                                                        Reset & Send Email
                                                    </Button>
                                                    <Button
                                                        onClick={() => {
                                                            setSelectedRequest(null);
                                                            setNewPassword('');
                                                            setError('');
                                                        }}
                                                        variant="secondary"
                                                        size="small"
                                                        disabled={processing === request._id}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <Button
                                                onClick={() => setSelectedRequest(request._id)}
                                                size="small"
                                                style={{ marginTop: '10px' }}
                                            >
                                                Process Request
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
