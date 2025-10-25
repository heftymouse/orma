import { serve } from "bun";

serve({
  port: 9999,
  async fetch(req) {
    const m = new URL(req.url).pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (!m) return new Response("not found", { status: 404 });

    const r = await fetch(`https://tile.openstreetmap.org/${m[1]}/${m[2]}/${m[3]}.png`);
    if (!r.ok) return new Response(null, { status: r.status });

    return new Response(r.body, {
      headers: {
        "Content-Type": "image/png",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  },
});