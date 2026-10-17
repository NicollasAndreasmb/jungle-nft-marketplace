/**
 * Collector profile: personal data (with uniqueness conflicts from the API), avatar upload with
 * client-side type/size checks and downscaling, password change, and the favorites list.
 * Confirmed changes are written to the server and reflected in the session/header cache.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Heart, Loader2, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { accountApi } from '@/api/account'
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  type Session,
  type User,
  passwordChangeRequestSchema,
  profileUpdateRequestSchema,
} from '@/api/contracts'
import { queryKeys } from '@/api/query-keys'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { errorMessage } from '@/lib/error-message'
import { Field, FormError } from '@/components/form/field'
import { useZodForm } from '@/components/form/use-zod-form'
import { PageContainer } from '@/components/layout/page-container'
import { NftCard, NftCardSkeleton } from '@/components/nft/nft-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useFavorites } from '@/features/favorites/favorites-queries'
import { useSession } from '@/features/session/session-queries'
import { useDocumentTitle } from '@/lib/use-document-title'

const AVATAR_SIZE_PX = 256

function useSyncUser() {
  const queryClient = useQueryClient()
  return (user: User) => {
    queryClient.setQueryData(queryKeys.profile(user.id), user)
    queryClient.setQueryData<Session | null>(queryKeys.session, (session) => (session ? { ...session, user } : session))
  }
}

function ProfileForm({ profile }: { profile: User }) {
  const syncUser = useSyncUser()
  const form = useZodForm(profileUpdateRequestSchema, {
    name: profile.name,
    username: profile.username,
    email: profile.email,
    bio: profile.bio,
  })
  const update = useMutation({
    mutationFn: accountApi.updateProfile,
    onSuccess: (user) => {
      syncUser(user)
      toast.success('Perfil atualizado.')
    },
    onError: form.applyApiError,
  })

  return (
    <form noValidate onSubmit={form.handleSubmit((data) => update.mutate(data))} className="grid max-w-xl gap-4">
      <FormError message={form.formError} />
      <Field name="name" label="Nome" error={form.errors.name}>
        {(props) => <Input {...props} autoComplete="name" value={form.values.name} onChange={(event) => form.setValue('name', event.target.value)} />}
      </Field>
      <Field name="username" label="Nome de usuário" hint="Letras minúsculas, números e sublinhado." error={form.errors.username}>
        {(props) => <Input {...props} autoComplete="username" value={form.values.username} onChange={(event) => form.setValue('username', event.target.value)} />}
      </Field>
      <Field name="email" label="E-mail" error={form.errors.email}>
        {(props) => (
          <Input {...props} type="email" autoComplete="email" value={form.values.email} onChange={(event) => form.setValue('email', event.target.value)} />
        )}
      </Field>
      <Field name="bio" label="Bio" hint={`${form.values.bio.length}/280 caracteres`} error={form.errors.bio}>
        {(props) => <Textarea {...props} rows={4} value={form.values.bio} onChange={(event) => form.setValue('bio', event.target.value)} />}
      </Field>
      <div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}

async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, AVATAR_SIZE_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao processar a imagem'))), 'image/png')
  })
}

function AvatarForm({ profile }: { profile: User }) {
  const syncUser = useSyncUser()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const apply = (avatarUrl: string | null) => syncUser({ ...profile, avatarUrl })

  const upload = useMutation({
    mutationFn: accountApi.uploadAvatar,
    onSuccess: ({ avatarUrl }) => {
      apply(avatarUrl)
      setError(null)
      toast.success('Avatar atualizado.')
    },
    onError: (failure) => setError(errorMessage(failure)),
  })
  const remove = useMutation({
    mutationFn: accountApi.removeAvatar,
    onSuccess: () => {
      apply(null)
      toast.success('Avatar removido.')
    },
    onError: (failure) => setError(errorMessage(failure)),
  })

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Use uma imagem PNG, JPEG ou WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem original deve ter no máximo 5 MB.')
      return
    }
    try {
      const resized = await downscaleImage(file)
      if (resized.size > AVATAR_MAX_BYTES) {
        setError(`A imagem processada excede ${AVATAR_MAX_BYTES / 1024} KB.`)
        return
      }
      setError(null)
      upload.mutate(resized)
    } catch {
      setError('Não foi possível ler esta imagem. Verifique se o arquivo é válido.')
    }
  }

  const busy = upload.isPending || remove.isPending
  return (
    <div className="grid max-w-xl gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-20">
          {profile.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={`Avatar de ${profile.name}`} /> : null}
          <AvatarFallback className="text-xl">{profile.name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              {upload.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              Enviar imagem
            </Button>
            {profile.avatarUrl ? (
              <Button type="button" variant="ghost" onClick={() => remove.mutate()} disabled={busy}>
                <Trash2 aria-hidden="true" /> Remover
              </Button>
            ) : null}
          </div>
          <p id="avatar-hint" className="text-xs text-muted-foreground">
            PNG, JPEG ou WebP. A imagem é redimensionada para {AVATAR_SIZE_PX} px.
          </p>
        </div>
      </div>
      <label htmlFor="field-avatar" className="sr-only">
        Selecionar imagem de avatar
      </label>
      <input
        ref={inputRef}
        id="field-avatar"
        type="file"
        accept={AVATAR_MIME_TYPES.join(',')}
        className="sr-only"
        aria-describedby="avatar-hint"
        onChange={(event) => void onFile(event)}
        tabIndex={-1}
      />
      <FormError message={error} />
    </div>
  )
}

const passwordFormSchema = passwordChangeRequestSchema
  .extend({ confirmPassword: z.string().min(1, 'Confirme a nova senha') })
  .refine((data) => data.newPassword === data.confirmPassword, { path: ['confirmPassword'], message: 'As senhas não coincidem' })

function PasswordForm() {
  const form = useZodForm(passwordFormSchema, { currentPassword: '', newPassword: '', confirmPassword: '' })
  const change = useMutation({
    mutationFn: accountApi.changePassword,
    onSuccess: () => {
      form.setValues({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Senha alterada. Outras sessões foram encerradas.')
    },
    onError: form.applyApiError,
  })
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(({ currentPassword, newPassword }) => change.mutate({ currentPassword, newPassword }))}
      className="grid max-w-xl gap-4"
    >
      <FormError message={form.formError} />
      <Field name="currentPassword" label="Senha atual" error={form.errors.currentPassword}>
        {(props) => (
          <Input {...props} type="password" autoComplete="current-password" value={form.values.currentPassword} onChange={(event) => form.setValue('currentPassword', event.target.value)} />
        )}
      </Field>
      <Field name="newPassword" label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números." error={form.errors.newPassword}>
        {(props) => (
          <Input {...props} type="password" autoComplete="new-password" value={form.values.newPassword} onChange={(event) => form.setValue('newPassword', event.target.value)} />
        )}
      </Field>
      <Field name="confirmPassword" label="Confirmar nova senha" error={form.errors.confirmPassword}>
        {(props) => (
          <Input {...props} type="password" autoComplete="new-password" value={form.values.confirmPassword} onChange={(event) => form.setValue('confirmPassword', event.target.value)} />
        )}
      </Field>
      <div>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Alterar senha
        </Button>
      </div>
    </form>
  )
}

function FavoritesList() {
  const { data, isPending, isError, error, refetch, isRefetching } = useFavorites()
  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NftCardSkeleton />
        <NftCardSkeleton />
        <NftCardSkeleton />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isRefetching} />
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Nenhum favorito ainda"
        description="Use o botão Favoritar na página de um NFT para acompanhá-lo aqui."
        action={
          <Button asChild variant="outline">
            <Link to="/">Explorar catálogo</Link>
          </Button>
        }
      />
    )
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.items.map((nft) => (
        <li key={nft.id}>
          <NftCard nft={nft} />
        </li>
      ))}
    </ul>
  )
}

export function ProfilePage() {
  useDocumentTitle('Perfil')
  const { user } = useSession()
  const userId = user?.id ?? 'anonymous'
  const profile = useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: ({ signal }) => accountApi.profile(signal),
    enabled: Boolean(user),
  })

  return (
    <PageContainer>
      <h1 className="mb-6 text-3xl font-bold">Perfil do colecionador</h1>
      {profile.isPending ? (
        <div className="grid max-w-xl gap-4" aria-busy="true" aria-label="Carregando perfil">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : profile.isError ? (
        <ErrorState
          error={profile.error}
          onRetry={() => void profile.refetch()}
          isRetrying={profile.isRefetching}
          title="Não foi possível carregar o perfil"
        />
      ) : (
        <Tabs defaultValue="dados" className="gap-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="avatar">Avatar</TabsTrigger>
            <TabsTrigger value="senha">Senha</TabsTrigger>
            <TabsTrigger value="favoritos">Favoritos</TabsTrigger>
          </TabsList>
          <TabsContent value="dados">
            <ProfileForm key={profile.dataUpdatedAt} profile={profile.data} />
          </TabsContent>
          <TabsContent value="avatar">
            <AvatarForm profile={profile.data} />
          </TabsContent>
          <TabsContent value="senha">
            <PasswordForm />
          </TabsContent>
          <TabsContent value="favoritos">
            <FavoritesList />
          </TabsContent>
        </Tabs>
      )}
      <p className="mt-8 text-sm text-muted-foreground">
        Gerencie também suas{' '}
        <Link to="/carteiras" className="text-foreground underline underline-offset-4">
          carteiras principal e secundária
        </Link>
        .
      </p>
    </PageContainer>
  )
}
