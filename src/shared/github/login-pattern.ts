/**
 * GitHub's login rule: 1 to 39 letters, digits or hyphens, not starting with
 * a hyphen. It is looser than GitHub's current signup rule, which also forbids
 * trailing and consecutive hyphens, because older accounts such as `rr-` still
 * have them and appear in the data.
 */
export const GITHUB_LOGIN_PATTERN = /^[a-z\d][a-z\d-]{0,38}$/iu
