const GitSync = require('./gitsync');

run();

async function run() {
    var sync = new GitSync("debug");
    sync.run();
}
