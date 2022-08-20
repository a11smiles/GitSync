const GitSync = require('./gitsync');

var sync = new GitSync();
await sync.run();
