/**
 * Home: featured highlights followed by the searchable, filterable catalog.
 */
import { PageContainer } from '@/components/layout/page-container'
import { useDocumentTitle } from '@/lib/use-document-title'
import { CatalogSection } from './catalog-section'
import { HighlightsSection } from './highlights-section'

export function HomePage() {
  useDocumentTitle(null)
  return (
    <PageContainer className="grid gap-14">
      <HighlightsSection />
      <CatalogSection />
    </PageContainer>
  )
}
