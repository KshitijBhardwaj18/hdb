'use client';

import { Button } from '@repo/ui/components/button';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import * as React from 'react';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

export function AuthWithGoogle() {
  return (
    <motion.div className='w-full' whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
      <Button
        variant='outline'
        onClick={() => signIn('google', { callbackUrl: '/' })}
        className='w-full shadow-xs'
        type='button'
      >
        <GoogleIcon className='mr-2 h-4 w-4' />
        Google
      </Button>
    </motion.div>
  );
}
