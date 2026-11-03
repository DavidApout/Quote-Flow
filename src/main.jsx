import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PaymentReturn from './components/PaymentReturn.jsx'
import App from './App.jsx'
import GuestPortal from './components/GuestPortal.jsx'
const guestPage = /^\/widget\/[\w-]+$/.test(window.location.pathname) || ['/track', '/verify-email'].includes(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {window.location.pathname === '/payment-return' ? <PaymentReturn /> : guestPage ? <GuestPortal /> : <App />}
  </StrictMode>,
)
