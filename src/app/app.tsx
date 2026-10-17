/**
 * Provider composition: query client, realtime socket, tooltips and router.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RealtimeProvider } from '@/realtime/realtime-provider'
import { createQueryClient } from './query-client'
import { createAppRouter } from './router'

export function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(() => createAppRouter(queryClient))
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </RealtimeProvider>
    </QueryClientProvider>
  )
}
