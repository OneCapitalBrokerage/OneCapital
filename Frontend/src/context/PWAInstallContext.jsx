import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const PWAInstallContext = createContext(null);

const isStandaloneDisplayMode = () => {
  if (typeof window === 'undefined') return false;
  const isStandaloneByMedia = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const isStandaloneOnIOS = window.navigator?.standalone === true;
  return isStandaloneByMedia || isStandaloneOnIOS;
};

export function PWAInstallProvider({ children }) {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
  const [isInstalling, setIsInstalling] = useState(false);
  const promptRef = useRef(null);

  useEffect(() => {
    // Capture the browser's install prompt before it disappears
    const onBeforeInstall = (e) => {
      e.preventDefault();
      promptRef.current = e;
      setCanInstall(true);
    };

    // Clear prompt once app is installed
    const onInstalled = () => {
      promptRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    const onDisplayModeChange = () => {
      setIsInstalled(isStandaloneDisplayMode());
    };

    let displayModeMedia = null;
    if (typeof window.matchMedia === 'function') {
      displayModeMedia = window.matchMedia('(display-mode: standalone)');
      if (typeof displayModeMedia.addEventListener === 'function') {
        displayModeMedia.addEventListener('change', onDisplayModeChange);
      } else if (typeof displayModeMedia.addListener === 'function') {
        displayModeMedia.addListener(onDisplayModeChange);
      }
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (displayModeMedia) {
        if (typeof displayModeMedia.removeEventListener === 'function') {
          displayModeMedia.removeEventListener('change', onDisplayModeChange);
        } else if (typeof displayModeMedia.removeListener === 'function') {
          displayModeMedia.removeListener(onDisplayModeChange);
        }
      }
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (isInstalling) return { status: 'busy' };
    if (isInstalled) return { status: 'installed' };
    if (!promptRef.current) return { status: 'unavailable' };

    setIsInstalling(true);
    try {
      const deferredPrompt = promptRef.current;
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      // The deferred prompt can only be used once.
      promptRef.current = null;
      setCanInstall(false);

      if (outcome === 'accepted') {
        setIsInstalled(true);
        return { status: 'accepted' };
      }

      return { status: 'dismissed' };
    } catch (error) {
      console.error('[PWA] Install prompt failed:', error);
      return { status: 'error' };
    } finally {
      setIsInstalling(false);
    }
  }, [isInstalled, isInstalling]);

  // Auto-trigger install if landing page linked here with ?install=true
  useEffect(() => {
    if (!canInstall) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('install') === 'true') {
      triggerInstall();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [canInstall, triggerInstall]);

  return (
    <PWAInstallContext.Provider value={{ canInstall, isInstalled, isInstalling, triggerInstall }}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export const usePWAInstall = () => useContext(PWAInstallContext);
