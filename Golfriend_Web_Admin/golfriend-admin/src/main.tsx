import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n/I18nProvider.tsx'
import { LocaleSwitcher } from './i18n/LocaleSwitcher.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {/* Interim app-wide language control; relocates into the admin shell header in a later slice. */}
      <LocaleSwitcher style={{ position: 'fixed', top: '8px', right: '8px', zIndex: 9999 }} />
      <App />
    </I18nProvider>
  </StrictMode>,
)
