'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { login, signup } from './actions';
import { OAuthButtons } from '@/components/buttons/oauth-signin';
import { set } from 'date-fns';

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (formData: FormData) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    console.log('login', isLoading);

    try {
      const result = await login(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        setSuccess('Login successful!');
        setTimeout(() => {
          window.location.href = '/prospects';
        }, 1000);
      }
    } catch (err) {
      console.log(err);
      setError('Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (formData: FormData) => {
    setIsLoading(true);

    setError(null);
    setSuccess(null);

    try {
      const { error } = await signup(formData);
      if (error) {
        setError(error);
      } else {
        setSuccess('Signup successful! Please check your email to verify your account.');
      }
    } catch (err) {
      console.log(err);
      setError('Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

      <Link href="/" className="relative mb-8 flex items-center gap-2">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <span className="text-2xl font-semibold text-foreground">Davis</span>
      </Link>
      <Card className="relative w-full max-w-md p-8 glass-card">
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form action={handleLogin} className="space-y-4">
              <Input type="email" name="email" placeholder="Email" required />
              <Input type="password" name="password" placeholder="Password" required />
              {error && <p className="text-destructive text-sm">{error}</p>}
              {success && <p className="text-green-500 text-sm">{success}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  'Login'
                )}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form action={handleSignup} className="space-y-4">
              <Input type="text" name="name" placeholder="Full Name" required />
              <Input type="email" name="email" placeholder="Email" required />
              <Input type="password" name="password" placeholder="Password" required />
              {error && <p className="text-destructive text-sm">{error}</p>}
              {success && <p className="text-green-500 text-sm">{success}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing up...
                  </>
                ) : (
                  'Sign Up'
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <OAuthButtons />
          </div>
        </div>
      </Card>
      <p className="relative mt-8 text-center text-sm text-muted-foreground">
        By signing up, you agree to our{' '}
        <Link href="/terms" className="font-medium underline underline-offset-4 hover:text-primary">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          href="/privacy"
          className="font-medium underline underline-offset-4 hover:text-primary"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
