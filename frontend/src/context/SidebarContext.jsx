import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const COLLAPSED_KEY = 'bituinsight_sidebar_collapsed';

const SidebarContext = createContext(null);

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const setCollapsed = useCallback((value) => {
    setCollapsedState(value);
    if (value) setMobileOpen(false);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((c) => !c);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        toggleCollapsed,
        mobileOpen,
        setMobileOpen,
        closeMobile,
        openMobile,
        toggleMobile,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
