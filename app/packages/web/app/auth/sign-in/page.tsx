import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import SignInForm from './sign-in-form';

type SignInPageProps = {
  searchParams?: Promise<{
    redirectTo?: string | string[];
  }>;
};

function safeRedirectTo(value: unknown) {
  const redirectTo = Array.isArray(value) ? value[0] : value;

  if (typeof redirectTo !== 'string' || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return '/';
  }

  return redirectTo;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const redirectTo = safeRedirectTo(params?.redirectTo);
  const user = await getCurrentUser();

  if (user) {
    redirect(redirectTo);
  }

  return <SignInForm redirectTo={redirectTo} />;
}
