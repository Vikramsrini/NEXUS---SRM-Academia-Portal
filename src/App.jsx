import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AttendancePage from './pages/AttendancePage';
import MarksPage from './pages/MarksPage';
import TimetablePage from './pages/TimetablePage';
import CoursesPage from './pages/CoursesPage';
import CalendarPage from './pages/CalendarPage';
import SkipProPage from './pages/SkipProPage';
import ResourcesPage from './pages/ResourcesPage';
import CgpaPage from './pages/CgpaPage';

function isLoggedIn() {
  return !!localStorage.getItem('academia_token');
}

function ProtectedRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route path="/" element={<Login />} />

        {/* Dashboard (Overview) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Sub-pages inside Dashboard layout */}
        <Route
          path="/dashboard/attendance"
          element={
            <ProtectedRoute>
              <Dashboard><AttendancePage /></Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/skippro"
          element={
            <ProtectedRoute>
              <Dashboard><SkipProPage /></Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/marks"
          element={
            <ProtectedRoute>
              <Dashboard><MarksPage /></Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/timetable"
          element={
            <ProtectedRoute>
              <Dashboard><TimetablePage /></Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/courses"
          element={
            <ProtectedRoute>
              <Dashboard><CoursesPage /></Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/calendar"
          element={
            <ProtectedRoute>
              <Dashboard><CalendarPage /></Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/resources"
          element={
            <ProtectedRoute>
              <Dashboard><ResourcesPage /></Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/cgpa"
          element={
            <ProtectedRoute>
              <Dashboard><CgpaPage /></Dashboard>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
