import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Layout/Navbar';
import LandingPage from './pages/LandingPage';
import BooksPage from './pages/BooksPage';
import BookPage from './pages/BookPage';
import PeoplePage from './pages/PeoplePage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import ReadingListPage from './pages/ReadingListPage';
// import FeedPage from './pages/FeedPage'; // removed 2026-08-23: social timeline dropped, file kept on disk

function Layout({ children }) {
  const { pathname } = useLocation();
  const showNav = pathname !== '/login';
  return (
    <>
      {showNav && <Navbar />}
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            {/* <Route path="/feed" element={<FeedPage />} /> removed 2026-08-23 */}
            <Route path="/feed" element={<Navigate to="/" replace />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:isbn" element={<BookPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/users/:username" element={<ProfilePage />} />
            <Route path="/users/:username/reading" element={<ReadingListPage />} />
            <Route path="/reading" element={<ReadingListPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
