import ProfileCard from './ProfileCard';
import NotificationCenter from './NotificationCenter';
import WidgetSettings from './WidgetSettings';

export default function SettingsPage({ user, onBack, onOpenRequest, onSessionExpired }) {
  return <section className="settings-page">
    <div className="section-heading workspace-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Settings</h2><p className="muted">Account information, notifications, and website setup.</p></div><button className="secondary" onClick={onBack}>← Back to workspace</button></div>
    <ProfileCard profileId={user.id} accountId={user.id} editable />
    <div className="settings-grid">
      <section className="panel"><p className="eyebrow">ACCOUNT</p><h3>Your profile</h3><dl className="settings-profile"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Account type</dt><dd>{user.role === 'business' ? 'Business owner' : 'Customer'}</dd></div>{user.role === 'business' && <div><dt>Business</dt><dd>{user.businessName}</dd></div>}</dl><p className="muted">Update your picture, banner, and bio above. Names and email addresses are read-only in this demo.</p></section>
      <section className="panel"><p className="eyebrow">PREFERENCES</p><h3>Appearance & payments</h3><p className="muted">Use the Light mode / Dark mode button at the top of the page to change your theme. Your preference is saved on this browser.</p><div className="settings-callout"><span className="status paid">Sandbox only</span><p>PayPal checkout uses test money. No real money is collected.</p><small>Currency: USD · Payment status appears on each accepted quote.</small></div></section>
    </div>
    <section className="panel settings-notifications"><p className="eyebrow">KEEP IN TOUCH</p><h3>Notifications & email</h3><p className="muted">Open Notifications below to verify your email, review delivery status, or view local demo emails.</p><NotificationCenter user={user} onSessionExpired={onSessionExpired} onOpen={onOpenRequest} /></section>
    {user.role === 'business' && <WidgetSettings accountId={user.id} />}
  </section>;
}
