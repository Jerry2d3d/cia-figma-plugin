const path = require('path');
const { execSync } = require('child_process');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

/**
 * A stamp the panel shows, so "is Figma running my latest build?" is a thing
 * you can read rather than guess. Figma caches a development plugin's UI
 * aggressively, and re-running it is not always enough.
 */
function buildStamp() {
  let commit = 'nogit';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {
    // A checkout without git history still builds; the time alone is enough.
  }
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${commit} ${time}`;
}

module.exports = (env, argv) => ({
  mode: argv.mode === 'production' ? 'production' : 'development',

  // Figma's `eval` behaves differently from a normal browser's, so plain
  // eval-based devtools don't work inside the plugin sandbox.
  devtool: argv.mode === 'production' ? 'source-map' : 'inline-source-map',

  entry: {
    ui: './src/ui/main.tsx',
    code: './src/code.ts',
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{ loader: 'swc-loader' }],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },

  optimization: {
    minimize: argv.mode === 'production',
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },

  plugins: [
    new (require('webpack').DefinePlugin)({
      __BUILD_STAMP__: JSON.stringify(buildStamp()),
    }),
    new HtmlWebpackPlugin({
      template: './src/ui/index.html',
      filename: 'index.html',
      inject: 'body',
      chunks: ['ui'],
    }),
    // Figma requires the UI to ship as a single self-contained HTML file —
    // no external <script src>, so the built ui.js gets inlined here.
    new HtmlInlineScriptPlugin({
      scriptMatchPattern: [/ui\.js$/],
    }),
    new ForkTsCheckerWebpackPlugin({
      async: argv.mode === 'development',
    }),
  ],
});
