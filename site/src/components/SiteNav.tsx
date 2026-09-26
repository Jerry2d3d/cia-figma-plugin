'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SiteNav.module.scss';

const PUBLIC_LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/plugins', label: 'The two plugins' },
];

const INTERNAL_LINKS = [
  { href: '/docs', label: 'Test runbook' },
  { href: '/log', label: 'Build log' },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className={styles.bar}>
      <nav className={styles.inner} aria-label="Main">
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>cia</span>
          <span>Figma Pipeline</span>
        </Link>

        <div className={styles.links}>
          {PUBLIC_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${pathname === item.href ? styles.linkActive : ''}`}
            >
              {item.label}
            </Link>
          ))}
          {INTERNAL_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.internal}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
