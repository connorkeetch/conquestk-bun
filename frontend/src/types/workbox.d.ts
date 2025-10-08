// Minimal module declarations to satisfy TypeScript in the SW build without installing workbox types.
// These modules are bundled by Vite PWA/workbox during build, but TS needs ambient declarations.

declare module 'workbox-core'
declare module 'workbox-expiration'
declare module 'workbox-precaching'
declare module 'workbox-routing'
declare module 'workbox-strategies'

