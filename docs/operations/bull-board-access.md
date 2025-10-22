# Bull Board Access Strategy

_Last updated: October 20, 2025_

Updated: Bull Board now runs as a separate Railway service protected by Basic Auth. The legacy embedded UI at `/api/admin/queues/ui` and cookie grant flow are deprecated. See `services/bullboard/README.md` for deployment and health endpoints. Ensure `REDIS_URL` is a Railway Variable Reference to the Redis add-on (or set `REDIS_PUBLIC_URL` for the public TLS endpoint), and keep `BULL_PREFIX` consistent with the backend (default `bull`).
