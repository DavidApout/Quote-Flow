import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PaymentReturn from './components/PaymentReturn.jsx'
import App from './App.jsx'
import GuestPortal from './components/GuestPortal.jsx'
import LegalPage from './components/LegalPage.jsx'
import LegalLinks from './components/LegalLinks.jsx'
import { legalPages } from './lib/legal.js'
import './legal.css'
const guestPage = /^\/widget\/[\w-]+$/.test(window.location.pathname) || ['/track', '/verify-email'].includes(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {legalPages.some(page => page.path === window.location.pathname) ? <LegalPage /> : window.location.pathname === '/payment-return' ? <PaymentReturn /> : guestPage ? <GuestPortal /> : <App />}
    <LegalLinks />
  </StrictMode>,
)
