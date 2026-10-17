/**
 * Favorites for the authenticated user with optimistic toggling: the cache flips immediately,
 * rolls back to the snapshot if the mutation fails, and is reconciled with the server afterwards.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountApi } from '@/api/account'
import type { Favorites } from '@/api/contracts'
import { queryKeys } from '@/api/query-keys'
import { useSession } from '@/features/session/session-queries'

export function useFavorites() {
  const { user } = useSession()
  return useQuery({
    queryKey: queryKeys.favorites(user?.id ?? 'anonymous'),
    queryFn: ({ signal }) => accountApi.favorites(signal),
    enabled: Boolean(user),
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const key = queryKeys.favorites(user?.id ?? 'anonymous')

  return useMutation({
    mutationFn: ({ nftId, favorite }: { nftId: string; favorite: boolean }) =>
      favorite ? accountApi.addFavorite(nftId) : accountApi.removeFavorite(nftId),
    onMutate: async ({ nftId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Favorites>(key)
      queryClient.setQueryData<Favorites>(key, (current) => {
        const base = current ?? { nftIds: [], items: [] }
        return favorite
          ? { ...base, nftIds: base.nftIds.includes(nftId) ? base.nftIds : [nftId, ...base.nftIds] }
          : { nftIds: base.nftIds.filter((id) => id !== nftId), items: base.items.filter((item) => item.id !== nftId) }
      })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(key, context?.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
