import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (typeof document !== 'undefined') {
  const preventZoom = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
  let lastTouchEnd = 0;
  const preventDoubleTapZoom = (e: TouchEvent) => { const now = Date.now(); if (now - lastTouchEnd <= 350) e.preventDefault(); lastTouchEnd = now; };
  document.addEventListener('touchmove', preventZoom, { passive: false });
  document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
  document.addEventListener('gesturestart', (e: Event) => e.preventDefault());
  document.addEventListener('dblclick', (e: MouseEvent) => { if ((e.target as HTMLElement).closest('.game-screen')) e.preventDefault(); });
}
