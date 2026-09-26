import Link from 'next/link';
import { Button } from '@bp/components/Button';
import { StatusGrid } from '@/components/StatusGrid';
import styles from './page.module.scss';

const LOOP = [
  {
    step: 'Code',
    title: 'Tokens and components are written once, in code',
    detail:
      'css-is-awesome holds the tokens and themes. BoilerPlate v2 holds the components that use them. Neither is drawn by hand in Figma.',
  },
  {
    step: 'Into Figma',
    title: 'The plugin builds the real library inside the file',
    detail:
      'Tokens become Figma Variables with Light and Dark modes. Components become real component sets, with every fill, radius and space bound to those Variables.',
  },
  {
    step: 'Design',
    title: 'A PM composes a screen from those pieces',
    detail:
      'Pick variants, set text, flip flags. Leave a Prompt beside anything that needs a rule, such as which login a page uses.',
  },
  {
    step: 'Back out',
    title: 'The screen reads back as structured facts',
    detail:
      'Which components, which props and flags, what text, what layout in token names, and every Prompt. Not a picture. Something an AI can build from.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className="eyebrow">Figma in, structured facts out</p>
          <h1 className={styles.title}>
            Design the screen in Figma. <span className={styles.accent}>Build it from the same parts.</span>
          </h1>
          <p className="lede">
            Two tools that turn a Figma file into a real extension of your codebase: the component
            library and its tokens go in, a composed screen comes back out as facts an AI can build
            from. Nothing is hand-drawn, and nothing is guessed.
          </p>
          <div className={styles.actions}>
            <Link href="/how-it-works" className={styles.plainLink}>
              <Button label="See how it works" variant="primary" size="large" />
            </Link>
            <Link href="/plugins" className={styles.plainLink}>
              <Button label="The two plugins" variant="outline" size="large" />
            </Link>
          </div>
        </div>
      </section>

      <div className="page">
        <section>
          <h2 className={styles.sectionTitle}>The loop</h2>
          <ol className={styles.loop}>
            {LOOP.map((item, index) => (
              <li key={item.step} className={styles.loopItem}>
                <span className={styles.loopIndex}>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <span className={styles.loopStep}>{item.step}</span>
                  <h3 className={styles.loopTitle}>{item.title}</h3>
                  <p className={styles.loopDetail}>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.statusSection}>
          <h2 className={styles.sectionTitle}>Where it stands today</h2>
          <p className="lede" style={{ marginBottom: '1.5rem' }}>
            Everything below has run inside real Figma, not just in tests.
          </p>
          <StatusGrid />
        </section>

        <section className={styles.ruleSection}>
          <h2 className={styles.sectionTitle}>The rule that keeps it honest</h2>
          <div className={styles.ruleGrid}>
            <div className={styles.rule}>
              <h3 className={styles.ruleTitle}>One direction of truth per thing</h3>
              <p className={styles.ruleBody}>
                Tokens and components flow from code into Figma. Screens flow from Figma into code. A
                designer restyling a component in Figma is drift to flag, never something to import.
              </p>
            </div>
            <div className={styles.rule}>
              <h3 className={styles.ruleTitle}>Gaps are named, never guessed</h3>
              <p className={styles.ruleBody}>
                Anything that does not resolve cleanly comes back as a named gap with a reason. A
                wrong guess produces work that looks right and is wrong, which is far more expensive
                than an honest hole.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
