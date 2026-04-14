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
import WordlePage from './pages/WordlePage';
import PageTransition from './components/PageTransition';
import './animations.css';

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
          <Route path="attendance" element={<PageTransition><AttendancePage /></PageTransition>} />
          <Route path="skippro" element={<PageTransition><SkipProPage /></PageTransition>} />
          <Route path="marks" element={<PageTransition><MarksPage /></PageTransition>} />
          <Route path="timetable" element={<PageTransition><TimetablePage /></PageTransition>} />
          <Route path="courses" element={<PageTransition><CoursesPage /></PageTransition>} />
          <Route path="calendar" element={<PageTransition><CalendarPage /></PageTransition>} />
          <Route path="resources" element={<PageTransition><ResourcesPage /></PageTransition>} />
          <Route path="cgpa" element={<PageTransition><CgpaPage /></PageTransition>} />
          <Route path="wordle" element={<PageTransition><WordlePage /></PageTransition>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
