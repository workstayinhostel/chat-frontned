# Metufy client

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_API` to the API server's base URL (for example, `http://localhost:4000`).
4. Start the client with `npm run dev`.

`VITE_GOOGLE_CLIENT_ID` is a public browser OAuth client ID, not a client secret.
The configured client ID is also the frontend default; provide the variable at
build time to override it for another Google OAuth application.

## Production deployment

Set `VITE_API` to the publicly reachable API base URL in the frontend build
environment, then run `npm run build` and deploy the `dist/` directory. Set
`VITE_GOOGLE_CLIENT_ID` at build time if using a different OAuth client. Add the
deployed frontend's exact origin (scheme and hostname) to the OAuth client's
authorized JavaScript origins in Google Cloud Console. Google sign-in will not
work on an origin that has not been authorized.
