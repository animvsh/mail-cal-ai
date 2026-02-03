// Cloudflare Pages Functions - proxies to worker
// This allows the API to be served from the same domain as the frontend

export const onRequest: PagesFunction = async (context) => {
  // In production, this would proxy to the deployed worker
  // For now, the worker handles everything directly
  return new Response('API route', { status: 200 })
}
