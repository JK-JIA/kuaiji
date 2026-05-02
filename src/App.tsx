import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { LedgerProvider } from './context/LedgerContext'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'

export default function App() {
  return (
    <LedgerProvider>
      <BrowserRouter>
        <div className="mx-auto min-h-dvh max-w-lg">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </div>
      </BrowserRouter>
    </LedgerProvider>
  )
}
