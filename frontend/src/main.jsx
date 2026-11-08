import React from 'react'
import ReactDOM from 'react-dom/client'
import { esES } from '@clerk/localizations';
import App from './App.jsx'
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'
import { capturarCobroDeUrl } from './config/linkCobro'
import { capturarDemoDeUrl } from './config/demo'
import { COBROS_QR_HABILITADOS } from './config/funcionalidades'

// Si se entró escaneando un QR de cobro (?cobro=<id>), se guarda el id antes de que Clerk o el
// onboarding se interpongan — ver config/linkCobro.js.
// Si además el QR es de la demo (?demo=<token>), se suma a esa demo antes de montar la app.
// Mientras el QR esté en "Próximamente" (config/funcionalidades.js), esos links se ignoran.
const sumandoseADemo = COBROS_QR_HABILITADOS ? capturarDemoDeUrl() : Promise.resolve()
if (COBROS_QR_HABILITADOS) capturarCobroDeUrl()

// Tomamos la clave que pusimos en el archivo .env
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Falta la clave VITE_CLERK_PUBLISHABLE_KEY en el archivo .env")
}

sumandoseADemo.finally(() => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} localization={esES} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </React.StrictMode>,
))