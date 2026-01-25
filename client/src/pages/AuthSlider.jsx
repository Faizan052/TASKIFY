import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { isValidEmail, getPasswordRequirements, checkPasswordStrength } from '../utils/helpers'
import Message from '../components/Message'
import ForgotPassword from '../components/ForgotPassword'

const SLIDE_MS = 600

// ============================================
// Validation Functions
// ============================================

const validateLoginEmail = (value) => {
  const trimmed = value.trim()
  if (!trimmed) return 'Email or username is required'
  return null
}

const validateLoginPassword = (value) => {
  if (!value) return 'Password is required'
  return null
}

const validateName = (value) => {
  const trimmed = value.trim()
  if (!trimmed) return 'Name is required'
  if (trimmed.length < 2) return 'Name must be at least 2 characters'
  if (trimmed.length > 50) return 'Name must be less than 50 characters'
  return null
}

const validateRegisterEmail = (value) => {
  const trimmed = value.trim()
  if (!trimmed) return 'Email is required'
  if (!isValidEmail(trimmed)) return 'Please enter a valid email address'
  return null
}

const validateRegisterPassword = (value) => {
  if (!value) return 'Password is required'
  if (value.length < 8) return 'Password must be at least 8 characters'
  if (!/[a-z]/.test(value)) return 'Password must contain lowercase letter'
  if (!/[A-Z]/.test(value)) return 'Password must contain uppercase letter'
  if (!/[0-9]/.test(value)) return 'Password must contain a number'
  return null
}

const validateConfirmPassword = (password, confirmPassword) => {
  if (!confirmPassword) return 'Please confirm your password'
  if (confirmPassword !== password) return 'Passwords do not match'
  return null
}

// ============================================
// Main AuthSlider Component
// ============================================

