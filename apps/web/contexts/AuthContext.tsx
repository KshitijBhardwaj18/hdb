'use client';

import type { AuthContextType } from '@repo/shared-types/types';
import { signOut, useSession } from 'next-auth/react';
import { createContext, use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import GlobalLoading from '@/app/loading';
import { AuthService } from '@/services/auth.service';

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthContextType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { status } = useSession();

  const logOut = () => {
    signOut({
      callbackUrl: '/login',
    });
  };

  const fetchUser = async () => {
    try {
      const resp = await AuthService.me();

      if (!resp) {
        toast.error('Failed to fetch user');
        logOut();
      }
      setUser(resp);
    } catch (_error) {
      toast.error('Failed to fetch user');
      signOut({
        callbackUrl: '/login',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchUser();
    } else if (status === 'unauthenticated') {
      setIsLoading(false);
    }
  }, [status]);

  if (isLoading || status === 'loading' || !user) {
    return <GlobalLoading />;
  }

  return <AuthContext value={user}>{children}</AuthContext>;
};

export const useAuth = () => {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
