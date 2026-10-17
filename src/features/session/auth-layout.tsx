import type { ReactNode } from 'react'
import { PageContainer } from '@/components/layout/page-container'

export function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <PageContainer className="flex justify-center">
      <div className="grid w-full max-w-md gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </PageContainer>
  )
}
