import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Layout/Navbar';
import FeedPage from './pages/FeedPage';
import BooksPage from './pages/BooksPage';
import BookPage from './pages/BookPage';
import PeoplePage from './pages/PeoplePage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';

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
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:isbn" element={<BookPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/users/:username" element={<ProfilePage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
