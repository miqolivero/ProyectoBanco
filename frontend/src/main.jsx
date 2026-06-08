import React from 'react'
import ReactDOM from 'react-dom/client'
import { esES } from '@clerk/localizations';
import App from './App.jsx'
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'

// Tomamos la clave que pusimos en el archivo .env
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Falta la clave VITE_CLERK_PUBLISHABLE_KEY en el archivo .env")
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} localization={esES} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)