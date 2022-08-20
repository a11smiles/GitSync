const GitSync = require('./gitsync');

run();

async function run() {
    var sync = new GitSync();
    await sync.run();
}
