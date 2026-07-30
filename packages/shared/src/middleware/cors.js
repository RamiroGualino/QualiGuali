const cors = require('cors');

// There's no API Gateway yet (Parte 1: "simular el gateway con Express
// directo"), so the frontend (Parte 7) talks to each service's own origin
// directly from the browser — every service needs CORS enabled or none of
// this works. Permissive by default (reflects the request origin) since the
// Vite dev server's port can vary; set CORS_ORIGIN (comma-separated) to an
// allowlist for any environment where that needs tightening.
function createCors() {
  const configured = process.env.CORS_ORIGIN;
  const origin = configured ? configured.split(',').map((o) => o.trim()) : true;

  return cors({ origin, credentials: true });
}

module.exports = { createCors };
