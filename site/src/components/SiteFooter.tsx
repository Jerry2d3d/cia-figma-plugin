import styles from './SiteFooter.module.scss';

export function SiteFooter() {
  return (
    <footer className={styles.foot}>
      <div className={styles.inner}>
        <p className={styles.line}>
          Two repos, one versioned contract. Built on css-is-awesome tokens and the BoilerPlate v2
          component library.
        </p>
        <p className={styles.note}>
          This site runs on the same design system it documents: every colour, space and radius here
          is a css-is-awesome token, and the components are BoilerPlate&apos;s own.
        </p>
      </div>
    </footer>
  );
}
