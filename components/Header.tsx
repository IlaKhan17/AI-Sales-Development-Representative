'use client';

import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import UserAccountNav from './user-account-nav';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

export default function Header({ user }: { user: User | null }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full px-4 md:px-8 transition-colors duration-200",
        scrolled
          ? "border-b border-border bg-background"
          : "border-b border-transparent bg-background"
      )}
    >
      <nav className="mx-auto max-w-6xl">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
            Davis
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-6">
            {user ? (
              <>
                <Link
                  href="/workspaces"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Open Davis
                </Link>
                <UserAccountNav user={user} />
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Log in
                </Link>
                <Button asChild size="sm" className="h-8 px-4">
                  <Link href="/login">Start a workspace</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden p-1" aria-label={isMenuOpen ? "Close menu" : "Open menu"} onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        <div className={cn(
          'md:hidden overflow-hidden transition-all duration-200',
          isMenuOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
        )}>
          <div className="space-y-3 px-1 pb-5 pt-2">
            {user ? (
              <>
                <Link
                  href="/workspaces"
                  className="block py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Open Davis
                </Link>
              </>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                <Button variant="ghost" asChild className="w-full justify-start h-9">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild className="w-full h-9">
                  <Link href="/login">Start a workspace</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
