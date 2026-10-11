import { useEffect, useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

import { authClient, signIn, useSession } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { authCallbackUrl, authRetryUrl } from '@/lib/auth-callback-url';
import { trackDance } from '@/lib/dance-analytics';
import { authFailureReason } from '@/lib/dance-diagnostics';
import { flushDanceFunnel } from '@/lib/dance-funnel-client';
import { resolveAfterAuthUrl, safeInternalPath } from '@/lib/redirect';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { TextField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import '@/styles/dance.css';

const signInSchema = z.object({
  email: z.string().email(m['common.sign.email_placeholder']()),
  password: z.string().min(1),
});

export function SignInForm({
  embedded = false,
  returnTo,
}: {
  embedded?: boolean;
  returnTo?: string;
}) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  // Set right before we navigate so the already-signed-in effect doesn't also fire.
  const navigatingRef = useRef(false);
  const [error, setError] = useState('');
  const socialLock = useRef(false);
  const [socialPending, setSocialPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // callbackUrl: internal page path, goes there directly after login.
  // redirect: either an internal path (same thing) or an app protocol URL like
  // `myapp://auth/callback`, which detours through /auth-callback for a token.
  const [redirectParam, setRedirectParam] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectParam(params.get('redirect'));
    setCallbackUrl(returnTo || params.get('callbackUrl'));
    if (params.get('authError') === '1') {
      setError(m['common.sign.retry_auth']());
      trackDance('dance_auth_failed', { reason: 'authentication_required' });
    }
  }, [returnTo]);

  // Already signed in (visited /sign-in directly, or a stale callbackUrl looped
  // back here) → go home. The auth pages never gate themselves, so this can't loop.
  useEffect(() => {
    if (sessionPending || navigatingRef.current) return;
    if (session?.user) {
      navigatingRef.current = true;
      window.location.assign(
        localizeHref(
          safeInternalPath(
            returnTo ||
              new URLSearchParams(window.location.search).get('callbackUrl')
          ) || '/#studio'
        )
      );
    }
  }, [sessionPending, session?.user, router, returnTo]);

  // Allow only same-site relative paths, and never an auth page (would loop).
  const safeCallbackUrl = safeInternalPath(callbackUrl);

  const afterLoginUrl = resolveAfterAuthUrl({
    redirect: redirectParam,
    callbackUrl: returnTo || callbackUrl,
    fallback: '/#studio',
  });

  // Carry callbackUrl/redirect across to sign-up so the destination survives the switch.
  const switchQuery = (() => {
    const p = new URLSearchParams();
    if (safeCallbackUrl) p.set('callbackUrl', safeCallbackUrl);
    if (redirectParam) p.set('redirect', redirectParam);
    const s = p.toString();
    return s ? `?${s}` : '';
  })();

  const configQuery = usePublicConfig();
  const configs = hydrated ? (configQuery.data ?? {}) : {};

  const configsLoaded = hydrated && configQuery.isSuccess;
  const emailEnabled = configs.email_auth_enabled !== 'false';
  const googleEnabled = configs.google_auth_enabled === 'true';
  const githubEnabled = configs.github_auth_enabled === 'true';
  const passwordResetEnabled = configs.password_reset_enabled === 'true';
  const hasSocial = googleEnabled || githubEnabled;
  const hasAnyMethod = emailEnabled || hasSocial;

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      trackDance('dance_auth_started', { stage: 'email' });
      setError('');
      navigatingRef.current = true;
      try {
        const result: any = await signIn.email({
          email: value.email,
          password: value.password,
        });
        if (result.error) {
          trackDance('dance_auth_failed', {
            stage: 'email',
            reason: authFailureReason(result.error),
          });
          navigatingRef.current = false;
          const status = result.error.status;
          const code = result.error.code;
          const msg = result.error.message || '';
          if (
            code === 'EMAIL_NOT_VERIFIED' ||
            (status === 403 && /not verified/i.test(msg))
          ) {
            const verifyPath = `/verify-email?sent=1&email=${encodeURIComponent(
              value.email
            )}&callbackUrl=${encodeURIComponent(afterLoginUrl)}`;
            void authClient.sendVerificationEmail({
              email: value.email,
              callbackURL: authCallbackUrl(
                localizeHref(afterLoginUrl),
                window.location.origin
              ),
            });
            router.push(verifyPath);
            return;
          }
          setError(
            authFailureReason(result.error) === 'invalid_credentials'
              ? m['common.sign.credentials_help']()
              : m['common.sign.retry_auth']()
          );
        } else {
          // Hard navigation so the destination reloads with a fresh session
          // cookie — a client push would let the guard read a stale (logged-out)
          // session store and bounce straight back to /sign-in.
          navigatingRef.current = true;
          window.location.assign(localizeHref(afterLoginUrl));
        }
      } catch (err: any) {
        trackDance('dance_auth_failed', {
          stage: 'email',
          reason: authFailureReason(err),
        });
        navigatingRef.current = false;
        setError(m['common.sign.retry_auth']());
      }
    },
  });

  async function handleSocial(provider: 'google' | 'github') {
    if (socialLock.current) return;
    socialLock.current = true;
    setSocialPending(true);
    setError('');
    trackDance('dance_auth_started', { stage: provider });
    await Promise.race([
      flushDanceFunnel(),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
    try {
      const result = await signIn.social({
        provider,
        fetchOptions: { signal: AbortSignal.timeout(15000) },
        callbackURL: authCallbackUrl(
          localizeHref(afterLoginUrl),
          window.location.origin
        ),
        errorCallbackURL: authRetryUrl(
          localizeHref(afterLoginUrl),
          localizeHref('/sign-in'),
          window.location.origin
        ),
      });
      if (result.error) {
        trackDance('dance_auth_failed', {
          stage: provider,
          reason: authFailureReason(result.error),
        });
        setError(m['common.sign.retry_auth']());
        socialLock.current = false;
        setSocialPending(false);
      }
    } catch {
      trackDance('dance_auth_failed', {
        stage: provider,
        reason: 'network_or_client',
      });
      setError(m['common.sign.retry_auth']());
      socialLock.current = false;
      setSocialPending(false);
    }
  }

  return (
    <div
      className={
        embedded
          ? 'dance-inline-auth'
          : 'dance-auth-page bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10'
      }
    >
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="self-center font-serif text-lg italic">
          {configs.app_name || envConfigs.app_name}
        </Link>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {m['common.sign.sign_in_title']()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {embedded && configsLoaded && emailEnabled && (
              <p className="dance-auth-new">
                <Link href={`/sign-up${switchQuery}`}>
                  {m['dance.auth.newaccount']()}
                </Link>
              </p>
            )}
            {configsLoaded && !hasAnyMethod ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm font-medium">
                  {m['common.sign.no_methods_title']()}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {m['common.sign.no_methods_description']()}
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
              >
                <FieldGroup>
                  {error && (
                    <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                      {error}
                    </div>
                  )}

                  {hasSocial && (
                    <Field>
                      {googleEnabled && (
                        <Button
                          variant="outline"
                          type="button"
                          disabled={socialPending}
                          onClick={() => handleSocial('google')}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            className="size-4"
                          >
                            <path
                              d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                              fill="currentColor"
                            />
                          </svg>
                          {socialPending
                            ? m['common.sign.connecting']()
                            : m['common.sign.google_sign_in']()}
                        </Button>
                      )}
                      {githubEnabled && (
                        <Button
                          variant="outline"
                          type="button"
                          disabled={socialPending}
                          onClick={() => handleSocial('github')}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            className="size-4"
                          >
                            <path
                              d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                              fill="currentColor"
                            />
                          </svg>
                          {m['common.sign.github_sign_in']()}
                        </Button>
                      )}
                    </Field>
                  )}

                  {hasSocial && emailEnabled && (
                    <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                      {m['common.sign.or']()}
                    </FieldSeparator>
                  )}

                  {emailEnabled && (
                    <>
                      <form.Field name="email">
                        {(field) => (
                          <TextField
                            field={field}
                            label={m['common.sign.email_title']()}
                            type="email"
                            required
                            placeholder={m['common.sign.email_placeholder']()}
                          />
                        )}
                      </form.Field>
                      <form.Field name="password">
                        {(field) => {
                          const err = field.state.meta.isTouched
                            ? (field.state.meta.errors?.[0] as any)
                            : null;
                          const errMsg =
                            err == null
                              ? null
                              : typeof err === 'string'
                                ? err
                                : err.message
                                  ? String(err.message)
                                  : String(err);
                          return (
                            <Field>
                              <div className="flex items-center justify-between">
                                <FieldLabel htmlFor={field.name}>
                                  {m['common.sign.password_title']()}
                                </FieldLabel>
                                {passwordResetEnabled && (
                                  <Link
                                    href={`/forgot-password${switchQuery}`}
                                    className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
                                  >
                                    {m['common.sign.forgot_password']()}
                                  </Link>
                                )}
                              </div>
                              <Input
                                id={field.name}
                                name={field.name}
                                type="password"
                                value={field.state.value}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                onBlur={field.handleBlur}
                                required
                                placeholder={m[
                                  'common.sign.password_placeholder'
                                ]()}
                                aria-invalid={errMsg ? true : undefined}
                              />
                              {errMsg && (
                                <p className="text-destructive text-sm">
                                  {errMsg}
                                </p>
                              )}
                            </Field>
                          );
                        }}
                      </form.Field>
                      <Field>
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                          {(isSubmitting) => (
                            <Button
                              type="submit"
                              disabled={isSubmitting || socialPending}
                            >
                              {isSubmitting
                                ? '...'
                                : m['common.sign.sign_in_title']()}
                            </Button>
                          )}
                        </form.Subscribe>
                        <FieldDescription className="text-center">
                          {m['common.sign.no_account']()}{' '}
                          <Link
                            href={`/sign-up${switchQuery}`}
                            className="underline underline-offset-4"
                          >
                            {m['common.sign.sign_up_title']()}
                          </Link>
                        </FieldDescription>
                      </Field>
                    </>
                  )}
                </FieldGroup>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
