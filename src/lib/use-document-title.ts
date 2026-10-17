import { useEffect } from 'react'

const SUFFIX = 'Jungle NFT Marketplace'

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} | ${SUFFIX}` : SUFFIX
  }, [title])
}
