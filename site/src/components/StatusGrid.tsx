import { Badge } from '@bp/components/Badge';
import { STATUS, type StatusLevel } from '@/content/pipeline';
import styles from './StatusGrid.module.scss';

const BADGE: Record<StatusLevel, { variant: 'success' | 'error' | 'warning'; text: string }> = {
  working: { variant: 'success', text: 'Working' },
  blocked: { variant: 'error', text: 'Blocked' },
  pending: { variant: 'warning', text: 'Not started' },
};

export function StatusGrid() {
  return (
    <ul className={styles.grid}>
      {STATUS.map((item) => (
        <li key={item.title} className={styles.cell}>
          <Badge variant={BADGE[item.level].variant} size="sm" dot>
            {BADGE[item.level].text}
          </Badge>
          <h3 className={styles.title}>{item.title}</h3>
          <p className={styles.detail}>{item.detail}</p>
        </li>
      ))}
    </ul>
  );
}
