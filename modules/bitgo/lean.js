// `bitgo/lean` entry point. A root-level file instead of an `exports` map, so deep imports such as
// `bitgo/dist/src/...` keep resolving as before.
module.exports = require('./dist/src/lean');
