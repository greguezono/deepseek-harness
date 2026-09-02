/** Copy dictionaries for the authorization Settings tab. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  tab: '授权',
  loading: '正在读取授权…',
  error: '暂时无法读取授权。',
  retry: '重试',
  empty: '暂无授权条目。',
  signIn: '登录',
  signOut: '退出登录',
  cancel: '取消',
  submit: '提交',
  decline: '拒绝',
  statusSignInRequired: '需要登录',
  statusAuthorizing: '授权中',
  statusAuthorized: '已授权',
  statusError: '出错',
  openLink: '打开链接',
  promptPlaceholder: '请输入',
  outcomeAuthorized: '授权完成。',
  outcomeCancelled: '已取消授权。',
  outcomeFailed: '授权失败。',
  serverLabel: '服务器',
  methodsLabel: '登录方式',
  loopbackOnlyNote: '仅可从本机浏览器完成登录。',
} satisfies Record<string, string>

/** Authorization tab locale key union. */
export type AuthorizationLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'Authorization',
  loading: 'Reading authorization…',
  error: 'Authorization is temporarily unavailable.',
  retry: 'Retry',
  empty: 'No authorization entries.',
  signIn: 'Sign in',
  signOut: 'Sign out',
  cancel: 'Cancel',
  submit: 'Submit',
  decline: 'Decline',
  statusSignInRequired: 'Sign-in required',
  statusAuthorizing: 'Authorizing',
  statusAuthorized: 'Authorized',
  statusError: 'Error',
  openLink: 'Open link',
  promptPlaceholder: 'Enter value',
  outcomeAuthorized: 'Authorization complete.',
  outcomeCancelled: 'Authorization cancelled.',
  outcomeFailed: 'Authorization failed.',
  serverLabel: 'Server',
  methodsLabel: 'Sign-in method',
  loopbackOnlyNote: 'Sign-in works only from a browser on the host machine.',
} satisfies Record<AuthorizationLocaleKey, string>
