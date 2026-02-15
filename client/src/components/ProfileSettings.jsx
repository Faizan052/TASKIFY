import React, { useMemo, useState } from 'react';
import { apiFetch, resolveAssetUrl } from '../api';
import { getPreferredTheme, toggleTheme } from '../theme';
import ResetDatabaseDialog from './ResetDatabaseDialog';

const formatRoleLabel = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

const buildAvatarFallback = (nameOrEmail) => {
  const value = (nameOrEmail || '').trim();
  return value ? value.charAt(0).toUpperCase() : 'U';
};

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
  const [themeVersion, setThemeVersion] = useState(0);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const [basicForm, setBasicForm] = useState({
    name: '',
    phone: '',
    department: '',
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

  const themeLabel = useMemo(() => {
	void themeVersion;
    const current = (typeof document !== 'undefined' && document.documentElement.dataset.theme)
      ? document.documentElement.dataset.theme
      : getPreferredTheme();
    return current === 'dark' ? 'Dark' : 'Light';
  }, [themeVersion]);

  const canUpdatePassword = useMemo(() => {
    if (kind === 'admin') return true;
    if (!profile) return false;
    const role = profile.role;
    return role !== 'hr' && role !== 'manager';
  }, [profile, kind]);

  const basicEndpoint = kind === 'admin' ? '/api/admin/profile/basic' : '/api/user/profile/basic';
  const credentialsEndpoint = kind === 'admin' ? '/api/admin/credentials' : '/api/user/credentials';

  const openEdit = () => {
    setError('');
    setMessage('');
    setMode('edit');
    setBasicForm({
      name: kind === 'admin' ? (profile?.username || '') : (profile?.name || ''),
      phone: profile?.phone || '',
      department: profile?.department || '',
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

  const onToggleTheme = () => {
    setError('');
    const next = toggleTheme();
    setMessage(`Theme set to ${next === 'dark' ? 'Dark' : 'Light'}.`);
    setThemeVersion((v) => v + 1);
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

  if (!profile) {
    return (
      <section className={`profile-shell ${className}`.trim()}>
        <div className="card">Loading profile...</div>
      </section>
    );
  }

  return (
    <section className={`profile-shell ${className}`.trim()}>
      {message && <div className="notice notice-success">{message}</div>}
      {error && <div className="notice notice-error">{error}</div>}

      {(view === 'profile' || view === 'both') && (
        <div className="profile-screen">
          <div className="profile-banner" aria-hidden />

          <div className="profile-hero">
            <div className="profile-hero-avatar" aria-hidden>
              {photoUrl ? (
                <img src={photoUrl} alt="Profile" />
              ) : (
                <span>{buildAvatarFallback(displayName || email)}</span>
              )}
            </div>

            <div className="profile-hero-meta">
              <div className="profile-hero-row">
                <h2 className="profile-hero-name">{displayName}</h2>
                <span className="profile-role-pill">{roleLabel || '—'}</span>
              </div>
              <div className="profile-hero-sub">
                <span className="profile-hero-email">{email || '—'}</span>
                {joinedLabel ? <span className="profile-hero-joined">Member since {joinedLabel}</span> : null}
              </div>
            </div>
          </div>

          <div className="profile-panels">
            <div className="profile-panel">
              <h3 className="profile-panel-title">Profile</h3>
              <div className="profile-fields">
                <div className="profile-field"><span className="k">{primaryNameLabel}</span><span className="v">{displayName || '—'}</span></div>
                <div className="profile-field"><span className="k">Role</span><span className="v">{roleLabel || '—'}</span></div>
                <div className="profile-field"><span className="k">Email</span><span className="v">{email || '—'}</span></div>
              </div>
            </div>

            <div className="profile-panel">
              <h3 className="profile-panel-title">Contact</h3>
              <div className="profile-fields">
                <div className="profile-field"><span className="k">Phone</span><span className="v">{profile.phone || '—'}</span></div>
                <div className="profile-field"><span className="k">Department</span><span className="v">{profile.department || '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(view === 'settings' || view === 'both') && (
        <div className="settings-card">
          <h3 className="settings-title">Settings</h3>
          <div className="settings-actions">
            <button className="btn" onClick={openEdit}>Edit Profile</button>
            <button className="btn btn-outline" onClick={openCredentials}>Update Login Credentials</button>
            <button className="btn btn-outline" onClick={onToggleTheme}>Theme: {themeLabel}</button>
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
            <form className="settings-panel" onSubmit={saveBasic}>
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
              </div>
              <div className="settings-footer">
                <button className="btn" disabled={savingBasic}>{savingBasic ? 'Saving...' : 'Save'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setMode('view')} disabled={savingBasic}>Cancel</button>
              </div>
            </form>
          )}

          {mode === 'credentials' && (
            <div className="settings-panel">
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
