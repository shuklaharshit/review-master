import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { TooltipProvider } from './components/ui/Tooltip'
import { ToastProvider, Toaster } from './components/ui/Toaster'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 }
  }
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider swipeDirection="right">
          <App />
          <Toaster />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
