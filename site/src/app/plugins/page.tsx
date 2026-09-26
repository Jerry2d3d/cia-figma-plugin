import type { Metadata } from 'next';
import { Alert } from '@bp/components/Alert';
import styles from '@/components/content.module.scss';

export const metadata: Metadata = {
  title: 'The two plugins',
  description:
    'What cia-figma-plugin and figma-import-export each do, and how they work together across the contract.',
};

export default function PluginsPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className="eyebrow">The two plugins</p>
          <h1 className={styles.title}>One writes Figma. One reads it.</h1>
          <p className="lede">
            Together they make a Figma file a real extension of the codebase. Apart, each is useful on
            its own: one keeps a Figma library in sync with code, the other turns designs into data.
          </p>
        </div>
      </header>

      <div className="page page--narrow">
        <section>
          <div className={`${styles.panel} ${styles.panelAccent}`}>
            <p className="eyebrow">Runs inside Figma</p>
            <h2 className={styles.h2}>cia-figma-plugin</h2>
            <p className={styles.body}>
              The only half that can create anything in a Figma file. It reads the token contract and
              writes real Variables, and reads a component spec and builds a real component set with
              everything bound to those Variables. It has no filesystem and no network: it only knows
              the JSON it is handed.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Panel</th>
                    <th>What it does</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Tokens</td>
                    <td>
                      Creates or updates a Variable collection, its Light and Dark modes, and every
                      variable in it. Re-running it updates in place rather than duplicating.
                    </td>
                  </tr>
                  <tr>
                    <td>Components</td>
                    <td>
                      Builds a component set from a spec: one component per variant combination, with
                      fills, strokes, radius, padding, spacing and type bound to the collection you
                      pick. Text props become editable fields and boolean props become flags.
                    </td>
                  </tr>
                  <tr>
                    <td>Prompt</td>
                    <td>
                      Adds the Prompt component, so a PM can leave a rule beside the part of the
                      design it governs.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={`${styles.panel} ${styles.panelAccent}`}>
            <p className="eyebrow">Runs as a server</p>
            <h2 className={styles.h2}>figma-import-export</h2>
            <p className={styles.body}>
              Has the filesystem and the source of truth. It reads the design system and the component
              code, produces the contracts the plugin consumes, and reads composed Figma screens back
              through the REST API. It can read anything in Figma and create nothing, which is a
              platform limit rather than a design choice.
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>What it does</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>export_tokens</td>
                    <td>
                      Turns a theme into the Variables-shaped token contract, splitting light and dark
                      values into two modes. Values Figma cannot hold come back as named gaps.
                    </td>
                  </tr>
                  <tr>
                    <td>export_component_spec</td>
                    <td>
                      Turns a component&apos;s TypeScript and stylesheet into a versioned build spec:
                      props with their enums, and every token call tagged with the property and state
                      it sets.
                    </td>
                  </tr>
                  <tr>
                    <td>map_screen</td>
                    <td>
                      Reads a composed screen: which components, which props and flags, what text,
                      what layout in token names, and the Prompts a PM left. Components are matched by
                      id, so renaming a layer does not break the match.
                    </td>
                  </tr>
                  <tr>
                    <td>pull_component</td>
                    <td>
                      Reads one Figma node and matches it against the component manifest. An unmatched
                      node is reported as a gap, never a guess.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>The Prompt component</h2>
          <p className={styles.body}>
            A PM needs somewhere to say &ldquo;this login is Google only&rdquo; or &ldquo;put this
            behind a feature flag&rdquo;, next to the thing it applies to. That is the Prompt
            component: a note placed in the design, with a rule, a scope, and a kind.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>rule</td>
                  <td>The instruction itself, in plain words. One rule per Prompt.</td>
                </tr>
                <tr>
                  <td>scope</td>
                  <td>
                    app, page, section or component. Placement decides it: a Prompt inside a frame
                    governs that frame.
                  </td>
                </tr>
                <tr>
                  <td>kind</td>
                  <td>
                    page for what the screen does, tooling for how it gets built, such as flags and
                    integrations.
                  </td>
                </tr>
                <tr>
                  <td>target</td>
                  <td>
                    Optional layer name, for a rule about one instance. Figma does not allow placing a
                    note inside an instance, so the Prompt sits beside it and names it.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={styles.internalNote}>
            <Alert variant="info" title="Figma comments stay human">
              Comments are for discussion between people, and nothing in the pipeline reads them. The
              Prompt component is the one channel the tooling looks at, which means a rule is always
              deliberate rather than an offhand remark picked up by accident.
            </Alert>
          </div>
        </section>
      </div>
    </>
  );
}
