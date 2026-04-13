import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import { Analytics } from '@vercel/analytics/react';
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
      <Analytics />
      <Routes>
        {/* Login */}
        <Route path="/" element={<Login />} />

        {/* Dashboard Layout & Sub-pages */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        >
          {/* Default overview */}
          <Route index element={null} /> 
          
          {/* Sub-pages */}
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="skippro" element={<SkipProPage />} />
          <Route path="marks" element={<MarksPage />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="cgpa" element={<CgpaPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
