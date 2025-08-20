const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/webllm-bundle.js',
  output: {
    filename: 'webllm.bundle.js',
    path: path.resolve(__dirname, 'lib'),
    library: 'WebLLM',
    libraryTarget: 'var',
    libraryExport: 'default'
  },
  resolve: {
    fallback: {
      "path": false,
      "fs": false,
      "crypto": false,
      "buffer": false,
      "stream": false,
    }
  },
  performance: {
    maxAssetSize: 50000000,
    maxEntrypointSize: 50000000,
  }
};
