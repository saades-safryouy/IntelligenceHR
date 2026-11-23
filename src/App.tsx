import { PreferencesProvider } from './app/preferences'
import { AuthProvider } from './contexts/AuthContext'
import { AppRoutes } from './routes/AppRoutes'
import './App.css'
import './styles.css'

export default function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <AppRoutes />
      </PreferencesProvider>
    </AuthProvider>
  )
}
