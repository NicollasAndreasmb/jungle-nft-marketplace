/**
 * REST and realtime contracts shared by the HTTP client, the UI and the MSW mock server.
 *
 * Every response consumed by the app is parsed with these schemas at the transport
 * boundary, and every request body accepted by the mock server is validated with the
 * request schemas, so transport, state and interface agree on a single typed shape.
 * Zod runs in jitless mode so it never probes `new Function`, keeping a strict CSP (no unsafe-eval).
 */
import { z } from 'zod'
import { isEthString } from '@/lib/eth'

z.config({ jitless: true })

export const ethAmount = z.string().refine(isEthString, { message: 'Valor ETH inválido' })
const isoDate = z.iso.datetime({ offset: true })

export const NETWORKS = ['ethereum', 'polygon', 'base'] as const
export const networkSchema = z.enum(NETWORKS)
export type Network = z.infer<typeof networkSchema>

export const CATEGORIES = ['art', 'gaming', 'music', 'photography', 'collectibles'] as const
export const categorySchema = z.enum(CATEGORIES)
export type Category = z.infer<typeof categorySchema>

export const SORT_OPTIONS = ['recent', 'price-asc', 'price-desc', 'name'] as const
export const sortSchema = z.enum(SORT_OPTIONS)
export type CatalogSort = z.infer<typeof sortSchema>

export const AVAILABILITY_OPTIONS = ['all', 'available', 'sold-out'] as const
export const availabilitySchema = z.enum(AVAILABILITY_OPTIONS)
export type AvailabilityFilter = z.infer<typeof availabilitySchema>

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
    details: z.unknown().optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  username: z.string(),
  bio: z.string(),
  avatarUrl: z.string().nullable(),
})
export type User = z.infer<typeof userSchema>

export const sessionSchema = z.object({
  user: userSchema,
  expiresAt: isoDate,
})
export type Session = z.infer<typeof sessionSchema>

export const sessionLookupSchema = z.union([sessionSchema, z.object({ user: z.null(), expiresAt: z.null() })])

export const realtimeTicketSchema = z.object({
  ticket: z.string(),
  expiresAt: isoDate,
})

const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'A senha deve conter ao menos uma letra')
  .regex(/\d/, 'A senha deve conter ao menos um número')

const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Informe pelo menos 2 caracteres')
  .max(80, 'Use no máximo 80 caracteres')

const emailInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-mail muito longo')
  .pipe(z.email('Informe um e-mail válido'))

export const loginRequestSchema = z.object({
  email: emailInputSchema,
  password: z.string().min(1, 'Informe a senha').max(72, 'Senha inválida'),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const registerRequestSchema = z.object({
  name: personNameSchema,
  email: emailInputSchema,
  password: passwordSchema,
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

export const editionSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceEth: ethAmount,
  supply: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  maxPerOrder: z.number().int().positive(),
})
export type Edition = z.infer<typeof editionSchema>

const collectionRefSchema = z.object({ id: z.string(), name: z.string() })
export type CollectionRef = z.infer<typeof collectionRefSchema>

const creatorSchema = z.object({ name: z.string(), handle: z.string() })

const imageSchema = z.object({
  src: z.string(),
  alt: z.string(),
})
export type NftImage = z.infer<typeof imageSchema>

export const nftSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  image: imageSchema,
  category: categorySchema,
  collection: collectionRefSchema,
  creator: creatorSchema,
  fromPriceEth: ethAmount.nullable(),
  totalAvailable: z.number().int().nonnegative(),
  createdAt: isoDate,
  version: z.number().int().nonnegative(),
})
export type NftSummary = z.infer<typeof nftSummarySchema>

export const nftDetailSchema = nftSummarySchema.extend({
  description: z.string(),
  gallery: z.array(imageSchema).min(1),
  editions: z.array(editionSchema).min(1),
  network: networkSchema,
  contractAddress: z.string(),
})
export type NftDetail = z.infer<typeof nftDetailSchema>

export const catalogPageSchema = z.object({
  items: z.array(nftSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})
export type CatalogPage = z.infer<typeof catalogPageSchema>

export const CATALOG_PAGE_SIZE = 12
export const PRICE_FILTER_MAX = '1000'

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.array(categorySchema).max(CATEGORIES.length).optional(),
  collection: z.string().max(64).optional(),
  minPrice: ethAmount.optional(),
  maxPrice: ethAmount.optional(),
  availability: availabilitySchema.optional(),
  sort: sortSchema.optional(),
  page: z.number().int().positive().max(1000).optional(),
})
export type CatalogQuery = z.infer<typeof catalogQuerySchema>

