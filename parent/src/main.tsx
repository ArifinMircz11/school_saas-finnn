import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../shared/src/ui/system.css';
import { ChildProvider } from './lib/ChildContext';
import App from './App';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20000 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={qc}><ChildProvider><BrowserRouter><App /></BrowserRouter></ChildProvider></QueryClientProvider></React.StrictMode>
);