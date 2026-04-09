import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// Import modular stylesheets in cascade order
import './styles/global.css'           // 1. Foundation: variables, resets, animations
import './styles/components.css'       // 2. Reusable: buttons, badges, cards, modals
import './styles/forms.css'           // 3. Forms: inputs, validation
import './styles/tables.css'          // 4. Tables: layouts, user management
import './styles/auth.css'            // 5. Pages: login/register
import './styles/home.css'            // 6. Pages: landing
import './styles/dashboard-common.css' // 7. Shared: dashboard base
import './styles/admin-dashboard.css' // 8. Specific: admin layouts
import './styles/user-dashboard.css'  // 9. Specific: user role layouts
import './styles/profile.css'         // 10. Pages: profile/settings
import './styles/chat.css'            // 11. Features: messaging
import './styles/manager-progress.css' // 12. Feature: manager progress tracker

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
