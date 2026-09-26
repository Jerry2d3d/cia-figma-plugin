'use client';

import { useState } from 'react';
import styles from './CopyRow.module.scss';

interface Props {
  label?: string;
  value: string;
}

export function CopyRow({ label, value }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers, or a page served without a secure context.
      const field = document.createElement('textarea');
      field.value = value;
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      document.body.removeChild(field);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={styles.wrap}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <div className={styles.row}>
        <code className={styles.code}>{value}</code>
        <button
          type="button"
          onClick={copy}
          className={styles.button}
          data-copied={copied ? 'yes' : undefined}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
