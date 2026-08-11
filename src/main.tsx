import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthGate } from './features/auth/components/AuthGate'
import { GoogleMapsProvider } from './components/GoogleMapsProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleMapsProvider>
      <AuthProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>
    </GoogleMapsProvider>
  </StrictMode>,
)
