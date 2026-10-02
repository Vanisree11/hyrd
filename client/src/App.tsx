import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AgentProvider } from './hooks/useAgent';
import AppLayout from './layouts/AppLayout';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import FindJobs from './pages/FindJobs';
import AgentPage from './pages/AgentPage';
import Applications from './pages/Applications';
import ActivityPage from './pages/ActivityPage';
import ResumePage from './pages/ResumePage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-zinc-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AgentProvider><AppLayout /></AgentProvider>;
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Auth />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} /><Route path="jobs" element={<FindJobs />} /><Route path="agent" element={<AgentPage />} />
        <Route path="applications" element={<Applications />} /><Route path="activity" element={<ActivityPage />} />
        <Route path="resume" element={<ResumePage />} /><Route path="profile" element={<ProfilePage />} /><Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>);
}
