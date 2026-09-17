const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

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
