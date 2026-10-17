/**
 * Cart state. The cart lives on the server (guest cart via cookie, user cart after login), so the
 * cache is keyed by identity and every mutation replaces it with the server response, which is
 * the source of truth for availability, coupon and totals.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cartApi } from '@/api/cart'
import type { AddCartItemRequest, Cart } from '@/api/contracts'
import { cartScope, queryKeys } from '@/api/query-keys'
import { useSession } from '@/features/session/session-queries'

export function useCartKey() {
  const { user, isLoading } = useSession()
  return { key: queryKeys.cart(cartScope(user?.id)), ready: !isLoading }
}

export function useCart() {
  const { key, ready } = useCartKey()
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => cartApi.get(signal),
    enabled: ready,
  })
}

function useCartMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<Cart>) {
  const queryClient = useQueryClient()
  const { key } = useCartKey()
  return useMutation({
    mutationFn,
    onSuccess: (cart) => queryClient.setQueryData(key, cart),
    onError: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export const useAddToCart = () => useCartMutation((body: AddCartItemRequest) => cartApi.addItem(body))
export const useUpdateCartItem = () =>
  useCartMutation(({ itemId, quantity }: { itemId: string; quantity: number }) => cartApi.updateItem(itemId, quantity))
export const useRemoveCartItem = () => useCartMutation((itemId: string) => cartApi.removeItem(itemId))
export const useApplyCoupon = () => useCartMutation((code: string) => cartApi.applyCoupon(code))
export const useRemoveCoupon = () => useCartMutation(() => cartApi.removeCoupon())
