/**
 * Collector account endpoints: favorites, profile, avatar, password and wallets.
 */
import {
  type CreateWalletRequest,
  type PasswordChangeRequest,
  type ProfileUpdateRequest,
  type WalletInput,
  avatarResponseSchema,
  favoritesSchema,
  userSchema,
  walletListSchema,
  walletSchema,
} from './contracts'
import { request, requestVoid } from './http'

export const accountApi = {
  favorites: (signal?: AbortSignal) => request(favoritesSchema, { url: '/favorites', method: 'GET', signal }),
  addFavorite: (nftId: string) => requestVoid({ url: `/favorites/${encodeURIComponent(nftId)}`, method: 'PUT' }),
  removeFavorite: (nftId: string) => requestVoid({ url: `/favorites/${encodeURIComponent(nftId)}`, method: 'DELETE' }),

  profile: (signal?: AbortSignal) => request(userSchema, { url: '/profile', method: 'GET', signal }),
  updateProfile: (body: ProfileUpdateRequest) => request(userSchema, { url: '/profile', method: 'PATCH', data: body }),
  uploadAvatar: (file: Blob) => {
    const form = new FormData()
    form.append('avatar', file, 'avatar')
    return request(avatarResponseSchema, { url: '/profile/avatar', method: 'POST', data: form })
  },
  removeAvatar: () => request(avatarResponseSchema, { url: '/profile/avatar', method: 'DELETE' }),
  changePassword: (body: PasswordChangeRequest) => requestVoid({ url: '/profile/password', method: 'PUT', data: body }),

  wallets: (signal?: AbortSignal) => request(walletListSchema, { url: '/wallets', method: 'GET', signal }),
  createWallet: (body: CreateWalletRequest) => request(walletSchema, { url: '/wallets', method: 'POST', data: body }),
  updateWallet: (walletId: string, body: WalletInput) =>
    request(walletSchema, { url: `/wallets/${encodeURIComponent(walletId)}`, method: 'PATCH', data: body }),
}
