import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API } from './api';


const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/auth/me`);
      const data = await res.json();
      setCustomer(data.customer ?? null);
    } catch {
      setCustomer(null); // servern svarar inte → visa som utloggad, krascha inte
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Servern tar bort cookien – React kan inte röra en httpOnly-cookie
  const logout = async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST' });
    } finally {
      setCustomer(null);
    }
  };

  return (
    <CustomerContext.Provider value={{ customer, loading, refresh, logout }}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  return useContext(CustomerContext);
}