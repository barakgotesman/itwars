import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * Adds the tags that need the site's real address (canonical link, og:url, absolute share-image URLs).
 * Build with `SITE_URL=https://your-domain npm run build`; without it the tags are simply left out.
 */
function siteUrlTags(): Plugin {
  return {
    name: 'site-url-tags',
    transformIndexHtml(html) {
      const site = process.env.SITE_URL?.replace(/\/+$/, '');
      if (!site) return html;
      const tags = [
        `<link rel="canonical" href="${site}/" />`,
        `<meta property="og:url" content="${site}/" />`,
        `<meta property="og:image" content="${site}/og-image.png" />`,
        `<meta name="twitter:image" content="${site}/og-image.png" />`,
      ].join('\n    ');
      return html.replace('</head>', `    ${tags}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), siteUrlTags()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
      '@client': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    // The game server runs separately in dev; proxy so the client uses same-origin URLs everywhere.
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
});
