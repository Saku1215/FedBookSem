import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('fedbooksem_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
  }, []);

  function login(userData) {
    setUser(userData);
    localStorage.setItem('fedbooksem_user', JSON.stringify(userData));
    localStorage.setItem('fedbooksem_token', userData.token);
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('fedbooksem_user');
    localStorage.removeItem('fedbooksem_token');
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
