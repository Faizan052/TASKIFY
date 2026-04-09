import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// ============================================
// Lazy Load Pages for Better Performance
// ============================================

// Authentication Pages
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const AdminRegister = lazy(() => import('./pages/AdminRegister'))
const UserLogin = lazy(() => import('./pages/UserLogin'))
const Register = lazy(() => import('./pages/Register'))
const Home = lazy(() => import('./pages/Home'))

// Admin Pages
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminProfile = lazy(() => import('./pages/AdminProfile'))
const ManageHrs = lazy(() => import('./pages/ManageHrs'))

// Role-Specific Dashboards
const HRDashboard = lazy(() => import('./pages/HRDashboard'))
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'))
const ManagerTrackProgress = lazy(() => import('./pages/ManagerTrackProgress'))
const DeveloperDashboard = lazy(() => import('./pages/DeveloperDashboard'))
const DesignerDashboard = lazy(() => import('./pages/DesignerDashboard'))
const TesterDashboard = lazy(() => import('./pages/TesterDashboard'))
const ClientDashboard = lazy(() => import('./pages/ClientDashboard'))

// User Pages
const UserProfile = lazy(() => import('./pages/UserProfile'))
const SubmitRequest = lazy(() => import('./pages/SubmitRequest'))

// ============================================
// Protected Route Component
// ============================================

/**
 * PrivateRoute - Protects routes that require authentication
 * @param {React.ReactNode} children - Component to render if authenticated
 * @param {boolean} adminOnly - Only allow admin access
 * @param {boolean} disallowAdmin - Prevent admin access (for user-only routes)
 */
function PrivateRoute({ children, adminOnly, disallowAdmin }) {
  const token = localStorage.getItem('tm_token')
  const isAdmin = localStorage.getItem('tm_isAdmin') === 'true'
  
  // Redirect to login if no token
  if (!token) {
    return <Navigate to={adminOnly ? '/admin/login' : '/user/login'} />
  }
  
  // Redirect non-admins away from admin routes
  if (adminOnly && !isAdmin) {
    return <Navigate to='/' />
  }
  
  // Redirect admins away from user-only routes
  if (disallowAdmin && isAdmin) {
    return <Navigate to='/admin' />
  }
  
  return children
}

// ============================================
// Main App Component
// ============================================

export default function App() {
  return (
    <div>
      <Suspense fallback={null}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/register" element={<AdminRegister />} />
          <Route path="/user/login" element={<UserLogin />} />
          <Route path="/register" element={<Register />} />
          
          {/* Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <PrivateRoute adminOnly>
                <AdminDashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/admin/profile" 
            element={
              <PrivateRoute adminOnly>
                <AdminProfile />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/admin/manage-hrs" 
            element={
              <PrivateRoute adminOnly>
                <ManageHrs />
              </PrivateRoute>
            } 
          />
          
          {/* Role-Based Dashboards */}
          <Route 
            path="/hr" 
            element={
              <PrivateRoute>
                <HRDashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/manager" 
            element={
              <PrivateRoute>
                <ManagerDashboard />
              </PrivateRoute>
            } 
          />
          <Route
            path="/manager/track/:mode/:id"
            element={
              <PrivateRoute>
                <ManagerTrackProgress />
              </PrivateRoute>
            }
          />
          <Route 
            path="/developer" 
            element={
              <PrivateRoute>
                <DeveloperDashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/designer" 
            element={
              <PrivateRoute>
                <DesignerDashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/tester" 
            element={
              <PrivateRoute>
                <TesterDashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/client" 
            element={
              <PrivateRoute>
                <ClientDashboard />
              </PrivateRoute>
            } 
          />
          
          {/* User Routes */}
          <Route 
            path="/request/new" 
            element={
              <PrivateRoute>
                <SubmitRequest />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <PrivateRoute disallowAdmin>
                <UserProfile />
              </PrivateRoute>
            } 
          />
        </Routes>
      </Suspense>
    </div>
  )
}
