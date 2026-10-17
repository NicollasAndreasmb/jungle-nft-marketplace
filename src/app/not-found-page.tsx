/**
 * Fallback for unknown routes.
 */
import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/layout/page-container'
import { useDocumentTitle } from '@/lib/use-document-title'

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada')
  return (
    <PageContainer>
      <h1 className="mb-6 text-3xl font-bold">Página não encontrada</h1>
      <EmptyState
        icon={Compass}
        title="Este endereço não existe"
        description="O link pode estar incorreto ou a página foi removida."
        action={
          <Button asChild>
            <Link to="/">Voltar ao catálogo</Link>
          </Button>
        }
      />
    </PageContainer>
  )
}
