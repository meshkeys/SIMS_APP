import { ROLE_LABELS } from '@sims/contracts';
import { Link, Outlet } from '@tanstack/react-router';
import { ChevronsUpDown, LogOut, Menu, X } from 'lucide-react';
import { Dialog, DropdownMenu, VisuallyHidden } from 'radix-ui';
import { useState } from 'react';
import { useAuth, useSession } from '@/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Brand } from '@/features/auth/login-page';
import { hasAnyRole } from '@/lib/access';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { CycleWidget } from './cycle-widget';
import { NAV } from './nav';

/** Signed-in layout: sidebar on wide screens, a menu drawer on small ones. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col bg-sidebar lg:flex">
        <Sidebar />
      </aside>

      <div className="flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
        <Brand />
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-text hover:bg-sidebar-hover"
              aria-label="Open menu"
            >
              <Menu />
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar">
              <VisuallyHidden.Root>
                <Dialog.Title>Menu</Dialog.Title>
                <Dialog.Description>Main navigation</Dialog.Description>
              </VisuallyHidden.Root>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 text-sidebar-text hover:bg-sidebar-hover"
                  aria-label="Close menu"
                >
                  <X />
                </Button>
              </Dialog.Close>
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      <main
        id="main"
        tabIndex={-1}
        className="min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
      >
        <div className="mx-auto max-w-[90rem]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession();
  const myUpdates = useApiQuery('getMyUpdates', {});
  const due = myUpdates.data?.items.filter((i) => i.actionNeeded).length ?? 0;

  return (
    <>
      <div className="px-5 py-5">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.heading} className="mt-4 first:mt-1">
            <h2 className="px-3 pb-2 text-[0.6875rem] font-medium tracking-wider text-sidebar-muted uppercase">
              {group.heading}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {group.items
                .filter(
                  (item) => !item.roles || hasAnyRole(session, item.roles),
                )
                .map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      activeOptions={{ exact: item.to === '/' }}
                      onClick={onNavigate}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-sidebar-text transition-colors hover:bg-sidebar-hover focus-visible:outline-sidebar-text aria-[current=page]:bg-sidebar-active aria-[current=page]:font-medium aria-[current=page]:text-white"
                    >
                      {item.label}
                      {item.to === '/my-updates' && due > 0 && (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[0.6875rem] font-semibold text-sidebar">
                          {due} due
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      <CycleWidget />
      <UserMenu />
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
}

function UserMenu() {
  const session = useSession();
  const { signOut, switchOrganisation } = useAuth();
  const role = session.membership.roles[0];
  const others = session.organisations.filter(
    (o) => o.id !== session.organisation.id,
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="m-3 flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-hover focus-visible:outline-sidebar-text"
          aria-label={`Account: ${session.user.name}`}
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold text-sidebar-text"
          >
            {initials(session.user.name)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-white">
              {session.user.name}
            </span>
            <span className="block truncate text-xs text-sidebar-muted">
              {role ? ROLE_LABELS[role] : session.organisation.name}
            </span>
          </span>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-4 text-sidebar-muted"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 min-w-60 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
        >
          <DropdownMenu.Label className="px-3 py-2">
            <span className="block font-medium text-ink">
              {session.user.name}
            </span>
            <span className="block text-xs text-ink-muted">
              {session.user.email}
            </span>
            <span className="mt-1 block text-xs text-ink-muted">
              {session.organisation.name}
            </span>
          </DropdownMenu.Label>
          {others.length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Label className="px-3 pt-1 pb-1 text-xs text-ink-subtle">
                Switch workspace
              </DropdownMenu.Label>
              {others.map((organisation) => (
                <DropdownMenu.Item
                  key={organisation.id}
                  onSelect={() => void switchOrganisation(organisation.id)}
                  className={menuItem}
                >
                  {organisation.name}
                </DropdownMenu.Item>
              ))}
            </>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className={menuItem}
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const menuItem = cn(
  'flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-ink outline-none select-none data-[highlighted]:bg-neutral-soft',
);
