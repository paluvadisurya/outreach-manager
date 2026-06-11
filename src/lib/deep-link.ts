/**
 * Deep-link helpers for screens that open a target (a campaign queue position,
 * a call persona) from a `?contact=` URL parameter.
 *
 * The screens are reached by soft navigation (`router.push`). Next.js may reuse
 * a page's React subtree from its client Router Cache instead of remounting it,
 * which keeps refs and state alive across visits. A naive "handle the deep link
 * once per mount" guard therefore silently ignores a *new* target and leaves the
 * screen pinned to the previous person — the cause of "Call view opened the
 * wrong person". These helpers make the screens react to the *value* of the
 * parameter instead of to mount lifetime.
 */

/**
 * Decide which deep-link target to act on. Returns the parameter value whenever
 * it differs from the last one acted on (so every distinct `?contact=` is
 * honored, even when the component is reused across a soft navigation), or
 * `null` when there is nothing new to do. The caller records the returned value
 * as the new "last handled".
 */
export function nextDeepLinkTarget(
  lastHandled: string | null,
  param: string | null,
): string | null {
  if (!param) return null;
  if (param === lastHandled) return null;
  return param;
}

/**
 * Sanitize a `from` origin carried alongside a deep link into a safe return
 * destination: only same-origin internal paths (leading "/") are allowed, never
 * an absolute external URL. Returns `null` when there is no safe destination.
 */
export function safeReturnPath(from: string | null): string | null {
  return from && from.startsWith("/") ? from : null;
}
