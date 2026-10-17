import type { AvailabilityFilter, CatalogSort, Category, Network } from '@/api/contracts'

export const CATEGORY_LABELS: Record<Category, string> = {
  art: 'Arte',
  gaming: 'Games',
  music: 'Música',
  photography: 'Fotografia',
  collectibles: 'Colecionáveis',
}

export const SORT_LABELS: Record<CatalogSort, string> = {
  recent: 'Mais recentes',
  'price-asc': 'Menor preço',
  'price-desc': 'Maior preço',
  name: 'Nome (A–Z)',
}

export const AVAILABILITY_LABELS: Record<AvailabilityFilter, string> = {
  all: 'Todos',
  available: 'Disponíveis',
  'sold-out': 'Esgotados',
}

export const NETWORK_LABELS: Record<Network, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  base: 'Base',
}
