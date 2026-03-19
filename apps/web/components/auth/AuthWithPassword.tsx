'use client';

import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn } from 'next-auth/react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { AuthService } from '@/services';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export function AuthWithPassword() {
  const [isLogin, setIsLogin] = useState(true);
  const router = useRouter();

  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: errorsLogin, isSubmitting: isSubmittingLogin },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerRegister,
    handleSubmit: handleSubmitRegister,
    formState: { errors: errorsRegister, isSubmitting: isSubmittingRegister },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onLogin = async (data: LoginFormValues) => {
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
        callbackUrl: '/',
      });

      if (result?.error) {
        toast.error('Invalid credentials');
      } else {
        toast.success('Logged in successfully');
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      toast.error('Something went wrong');
    }
  };

  const onRegister = async (data: RegisterFormValues) => {
    try {
      await AuthService.register(data);
      toast.success('Account created successfully! Signing you in...');

      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
        callbackUrl: '/',
      });

      if (result?.error) {
        toast.error('Registration successful but login failed. Please try logging in manually.');
        setIsLogin(true);
      } else {
        toast.success('Welcome!');
        router.push('/');
        router.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to register';
      toast.error(errorMessage);
    }
  };

  return (
    <div className='space-y-4'>
      <AnimatePresence mode='wait'>
        {isLogin ? (
          <motion.form
            key='login-form'
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onSubmit={handleSubmitLogin(onLogin)}
            className='space-y-4'
          >
            <div className='space-y-2'>
              <Label htmlFor='email'>Email</Label>
              <Input id='email' type='email' placeholder='m@example.com' {...registerLogin('email')} />
              {errorsLogin.email && <p className='text-destructive text-xs'>{errorsLogin.email.message}</p>}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='password'>Password</Label>
              <Input id='password' type='password' {...registerLogin('password')} />
              {errorsLogin.password && <p className='text-destructive text-xs'>{errorsLogin.password.message}</p>}
            </div>

            <Button type='submit' className='w-full' disabled={isSubmittingLogin}>
              {isSubmittingLogin ? 'Signing in...' : 'Sign In'}
            </Button>
          </motion.form>
        ) : (
          <motion.form
            key='register-form'
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={handleSubmitRegister(onRegister)}
            className='space-y-4'
          >
            <div className='space-y-2'>
              <Label htmlFor='register-name'>Name</Label>
              <Input id='register-name' placeholder='John Doe' {...registerRegister('name')} />
              {errorsRegister.name && <p className='text-destructive text-xs'>{errorsRegister.name.message}</p>}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='register-email'>Email</Label>
              <Input id='register-email' type='email' placeholder='m@example.com' {...registerRegister('email')} />
              {errorsRegister.email && <p className='text-destructive text-xs'>{errorsRegister.email.message}</p>}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='register-password'>Password</Label>
              <Input id='register-password' type='password' {...registerRegister('password')} />
              {errorsRegister.password && <p className='text-destructive text-xs'>{errorsRegister.password.message}</p>}
            </div>

            <Button type='submit' className='w-full' disabled={isSubmittingRegister}>
              {isSubmittingRegister ? 'Creating account...' : 'Create Account'}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className='flex justify-center pt-2'>
        <Button variant='link' className='px-0 text-sm' onClick={() => setIsLogin(!isLogin)} type='button'>
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </Button>
      </div>
    </div>
  );
}
