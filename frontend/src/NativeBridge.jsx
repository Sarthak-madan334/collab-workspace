import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Network } from '@capacitor/network';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { IS_ANDROID } from './native-session.js';

const API_ORIGIN = import.meta.env.VITE_SOCKET_URL;

export default function NativeBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const [networkState, setNetworkState] = useState('online');

  const retry = useCallback(async () => {
    if (!IS_ANDROID) return;
    const status = await Network.getStatus().catch(() => ({ connected: navigator.onLine }));
    if (!status.connected) { setNetworkState('offline'); return; }
    try {
      const response = await fetch(`${API_ORIGIN}/health/ready`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Service unavailable');
      setNetworkState('online');
      window.dispatchEvent(new Event('synkro:connectivity-restored'));
    } catch { setNetworkState('server'); }
  }, []);

  useEffect(() => {
    if (!IS_ANDROID) return;
    const workspace = location.pathname === '/dashboard' || location.pathname.startsWith('/rooms/');
    SystemBars.setStyle({ style: workspace ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    if (!IS_ANDROID) return undefined;
    document.body.classList.add('native-android');
    let disposed = false;
    const handles = [];
    const listen = async (plugin, event, callback) => {
      const handle = await plugin.addListener(event, callback);
      if (disposed) handle.remove(); else handles.push(handle);
    };
    listen(Network, 'networkStatusChange', (status) => {
      if (!status.connected) setNetworkState('offline');
      else retry();
    });
    listen(CapacitorApp, 'appStateChange', ({ isActive }) => {
      window.dispatchEvent(new Event(isActive ? 'synkro:resumed' : 'synkro:paused'));
      if (isActive) retry();
    });
    const onNetworkError = () => setNetworkState((state) => state === 'offline' ? state : 'server');
    const onApiSuccess = () => setNetworkState('online');
    const onExternalLink = (event) => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (!['https:', 'http:'].includes(url.protocol) || url.origin === window.location.origin) return;
      event.preventDefault();
      Browser.open({ url: url.href }).catch(() => { window.location.href = url.href; });
    };
    window.addEventListener('synkro:api-network-error', onNetworkError);
    window.addEventListener('synkro:api-success', onApiSuccess);
    document.addEventListener('click', onExternalLink, true);
    retry();
    return () => {
      disposed = true;
      handles.forEach((handle) => handle.remove());
      window.removeEventListener('synkro:api-network-error', onNetworkError);
      window.removeEventListener('synkro:api-success', onApiSuccess);
      document.removeEventListener('click', onExternalLink, true);
      document.body.classList.remove('native-android');
    };
  }, [retry]);

  useEffect(() => {
    if (!IS_ANDROID) return undefined;
    let disposed = false;
    let handle;
    CapacitorApp.addListener('backButton', () => {
      const dialogClose = document.querySelector('.modal-scrim .modal-close, .drawer-scrim .drawer-header button');
      if (dialogClose) { dialogClose.click(); return; }
      if (location.pathname.startsWith('/rooms/')) {
        if (document.querySelector('.room-page[data-unsaved="true"]') && !window.confirm('Leave this room? Unsaved changes may be lost.')) return;
        navigate('/dashboard');
      } else if (location.pathname === '/dashboard' || location.pathname === '/') {
        CapacitorApp.minimizeApp();
      } else {
        navigate('/');
      }
    }).then((listener) => { if (disposed) listener.remove(); else handle = listener; });
    return () => { disposed = true; handle?.remove(); };
  }, [location.pathname, navigate]);

  if (!IS_ANDROID || networkState === 'online') return null;
  return <div className="native-network-banner" role="status" aria-live="polite">
    <span>{networkState === 'offline' ? 'You’re offline. Reconnect to continue working together.' : 'The workspace server is unavailable. Keep this page open to preserve unsaved edits.'}</span>
    <button type="button" onClick={retry}>Retry</button>
  </div>;
}
