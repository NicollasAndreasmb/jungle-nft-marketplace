/**
 * Deterministic seed data for the mock server: collections, NFTs with editions, coupons and
 * demo users. All credentials are fictitious and documented in the project README.
 * Passwords are only used at seed time to derive PBKDF2 hashes; plaintext is never persisted.
 */
import type { Category, Network, WalletProvider, WalletSlot } from '@/api/contracts'
import { multiplyEth, percentOfEth } from '@/lib/eth'

export interface EditionSeed {
  id: string
  name: string
  priceEth: string
  supply: number
  available: number
  maxPerOrder: number
}

export interface NftSeed {
  id: string
  name: string
  description: string
  category: Category
  collectionId: string
  creator: { name: string; handle: string }
  network: Network
  contractAddress: string
  createdAt: string
  featured: boolean
  editions: EditionSeed[]
}

export const COLLECTIONS = [
  { id: 'canopy-dreams', name: 'Canopy Dreams' },
  { id: 'pixel-fauna', name: 'Pixel Fauna' },
  { id: 'sonic-roots', name: 'Sonic Roots' },
  { id: 'lens-of-the-wild', name: 'Lens of the Wild' },
  { id: 'jungle-relics', name: 'Jungle Relics' },
  { id: 'neon-vines', name: 'Neon Vines' },
] as const

const COLLECTION_CATEGORY: Record<string, Category> = {
  'canopy-dreams': 'art',
  'pixel-fauna': 'gaming',
  'sonic-roots': 'music',
  'lens-of-the-wild': 'photography',
  'jungle-relics': 'collectibles',
  'neon-vines': 'art',
}

const CREATORS = [
  { name: 'Marina Aquino', handle: 'marinaaquino' },
  { name: 'Theo Bastos', handle: 'theobastos' },
  { name: 'Iara Duarte', handle: 'iaraduarte' },
  { name: 'Kenji Moraes', handle: 'kenjimoraes' },
  { name: 'Lia Fontes', handle: 'liafontes' },
  { name: 'Rafael Nunes', handle: 'rafaelnunes' },
]

const NAMES = [
  'Aurora na Copa', 'Jaguar de Pixel', 'Batida de Raiz', 'Orvalho Noturno', 'Relíquia de Jade', 'Vinha Elétrica',
  'Bromélia Solar', 'Tucano 8-bit', 'Pulso da Mata', 'Neblina no Rio', 'Totem Esmeralda', 'Circuito Selvagem',
  'Folhagem Prisma', 'Macaco Arcade', 'Tambor das Águas', 'Margem Dourada', 'Amuleto de Âmbar', 'Néon Botânico',
  'Clareira Lunar', 'Capivara Quest', 'Coro dos Grilos', 'Raízes Expostas', 'Moeda do Templo', 'Trepadeira Glitch',
  'Dossel em Chamas', 'Arara Speedrun', 'Eco da Cachoeira', 'Brilho de Musgo', 'Máscara Ancestral', 'Liana Fluorescente',
  'Semente Cósmica', 'Onça Boss Fight', 'Ritmo de Chuva', 'Contraluz Verde', 'Cálice de Obsidiana', 'Seiva Digital',
]

const PRICE_POINTS = ['0.018', '0.045', '0.08', '0.12', '0.25', '0.4', '0.65', '0.9', '1.2', '1.75', '2.4', '3.1']
const NETWORK_ROTATION: Network[] = ['ethereum', 'polygon', 'base']

