import React, { useState } from 'react'

/**
 * ResetDatabaseDialog Component
 * Beautiful modal for selective database reset with multiple options
 */
export default function ResetDatabaseDialog({ isOpen, onClose, onConfirm }) {
  const [selectedOptions, setSelectedOptions] = useState({
    users: false,
    tasks: false,
    teams: false,
    messages: false,
    notifications: false
  })
  const [confirmText, setConfirmText] = useState('')
  const [step, setStep] = useState(1) // 1: select options, 2: confirm

  if (!isOpen) return null

  const hasSelection = Object.values(selectedOptions).some(v => v)
  const allSelected = Object.values(selectedOptions).every(v => v)

  const handleToggle = (key) => {
    setSelectedOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSelectAll = () => {
    const newValue = !allSelected
    setSelectedOptions({
      users: newValue,
      tasks: newValue,
      teams: newValue,
      messages: newValue,
      notifications: newValue
    })
  }

  const handleNext = () => {
    if (!hasSelection) return
    setStep(2)
  }

  const handleConfirm = () => {
    if (confirmText !== 'RESET') return
    onConfirm(selectedOptions)
    handleClose()
  }

  const handleClose = () => {
    setSelectedOptions({
      users: false,
      tasks: false,
      teams: false,
      messages: false,
      notifications: false
    })
    setConfirmText('')
    setStep(1)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content reset-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-icon">⚠️</div>
          <h2 className="modal-title">Reset Database</h2>
          <button className="modal-close" onClick={handleClose} aria-label="Close">
            ✕
          </button>
        </div>

        {step === 1 ? (
          <>
            {/* Step 1: Select Options */}
            <div className="modal-body">
              <p className="modal-description">
                Select which data you want to permanently delete from the database.
                Your admin account will remain intact.
              </p>

              <div className="reset-options">
                <div className="reset-option select-all">
                  <label className="reset-checkbox">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                    />
                    <span className="checkbox-custom"></span>
                    <div className="option-content">
                      <span className="option-title">Select All</span>
                      <span className="option-desc">Reset entire database</span>
                    </div>
                  </label>
                </div>

                <div className="reset-option">
                  <label className="reset-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedOptions.users}
                      onChange={() => handleToggle('users')}
                    />
                    <span className="checkbox-custom"></span>
                    <div className="option-content">
                      <span className="option-title">👥 Users</span>
                      <span className="option-desc">All HRs, Managers, Designers, Developers, Testers, and Clients</span>
                    </div>
                  </label>
                </div>

                <div className="reset-option">
                  <label className="reset-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedOptions.tasks}
                      onChange={() => handleToggle('tasks')}
                    />
                    <span className="checkbox-custom"></span>
                    <div className="option-content">
                      <span className="option-title">📋 Tasks</span>
                      <span className="option-desc">All tasks and projects</span>
                    </div>
                  </label>
                </div>

                <div className="reset-option">
                  <label className="reset-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedOptions.teams}
                      onChange={() => handleToggle('teams')}
                    />
                    <span className="checkbox-custom"></span>
                    <div className="option-content">
                      <span className="option-title">👨‍👩‍👧‍👦 Teams</span>
                      <span className="option-desc">All team data and associations</span>
                    </div>
                  </label>
                </div>

                <div className="reset-option">
                  <label className="reset-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedOptions.messages}
                      onChange={() => handleToggle('messages')}
                    />
                    <span className="checkbox-custom"></span>
                    <div className="option-content">
                      <span className="option-title">💬 Messages</span>
                      <span className="option-desc">All chat messages and conversations</span>
                    </div>
                  </label>
                </div>

                <div className="reset-option">
                  <label className="reset-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedOptions.notifications}
                      onChange={() => handleToggle('notifications')}
                    />
                    <span className="checkbox-custom"></span>
                    <div className="option-content">
                      <span className="option-title">🔔 Notifications</span>
                      <span className="option-desc">All system notifications</span>
                    </div>
                  </label>
                </div>
              </div>

              {!hasSelection && (
                <div className="warning-box">
                  <span className="warning-icon">ℹ️</span>
                  <span>Please select at least one option to continue</span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={handleClose}>
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleNext}
                disabled={!hasSelection}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Confirm */}
            <div className="modal-body">
              <div className="confirm-section">
                <div className="danger-alert">
                  <div className="alert-icon">⚠️</div>
                  <div className="alert-content">
                    <h3>This action cannot be undone!</h3>
                    <p>You are about to permanently delete:</p>
                  </div>
                </div>

                <ul className="selected-items">
                  {selectedOptions.users && <li>✓ All Users</li>}
                  {selectedOptions.tasks && <li>✓ All Tasks & Projects</li>}
                  {selectedOptions.teams && <li>✓ All Teams</li>}
                  {selectedOptions.messages && <li>✓ All Messages</li>}
                  {selectedOptions.notifications && <li>✓ All Notifications</li>}
                </ul>

                <div className="confirm-input-group">
                  <label htmlFor="confirmText">
                    Type <strong>RESET</strong> to confirm:
                  </label>
                  <input
                    id="confirmText"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type RESET"
                    autoComplete="off"
                    className="confirm-input"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setStep(1)}>
                Back
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleConfirm}
                disabled={confirmText !== 'RESET'}
              >
                Confirm Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
