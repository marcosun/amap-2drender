const {
  BABEL_ENV,
  NODE_ENV,
} = process.env;

let presets;

if (BABEL_ENV === 'es') {
  presets = [];
} else {
  presets = [
    [
      '@babel/preset-env',
      {
        targets: {
          ie: 11,
          edge: 14,
          firefox: 45,
          chrome: 49,
          safari: 10,
          node: '6.10',
        },
        modules: BABEL_ENV === 'modules' ? false : 'commonjs',
      },
    ],
  ];
}

module.exports = {
  /**
   * Remove comments in production build.
   */
  "comments": NODE_ENV !== 'production',
  /**
   * Ignore test files in production build.
   */
  "ignore": NODE_ENV === 'production' ? ['**/*.test.js'] : [],
  "plugins": [
    // Stage 1
    "@babel/plugin-proposal-export-default-from",
    // Stage 2
    "@babel/plugin-proposal-export-namespace-from",
    // Stage 3
    ["@babel/plugin-proposal-class-properties", { "loose": false }],
  ],
  "presets": presets,
};