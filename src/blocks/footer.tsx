import { m } from '@/paraglide/messages.js';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';

export function Footer() {
  const columns: FooterColumn[] = [
    {
      title: m['landing.footer.product'](),
      links: [
        { label: m['dance.studio'](), href: '/#studio' },
        { label: m['dance.pricing'](), href: '/pricing' },
      ],
    },
    {
      title: m['landing.footer.legal'](),
      links: [
        { label: m['dance.privacy'](), href: '/privacy-policy' },
        { label: m['dance.terms'](), href: '/terms-of-service' },
        { label: m['dance.refunds'](), href: '/refund-policy' },
        { label: m['dance.contact'](), href: '/contact' },
      ],
    },
  ];
  return <SiteFooter tagline={m['dance.lead']()} columns={columns} />;
}
