import { useState } from 'react';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import { apiFetch } from '../api';

export default function ForgotPassword({ onClose, onSuccess }) {
    const [step, setStep] = useState(1); // 1: email, 2: otp, 3: new password
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [_userType, setUserType] = useState('');
    const [userName, setUserName] = useState('');
    const [userRole, setUserRole] = useState('');
    const [_requiresOTP, setRequiresOTP] = useState(false);

    const handleRequestReset = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            const data = await apiFetch('/api/auth/forgot-password', {
                method: 'POST',
                body: { email }
            });

            setUserType(data.userType);
            setUserName(data.userName || 'User');
            setUserRole(data.role || data.userType);
            setRequiresOTP(data.requiresOTP);
            setMessage(data.message);

            if (data.requiresOTP) {
                // Move to OTP step
                setStep(2);
            } else {
                // For HR/Manager requests, show success message and close
                setTimeout(() => {
                    onClose?.();
                }, 3000);
            }
        } catch (err) {
            setError(err.message || 'Failed to process request. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            const data = await apiFetch('/api/auth/verify-reset-otp', {
                method: 'POST',
                body: { email, otp }
            });

            setMessage(data.message);
            setStep(3);
        } catch (err) {
            setError(err.message || 'Invalid OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setLoading(true);

        try {
            const data = await apiFetch('/api/auth/reset-password', {
                method: 'POST',
                body: { email, newPassword }
            });

            setMessage(data.message);
            onSuccess?.();

            // Close modal after 2 seconds
            setTimeout(() => {
                onClose?.();
            }, 2000);
        } catch (err) {
            setError(err.message || 'Failed to reset password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setError('');
        setMessage('');
        setLoading(true);

        try {
            await apiFetch('/api/auth/forgot-password', {
                method: 'POST',
                body: { email }
            });

            setMessage('OTP resent successfully!');
        } catch (err) {
            setError(err.message || 'Failed to resend OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const getRoleDisplay = (role) => {
        const roleMap = {
            'admin': 'Administrator',
            'hr': 'HR',
            'manager': 'Manager',
            'developer': 'Developer',
            'designer': 'Designer',
            'tester': 'Tester',
            'client': 'Client',
            'user': 'User'
        };
        return roleMap[role] || role;
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <Card style={{ maxWidth: '500px', width: '100%' }}>
                <div style={{ padding: '30px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ margin: 0, color: '#667eea' }}>
                            {step === 1 && '🔒 Forgot Password'}
                            {step === 2 && '📧 Verify OTP'}
                            {step === 3 && '🔑 New Password'}
                        </h2>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '24px',
                                cursor: 'pointer',
                                color: '#6b7280',
                                padding: '0',
                                lineHeight: 1
                            }}
                        >
                            ×
                        </button>
                    </div>

                    {error && (
                        <div style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            border: '1px solid #fecaca'
                        }}>
                            {error}
                        </div>
                    )}

                    {message && (
                        <div style={{
                            background: '#d1fae5',
                            color: '#059669',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            border: '1px solid #a7f3d0'
                        }}>
                            {message}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleRequestReset}>
                            <p style={{ color: '#6b7280', marginBottom: '20px' }}>
                                Enter your email address and we'll help you reset your password.
                            </p>
                            <Input
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your.email@example.com"
                                required
                                disabled={loading}
                            />
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <Button
                                    type="submit"
                                    loading={loading}
                                    style={{ flex: 1 }}
                                >
                                    Continue
                                </Button>
                                <Button
                                    type="button"
                                    onClick={onClose}
                                    variant="secondary"
                                    disabled={loading}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleVerifyOTP}>
                            {/* Professional User Greeting */}
                            <div style={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '25px',
                                color: 'white',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                                    {userRole === 'admin' ? '👑' : 
                                     userRole === 'hr' ? '👥' : 
                                     userRole === 'manager' ? '👔' : 
                                     userRole === 'developer' ? '💻' : 
                                     userRole === 'designer' ? '🎨' : 
                                     userRole === 'tester' ? '🔍' : 
                                     userRole === 'client' ? '🤝' : '👤'}
                                </div>
                                <h3 style={{ margin: '0 0 5px 0', fontSize: '20px', fontWeight: '600' }}>
                                    Hi, {userName}!
                                </h3>
                                <p style={{ margin: 0, fontSize: '14px', opacity: 0.95 }}>
                                    {getRoleDisplay(userRole)}
                                </p>
                            </div>

                            <p style={{ color: '#6b7280', marginBottom: '20px', textAlign: 'center' }}>
                                We sent a 6-digit verification code to<br />
                                <strong style={{ color: '#1f2937' }}>{email}</strong>
                            </p>
                            <Input
                                label="Enter OTP"
                                type="text"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="000000"
                                maxLength={6}
                                required
                                disabled={loading}
                                style={{ fontSize: '24px', textAlign: 'center', letterSpacing: '8px' }}
                            />
                            <div style={{ marginTop: '15px', textAlign: 'center' }}>
                                <button
                                    type="button"
                                    onClick={handleResendOTP}
                                    disabled={loading}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#667eea',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    Resend OTP
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <Button
                                    type="submit"
                                    loading={loading}
                                    style={{ flex: 1 }}
                                >
                                    Verify OTP
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    variant="secondary"
                                    disabled={loading}
                                >
                                    Back
                                </Button>
                            </div>
                        </form>
                    )}

                    {step === 3 && (
                        <form onSubmit={handleResetPassword}>
                            {/* Professional User Greeting */}
                            <div style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '25px',
                                color: 'white',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                                    {userRole === 'admin' ? '👑' : 
                                     userRole === 'hr' ? '👥' : 
                                     userRole === 'manager' ? '👔' : 
                                     userRole === 'developer' ? '💻' : 
                                     userRole === 'designer' ? '🎨' : 
                                     userRole === 'tester' ? '🔍' : 
                                     userRole === 'client' ? '🤝' : '👤'}
                                </div>
                                <h3 style={{ margin: '0 0 5px 0', fontSize: '20px', fontWeight: '600' }}>
                                    Hi, {userName}!
                                </h3>
                                <p style={{ margin: 0, fontSize: '14px', opacity: 0.95 }}>
                                    {getRoleDisplay(userRole)}
                                </p>
                            </div>

                            <p style={{ color: '#6b7280', marginBottom: '20px', textAlign: 'center' }}>
                                Choose a strong password for your account
                            </p>
                            <Input
                                label="New Password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                required
                                disabled={loading}
                            />
                            <Input
                                label="Confirm Password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                required
                                disabled={loading}
                            />
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
                                Password must be at least 8 characters long
                            </div>
                            <Button
                                type="submit"
                                loading={loading}
                                style={{ width: '100%', marginTop: '20px' }}
                            >
                                Reset Password
                            </Button>
                        </form>
                    )}
                </div>
            </Card>
        </div>
    );
}
