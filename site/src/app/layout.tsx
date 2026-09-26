import type { Metadata } from 'next';
import 'css-is-awesome/css';
import 'css-is-awesome/themes/boilerplate';
import '@/styles/site.scss';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: {
    default: 'cia Figma Pipeline',
    template: '%s · cia Figma Pipeline',
  },
  description:
    'Design a screen in Figma from the real component library, then read it back as structured facts an AI can build from.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
