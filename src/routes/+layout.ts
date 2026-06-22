// SPA: render on the client only. The reporter must work from the Service-Worker cache while
// offline, and manager auth / IndexedDB are browser-only — so there is no useful SSR pass.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'ignore';
