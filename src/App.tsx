import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppUpdateGate } from './components/AppUpdateGate'
import { AppTutorialGate } from './components/AppTutorialGate'
import { WelcomeOfferGate } from './components/WelcomeOfferGate'
import { BottomNav } from './components/BottomNav'
import { MainTabScrollToTop } from './components/MainTabScrollToTop'
import { AuthProvider } from './context/AuthContext'
import { LedgerProvider } from './context/LedgerContext'
import { useAuth } from './context/AuthContext'
import { BillExportPage } from './pages/importExport/BillExportPage'
import { BillImportPage } from './pages/importExport/BillImportPage'
import { ImportExportHubPage } from './pages/importExport/ImportExportHubPage'
import { ImportHistoryPage } from './pages/importExport/ImportHistoryPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'

function AuthGate({ children }: { children: React.ReactNode }) {
  const { apiBase, token } = useAuth()
  if (apiBase && !token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <LedgerProvider>
      <BrowserRouter>
        <AppUpdateGate />
        <AppTutorialGate />
        <WelcomeOfferGate />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <AuthGate>
                <div className="mx-auto min-h-dvh max-w-lg">
                  <MainTabScrollToTop />
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/stats" element={<StatsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route
                      path="/settings/import-export"
                      element={<ImportExportHubPage />}
                    />
                    <Route
                      path="/settings/import-export/export"
                      element={<BillExportPage />}
                    />
                    <Route
                      path="/settings/import-export/import"
                      element={<BillImportPage />}
                    />
                    <Route
                      path="/settings/import-export/history"
                      element={<ImportHistoryPage />}
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  <BottomNav />
                </div>
              </AuthGate>
            }
          />
        </Routes>
      </BrowserRouter>
      </LedgerProvider>
    </AuthProvider>
  )
}
