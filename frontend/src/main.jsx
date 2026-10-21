import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import './workspace.css';
import './native.css';
import './landing-desktop.css';
import './flow-stage.css';

// The service worker can otherwise keep serving an older landing page after deployment.
// Refresh public pages when an updated worker takes control. Keep any typed form
// values and the room editor in place until the user navigates or reloads.
if (import.meta.env.PROD && import.meta.env.MODE !== 'android' && 'serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    const path = window.location.pathname;
    if (reloading || !['/', '/login', '/register'].includes(path)) return;
    if (path !== '/' && [...document.querySelectorAll('input')].some((input) => input.value)) return;
    reloading = true;
    window.location.reload();
  });

  const checkForUpdate = () => {
    navigator.serviceWorker.ready.then((registration) => registration.update()).catch(() => {});
  };
  window.addEventListener('load', checkForUpdate, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </React.StrictMode>,
);
