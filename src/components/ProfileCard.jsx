import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

async function resizePhoto(file, banner) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw Error('Choose a JPG, PNG, or WebP image under 8 MB.');
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('Unable to read this image.')); reader.readAsDataURL(file);
  });
  {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = banner ? 1200 : 320; canvas.height = banner ? 360 : 320;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eef2f6'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
    ctx.drawImage(img, (canvas.width - img.width * scale) / 2, (canvas.height - img.height * scale) / 2, img.width * scale, img.height * scale);
    const result = canvas.toDataURL('image/jpeg', .8);
    if (result.length > 500000) throw Error('This image is too detailed. Choose a smaller image.');
    return result;
  }
}

export default function ProfileCard({ profileId, accountId, editable = false, compact = false }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let alive = true;
    const load = () => api(`/profiles/${profileId}`, { accountId }).then(data => { if (alive) setProfile(data); }).catch(e => { if (alive) setError(e.message); });
    void load();
    if (!editable) window.addEventListener('quoteflow-profile-change', load);
    return () => { alive = false; window.removeEventListener('quoteflow-profile-change', load); };
  }, [profileId, accountId, editable]);
  async function choose(file, field) {
    if (!file || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { const image = await resizePhoto(file, field === 'banner'); setProfile(p => ({ ...p, [field]: image })); }
    catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={`profile-card ${compact ? 'profile-compact' : ''}`} aria-label={editable ? 'Edit profile' : 'Profile'}>
    {error && <p className="error" role="alert">{error}</p>}
    {!profile ? <p className="muted">Loading profile…</p> : <>
      <div className="profile-banner">{profile.banner && <img src={profile.banner} alt="" />}</div>
      <div className="profile-body"><div className="profile-avatar">{profile.avatar ? <img src={profile.avatar} alt={`${profile.name} profile`} /> : <span aria-hidden="true">{profile.name.slice(0, 2).toUpperCase()}</span>}</div><h3>{profile.name}</h3><p className="profile-rating"><span aria-hidden="true">★ </span>{profile.rating.count ? `${profile.rating.average.toFixed(1)} / 5 · ${profile.rating.count} rating${profile.rating.count === 1 ? '' : 's'}` : 'No ratings yet'}</p><small className="muted">Demo quote feedback</small>{profile.bio && <p className="profile-bio">{profile.bio}</p>}
      {editable && <form onSubmit={async e => { e.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError(''); setNotice(''); try { await api('/profile', { method: 'PATCH', accountId, body: { bio: profile.bio, avatar: profile.avatar, banner: profile.banner } }); setNotice('Profile saved.'); window.dispatchEvent(new Event('quoteflow-profile-change')); } catch (e) { setError(e.message); } finally { pending.current = false; setBusy(false); } }}><fieldset disabled={busy}>
        <label htmlFor="profile-photo">Profile picture</label><input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void choose(e.target.files[0], 'avatar'); e.target.value = ''; }} />{profile.avatar && <button type="button" className="text-button" onClick={() => setProfile(p => ({ ...p, avatar: '' }))}>Remove photo</button>}
        <label htmlFor="profile-banner">Banner image</label><input id="profile-banner" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void choose(e.target.files[0], 'banner'); e.target.value = ''; }} />{profile.banner && <button type="button" className="text-button" onClick={() => setProfile(p => ({ ...p, banner: '' }))}>Remove banner</button>}
        <p className="muted">Images are center-cropped. Preview above, then save. Business profiles are visible to signed-in customers; customer profiles are visible to businesses they request quotes from.</p>
        <label htmlFor="profile-bio">About {profile.role === 'business' ? 'your business' : 'you'}</label><textarea id="profile-bio" maxLength={300} value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} /><button>{busy ? 'Saving…' : 'Save profile'}</button>
      </fieldset><p role="status">{notice}</p></form>}
      </div>
    </>}
  </section>;
}
