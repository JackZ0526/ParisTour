import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GoogleMapsProvider } from './components/GoogleMapsProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleMapsProvider>
      <App />
    </GoogleMapsProvider>
  </StrictMode>,
)
