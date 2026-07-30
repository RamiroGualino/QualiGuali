// Plain module-level store (not a React context) so the framework-agnostic
// http client can read the current token / report a 401 without importing
// React state. AuthContext is the only thing that writes to this.
let token = null;
let onUnauthorized = () => {};

export function setToken(nextToken) {
  token = nextToken;
}

export function getToken() {
  return token;
}

export function setOnUnauthorized(handler) {
  onUnauthorized = handler;
}

export function notifyUnauthorized() {
  onUnauthorized();
}
