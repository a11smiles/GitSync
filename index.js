const fs = require('fs');
const core = require('@actions/core');
const github = require('@actions/github');
const azdo = require('azure-devops-node-api');

main();

async function main() {
    try {
        const context = github.context;
        const env = process.env;

        let config = getConfig(context.payload, env);
        console.log(config);
    } finally {
    }
}

async function getConfig(payload, env) {
    let configJSON = {};

    if (env.config_file) {
        try {
            let configFile = fs.readFileSync('gsconfig.json');
            configJSON = JSON.parse(configFile);    

            console.log('JSON configuration file loaded.');
        } catch {
            console.log('JSON configuration file not found.');
        };
    }    

    let config = {
        ...payload,
        ...configJSON,
        ...env
    };

    return config;
}

async function createWorkItem() {

}

async function updateWorkItem() {

}

async function updateIssue() {

}