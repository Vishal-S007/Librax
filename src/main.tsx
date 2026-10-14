import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LibraryProvider } from '@/app/providers';
import { ToastProvider } from '@/components/ui/Toast';
import { getLibrary } from '@/app/library';
import '@/styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LibraryProvider library={getLibrary()}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LibraryProvider>
  </StrictMode>,
);