function buildEditions(index: number): EditionSeed[] {
  const nftId = `nft-${String(index).padStart(3, '0')}`
  const basePrice = PRICE_POINTS[(index * 5) % PRICE_POINTS.length] ?? '0.1'
  const editionCount = 1 + (index % 3)
  const soldOutNft = index % 9 === 4
  const definitions = [
    { suffix: 'genesis', name: 'Edição Genesis', percent: 300, supply: 5, maxPerOrder: 1 },
    { suffix: 'standard', name: 'Edição Padrão', percent: 100, supply: 25, maxPerOrder: 5 },
    { suffix: 'open', name: 'Edição Aberta', percent: 50, supply: 100, maxPerOrder: 10 },
  ].slice(0, editionCount)

  return definitions.map((definition, editionIndex) => {
    const editionSoldOut = soldOutNft || (editionIndex === 0 && index % 4 === 1)
    return {
      id: `${nftId}-${definition.suffix}`,
      name: definition.name,
      priceEth: definition.percent > 100 ? multiplyEth(basePrice, definition.percent / 100) : percentOfEth(basePrice, definition.percent),
      supply: definition.supply,
      available: editionSoldOut ? 0 : Math.max(1, definition.supply - ((index * 3 + editionIndex) % definition.supply)),
      maxPerOrder: definition.maxPerOrder,
    }
  })
}

export const NFT_SEEDS: NftSeed[] = NAMES.map((name, position) => {
  const index = position + 1
  const collection = COLLECTIONS[position % COLLECTIONS.length] ?? COLLECTIONS[0]
  const creator = CREATORS[(position * 5) % CREATORS.length] ?? CREATORS[0]!
  const category = position % 7 === 6 ? 'collectibles' : (COLLECTION_CATEGORY[collection.id] ?? 'art')
  const createdAt = new Date(Date.UTC(2026, 0, 5) + position * 3 * 86_400_000).toISOString()
  return {
    id: `nft-${String(index).padStart(3, '0')}`,
    name,
    description: `${name} integra a coleção ${collection.name}, criada por ${creator.name}. Cada edição tem tiragem limitada e certificado de autenticidade registrado no contrato da coleção.`,
    category,
    collectionId: collection.id,
    creator,
    network: NETWORK_ROTATION[position % NETWORK_ROTATION.length] ?? 'ethereum',
    contractAddress: `0x${(0x5a17c0de + index * 0x1f3d).toString(16).padStart(8, '0')}${'0'.repeat(28)}${String(index).padStart(4, '0')}`,
    createdAt,
    featured: [1, 8, 14, 26].includes(index),
    editions: buildEditions(index),
  }
})

export interface CouponSeed {
  code: string
  description: string
  percentOff: number
  expiresAt: string
}

export const COUPON_SEEDS: CouponSeed[] = [
  { code: 'JUNGLE10', description: '10% de desconto no subtotal', percentOff: 10, expiresAt: '2099-12-31T23:59:59.000Z' },
  { code: 'GENESIS25', description: '25% de desconto no subtotal', percentOff: 25, expiresAt: '2099-12-31T23:59:59.000Z' },
  { code: 'EXPIRED20', description: '20% de desconto no subtotal', percentOff: 20, expiresAt: '2024-01-31T23:59:59.000Z' },
]

export interface WalletSeed {
  slot: WalletSlot
  label: string
  address: string
  provider: WalletProvider
  networks: Network[]
}

export interface UserSeed {
  id: string
  name: string
  email: string
  username: string
  bio: string
  password: string
  favorites: string[]
  wallets: WalletSeed[]
}

export const USER_SEEDS: UserSeed[] = [
  {
    id: 'user-ana',
    name: 'Ana Ribeiro',
    email: 'ana@jungle.test',
    username: 'ana_ribeiro',
    bio: 'Colecionadora de arte generativa e fotografia de natureza.',
    password: 'Jungle@2026',
    favorites: ['nft-001', 'nft-008'],
    wallets: [
      {
        slot: 'primary',
        label: 'MetaMask principal',
        address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        provider: 'metamask',
        networks: ['ethereum', 'polygon', 'base'],
      },
      {
        slot: 'secondary',
        label: 'Coinbase reserva',
        address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        provider: 'coinbase',
        networks: ['ethereum', 'base'],
      },
    ],
  },
  {
    id: 'user-bruno',
    name: 'Bruno Lima',
    email: 'bruno@jungle.test',
    username: 'bruno_lima',
    bio: '',
    password: 'Jungle@2026',
    favorites: [],
    wallets: [],
  },
]
