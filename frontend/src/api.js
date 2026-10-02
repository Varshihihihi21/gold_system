const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

if (import.meta.env.PROD && new URL(API_BASE_URL).protocol !== 'https:') {
  throw new Error('Packaged terminals require an HTTPS API endpoint.');
}

/** HTTP error carrying the backend status code and its actionable error message. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Send a JSON request to the backend and return its JSON response.
 * @param {string} path Backend route beginning with `/api`.
 * @param {RequestInit & {token?: string, deviceGuid?: string, onAuthFailure?: Function}} options Request and optional device credentials.
 * @returns {Promise<unknown>} Parsed JSON response.
 */
export async function apiRequest(path, options = {}) {
  const {
    token,
    deviceGuid,
    onAuthFailure,
    onTokenRotated,
    headers: suppliedHeaders,
    ...requestOptions
  } = options;
  const headers = new Headers(suppliedHeaders || {});
  if (requestOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', ['Bearer', token].join(' '));
  if (deviceGuid) headers.set('x-device-guid', deviceGuid);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...requestOptions, headers });
  } catch {
    throw new Error(`Could not reach the server at ${API_BASE_URL}. Check the backend and network connection.`);
  }
  const rotatedToken = response.headers.get('X-Access-Token');
  if (token && rotatedToken && onTokenRotated) onTokenRotated(rotatedToken);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(`The server returned an unreadable response (HTTP ${response.status}).`, response.status);
  }
  if (!response.ok) {
    const message = data?.error || `Request failed (HTTP ${response.status}).`;
    if ((response.status === 401 || response.status === 403) && onAuthFailure) {
      onAuthFailure(response.status);
    }
    throw new ApiError(message, response.status);
  }
  return data;
}
