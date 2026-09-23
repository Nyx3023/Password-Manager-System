/**
 * Built-in Google Drive OAuth Credentials for SecureX
 *
 * Hardcoding your Google OAuth Client ID here embeds it directly into the application
 * binary, so neither you nor your users ever need to input API keys again when
 * installing or reinstalling SecureX on any device (Desktop or Mobile).
 */

export const BUILTIN_GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";

/**
 * Optional client secret (usually not required for Desktop App PKCE, but supported if needed).
 */
export const BUILTIN_GOOGLE_CLIENT_SECRET =
  (import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined) || "";
