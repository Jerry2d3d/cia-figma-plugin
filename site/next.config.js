import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

// BoilerPlate ships the React arm as TypeScript + SCSS Module *source*, not a
// build. Its package exports map points at `.ts` files, which the bundler will
// not resolve through a symlinked node_modules entry, so the components are
// aliased straight to that source and compiled with the rest of this app.
const boilerplateSrc = path.join(repoRoot, 'boiler-project-ai', 'packages', 'react', 'src');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@boilerai/react'],

  turbopack: {
    // Both this app and the component source it compiles live under here.
    root: repoRoot,
    resolveAlias: {
      '@bp': boilerplateSrc,
    },
  },

  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, '@bp': boilerplateSrc };
    return config;
  },

  sassOptions: {
    // Modern Dart Sass reads `loadPaths`; `includePaths` is the legacy name and
    // is ignored. cia's own `scss` directory has to be listed: `api.scss` uses
    // a relative `@use './system'`, which the bundler's importer will not
    // resolve on its own.
    //
    // `src/styles` is deliberately NOT listed, and must stay off. A load path
    // shadows a package's own relative imports, so a local partial named like a
    // cia module (`_system`, `_theme`, `_layout`) would be picked up instead of
    // cia's. This mirrors boiler-project-ai's config, which hit exactly that.
    loadPaths: [
      path.join(here, 'node_modules'),
      path.join(here, 'node_modules', 'css-is-awesome', 'scss'),
    ],
  },

  // Kept export-ready so this can move to static hosting with no rework.
  images: { unoptimized: true },
};

export default nextConfig;
