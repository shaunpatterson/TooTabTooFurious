const path = require('path');

module.exports = {
  mode: 'production',
  devtool: 'source-map', // Use source-map instead of eval-based options
  entry: './background.js',
  output: {
    filename: 'background.bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.js'],
    fallback: {
      "path": false,
      "fs": false,
      "crypto": false,
      "buffer": false,
      "stream": false,
      "perf_hooks": false,
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: [/node_modules/, /webllm\.bundle\.js$/],
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: []
          }
        }
      }
    ]
  },
  performance: {
    maxAssetSize: 50000000,
    maxEntrypointSize: 50000000,
  }
};