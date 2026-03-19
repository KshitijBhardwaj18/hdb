'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import * as z from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPrompt, setShowForgotPrompt] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Invalid email or password');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      toast.error('Something went wrong');
    }
  };

  return (
    <div className='relative flex min-h-screen items-center justify-center bg-[#1D1E1F]'>
      <div
        className='relative w-full max-w-[700px]'
        style={{ backgroundImage: "url('/auth-pattern.svg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className='relative mx-auto flex w-[480px] flex-col items-center gap-8 rounded-2xl bg-[#222222] p-8'>
          {/* Header */}
          <div className='flex flex-col items-center gap-2'>
            <h1
              className='text-center text-xl font-bold leading-[1.6] text-white'
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Welcome back from
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src='/logo.png' alt='HydraDB' className='h-20 w-[175px] object-contain' />
            <p className='text-center text-base text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Sign in to access your deployment dashboard
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className='flex w-full flex-col gap-6'>
            {/* Email */}
            <div className='flex flex-col gap-2.5'>
              <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                Email address
              </label>
              <input
                type='email'
                placeholder='john@gmail.com'
                className='rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-base text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
                {...register('email')}
              />
              {errors.email && <p className='text-xs text-red-400'>{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className='flex flex-col gap-2.5'>
              <div className='flex items-center justify-between'>
                <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  Password
                </label>
                <button
                  type='button'
                  onClick={() => setShowForgotPrompt(true)}
                  className='text-sm text-white hover:underline'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                >
                  Forgot password?
                </button>
              </div>
              <div className='relative'>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder='Enter your password'
                  className='w-full rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 pr-10 text-base text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                  {...register('password')}
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute right-3.5 top-1/2 -translate-y-1/2 text-white'
                >
                  {showPassword ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
                </button>
              </div>
              {errors.password && <p className='text-xs text-red-400'>{errors.password.message}</p>}
            </div>

            {/* Sign In Button */}
            <button
              type='submit'
              disabled={isSubmitting}
              className='flex h-[42px] w-full items-center justify-center rounded-lg bg-[#353535] text-base font-medium text-[#5C5C5C] transition-colors hover:bg-[#404040] hover:text-white disabled:opacity-50'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>

            {/* Sign Up Link */}
            <p className='text-center text-base text-[#6D6D6D]'>
              Don&apos;t have an account?{' '}
              <Link href='/register' className='text-[#6D6D6D] hover:text-white hover:underline'>
                Create account
              </Link>
            </p>
          </form>
        </div>
      </div>

      {/* Terms Footer */}
      <p className='absolute bottom-6 text-center text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
        By signing in, you agree to our Terms of Service & Privacy Policy
      </p>

      {/* Forgot Password Prompt */}
      {showForgotPrompt && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
          <div className='w-full max-w-[400px] rounded-2xl bg-[#222222] p-6' style={{ border: '0.5px solid #5B5B5B' }}>
            <h2 className='mb-2 text-lg font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Reset Password
            </h2>
            <p className='mb-5 text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Please contact your administrator to reset your password. Self-service password reset is not available at this time.
            </p>
            <button
              onClick={() => setShowForgotPrompt(false)}
              className='w-full rounded-lg bg-[#FF4400] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
