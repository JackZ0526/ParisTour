import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthGate } from './features/auth/components/AuthGate'
import { GoogleMapsProvider } from './features/map/components/GoogleMapsProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <GoogleMapsProvider>
          <App />
        </GoogleMapsProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
