import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth';
import { UiProvider } from './ui';
import App from './App';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <UiProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
