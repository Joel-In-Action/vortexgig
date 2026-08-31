import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import Admin from './pages/Admin'
import EmployerDashboard from './pages/EmployerDashboard'
import Landing from './pages/Landing'
import Leaderboard from './pages/Leaderboard'
import Login from './pages/Login'
import NewTask from './pages/NewTask'
import NotFound from './pages/NotFound'
import Register from './pages/Register'
import Settings from './pages/Settings'
import Submissions from './pages/Submissions'
import TaskDetail from './pages/TaskDetail'
import Tasks from './pages/Tasks'
import WorkerDashboard from './pages/WorkerDashboard'

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <span className="footer__mark">VORTEXGIG / {new Date().getFullYear()}</span>
        <span>Short briefs, visible payouts, no guesswork.</span>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <div className="app">
      <Navbar />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/tasks" element={<Tasks />} />
        <Route
          path="/tasks/new"
          element={
            <ProtectedRoute role="EMPLOYER">
              <NewTask />
            </ProtectedRoute>
          }
        />
        {/* The employer workspace links here; keep the old shape working. */}
        <Route path="/employer/tasks/new" element={<Navigate to="/tasks/new" replace />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute role="ADMIN">
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employer"
          element={
            <ProtectedRoute role="EMPLOYER">
              <EmployerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/worker"
          element={
            <ProtectedRoute role="WORKER">
              <WorkerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/submissions"
          element={
            <ProtectedRoute>
              <Submissions />
            </ProtectedRoute>
          }
        />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>

      <Footer />
    </div>
  )
}
