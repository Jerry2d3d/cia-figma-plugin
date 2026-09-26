import type { Metadata } from 'next';
import { Alert } from '@bp/components/Alert';
import { CopyRow } from '@/components/CopyRow';
import { PATHS } from '@/content/pipeline';
import styles from '@/components/content.module.scss';

export const metadata: Metadata = {
  title: 'Test runbook',
  description:
    'Step by step for the current round: refresh the plugin, compose a screen in Figma, and read it back.',
};

export default function DocsPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className="eyebrow">Internal · round 3</p>
          <h1 className={styles.title}>Run the current test</h1>
          <p className="lede">
            This round runs the whole idea for the first time: compose a screen in Figma, then get
            structured facts out of it. About 25 minutes. Nothing here can damage anything, it only
            adds to a Figma file.
          </p>
        </div>
      </header>

      <div className="page page--narrow">
        <section>
          <h2 className={styles.h2}>The plugin panel</h2>
          <p className={styles.body}>
            Four buttons, and two of them say <strong>Choose File</strong>. Every step below names
            which one to use.
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
                  <td>a .variables.json token file</td>
                </tr>
                <tr>
                  <td>Button B</td>
                  <td>Second Choose File, under Spec</td>
                  <td>a .component-spec.json file</td>
                </tr>
                <tr>
                  <td>Button C</td>
                  <td>Build, greyed out until A and B are done</td>
                  <td>nothing, just click it</td>
                </tr>
                <tr>
                  <td>Button D</td>
                  <td>Add Prompt component</td>
                  <td>nothing, just click it</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={styles.internalNote}>
            <Alert variant="warning" title="The easy mistake">
              Feeding a component spec to Button A reports an unsupported spec version. That is the
              wrong door, not a bug. Token files go in A, component specs go in B.
            </Alert>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part A</span>
              <h3 className={styles.stepTitle}>Relay one message</h3>
              <span className={styles.stepTime}>1 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>
                Open the figma-import-export session and paste the block from the bottom of the state
                file. It asks for the variant-classification fix, which unblocks 34 of the 35
                components, so that session can work on it while you do the rest.
              </p>
              <CopyRow label="The file to open" value={PATHS.state} />
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part B</span>
              <h3 className={styles.stepTitle}>Refresh the Prompt component</h3>
              <span className={styles.stepTime}>3 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>
                The target field&apos;s default changed, so the Prompt set needs rebuilding.
              </p>
              <ol className={styles.steps}>
                <li>Delete the existing Prompt component set and any Prompt instances from round 2.</li>
                <li>
                  Close the plugin, then reopen it from Plugins, Development, cia (dev). That picks up
                  the rebuilt code.
                </li>
                <li>Click Button D, Add Prompt component.</li>
                <li>Ctrl-drag one variant out to make an instance, and check the sidebar.</li>
              </ol>
              <Alert variant="success" title="Expect">
                Eight variants, with rule and target as editable fields. On an instance, target must
                be empty rather than pre-filled: the reader treats any text there as a real layer
                name.
              </Alert>
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part C</span>
              <h3 className={styles.stepTitle}>Compose a small screen</h3>
              <span className={styles.stepTime}>8 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>
                This is the artefact the read side needs. Keep it small and realistic.
              </p>
              <ol className={styles.steps}>
                <li>Press F, draw a frame about 800 by 600, and name it Login.</li>
                <li>Ctrl-drag three Button instances out of the Button set and into that frame.</li>
                <li>
                  Set them to primary large with the label Sign in with Google, outline medium with
                  Use a passkey, and ghost small with Need help? and the disabled flag on.
                </li>
                <li>
                  Select all three and press Shift+A to wrap them in auto-layout. Name that frame
                  Actions, set it vertical, and give it some spacing.
                </li>
                <li>Add two Prompt instances to the Login frame, using the rules below.</li>
                <li>
                  Select both Prompts, right-click, Frame selection, and name that frame exactly
                  _prompts.
                </li>
              </ol>
              <CopyRow label="Prompt 1 · scope page · kind page · no target" value={PATHS.rule1} />
              <CopyRow label="Prompt 2 · scope component · kind tooling · target Use a passkey" value={PATHS.rule2} />
            </div>
          </div>

          <div className={styles.stepGroup}>
            <div className={styles.stepHead}>
              <span className={styles.stepTag}>Part D</span>
              <h3 className={styles.stepTitle}>Read the screen back</h3>
              <span className={styles.stepTime}>10 min</span>
            </div>
            <div className={styles.stepBody}>
              <p className={styles.body}>The payoff: Figma in, structured facts out.</p>
              <ol className={styles.steps}>
                <li>
                  One-time token setup. In Figma go to Settings, Security, Personal access tokens,
                  Generate new token. Name it figma-import-export and scope it to File content,
                  read-only. Copy it straight away, Figma shows it once.
                </li>
                <li>
                  Put it in the env file below, copying .env.example first if that file does not
                  exist. Then restart the figma-import-export session, since the file is read at
                  startup.
                </li>
                <li>
                  Select the Login frame, right-click, Copy link to selection. The link must point at
                  the frame, not the page.
                </li>
                <li>Paste the request below into that session, followed by your link.</li>
              </ol>
              <CopyRow label="Env file" value={PATHS.env} />
              <CopyRow label="Line to put in it" value={PATHS.envLine} />
              <CopyRow label="Request for the other session" value={PATHS.readRequest} />
              <Alert variant="success" title="A good result">
                Three instances with their variant props and labels, the disabled flag true on the
                third, the Actions frame reported vertical with its spacing as a token name rather
                than a pixel number, and both prompts with the right scope and kind. The first
                prompt&apos;s target should come back empty.
              </Alert>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Files you will need</h2>
          <CopyRow label="Import the plugin from this manifest" value={PATHS.manifest} />
          <CopyRow label="Button A · the token file" value={PATHS.tokens} />
          <CopyRow label="Button B · the component spec" value={PATHS.spec} />
          <CopyRow label="Rebuild the plugin, from packages\cia-plugin" value={PATHS.build} />
          <CopyRow label="Run its tests" value={PATHS.test} />
        </section>
      </div>
    </>
  );
}
