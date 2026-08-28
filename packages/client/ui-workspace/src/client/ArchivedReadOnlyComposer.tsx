/**
 * Composer replacement for an archived session. The workspace browser opens
 * archived rows for reading, so the session has no send path: this frame
 * states that instead of offering an input the Host would reject.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ArchivedReadOnlyComposer.module.css'

/** Full chain props after the archived selector accepts the owner currency. */
export type ArchivedReadOnlyComposerProps =
  PropsRuntime<'conversation.composer'> & PropsLocale<'workspace'>

/**
 * Explain that an archived session is open for reading only.
 * @param props.t - the plugin's locale seat.
 * @returns a read-only composer replacement.
 */
export function ArchivedReadOnlyComposer({ t }: Pick<ArchivedReadOnlyComposerProps, 't'>) {
  return (
    <div className={css.frame} role="status">
      <strong>{t('archived.readonly.title')}</strong>
      <span>{t('archived.readonly.body')}</span>
    </div>
  )
}
