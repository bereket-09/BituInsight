import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const COLLAPSED_KEY = 'coreinsight_sidebar_collapsed';
const LAYOUT_MODE_KEY = 'coreinsight_layout_mode';

const SidebarContext = createContext(null);

export function SidebarProvider({ children }) {
  const [layoutMode, setLayoutModeState] = useState(() => {
    try {
      return localStorage.getItem(LAYOUT_MODE_KEY) || 'top';
    } catch {
      return 'top';
    }
  });

  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiCopilotOpen, setAiCopilotOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_MODE_KEY, layoutMode);
    } catch {
      /* ignore */
    }
  }, [layoutMode]);

  const setLayoutMode = useCallback((mode) => {
    setLayoutModeState(mode);
  }, []);

  const toggleLayoutMode = useCallback(() => {
    setLayoutModeState((current) => (current === 'top' ? 'side' : 'top'));
  }, []);

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

  const openAiCopilot = useCallback(() => setAiCopilotOpen(true), []);
  const closeAiCopilot = useCallback(() => setAiCopilotOpen(false), []);
  const toggleAiCopilot = useCallback(() => setAiCopilotOpen((o) => !o), []);

  return (
    <SidebarContext.Provider
      value={{
        layoutMode,
        setLayoutMode,
        toggleLayoutMode,
        collapsed,
        setCollapsed,
        toggleCollapsed,
        mobileOpen,
        setMobileOpen,
        closeMobile,
        openMobile,
        toggleMobile,
        aiCopilotOpen,
        setAiCopilotOpen,
        openAiCopilot,
        closeAiCopilot,
        toggleAiCopilot,
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