export const collectionListSchema = z.array(collectionRefSchema)
export const highlightListSchema = z.array(nftSummarySchema)

export const favoritesSchema = z.object({
  nftIds: z.array(z.string()),
  items: z.array(nftSummarySchema),
})
export type Favorites = z.infer<typeof favoritesSchema>

export const CART_ITEM_STATUSES = ['ok', 'price-changed', 'insufficient', 'sold-out'] as const

export const cartItemSchema = z.object({
  id: z.string(),
  nftId: z.string(),
  editionId: z.string(),
  nftName: z.string(),
  editionName: z.string(),
  image: imageSchema,
  unitPriceEth: ethAmount,
  previousUnitPriceEth: ethAmount.nullable(),
  quantity: z.number().int().positive(),
  available: z.number().int().nonnegative(),
  maxPerOrder: z.number().int().positive(),
  lineTotalEth: ethAmount,
  status: z.enum(CART_ITEM_STATUSES),
})
export type CartItem = z.infer<typeof cartItemSchema>

export const couponSchema = z.object({
  code: z.string(),
  description: z.string(),
  percentOff: z.number().int().min(1).max(100),
})
export type Coupon = z.infer<typeof couponSchema>

export const priceSummarySchema = z.object({
  subtotalEth: ethAmount,
  discountEth: ethAmount,
  networkFeeEth: ethAmount,
  totalEth: ethAmount,
})
export type PriceSummary = z.infer<typeof priceSummarySchema>

export const cartSchema = z.object({
  id: z.string(),
  items: z.array(cartItemSchema),
  coupon: couponSchema.nullable(),
  summary: priceSummarySchema,
  feeNetwork: networkSchema,
  itemCount: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  updatedAt: isoDate,
})
export type Cart = z.infer<typeof cartSchema>

export const MAX_QUANTITY_PER_LINE = 99

export const addCartItemRequestSchema = z.object({
  nftId: z.string().min(1).max(64),
  editionId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
})
export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>

export const updateCartItemRequestSchema = z.object({
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
})

export const applyCouponRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, 'Informe o código do cupom')
    .max(24, 'Código muito longo')
    .regex(/^[A-Z0-9-]+$/, 'Use apenas letras, números e hífen'),
})

export const walletProviderSchema = z.enum(['metamask', 'coinbase', 'walletconnect', 'rainbow'])
export type WalletProvider = z.infer<typeof walletProviderSchema>
export const walletSlotSchema = z.enum(['primary', 'secondary'])
export type WalletSlot = z.infer<typeof walletSlotSchema>

export const walletSchema = z.object({
  id: z.string(),
  slot: walletSlotSchema,
  label: z.string(),
  address: z.string(),
  provider: walletProviderSchema,
  networks: z.array(networkSchema).min(1),
  updatedAt: isoDate,
})
export type Wallet = z.infer<typeof walletSchema>
export const walletListSchema = z.array(walletSchema)

export const walletAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Informe um endereço válido (0x seguido de 40 caracteres hexadecimais)')

export const walletInputSchema = z.object({
  label: z.string().trim().min(2, 'Informe pelo menos 2 caracteres').max(40, 'Use no máximo 40 caracteres'),
  address: walletAddressSchema,
  provider: walletProviderSchema,
  networks: z.array(networkSchema).min(1, 'Selecione ao menos uma rede').max(NETWORKS.length),
})
export type WalletInput = z.infer<typeof walletInputSchema>

export const createWalletRequestSchema = walletInputSchema.extend({ slot: walletSlotSchema })
export type CreateWalletRequest = z.infer<typeof createWalletRequestSchema>

export const walletSessionSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  network: networkSchema,
  status: z.literal('connected'),
  connectedAt: isoDate,
})
export type WalletSession = z.infer<typeof walletSessionSchema>

export const connectWalletRequestSchema = z.object({ network: networkSchema })

