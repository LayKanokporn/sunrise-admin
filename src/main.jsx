// [LOG] entry — main.jsx mounts QueryClient + App
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30_000,     // polling 30s — กึ่ง realtime
      refetchOnWindowFocus: true,
      staleTime: 10_000,
      retry: 1
    }
  }
});

console.log('[INFO] [main] mounting app');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
