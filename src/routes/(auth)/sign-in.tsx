import { createFileRoute } from '@tanstack/react-router';

import { SignInForm } from '@/blocks/sign-in-form';

export const Route = createFileRoute('/(auth)/sign-in')({
  component: SignInForm,
});
