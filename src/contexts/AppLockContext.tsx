import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";

const BG_TIMESTAMP_KEY = "inkota_bg_at";
const LOCK_TIMEOUT_MS = 15_000; // 15s — within the 10–30s window

interface AppLockContextType {
  locked: boolean;
  unlock: () => void;
  lockNow: () => void;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export const AppLockProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const wasUserRef = useRef(false);

  const lockNow = useCallback(() => setLocked(true), []);
  const unlock = useCallback(() => {
    setLocked(false);
    sessionStorage.removeItem(BG_TIMESTAMP_KEY);
  }, []);

  // When a user signs in for the first time (fresh login), they are already unlocked.
  // When they sign out, reset lock state.
  useEffect(() => {
    if (user && !wasUserRef.current) {
      // fresh login — start unlocked
      setLocked(false);
      sessionStorage.removeItem(BG_TIMESTAMP_KEY);
    }
    if (!user) {
      setLocked(false);
      sessionStorage.removeItem(BG_TIMESTAMP_KEY);
    }
    wasUserRef.current = !!user;
  }, [user]);

  // Lock immediately when app goes background; on return, lock if elapsed > timeout.
  useEffect(() => {
    if (!user) return;

    const onHidden = () => {
      sessionStorage.setItem(BG_TIMESTAMP_KEY, Date.now().toString());
    };

    const onVisible = () => {
      const ts = parseInt(sessionStorage.getItem(BG_TIMESTAMP_KEY) || "0", 10);
      if (ts && Date.now() - ts >= LOCK_TIMEOUT_MS) {
        setLocked(true);
      }
      sessionStorage.removeItem(BG_TIMESTAMP_KEY);
    };

    const handleVisibility = () => {
      if (document.hidden) onHidden();
      else onVisible();
    };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", onHidden);
    window.addEventListener("focus", onVisible);

    // Capacitor native lifecycle
    let removeNative: (() => void) | null = null;
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/app").then(({ App }) => {
        const handle = App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) onHidden();
          else onVisible();
        });
        removeNative = () => {
          handle.then((h) => h.remove());
        };
      }).catch(() => {});
    }

    // If the page was reloaded while a bg timestamp existed and enough time has passed → lock
    const ts = parseInt(sessionStorage.getItem(BG_TIMESTAMP_KEY) || "0", 10);
    if (ts && Date.now() - ts >= LOCK_TIMEOUT_MS) {
      setLocked(true);
    }

    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", onHidden);
      window.removeEventListener("focus", onVisible);
      removeNative?.();
    };
  }, [user]);

  return (
    <AppLockContext.Provider value={{ locked, unlock, lockNow }}>
      {children}
    </AppLockContext.Provider>
  );
};

export const useAppLock = () => {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
};
