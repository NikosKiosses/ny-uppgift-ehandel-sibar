import { createContext, useContext, useState } from 'react';
import { API } from './api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('isAdmin') === 'true');

  const login = async (email, password) => {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.meddelande === 'Inloggning lyckades' && data.admin) {
      localStorage.setItem('isAdmin', 'true');
      setIsAdmin(true);
      return { success: true };
    } else if (data.meddelande === 'Inloggning lyckades' && !data.admin) {
      return { success: false, error: 'Endast admin kan logga in här' };
    } else {
      return { success: false, error: 'Fel email eller lösenord' };
    }
  };

  const logout = () => {
    localStorage.removeItem('isAdmin');
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}