export default function AuthSlider() {
  const nav = useNavigate()
  const location = useLocation()
  const navTimerRef = useRef(null)

  // Determine initial mode based on URL
  const initialMode = useMemo(() => {
    return location.pathname === '/register' ? 'register' : 'login'
  }, [location.pathname])

  const [mode, setMode] = useState(initialMode)

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginTouched, setLoginTouched] = useState({ email: false, password: false })

  // Register form state
  const [name, setName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState('developer')
  const [otp, setOtp] = useState('')
  const [regStep, setRegStep] = useState(1) // 1: Basic Info, 2: OTP Verification
  const [otpSent, setOtpSent] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [registerTouched, setRegisterTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false
  })

  // Common state
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [registerError, setRegisterError] = useState(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  // Sync mode with URL path
  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  // Cleanup navigation timer on unmount
  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current)
      }
    }
  }, [])

  // Compute validation errors for login
  const loginEmailError = loginTouched.email ? validateLoginEmail(email) : null
  const loginPasswordError = loginTouched.password ? validateLoginPassword(password) : null
  const isLoginFormValid = !validateLoginEmail(email) && !validateLoginPassword(password)

  // Compute validation errors for registration
  const nameError = registerTouched.name ? validateName(name) : null
  const regEmailError = registerTouched.email ? validateRegisterEmail(regEmail) : null
  const regPasswordError = registerTouched.password ? validateRegisterPassword(regPassword) : null
  const confirmPasswordError = registerTouched.confirmPassword 
    ? validateConfirmPassword(regPassword, confirmPassword) 
    : null
  
  const passwordStrength = regPassword ? checkPasswordStrength(regPassword) : null
  const passwordRequirements = useMemo(() => getPasswordRequirements(regPassword), [regPassword])
  
  const isRegisterFormValid = !validateName(name) &&
    !validateRegisterEmail(regEmail) &&
    !validateRegisterPassword(regPassword) &&
    !validateConfirmPassword(regPassword, confirmPassword)

  // ============================================
  // Helper Functions
  // ============================================

  // Navigate user to appropriate dashboard after login
  const completeLogin = (data, fallbackRole) => {
    const roleValue = data?.role || fallbackRole || 'client'
    localStorage.setItem('tm_token', data.token)
    localStorage.setItem('tm_isAdmin', roleValue === 'admin' ? 'true' : 'false')
    localStorage.setItem('tm_role', roleValue)

    // Redirect based on role
    const roleRoutes = {
      admin: '/admin',
      hr: '/hr',
      manager: '/manager',
      developer: '/developer',
      designer: '/designer',
      tester: '/tester',
      client: '/client'
    }
    nav(roleRoutes[roleValue] || '/')
  }

  // Switch between login and register modes with animation
  const goToMode = (nextMode) => {
    if (nextMode === mode) return

    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current)
    }

    setMode(nextMode)

    // Update URL after animation completes
    navTimerRef.current = setTimeout(() => {
      nav(nextMode === 'register' ? '/register' : '/user/login')
    }, SLIDE_MS)
  }

  // ============================================
  // Form Submission Handlers
  // ============================================

  // Handle login form submission
  const submitLogin = async (e) => {
    e.preventDefault()
    setLoginTouched({ email: true, password: true })

    if (!isLoginFormValid) {
      setLoginError('Please fix the validation errors before submitting')
      return
    }

    setLoading(true)
    setLoginError(null)

    const trimmedEmail = email.trim()

    try {
      // Try user login first
      const userData = await apiFetch('/api/user/login', {
        method: 'POST',
        body: { email: trimmedEmail, password }
      })
      completeLogin(userData, userData.role)
    } catch (userErr) {
      const message = userErr?.message || ''
      
      // Handle account deactivation
      if (message === 'ACCOUNT_DEACTIVATED') {
        setLoginError('Your account has been deactivated. Please contact the administrator at admin@taskify.com for assistance.')
        setLoading(false)
        return
      }
      
      const shouldTryAdmin = message.includes('Invalid email or password') || 
                            message.includes('User not found')

      // Network error
      if (message === 'Failed to fetch') {
        setLoginError('Unable to reach server. Please ensure backend is running.')
        setLoading(false)
        return
      }

      // If user login failed, try admin login
      if (shouldTryAdmin) {
        try {
          const adminData = await apiFetch('/api/admin/login', {
            method: 'POST',
            body: { username: trimmedEmail, password }
          })
          completeLogin(adminData, 'admin')
        } catch (adminErr) {
          setLoginError(adminErr?.message || 'Invalid credentials')
          setLoading(false)
        }
      } else {
        setLoginError(message || 'Unable to sign in')
        setLoading(false)
      }
    }
  }

  // Handle registration form submission
  const submitRegister = async (e) => {
    e.preventDefault()

    if (regStep === 1) {
      // Step 1: Send OTP
      setRegisterTouched({ name: true, email: true, password: true, confirmPassword: true })

      if (!isRegisterFormValid) {
        setRegisterError('Please fix all validation errors')
        return
      }

      setSendingOtp(true)
      setRegisterError(null)

      try {
        const res = await apiFetch('/api/user/send-otp', {
          method: 'POST',
          body: {
            name: name.trim(),
            email: regEmail.trim(),
            role
          }
        })

        setOtpSent(true)
        setRegStep(2)
        setRegisterError(null)
      } catch (err) {
        setRegisterError(err.message || 'Failed to send OTP')
      } finally {
        setSendingOtp(false)
      }
    } else {
      // Step 2: Verify OTP and Register
      if (!otp || otp.trim().length !== 6) {
        setRegisterError('Please enter the 6-digit OTP sent to your email')
        return
      }

      setLoading(true)
      setRegisterError(null)

      try {
        const res = await apiFetch('/api/user/register', {
          method: 'POST',
          body: {
            name: name.trim(),
            email: regEmail.trim(),
            password: regPassword,
            role,
            otp: otp.trim()
          }
        })

        // Redirect to login after successful registration
        nav('/user/login')
      } catch (err) {
        setRegisterError(err.message || 'Registration failed. Please check your OTP.')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleResendOtp = async () => {
    setSendingOtp(true)
    setRegisterError(null)

    try {
      const res = await apiFetch('/api/user/send-otp', {
        method: 'POST',
        body: {
          name: name.trim(),
          email: regEmail.trim(),
          role
        }
      })

      setRegisterError(null)
      // Show success message temporarily
      const successMsg = res.message || 'OTP resent to your email!'
      setRegisterError(null)
      alert(successMsg)
    } catch (err) {
      setRegisterError(err.message || 'Failed to resend OTP')
    } finally {
      setSendingOtp(false)
    }
  }

  // ============================================
  // Render Component
  // ============================================

  const isRegisterMode = mode === 'register'

  return (
    <main className="page auth-page">
      {/* Home Button */}
      <div className="auth-home-btn">
        <button onClick={() => nav('/')} type="button">← Home</button>
      </div>

      <div className={`auth-container ${isRegisterMode ? 'active' : ''}`}>
        {/* ========== Login Form ========== */}
        <div className="auth-form-box login-box">
          <h2>Welcome Back</h2>
          <p className="auth-form-subtitle">Sign in to access your workspace</p>

          {loginError && !isRegisterMode && (
            <Message type="error">{loginError}</Message>
          )}

          <form className="auth-form" onSubmit={submitLogin} autoComplete="off">
            <input
              type="text"
              name="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setLoginTouched((prev) => ({ ...prev, email: true }))}
              className={loginTouched.email ? (loginEmailError ? 'invalid' : 'valid') : ''}
              autoComplete="username"
              placeholder="Email or Username"
            />
            {loginEmailError && <div className="validation-error">{loginEmailError}</div>}

            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setLoginTouched((prev) => ({ ...prev, password: true }))}
                className={loginTouched.password ? (loginPasswordError ? 'invalid' : 'valid') : ''}
                autoComplete="current-password"
                placeholder="Password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {loginPasswordError && <div className="validation-error">{loginPasswordError}</div>}

            <button 
              className="auth-submit-btn" 
              type="submit" 
              disabled={loading || !isLoginFormValid}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            {/* Forgot Password Button - Inside form, near login button */}
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 20px',
                marginTop: '12px',
                border: '2px solid transparent',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.12))',
                color: '#ef4444',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.15)',
                opacity: loading ? 0.6 : 1
              }}
              onMouseOver={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.2))';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.25)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                }
              }}
              onMouseOut={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.12))';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.borderColor = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: '16px', filter: 'drop-shadow(0 2px 4px rgba(239, 68, 68, 0.3))' }}>🔒</span>
              <span>Forgot Password?</span>
            </button>
          </form>
        </div>

        {/* ========== Register Form ========== */}
        <div className="auth-form-box register-box">
          <h2>Create Account</h2>
          <p className="auth-form-subtitle">
            {regStep === 1 ? 'Join TASKIFY to manage your projects' : 'Verify your email address'}
          </p>

          {registerError && isRegisterMode && (
            <Message type="error">{registerError}</Message>
          )}

          <form className="auth-form" onSubmit={submitRegister} autoComplete="off">
            {/* Anti-autofill hack */}
            <input type="text" name="_fake1" style={{ display: 'none' }} autoComplete="off" />
            <input type="password" name="_fake2" style={{ display: 'none' }} autoComplete="off" />

            {regStep === 1 ? (
              <>
                <input
                  name="name"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setRegisterTouched((prev) => ({ ...prev, name: true }))}
                  className={registerTouched.name ? (nameError ? 'invalid' : 'valid') : ''}
                  placeholder="Full Name"
                />
                {nameError && <div className="validation-error">{nameError}</div>}

                <input
                  name="email"
                  autoComplete="off"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  onBlur={() => setRegisterTouched((prev) => ({ ...prev, email: true }))}
                  className={registerTouched.email ? (regEmailError ? 'invalid' : 'valid') : ''}
                  placeholder="Email Address"
                />
                {regEmailError && <div className="validation-error">{regEmailError}</div>}

                <div className="password-input-wrapper">
                  <input
                    name="password"
                    autoComplete="new-password"
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    onBlur={() => setRegisterTouched((prev) => ({ ...prev, password: true }))}
                    className={registerTouched.password ? (regPasswordError ? 'invalid' : 'valid') : ''}
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {regPasswordError && <div className="validation-error">{regPasswordError}</div>}

                {/* Password Strength Indicator */}
                {regPassword && passwordStrength && (
                  <div className={`password-strength ${passwordStrength}`}>
                    <span className="password-strength-label">
                      Strength: {passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1)}
                    </span>
                    <div className="password-strength-bar">
                      <div className={`password-strength-fill ${passwordStrength}`}></div>
                    </div>
                  </div>
                )}

                {/* Password Requirements */}
                {regPassword && (
                  <div className="input-requirements">
                    <ul>
                      {passwordRequirements.map((req, idx) => (
                        <li key={idx} className={req.met ? 'met' : ''}>
                          {req.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => setRegisterTouched((prev) => ({ ...prev, confirmPassword: true }))}
                    className={registerTouched.confirmPassword ? (confirmPasswordError ? 'invalid' : 'valid') : ''}
                    placeholder="Confirm Password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {confirmPasswordError && <div className="validation-error">{confirmPasswordError}</div>}
                {!confirmPasswordError && confirmPassword && registerTouched.confirmPassword && (
                  <div className="validation-success">Passwords match</div>
                )}

                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)} 
                  className="role-select"
                >
                  <option value="developer">Developer</option>
                  <option value="designer">Designer</option>
                  <option value="tester">Tester</option>
                  <option value="client">Client</option>
                </select>

                <button 
                  className="auth-submit-btn" 
                  type="submit" 
                  disabled={sendingOtp || !isRegisterFormValid}
                >
                  {sendingOtp ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </>
            ) : (
              <>
                <div style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  marginBottom: '1rem',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    📧 OTP sent to:
                  </div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                    {regEmail}
                  </div>
                </div>

                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  style={{ 
                    fontSize: '1.5rem', 
                    letterSpacing: '0.5rem', 
                    textAlign: 'center',
                    fontWeight: '600'
                  }}
                />
                <div style={{ 
                  color: 'var(--text-muted)', 
                  fontSize: '0.85rem', 
                  marginTop: '-0.5rem',
                  marginBottom: '1rem',
                  textAlign: 'center' 
                }}>
                  Check your email inbox for the OTP code
                </div>

                <button 
                  className="auth-submit-btn" 
                  type="submit" 
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? 'Verifying...' : 'Verify & Register'}
                </button>

                <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
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
                      fontSize: '0.9rem',
                      padding: '0.5rem'
                    }}
                  >
                    {sendingOtp ? 'Resending...' : 'Resend OTP'}
                  </button>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setRegStep(1)
                      setOtp('')
                      setRegisterError(null)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      padding: '0.5rem'
                    }}
                  >
                    ← Change Email/Details
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        {/* ========== Overlay Panel ========== */}
        <div className="auth-overlay">
          {isRegisterMode ? (
            <>
              <h1>Welcome Back!</h1>
              <p>Already have an account?</p>
              <button 
                className="auth-overlay-btn" 
                onClick={() => goToMode('login')} 
                type="button"
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              <h1>Hello, Welcome!</h1>
              <p>Don't have an account?</p>
              <button 
                className="auth-overlay-btn" 
                onClick={() => goToMode('register')} 
                type="button"
              >
                Register
              </button>
            </>
          )}
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <ForgotPassword
          onClose={() => setShowForgotPassword(false)}
          onSuccess={() => {
            // Optional: You can show a success message or clear the login form
            setLoginError(null);
          }}
        />
      )}
    </main>
  )
}
