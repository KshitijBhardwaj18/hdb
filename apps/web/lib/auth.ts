import type { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { envConfig } from '@/config';
import { AuthService } from '@/services';

const googleAuthProvider = GoogleProvider({
  clientId: envConfig.providers.google.clientId,
  clientSecret: envConfig.providers.google.clientSecret,
});

const credentialsProvider = CredentialsProvider({
  name: 'Credentials',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' },
  },
  async authorize(credentials) {
    if (!credentials?.email || !credentials?.password) {
      return null;
    }
    try {
      const resp = await AuthService.login({
        email: credentials.email,
        password: credentials.password,
      });
      if (resp) {
        return {
          id: resp.user.id,
          name: resp.user.name,
          email: resp.user.email,
          avatarUrl: resp.user.avatarUrl,
          token: resp.token,
        };
      }
      return null;
    } catch (error) {
      console.error('Error logging in:', error);
      return null;
    }
  },
});

export const authOptions: AuthOptions = {
  providers: [googleAuthProvider, credentialsProvider],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        const email = profile?.email;

        if (email && account.id_token) {
          try {
            const resp = await AuthService.handleGoogleAuth(account.id_token);
            if (resp) {
              user.id = resp.user.id;
              user.name = resp.user.name ?? 'Unknown';
              user.email = resp.user.email;
              user.avatarUrl = resp.user.avatarUrl || user.image || '';
              user.token = resp.token;
            } else {
              console.error('Error signing in');
              return false;
            }
          } catch (error) {
            console.error('Error signing in:', error);
            return false;
          }
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update' && session?.user) {
        return { ...token, ...session.user };
      }
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.avatarUrl = user.avatarUrl || '';
        token.token = user.token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.avatarUrl = token.avatarUrl as string;
        session.user.token = token.token as string;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
};
