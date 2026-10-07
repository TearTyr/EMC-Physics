/* ==========================================================================
   Tailwind CSS — production build config (OPTIONAL path)
   --------------------------------------------------------------------------
   By default every page loads Tailwind from the official Play CDN
   (https://cdn.tailwindcss.com), exactly as the assignment requires, and the
   utility classes are written straight into the HTML markup, e.g.
   class="grid grid-cols-1 md:grid-cols-2 gap-4", class="flex items-center".

   The Play CDN compiles in the browser and prints a console warning on
   production domains. For a production host (Vercel, Netlify, ...) you can
   compile the identical utilities once, at build time:

       npm run build:css                       # -> css/tailwind.generated.css
       node tools/switch-css.mjs built         # point the pages at it
       node tools/switch-css.mjs cdn           # ...and back to the CDN

   `content` includes js/*.js because js/quiz.js and js/sim-circuit.js inject
   markup that uses utility classes (grid, gap-2, flex, ...).
   ========================================================================== */
export default {
  content: ['./*.html', './topics/*.html', './js/*.js'],
  theme: {
    extend: {
      colors: { brand: { DEFAULT: '#22d3ee', deep: '#0e1a2e', line: '#1e2f4d' } }
    }
  }
};
