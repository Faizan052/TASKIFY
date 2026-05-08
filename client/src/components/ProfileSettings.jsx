import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, resolveAssetUrl } from '../api';
import { CATEGORY_OPTIONS, formatCategories } from '../utils/helpers';
import ResetDatabaseDialog from './ResetDatabaseDialog';

const formatRoleLabel = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

const buildAvatarFallback = (nameOrEmail) => {
  const value = (nameOrEmail || '').trim();
  return value ? value.charAt(0).toUpperCase() : 'U';
};

const ROLES_WITH_CATEGORY_EDIT = ['developer', 'designer', 'tester'];
const FLASH_MESSAGE_MS = 1500;

export default function ProfileSettings({
  kind = 'user',
  profile,
  onProfileUpdated,
  passwordDisabledMessage,
  view = 'both', // 'profile' | 'settings' | 'both'
  className = '',
}) {
  const [mode, setMode] = useState('view'); // view | edit | credentials
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);

  const [basicForm, setBasicForm] = useState({
    name: '',
    phone: '',
    department: '',
    categories: [],
    photoFile: null,
  });

  const [passwordForm, setPasswordForm] = useState({
    password: '',
  });

  const roleLabel = useMemo(() => {
    if (!profile) return '';
    if (kind === 'admin') return 'Admin';
    return formatRoleLabel(profile.role);
  }, [profile, kind]);

  const displayName = useMemo(() => {
    if (!profile) return '';
    if (kind === 'admin') return profile.username || profile.email || 'Admin';
    return profile.name || profile.email || 'User';
  }, [profile, kind]);

  const primaryNameLabel = useMemo(() => (kind === 'admin' ? 'Username' : 'Name'), [kind]);

  const email = useMemo(() => {
    if (!profile) return '';
    return profile.email || '';
  }, [profile]);

  const photoPath = useMemo(() => {
    if (!profile) return '';
    return profile.profilePhoto || '';
  }, [profile]);

  const photoUrl = useMemo(() => {
    if (!photoPath) return '';
    return resolveAssetUrl(photoPath);
  }, [photoPath]);

  const joinedLabel = useMemo(() => {
    if (!profile || !profile.createdAt) return '';
    try {
      return new Date(profile.createdAt).toLocaleDateString();
    } catch {
      return '';
    }
  }, [profile]);

  const canUpdatePassword = useMemo(() => {
    if (kind === 'admin') return true;
    if (!profile) return false;
    const role = profile.role;
    return role !== 'hr' && role !== 'manager';
  }, [profile, kind]);

  const basicEndpoint = kind === 'admin' ? '/api/admin/profile/basic' : '/api/user/profile/basic';
  const credentialsEndpoint = kind === 'admin' ? '/api/admin/credentials' : '/api/user/credentials';
  const canEditCategories = kind !== 'admin' && ROLES_WITH_CATEGORY_EDIT.includes((profile?.role || '').toLowerCase());

  const profileCategories = useMemo(() => {
    if (Array.isArray(profile?.categories) && profile.categories.length > 0) {
      return profile.categories;
    }
    if (profile?.category) {
      return [profile.category];
    }
    return [];
  }, [profile]);

  const toggleCategory = (categoryValue) => {
    setBasicForm((prev) => {
      const current = Array.isArray(prev.categories) ? prev.categories : [];
      if (current.includes(categoryValue)) {
        return { ...prev, categories: current.filter((item) => item !== categoryValue) };
      }
      return { ...prev, categories: [...current, categoryValue] };
    });
  };

  const openEdit = () => {
    setError('');
    setMessage('');
    setMode('edit');
    setBasicForm({
      name: kind === 'admin' ? (profile?.username || '') : (profile?.name || ''),
      phone: profile?.phone || '',
      department: profile?.department || '',
      categories: profileCategories,
      photoFile: null,
    });
  };

  const openCredentials = () => {
    setError('');
    setMessage('');
    setMode('credentials');
    setPasswordForm({ password: '' });
  };

  const saveBasic = async (e) => {
    e.preventDefault();
    setSavingBasic(true);
    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      if (typeof basicForm.name === 'string') {
        formData.append(kind === 'admin' ? 'username' : 'name', basicForm.name);
      }
      formData.append('phone', typeof basicForm.phone === 'string' ? basicForm.phone : '');
      formData.append('department', typeof basicForm.department === 'string' ? basicForm.department : '');
      if (canEditCategories) {
        if (!Array.isArray(basicForm.categories) || basicForm.categories.length === 0) {
          throw new Error('Please select at least one category.');
        }
        formData.append('categories', JSON.stringify(basicForm.categories));
      }
      if (basicForm.photoFile) {
        formData.append('profilePhoto', basicForm.photoFile);
      }

      const updated = await apiFetch(basicEndpoint, { method: 'PUT', body: formData });
      setMessage('Profile saved successfully.');
      setMode('view');
      if (typeof onProfileUpdated === 'function') {
        await onProfileUpdated(updated);
      }
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSavingBasic(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setSavingPassword(true);
    setError('');
    setMessage('');

    try {
      if (!passwordForm.password || passwordForm.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      const updated = await apiFetch(credentialsEndpoint, { method: 'PUT', body: { password: passwordForm.password } });
      setMessage((updated && updated.message) ? updated.message : 'Password updated successfully.');
      setMode('view');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  const onResetDatabase = async (selectedOptions) => {
    setResetting(true);
    setError('');
    setMessage('');

    try {
      const result = await apiFetch('/api/admin/reset-database', { 
        method: 'POST',
        body: { options: selectedOptions }
      });
      setMessage(result.message || 'Database reset successfully!');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to reset database');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), FLASH_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), FLASH_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [error]);

  if (!profile) {
    return (
      <section className={`profile-shell ${className}`.trim()}>
        <div className="card">Loading profile...</div>
      </section>
    );
  }

  return (
    <section className={`profile-shell profile-shell-glass ${className}`.trim()}>
      {message && <div className="notice notice-success">{message}</div>}
      {error && <div className="notice notice-error">{error}</div>}

      {(view === 'profile' || view === 'both') && (
        <div className="profile-screen glass-surface">
          <div className="profile-banner">
            <div className="profile-banner-content">
              <div className="profile-banner-left">
                <div className="profile-banner-avatar">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Profile" />
                  ) : (
                    <span>{buildAvatarFallback(displayName || email)}</span>
                  )}
                </div>
                <div className="profile-banner-meta">
                  <div className="profile-banner-name">{displayName || '—'}</div>
                </div>
              </div>
              <div className="profile-banner-right">
                <div className="profile-banner-role">{roleLabel || '—'}</div>
              </div>
            </div>
          </div>

          <div className="profile-panels">
            <div className="profile-panel glass-panel">
              <h3 className="profile-panel-title">Profile</h3>
              <div className="profile-fields">
                <div className="profile-field"><span className="k">{primaryNameLabel}</span><span className="v">{displayName || '—'}</span></div>
                <div className="profile-field"><span className="k">Role</span><span className="v">{roleLabel || '—'}</span></div>
                <div className="profile-field"><span className="k">Email</span><span className="v">{email || '—'}</span></div>
              </div>
            </div>

            <div className="profile-panel glass-panel">
              <h3 className="profile-panel-title">Contact</h3>
              <div className="profile-fields">
                <div className="profile-field"><span className="k">Phone</span><span className="v">{profile.phone || '—'}</span></div>
                <div className="profile-field"><span className="k">Department</span><span className="v">{profile.department || '—'}</span></div>
                {canEditCategories ? <div className="profile-field"><span className="k">Categories</span><span className="v">{formatCategories(profileCategories)}</span></div> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {(view === 'settings' || view === 'both') && (
        <div className="settings-card glass-surface">
          <h3 className="settings-title">Settings</h3>
          <div className="settings-hero">
            <div className="settings-hero-avatar">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile" />
              ) : (
                <span>{buildAvatarFallback(displayName || email)}</span>
              )}
            </div>
            <div className="settings-hero-meta">
              <div className="settings-hero-name">{displayName || '—'}</div>
              <div className="settings-hero-role">{roleLabel || '—'}</div>
              <div className="settings-hero-email">{email || '—'}</div>
            </div>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={openEdit}>Edit Profile</button>
            <button className="btn btn-outline" onClick={openCredentials}>Update Login Credentials</button>
            {kind === 'admin' && (
              <button 
                className="btn reset-db-btn" 
                onClick={() => setShowResetDialog(true)} 
                disabled={resetting}
              >
                <span className="btn-icon-left">⚠️</span>
                <span>{resetting ? 'Resetting Database...' : 'Reset Database'}</span>
                <span className="btn-shine"></span>
              </button>
            )}
          </div>

          {mode === 'edit' && (
            <form className="settings-panel glass-inset" onSubmit={saveBasic}>
              <h4 className="settings-panel-title">Edit Profile</h4>
              <div className="grid">
                <label>
                  {primaryNameLabel}
                  <input value={basicForm.name} onChange={(e) => setBasicForm((p) => ({ ...p, name: e.target.value }))} required />
                </label>
                <label>
                  Phone
                  <input value={basicForm.phone} onChange={(e) => setBasicForm((p) => ({ ...p, phone: e.target.value }))} placeholder="e.g. +92 300 1234567" />
                </label>
                <label>
                  Department
                  <input value={basicForm.department} onChange={(e) => setBasicForm((p) => ({ ...p, department: e.target.value }))} placeholder="e.g. Development" />
                </label>
                <label>
                  Profile Photo
                  <input type="file" accept="image/png,image/jpeg" onChange={(e) => setBasicForm((p) => ({ ...p, photoFile: e.target.files && e.target.files[0] ? e.target.files[0] : null }))} />
                </label>
                {canEditCategories ? (
                  <label style={{ gridColumn: '1 / -1' }}>
                    Categories
                    <div style={{
                      marginTop: '8px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '8px'
                    }}>
                      {CATEGORY_OPTIONS.map((option) => {
                        const checked = (basicForm.categories || []).includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleCategory(option.value)}
                            style={{
                              textAlign: 'left',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: checked ? '1px solid #667eea' : '1px solid #d1d5db',
                              background: checked ? 'rgba(102, 126, 234, 0.12)' : '#fff',
                              color: checked ? '#4338ca' : '#334155',
                              fontWeight: checked ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                      Selected: {formatCategories(basicForm.categories || [])}
                    </div>
                  </label>
                ) : null}
              </div>
              <div className="settings-footer">
                <button className="btn" disabled={savingBasic}>{savingBasic ? 'Saving...' : 'Save'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setMode('view')} disabled={savingBasic}>Cancel</button>
              </div>
            </form>
          )}

          {mode === 'credentials' && (
            <div className="settings-panel glass-inset">
              <h4 className="settings-panel-title">Update Login Credentials</h4>

              {!canUpdatePassword ? (
                <div className="notice notice-info">
                  {passwordDisabledMessage || 'You can’t update your password from here. Please contact your administrator.'}
                </div>
              ) : (
                <form onSubmit={savePassword}>
                  <div className="grid">
                    <label>
                      Email
                      <input value={email} readOnly />
                    </label>
                    <label>
                      New Password
                      <input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm({ password: e.target.value })} placeholder="Minimum 8 characters" required />
                    </label>
                  </div>
                  <div className="settings-footer">
                    <button className="btn" disabled={savingPassword}>{savingPassword ? 'Updating...' : 'Update Password'}</button>
                    <button type="button" className="btn btn-outline" onClick={() => setMode('view')} disabled={savingPassword}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      <ResetDatabaseDialog 
        isOpen={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onConfirm={onResetDatabase}
      />
    </section>
  );
}
