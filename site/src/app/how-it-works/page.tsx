import type { Metadata } from 'next';
import styles from '@/components/content.module.scss';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Why the pipeline is split across two runtimes, what the contract between them carries, and the rules that keep it honest.',
};

export default function HowItWorksPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className="eyebrow">How it works</p>
          <h1 className={styles.title}>One contract, two runtimes</h1>
          <p className="lede">
            The split is not a preference. Figma&apos;s Plugin API only exists inside Figma, and Node
            APIs do not exist inside Figma&apos;s sandbox. So the work is divided by what each side is
            physically able to do, and the two halves meet at a versioned JSON contract.
          </p>
        </div>
      </header>

      <div className="page page--narrow">
        <section>
          <h2 className={styles.h2}>What each side can do</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>&nbsp;</th>
                  <th>figma-import-export</th>
                  <th>cia-figma-plugin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Runtime</td>
                  <td>Node, outside Figma</td>
                  <td>Figma&apos;s plugin sandbox</td>
                </tr>
                <tr>
                  <td>Knows about</td>
                  <td>the token contract and the component source</td>
                  <td>the live Figma document</td>
                </tr>
                <tr>
                  <td>Produces</td>
                  <td>token JSON, component specs, screen facts</td>
                  <td>real Variables and real components</td>
                </tr>
                <tr>
                  <td>Cannot</td>
                  <td>create anything in a Figma file</td>
                  <td>read your repositories</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.body} style={{ marginTop: '1rem' }}>
            Neither reads the other&apos;s source or dependencies. That is what lets either side be
            rewritten without touching the other.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What the contract carries</h2>
          <div className={styles.cardGrid}>
            <div className={`${styles.panel} ${styles.panelAccent}`}>
              <h3 className={styles.h3}>The token contract</h3>
              <p className={styles.body}>
                A collection name, its modes, and every variable with a value per mode. It mirrors
                Figma&apos;s own Variables model rather than any plugin&apos;s conventions. Values Figma
                cannot hold, such as composite shadows, come back as named gaps with their raw value.
              </p>
            </div>
            <div className={`${styles.panel} ${styles.panelAccent}`}>
              <h3 className={styles.h3}>The component spec</h3>
              <p className={styles.body}>
                A component&apos;s props with their enums and defaults, plus its style blocks. Every
                token call is tagged with the CSS property it sets and the state it belongs to, so the
                builder never has to guess which colour is the fill and which is the border.
              </p>
            </div>
            <div className={`${styles.panel} ${styles.panelAccent}`}>
              <h3 className={styles.h3}>The screen facts</h3>
              <p className={styles.body}>
                Which components a screen uses, the variant props and flags on each instance, the text
                inside them, the auto-layout of the frames that hold them in token names, and every
                Prompt a PM left in the file.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Every payload is versioned</h2>
          <p className={styles.body}>
            Each contract carries a spec version, and a reader that receives a version it does not
            understand refuses clearly instead of guessing. That is what made it safe to change the
            component spec mid-project: the plugin rejected the old shape by name rather than
            silently mis-binding half a component.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Gaps are first-class</h2>
          <p className={styles.body}>
            Anything that does not resolve cleanly comes back as a named gap with a reason, never a
            best guess. When Button was first built, nine gaps came back: a missing border width in
            the spec, three typography tokens that do not exist in the design system, and a spacing
            token dropped by an export bug. All nine were real problems worth fixing upstream, and all
            nine would have been invisible if the builder had approximated them.
          </p>
          <p className={styles.body}>
            The same rule applies in the other direction. A component whose styles cannot be tied to
            its props is reported as exactly that, rather than being matched by guessing at a naming
            convention. A wrong guess produces a component that looks right and is wrong, which costs
            far more than an honest hole.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>One direction of truth per thing</h2>
          <p className={styles.body}>
            Tokens and components flow from code into Figma. Screens flow from Figma into code. A
            designer restyling a component inside Figma is drift to flag, never something to import
            back. Without that rule, two libraries and two tools quickly become four competing sources
            of truth.
          </p>
        </section>
      </div>
    </>
  );
}
