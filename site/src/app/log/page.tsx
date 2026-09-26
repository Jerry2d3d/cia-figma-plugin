import type { Metadata } from 'next';
import { Badge } from '@bp/components/Badge';
import { LOG, NEXT_STEPS, type StatusLevel } from '@/content/pipeline';
import styles from '@/components/content.module.scss';

export const metadata: Metadata = {
  title: 'Build log',
  description: 'Every real run inside Figma, newest first, with what it proved and what it broke.',
};

const BADGE: Record<StatusLevel, { variant: 'success' | 'error' | 'warning'; text: string }> = {
  working: { variant: 'success', text: 'Passed' },
  blocked: { variant: 'error', text: 'Blocked' },
  pending: { variant: 'warning', text: 'Pending' },
};

export default function LogPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className="eyebrow">Internal · build log</p>
          <h1 className={styles.title}>What has actually been tested</h1>
          <p className="lede">
            Newest first. Each round is a real run inside Figma, not a unit test. Unit tests pass long
            before a thing works in the product.
          </p>
        </div>
      </header>

      <div className="page page--narrow">
        <section>
          {LOG.map((entry) => (
            <article key={entry.slug} className={styles.entry}>
              <div className={styles.entryHead}>
                <Badge variant={BADGE[entry.level].variant} size="sm" dot>
                  {BADGE[entry.level].text}
                </Badge>
                <span className={styles.entryDate}>{entry.date}</span>
              </div>
              <h2 className={styles.entryTitle}>
                {entry.round} — {entry.title}
              </h2>
              {entry.body.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className={styles.body}>
                  {paragraph}
                </p>
              ))}
              <dl className={styles.facts}>
                {entry.facts.map((fact) => (
                  <div key={fact.label} style={{ display: 'contents' }}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What&apos;s next</h2>
          <p className={styles.body}>
            In order. The first one unblocks the most work of anything on the list.
          </p>
          <ol className={styles.numbered}>
            {NEXT_STEPS.map((step, index) => (
              <li key={step.title} className={styles.numberedItem}>
                <span className={styles.numberedIndex}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <span className={styles.ownerTag}>{step.owner}</span>
                  <h3 className={styles.h3}>{step.title}</h3>
                  <p className={styles.body}>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
