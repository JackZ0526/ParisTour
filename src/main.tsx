import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { AuthGate } from './components/AuthGate.tsx'
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