export const quoteLineSchema = z.object({
  nftId: z.string(),
  editionId: z.string(),
  nftName: z.string(),
  editionName: z.string(),
  image: imageSchema,
  unitPriceEth: ethAmount,
  quantity: z.number().int().positive(),
  lineTotalEth: ethAmount,
})
export type QuoteLine = z.infer<typeof quoteLineSchema>

export const quoteSchema = priceSummarySchema.extend({
  id: z.string(),
  network: networkSchema,
  couponCode: z.string().nullable(),
  items: z.array(quoteLineSchema).min(1),
  createdAt: isoDate,
  expiresAt: isoDate,
})
export type Quote = z.infer<typeof quoteSchema>

export const createQuoteRequestSchema = z.object({ network: networkSchema })

export const collectorSchema = z.object({
  fullName: personNameSchema,
  email: emailInputSchema,
  country: z.string().trim().min(2, 'Informe o país').max(56, 'Use no máximo 56 caracteres'),
  displayName: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres')
    .max(40, 'Use no máximo 40 caracteres'),
})
export type Collector = z.infer<typeof collectorSchema>

export const createOrderRequestSchema = z.object({
  quoteId: z.string().min(1).max(64),
  walletSessionId: z.string().min(1).max(64),
  collector: collectorSchema,
})
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>

export const ORDER_STATUSES = ['pending', 'confirmed', 'rejected'] as const
export const orderStatusSchema = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof orderStatusSchema>

export const orderSchema = priceSummarySchema.extend({
  id: z.string(),
  status: orderStatusSchema,
  version: z.number().int().nonnegative(),
  network: networkSchema,
  couponCode: z.string().nullable(),
  wallet: z.object({ label: z.string(), address: z.string(), provider: walletProviderSchema }),
  collector: collectorSchema,
  items: z.array(quoteLineSchema).min(1),
  transaction: z
    .object({ hash: z.string(), explorerUrl: z.string(), blockNumber: z.number().int().positive() })
    .nullable(),
  failureReason: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type Order = z.infer<typeof orderSchema>
export const orderListSchema = z.array(orderSchema)

export const quoteChangeSchema = z.object({
  nftId: z.string(),
  editionId: z.string(),
  nftName: z.string(),
  editionName: z.string(),
  kind: z.enum(['price-changed', 'insufficient', 'sold-out', 'coupon-invalid']),
  previousUnitPriceEth: ethAmount.nullable(),
  currentUnitPriceEth: ethAmount.nullable(),
  available: z.number().int().nonnegative().nullable(),
})
export type QuoteChange = z.infer<typeof quoteChangeSchema>
export const quoteChangeListSchema = z.array(quoteChangeSchema)

export const profileUpdateRequestSchema = z.object({
  name: personNameSchema,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use pelo menos 3 caracteres')
    .max(24, 'Use no máximo 24 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Use apenas letras minúsculas, números e sublinhado'),
  email: emailInputSchema,
  bio: z.string().trim().max(280, 'Use no máximo 280 caracteres'),
})
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>

export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual').max(72),
  newPassword: passwordSchema,
})
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>

export const AVATAR_MAX_BYTES = 512 * 1024
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const avatarResponseSchema = z.object({ avatarUrl: z.string().nullable() })

const eventEnvelope = <TType extends string, TResource extends string, TData extends z.ZodType>(
  type: TType,
  resource: TResource,
  data: TData,
) =>
  z.object({
    eventId: z.string(),
    type: z.literal(type),
    resource: z.object({ type: z.literal(resource), id: z.string() }),
    version: z.number().int().nonnegative(),
    occurredAt: isoDate,
    data,
  })

export const nftUpdatedEventSchema = eventEnvelope(
  'nft.updated',
  'nft',
  z.object({
    editions: z.array(editionSchema.pick({ id: true, priceEth: true, available: true })),
    fromPriceEth: ethAmount.nullable(),
    totalAvailable: z.number().int().nonnegative(),
  }),
)
export type NftUpdatedEvent = z.infer<typeof nftUpdatedEventSchema>

export const orderUpdatedEventSchema = eventEnvelope(
  'order.updated',
  'order',
  z.object({
    status: orderStatusSchema,
    userId: z.string(),
  }),
)
export type OrderUpdatedEvent = z.infer<typeof orderUpdatedEventSchema>

export const REALTIME_EVENTS = {
  nftUpdated: 'nft.updated',
  orderUpdated: 'order.updated',
} as const
