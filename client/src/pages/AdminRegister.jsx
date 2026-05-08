import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api'
import Message from '../components/Message'
import Button from '../components/Button'
import Input from '../components/Input'

/**
 * AdminRegister Component
 * Allows registration of admin if no admin exists in the system
 */
export default function AdminRegister() {
  const nav = useNavigate()

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [step, setStep] = useState(1) // 1: Basic Info, 2: OTP Verification
  const [_otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [adminExists, setAdminExists] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const MESSAGE_TIMEOUT_MS = 4500

  const [touched, setTouched] = useState({
    name: false,
    username: false,
    email: false,
    password: false,
    confirmPassword: false
  })

  // Check if admin already exists
  useEffect(() => {
    checkAdminExists()
  }, [])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), MESSAGE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), MESSAGE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [success])

  const checkAdminExists = async () => {
    try {
      setCheckingAdmin(true)
      const response = await apiFetch('/api/admin/check-exists', {
        method: 'GET'
      })
      setAdminExists(response.exists)
    } catch (err) {
      console.error('Error checking admin:', err)
      setAdminExists(false)
    } finally {
      setCheckingAdmin(false)
    }
  }

  // Validation functions
  const validateName = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return 'Name is required'
    if (trimmed.length < 2) return 'Name must be at least 2 characters'
    return null
  }

  const validateUsername = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return 'Username is required'
    if (trimmed.length < 3) return 'Username must be at least 3 characters'
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Username can only contain letters, numbers, and underscores'
    return null
  }

  const validateEmail = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return 'Email is required'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) return 'Please enter a valid email address'
    return null
  }

  const validatePassword = (value) => {
    if (!value) return 'Password is required'
    if (value.length < 8) return 'Password must be at least 8 characters'
    if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter'
    if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter'
    if (!/[0-9]/.test(value)) return 'Password must contain at least one number'
    return null
  }

  const validateConfirmPassword = (value) => {
    if (!value) return 'Please confirm your password'
    if (value !== password) return 'Passwords do not match'
    return null
  }

  // Get validation errors
  const nameError = touched.name ? validateName(name) : null
  const usernameError = touched.username ? validateUsername(username) : null
  const emailError = touched.email ? validateEmail(email) : null
  const passwordError = touched.password ? validatePassword(password) : null
  const confirmPasswordError = touched.confirmPassword ? validateConfirmPassword(confirmPassword) : null

  const isFormValid = 
    !validateName(name) &&
    !validateUsername(username) &&
    !validateEmail(email) &&
    !validatePassword(password) &&
    !validateConfirmPassword(confirmPassword)

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  const handleSendOtp = async (e) => {
    e.preventDefault()
    
    // Validate basic info before sending OTP
    setTouched({
      name: true,
      username: true,
      email: true,
      password: true,
      confirmPassword: true
    })

    if (!isFormValid) {
      setError('Please fix all validation errors before proceeding')
      return
    }

    setSendingOtp(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await apiFetch('/api/admin/send-otp', {
        method: 'POST',
        body: {
          email: email.trim(),
          name: name.trim()
        }
      })

      setSuccess(response.message || 'OTP sent to your email!')
      setOtpSent(true)
      setStep(2)
    } catch (err) {
      setError(err?.message || 'Failed to send OTP. Please try again.')
    } finally {
      setSendingOtp(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the 6-digit OTP sent to your email')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await apiFetch('/api/admin/register', {
        method: 'POST',
        body: {
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          otp: otp.trim()
        }
      })

      setSuccess('Admin registered successfully! Redirecting to login...')
      
      // Redirect to admin login after 2 seconds
      setTimeout(() => {
        nav('/admin/login')
      }, 2000)
    } catch (err) {
      setError(err?.message || 'Failed to register admin. Please check your OTP and try again.')
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setSendingOtp(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await apiFetch('/api/admin/send-otp', {
        method: 'POST',
        body: {
          email: email.trim(),
          name: name.trim()
        }
      })

      setSuccess(response.message || 'OTP resent to your email!')
    } catch (err) {
      setError(err?.message || 'Failed to resend OTP. Please try again.')
    } finally {
      setSendingOtp(false)
    }
  }

  if (checkingAdmin) {
    return (
      <main className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h2>Checking system status...</h2>
        </div>
      </main>
    )
  }

  if (adminExists) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
            <h2 style={{ marginBottom: '1rem' }}>Admin Already Registered</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
              An administrator account already exists in the system. 
              If you're the admin, please use the login page to access your account.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/admin/login" style={{ textDecoration: 'none' }}>
                <Button variant="primary">Go to Admin Login</Button>
              </Link>
              <Link to="/" style={{ textDecoration: 'none' }}>
                <Button variant="secondary">Back to Home</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="home-logo" aria-label="Taskify Logo" style={{ margin: '0 auto 1rem' }}>A</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Register Administrator</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Create the first admin account for your Taskify system
          </p>
        </div>

        {error && <Message type="error" message={error} onClose={() => setError(null)} />}
        {success && <Message type="success" message={success} />}

        {step === 1 ? (
          <form onSubmit={handleSendOtp} noValidate>
          {/* Name Field */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Full Name
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleBlur('name')}
              placeholder="Enter your full name"
              disabled={loading}
              error={nameError}
            />
            {nameError && (
              <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {nameError}
              </div>
            )}
          </div>

          {/* Username Field */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Username
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => handleBlur('username')}
              placeholder="Choose a username"
              disabled={loading}
              error={usernameError}
            />
            {usernameError && (
              <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {usernameError}
              </div>
            )}
          </div>

          {/* Email Field */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => handleBlur('email')}
              placeholder="Enter your email"
              disabled={loading}
              error={emailError}
            />
            {emailError && (
              <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {emailError}
              </div>
            )}
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => handleBlur('password')}
                placeholder="Create a strong password"
                disabled={loading}
                error={passwordError}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '1.2rem'
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {passwordError && (
              <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {passwordError}
              </div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => handleBlur('confirmPassword')}
                placeholder="Re-enter your password"
                disabled={loading}
                error={confirmPasswordError}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '1.2rem'
                }}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {confirmPasswordError && (
              <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {confirmPasswordError}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={sendingOtp}
            style={{ marginBottom: '1rem' }}
          >
            {sendingOtp ? 'Sending OTP...' : 'Send OTP'}
          </Button>

          {/* Back to Home Link */}
          <div style={{ textAlign: 'center' }}>
            <Link to="/" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9rem' }}>
              ← Back to Home
            </Link>
          </div>
        </form>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ 
              background: 'var(--bg-secondary)', 
              padding: '1rem', 
              borderRadius: '8px', 
              marginBottom: '1.5rem',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                📧 OTP sent to:
              </div>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {email}
              </div>
            </div>

            {/* OTP Field */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="otp" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Enter OTP Code
              </label>
              <Input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                disabled={loading}
                style={{ 
                  fontSize: '1.5rem', 
                  letterSpacing: '0.5rem', 
                  textAlign: 'center',
                  fontWeight: '600'
                }}
                maxLength={6}
              />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>
                Check your email inbox for the OTP code
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={loading || otp.length !== 6}
              style={{ marginBottom: '1rem' }}
            >
              {loading ? 'Verifying...' : 'Verify & Register'}
            </Button>

            {/* Resend OTP */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={sendingOtp}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.9rem'
                }}
              >
                {sendingOtp ? 'Resending...' : 'Resend OTP'}
              </button>
            </div>

            {/* Back Button */}
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setOtp('')
                  setError(null)
                  setSuccess(null)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                ← Change Email/Details
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
