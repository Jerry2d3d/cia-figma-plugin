import type { Metadata } from 'next';
import { Alert } from '@bp/components/Alert';
import { CopyRow } from '@/components/CopyRow';
import { PATHS } from '@/content/pipeline';
import styles from '@/components/content.module.scss';

export const metadata: Metadata = {
  title: 'Test runbook',
  description:
    'Build everything from an empty Figma file: five themes, the whole component library, a two-screen design and a theme switch.',
};

export default function DocsPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className="eyebrow">Internal · runbook</p>
          <h1 className={styles.title}>From an empty Figma file</h1>
          <p className="lede">
            Five themes, all 99 components, the Prompt, a two-screen design and a theme switch.
            About 40 minutes, most of it waiting on one build. Nothing here can damage anything
            outside the new Figma file.
          </p>
        </div>
      </header>

      <div className="page page--narrow">
        <section>
          <h2 className={styles.h2}>The plugin panel</h2>
          <p className={styles.body}>
            Four sections, and two buttons both say <strong>Choose File</strong>. Every step below
            says which one.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Where it is</th>
                  <th>What it takes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Button A</td>
                  <td>First Choose File, under Tokens</td>
                  <td>the themes file</td>
                </tr>
                <tr>
                  <td>Button B</td>
                  <td>Second Choose File, under Spec files</td>
                  <td>one or many component specs</td>
                </tr>
                <tr>
                  <td>Button C</td>
                  <td>Build, greyed until a collection and specs are chosen</td>
                  <td>nothing, just click it</td>
                </tr>
                <tr>
                  <td>Button D</td>
                  <td>Add Prompt component</td>
                  <td>nothing, just click it</td>
                </tr>
                <tr>
                  <td>Button E</td>
                  <td>Mark selected, under Frames</td>
                  <td>a frame selected on the canvas</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={styles.internalNote}>
            <Alert variant="warning" title="The easy mistake">
              Putting a component spec into Button A reports an unsupported version. That is the
              wrong door rather than a bug. The themes file goes in A, component specs go in B.
            </Alert>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part 0</span>
              <h3 className={styles.stepTitle}>New file and plugin</h3>
              <span className={styles.stepTime}>3 min</span>
            </div>
            <div className={styles.stepBody}>
              <ol className={styles.steps}>
                <li>
                  Open the Figma <strong>desktop</strong> app. The browser version cannot run a local
                  plugin.
                </li>
                <li>Make a new design file.</li>
                <li>Plugins, Development, Import plugin from manifest, and pick the file below.</li>
                <li>
                  Run it, and check all four headings are there: Tokens, Components, Prompt, Frames.
                  If Frames is missing, Figma cached an older build. Remove it under Manage plugins
                  in development and import again.
                </li>
              </ol>
              <CopyRow label="The manifest" value={PATHS.manifest} />
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part 1</span>
              <h3 className={styles.stepTitle}>The five themes</h3>
              <span className={styles.stepTime}>3 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>Button A, then the file below.</p>
              <CopyRow label="Button A · the themes file" value={PATHS.tokens} />
              <Alert variant="success" title="Expect">
                Collection <strong>cia</strong>, 133 created, 9 modes added, no gaps, and a line
                saying the variable map was saved. Nine rather than ten is right: a new collection
                arrives with one mode already, which gets renamed rather than left behind.
              </Alert>
              <p className={styles.body}>
                Open Figma&apos;s Variables panel and confirm ten mode columns. Find{' '}
                <code>btn-radius</code>: most columns should show the name <code>radius-md</code>{' '}
                rather than a number, because it points at that variable instead of copying it.
                Terminal shows 0 and press shows 2, which are real overrides.
              </p>
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part 2</span>
              <h3 className={styles.stepTitle}>The whole component library</h3>
              <span className={styles.stepTime}>10 min</span>
            </div>
            <div className={styles.stepBody}>
              <ol className={styles.steps}>
                <li>Check the Collection dropdown says cia.</li>
                <li>Button B, go to the folder below, and press Ctrl+A. It holds the 99 specs and nothing else.</li>
                <li>Button C should read Build 99 components. Click it, then wait.</li>
              </ol>
              <CopyRow label="Button B · the component specs folder" value={PATHS.spec} />
              <p className={styles.body}>
                The folder should hold exactly 99 files. If Ctrl+A picks more, some are stale
                duplicates from an older export, and the panel will report duplicate sets.
              </p>
              <Alert variant="success" title="Expect">
                Built 99 components, 282 variants and 4639 bindings, about 152 build gaps plus 58 the spec reports, and a collapsed
                list of things not built. The component sets lay out in a grid rather than a pile.
              </Alert>
              <p className={styles.body}>
                Headings should come out at six different sizes, largest to smallest. If all six look
                the same, the build ran against an older plugin. Container should show five widths.
              </p>
              <p className={styles.body}>
                Components now arrive with their inner parts as nested frames, not just a styled
                outer box. Open Checkbox or Dropdown in the layers panel and you should see named
                children. Three still arrive empty, because their JSX could not be scanned, and the
                panel says which.
              </p>
              <div className={styles.internalNote}>
                <Alert variant="warning" title="Sizes are right but not themeable">
                  69 typography values are applied as plain numbers rather than bound, because cia
                  exports no Variable for them. They render correctly and they will not change when
                  you switch theme. That is the single biggest upstream ask on the token side.
                </Alert>
              </div>
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part 3</span>
              <h3 className={styles.stepTitle}>The Prompt component</h3>
              <span className={styles.stepTime}>2 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>
                Button D, once. Eight variants appear, each saying what its scope governs. Clicking
                twice makes a second set and the panel will say so.
              </p>
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part 4</span>
              <h3 className={styles.stepTitle}>A two-screen design</h3>
              <span className={styles.stepTime}>12 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>This part has never been tested. One page and one modal.</p>
              <ol className={styles.steps}>
                <li>Draw a large frame named Login and a small one named Confirm beside it.</li>
                <li>
                  Select Login, set the Frames dropdown to <strong>page</strong>, click Button E. It
                  becomes page/Login. Do the same for Confirm as <strong>modal</strong>.
                </li>
                <li>
                  Ctrl-drag three Button instances into Login. Give them different variants and real
                  labels, and turn the disabled flag on for one.
                </li>
                <li>
                  Select the three and press Shift+A for auto-layout. Name it Actions, set it
                  vertical.
                </li>
                <li>
                  Hover the gap field, click the small variable icon, and pick <code>space-md</code>.
                  Do the same for padding with <code>space-lg</code>.
                </li>
                <li>Put one Button in the modal.</li>
                <li>
                  Add a Prompt to Login with the rule below, then set Position: Absolute on it so it
                  floats over the screen instead of joining the row.
                </li>
                <li>
                  Optional: in prototype mode, drag a connection from the modal&apos;s button back to
                  Login. Nobody has proven those come back over the API yet.
                </li>
              </ol>
              <CopyRow label="A rule for the Prompt" value={PATHS.rule1} />
              <Alert variant="warning" title="Bind, do not type">
                Typing 16 into the gap field looks identical and binds nothing. The binding is the
                whole point: it is what lets the screen read back as a token name rather than a
                number.
              </Alert>
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part 5</span>
              <h3 className={styles.stepTitle}>The theme switch</h3>
              <span className={styles.stepTime}>2 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>
                Select the Login frame, find the variable modes control in the right panel, and
                change it from <code>sketchbook Light</code> to <code>terminal Dark</code>. The whole
                screen should re-theme. Nothing is rebuilt and nothing is relinked. Try{' '}
                <code>glass Light</code> and <code>press Dark</code> too.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What to send back</h2>
          <ul className={styles.steps}>
            <li>The Variables panel with its ten mode columns.</li>
            <li>The build result panel after all 99.</li>
            <li>The layers panel showing both frames.</li>
            <li>The same screen in two different themes.</li>
            <li>The Login frame link, via right-click, Copy link to selection.</li>
            <li>Any error text word for word, with the part and step it happened on.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Running the plugin yourself</h2>
          <CopyRow label="Rebuild it, from packages\cia-plugin" value={PATHS.build} />
          <CopyRow label="Run its tests" value={PATHS.test} />
        </section>
      </div>
    </>
  );
}
