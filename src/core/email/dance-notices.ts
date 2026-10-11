type Notice = 'delivery-restored' | 'credits-compensated';

// Drafts only. No provider call, recipient lookup, or automatic task notification.
export function danceNoticeDraft(
  kind: Notice,
  appName: string,
  appUrl: string
) {
  const origin = new URL(appUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password)
    throw new Error('An HTTPS website URL is required');
  const ordersUrl = new URL('/#orders', origin).href;
  const supportUrl = new URL('/contact', origin).href;
  if (kind === 'delivery-restored')
    return {
      subject: `Your ${appName} video is ready`,
      text: `Hi,\n\nWe're sorry your video was delayed. The video was generated successfully, but a problem saving the result prevented it from appearing in your account. We've restored delivery, and it is now available in your account.\n\nSign in with the same account and open your orders to view or download it:\n${ordersUrl}\n\nWe did not charge you again or use any additional credits. The original download expiry still applies; please check the date shown in your account.\n\nIf you need help, contact us here:\n${supportUrl}\n\nThank you for your patience.\n${appName} Support`,
    };
  if (kind === 'credits-compensated')
    return {
      subject: `100 credits added to your ${appName} account`,
      text: `Hi,\n\nWe're sorry we couldn't deliver your earlier video successfully. To make up for the service problem, we've added 100 support credits to your account, enough for one video at the current credit rate.\n\nSign in with the same account to check your balance:\n${origin.origin}/\n\nThis is a credit compensation, not a cash refund. We have kept the deleted task deleted and have not restored its photos or video. Please check your account for the credit expiry date.\n\nIf you need help, contact us here:\n${supportUrl}\n\nThank you for your patience.\n${appName} Support`,
    };
  throw new Error('Unknown notification type');
}
