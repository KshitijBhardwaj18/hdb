'use client';

import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import * as z from 'zod';
import { AuthService } from '@/services';

const step1Schema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

const step2Schema = z
  .object({
    password: z.string().min(8, 'Must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const step1Form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
  });

  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
  });

  const onStep1Submit = (data: Step1Values) => {
    setStep1Data(data);
    setStep(2);
  };

  const onStep2Submit = async (data: Step2Values) => {
    if (!step1Data) return;

    try {
      await AuthService.register({
        name: step1Data.name,
        email: step1Data.email,
        password: data.password,
      });

      toast.success('Account created successfully!');

      const result = await signIn('credentials', {
        email: step1Data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Account created but auto-login failed. Please sign in.');
        router.push('/login');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      toast.error(message);
    }
  };

  return (
    <div className='relative flex min-h-screen items-center justify-center bg-[#1D1E1F]'>
      <div
        className='relative w-full max-w-[700px]'
        style={{ backgroundImage: "url('/auth-pattern.svg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className='relative mx-auto flex w-[480px] flex-col items-center gap-8 rounded-2xl bg-[#222222] p-8'>
          {step === 1 ? <Step1Content form={step1Form} onSubmit={onStep1Submit} /> : null}

          {step === 2 ? (
            <Step2Content
              form={step2Form}
              onSubmit={onStep2Submit}
              onBack={() => setStep(1)}
              showPassword={showPassword}
              showConfirm={showConfirm}
              onTogglePassword={() => setShowPassword(!showPassword)}
              onToggleConfirm={() => setShowConfirm(!showConfirm)}
            />
          ) : null}
        </div>
      </div>

      {/* Terms Footer */}
      <p className='absolute bottom-6 text-center text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
        By creating an account, you agree to our Terms of Service & Privacy Policy
      </p>
    </div>
  );
}

function Step1Content({
  form,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<Step1Values>>;
  onSubmit: (data: Step1Values) => void;
}) {
  return (
    <>
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
          Get started with HydraDB deployment platform
        </p>
      </div>

      {/* Form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className='flex w-full flex-col gap-6'>
        <div className='flex flex-col gap-2.5'>
          <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Company Name
          </label>
          <input
            placeholder='Your company'
            className='rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-base text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
            {...form.register('companyName')}
          />
          {form.formState.errors.companyName && (
            <p className='text-xs text-red-400'>{form.formState.errors.companyName.message}</p>
          )}
        </div>

        <div className='flex flex-col gap-2.5'>
          <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Full Name
          </label>
          <input
            placeholder='John Doe'
            className='rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-base text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
            {...form.register('name')}
          />
          {form.formState.errors.name && <p className='text-xs text-red-400'>{form.formState.errors.name.message}</p>}
        </div>

        <div className='flex flex-col gap-2.5'>
          <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Email address
          </label>
          <input
            type='email'
            placeholder='john@gmail.com'
            className='rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-base text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
            {...form.register('email')}
          />
          {form.formState.errors.email && <p className='text-xs text-red-400'>{form.formState.errors.email.message}</p>}
        </div>

        <button
          type='submit'
          className='flex h-[42px] w-full items-center justify-center rounded-lg bg-[#353535] text-base font-medium text-[#5C5C5C] transition-colors hover:bg-[#404040] hover:text-white'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          Continue
        </button>

        <p className='text-center text-base text-[#6D6D6D]'>
          Already have an account?{' '}
          <Link href='/login' className='text-[#6D6D6D] hover:text-white hover:underline'>
            Sign In
          </Link>
        </p>
      </form>
    </>
  );
}

function Step2Content({
  form,
  onSubmit,
  onBack,
  showPassword,
  showConfirm,
  onTogglePassword,
  onToggleConfirm,
}: {
  form: ReturnType<typeof useForm<Step2Values>>;
  onSubmit: (data: Step2Values) => void;
  onBack: () => void;
  showPassword: boolean;
  showConfirm: boolean;
  onTogglePassword: () => void;
  onToggleConfirm: () => void;
}) {
  return (
    <>
      {/* Back button - absolute positioned top-left of card */}
      <button
        type='button'
        onClick={onBack}
        className='absolute left-4 top-4 flex items-center gap-2.5 rounded-lg text-base font-medium text-white'
        style={{ fontFamily: 'Satoshi, sans-serif' }}
      >
        <ArrowLeft className='h-6 w-6' />
        Back
      </button>

      {/* Header */}
      <div className='flex flex-col items-center gap-2'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src='/set-password-illustration.png' alt='' className='h-[125px] w-[180px] object-contain' />
        <h1
          className='text-center text-[28px] font-medium leading-[1.14] text-white'
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Set the Password
        </h1>
        <p className='text-center text-base text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
          Set a strong password to create your account securely
        </p>
      </div>

      {/* Form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className='flex w-full flex-col gap-6'>
        <div className='flex flex-col gap-2.5'>
          <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Password
          </label>
          <div className='relative'>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder='Create a strong password'
              className='w-full rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 pr-10 text-base text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
              {...form.register('password')}
            />
            <button
              type='button'
              onClick={onTogglePassword}
              className='absolute right-3.5 top-1/2 -translate-y-1/2 text-white'
            >
              {showPassword ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
            </button>
          </div>
          <p className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Must be at least 8 characters with uppercase, lowercase, and numbers
          </p>
          {form.formState.errors.password && (
            <p className='text-xs text-red-400'>{form.formState.errors.password.message}</p>
          )}
        </div>

        <div className='flex flex-col gap-2.5'>
          <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Confirm Password
          </label>
          <div className='relative'>
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder='Re-enter your password'
              className='w-full rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 pr-10 text-base text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
              {...form.register('confirmPassword')}
            />
            <button
              type='button'
              onClick={onToggleConfirm}
              className='absolute right-3.5 top-1/2 -translate-y-1/2 text-white'
            >
              {showConfirm ? <EyeOff className='h-5 w-5' /> : <Eye className='h-5 w-5' />}
            </button>
          </div>
          {form.formState.errors.confirmPassword && (
            <p className='text-xs text-red-400'>{form.formState.errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type='submit'
          disabled={form.formState.isSubmitting}
          className='flex h-[42px] w-full items-center justify-center rounded-lg bg-[#353535] text-base font-medium text-[#5C5C5C] transition-colors hover:bg-[#404040] hover:text-white disabled:opacity-50'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          {form.formState.isSubmitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </>
  );
}
