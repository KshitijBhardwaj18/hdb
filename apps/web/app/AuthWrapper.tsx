'use client';
import { signOut, useSession } from 'next-auth/react';
import React, { useEffect } from 'react';
import { verifyToken } from '@/helpers/validation.helpers';

const AuthWrapper = ({ children }: { children: React.ReactNode }) => {
  const { data } = useSession();
  useEffect(() => {
    if (data?.user.token) {
      verifyToken(data.user.token).then((payload) => {
        if (!payload) {
          signOut({
            callbackUrl: '/login',
          });
        }
      });
    }
  }, [data?.user.token]);
  return <>{children}</>;
};

export default AuthWrapper;
