import { useQuery } from '@tanstack/react-query'
import { accountApi } from '@/api/account'
import { queryKeys } from '@/api/query-keys'

export function useWallets(userId: string) {
  return useQuery({ queryKey: queryKeys.wallets(userId), queryFn: ({ signal }) => accountApi.wallets(signal) })
}
