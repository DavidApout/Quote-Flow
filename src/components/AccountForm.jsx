import { useState } from 'react';
import { api } from '../lib/api';

export default function AccountForm({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('customer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveredCode, setRecoveredCode] = useState('');
  function switchMode(next) { setMode(next); setError(''); }
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      const result = await api(`/auth/${mode}`, { method: 'POST', body: { ...values, role } });
      if (mode === 'recover') setRecoveredCode(result.recoveryCode);
      else onSignedIn(result);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  if (recoveredCode) return <RecoveryCode code={recoveredCode} onDone={() => { setRecoveredCode(''); switchMode('login'); }} message="Password reset. Save your new recovery code, then sign in. Your old code no longer works." />;
  return <section className="panel account-panel">
    <p className="eyebrow">YOUR IDEAS. YOUR SPACE.</p>
    <h2>{mode === 'register' ? 'Create your account' : mode === 'recover' ? 'Recover your account' : 'Welcome back'}</h2>
    <p className="muted">{mode === 'recover' ? 'Use the recovery code you saved when you created your account.' : 'Keep your services and quotes together, wherever you work.'}</p>
    <form key={mode} onSubmit={submit}>
      <fieldset disabled={busy}>
        {mode === 'register' && <><label htmlFor="account-role">I’m here as a</label><select id="account-role" value={role} onChange={event => setRole(event.target.value)}><option value="customer">Customer — request quotes</option><option value="business">Business owner — offer services</option></select><label htmlFor="account-name">Your name</label><input id="account-name" name="name" autoComplete="name" maxLength={100} required />{role === 'business' && <><label htmlFor="business-name">Business name</label><input id="business-name" name="businessName" autoComplete="organization" maxLength={100} required /><p className="muted">Customers will see this name when choosing a business.</p></>}</>}
        <label htmlFor="account-email">Email</label><input id="account-email" name="email" type="email" autoComplete="email" maxLength={254} required />
        {mode === 'recover' && <><label htmlFor="recovery-code">Recovery code</label><input id="recovery-code" name="recoveryCode" autoComplete="off" required maxLength={100} /></>}
        <label htmlFor="account-password">{mode === 'recover' ? 'New password' : 'Password'}</label><input id="account-password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 15} maxLength={128} required />
        {mode !== 'login' && <p className="muted">Use 15–128 characters. A memorable passphrase works well.</p>}
        <button type="submit">{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'recover' ? 'Reset password' : 'Sign in'}</button>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    <div className="account-links">{mode === 'login' ? <><button className="secondary" disabled={busy} onClick={() => switchMode('register')}>Create an account</button><button className="text-button" disabled={busy} onClick={() => switchMode('recover')}>Forgot password?</button></> : <button className="secondary" disabled={busy} onClick={() => switchMode('login')}>Back to sign in</button>}</div>
  </section>;
}

export function RecoveryCode({ code, onDone, message = 'Save this private recovery code somewhere safe. You’ll need it if you forget your password.' }) {
  return <section className="panel account-panel"><p className="eyebrow">KEEP YOUR ACCOUNT ACCESSIBLE</p><h2>Save your recovery code</h2><p className="muted">{message}</p><code className="recovery-code">{code}</code><p className="muted">This code is shown only once. Treat it like a password. Email recovery is not available yet.</p><button className="submit-request" onClick={onDone}>I’ve saved my code</button></section>;
}
