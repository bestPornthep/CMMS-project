// The user-facing message of a failed API call: the backend's own text when it sent one (Nest puts it in
// `error.message`; a 409 PM-type conflict already names the blocking task there), else a fallback.
export function apiErrorMessage(e: any, fallback = 'Something went wrong. Please try again.'): string {
  const raw = e?.error?.message;
  return (Array.isArray(raw) ? raw.join(' ') : raw) || e?.message || fallback;
}
