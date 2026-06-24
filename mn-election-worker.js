/**
 * Cloudflare Worker — MN Election Results Proxy
 * 
 * Deploy at: https://workers.cloudflare.com
 * 
 * This worker fetches the MN SOS results file server-side and
 * returns it with CORS headers so your HTML page can fetch it
 * from the browser without restriction.
 *
 * Setup steps:
 *   1. Log in to dash.cloudflare.com → Workers & Pages → Create
 *   2. Choose "Create Worker", paste this code, click Deploy
 *   3. Copy the worker URL (e.g. https://mn-election-proxy.YOUR-NAME.workers.dev)
 *   4. Paste it into DATA_URL in your HTML file
 *
 * Optional: add a custom route like results.yourdomain.com/* in Workers > Triggers
 */

const UPSTREAM_BASE = 'https://electionresultsfiles.sos.mn.gov';

// Cache responses for 60 seconds so rapid refreshes don't hammer the state server
const CACHE_SECONDS = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Allow a ?file= param so you can reuse this worker for other result files
    // e.g. ?file=/20220809/ushouse.txt
    // Default to ushouse.txt if no param provided
    const filePath = url.searchParams.get('file') || '/20220809/ushouse.txt';

    // Basic path sanitization — only allow .txt files under the expected structure
    if (!/^\/\d{8}\/[a-zA-Z0-9_]+\.txt$/.test(filePath)) {
      return new Response('Invalid file path', { status: 400 });
    }

    const upstreamUrl = `${UPSTREAM_BASE}${filePath}`;

    // Check Cloudflare cache first
    const cacheKey = new Request(upstreamUrl);
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      // Not cached — fetch from MN SOS
      const upstream = await fetch(upstreamUrl, {
        headers: { 'User-Agent': 'ElectionWidget/1.0' },
      });

      if (!upstream.ok) {
        return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status });
      }

      const body = await upstream.text();

      response = new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        },
      });

      // Store in Cloudflare edge cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    // Always return with CORS header (cache.match strips it)
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
  },
};
