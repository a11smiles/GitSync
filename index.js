const fs = require('fs');
const log = require('loglevel');
const core = require('@actions/core');
const github = require('@actions/github');
const azdo = require('azure-devops-node-api');

main();

async function main() {
    try {
        const context = github.context;
        const env = process.env;

        let config = getConfig(context.payload, env);
        
        log.debug(config);
        
    } finally {
    }
}

async function getConfig(payload, env) {
    let configJSON = {};

    if (env.config_file) {
        try {
            let configFile = fs.readFileSync(env.config_file);
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

    log.setLevel(config.env.log_level ? config.env.log_level.toLowerCase() : "debug");

    return config;
}

async function getWorkItem() {

}

async function createWorkItem() {

}

async function updateWorkItem() {

}

async function updateIssue() {

}