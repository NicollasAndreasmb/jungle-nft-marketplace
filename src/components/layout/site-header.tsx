/**
 * Global header: brand, primary navigation, cart with live item count and the account menu
 * (or sign-in links). On small screens navigation moves into a focus-trapped drawer.
 */
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogOut, Menu, ShoppingBag, User as UserIcon, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useCart } from '@/features/cart/cart-queries'
import { useLogout, useSession } from '@/features/session/session-queries'
import { BrandLogo } from './brand-logo'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function CartLink() {
  const { data } = useCart()
  const count = data?.itemCount ?? 0
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link to="/carrinho" aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`} data-testid="header-cart">
        <ShoppingBag aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
          >
            {count}
          </span>
        ) : null}
      </Link>
    </Button>
  )
}

function useSignOut() {
  const logout = useLogout()
  const navigate = useNavigate()
  return () =>
    logout.mutate(undefined, {
      onSettled: () => {
        toast.success('Você saiu da sua conta.')
        void navigate({ to: '/' })
      },
    })
}

function AccountMenu() {
  const { user } = useSession()
  const signOut = useSignOut()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={`Conta de ${user.name}`} data-testid="account-menu">
          <Avatar className="size-7">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm lg:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/perfil">
            <UserIcon aria-hidden="true" /> Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/carteiras">
            <Wallet aria-hidden="true" /> Carteiras
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden="true" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useCurrentHref() {
  return useRouterState({ select: (state) => state.location.href })
}

function GuestLinks() {
  const href = useCurrentHref()
  const redirect = href.startsWith('/login') || href.startsWith('/cadastro') ? undefined : href
  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link to="/login" search={{ redirect }}>
          Entrar
        </Link>
      </Button>
      <Button asChild size="sm">
        <Link to="/cadastro" search={{ redirect }}>
          Criar conta
        </Link>
      </Button>
    </>
  )
}

function MobileMenu() {
  const [open, setOpen] = useState(false)
  const { user } = useSession()
  const href = useCurrentHref()
  const signOut = useSignOut()
  const close = () => setOpen(false)
  const linkClass = 'rounded-md px-3 py-2.5 text-base hover:bg-accent focus-visible:bg-accent'
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu" className="md:hidden">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(20rem,100vw)] p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>{user ? `Conectado como ${user.name}` : 'Navegue pelo marketplace'}</SheetDescription>
        </SheetHeader>
        <nav aria-label="Menu principal" className="flex flex-col gap-1 p-3">
          <Link to="/" className={linkClass} onClick={close}>
            Explorar
          </Link>
          <Link to="/carrinho" className={linkClass} onClick={close}>
            Carrinho
          </Link>
          {user ? (
            <>
              <Link to="/perfil" className={linkClass} onClick={close}>
                Perfil
              </Link>
              <Link to="/carteiras" className={linkClass} onClick={close}>
                Carteiras
              </Link>
              <button
                type="button"
                className={`${linkClass} text-left`}
                onClick={() => {
                  close()
                  signOut()
                }}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link to="/login" search={{ redirect: href }} className={linkClass} onClick={close}>
                Entrar
              </Link>
              <Link to="/cadastro" search={{ redirect: href }} className={linkClass} onClick={close}>
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

export function SiteHeader() {
  const { user, isLoading } = useSession()
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="rounded-md" aria-label="Jungle, página inicial">
          <BrandLogo />
        </Link>
        <nav aria-label="Principal" className="hidden md:block">
          <Link
            to="/"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'text-foreground' }}
            activeOptions={{ exact: true, includeSearch: false }}
          >
            Explorar
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <CartLink />
          <div className="hidden items-center gap-2 md:flex">
            {isLoading ? <span className="h-8 w-28" aria-hidden="true" /> : user ? <AccountMenu /> : <GuestLinks />}
          </div>
          <MobileMenu />
        </div>
      </div>
    </header>
  )
}
