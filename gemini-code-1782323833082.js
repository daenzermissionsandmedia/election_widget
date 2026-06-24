export default {
  async fetch(request, env, ctx) {
    // 1. Handle browser preflight CORS requests automatically
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const targetUrl = "https://electionresultsfiles.sos.mn.gov/20220809/ushouse.txt";
    
    // 2. Normalize the URL to strip query parameters so everyone shares the same cache
    const url = new URL(request.url);
    const cacheUrl = `${url.origin}${url.pathname}`;
    const cacheKey = new Request(cacheUrl, request);
    const cache = caches.default;

    // 3. Look for a cached version of the data in the current edge data center
    let response = await cache.match(cacheKey);

    if (!response) {
      try {
        // Cache miss: Pull fresh text data from the state server
        const originResponse = await fetch(targetUrl);
        
        if (!originResponse.ok) {
          return new Response(`Origin Server Error: ${originResponse.status}`, { 
            status: originResponse.status,
            headers: { "Access-Control-Allow-Origin": "*" }
          });
        }

        // Reconstruct the response object so the headers become mutable
        response = new Response(originResponse.body, originResponse);
        
        // 4. Inject headers to permit cross-origin lookups
        response.headers.set("Access-Control-Allow-Origin", "*");
        
        // 5. Instruct Cloudflare to cache this text file layout for 30 seconds
        response.headers.set("Cache-Control", "public, max-age=30");

        // Save it to the local edge cache folder asynchronously
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (error) {
        return new Response(`Worker proxy failure: ${error.message}`, { 
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    return response;
  }
};