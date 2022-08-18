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

        var workItem = getWorkItem(config);

    } catch (exc) {
        log.error(exc);
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

    config.ado_orgUrl = `https://dev.azure.com/${config.ado_organization}`;

    log.setLevel(config.log_level != undefined ? config.log_level.toLowerCase() : "debug");

    return config;
}

async function getWorkItem(config) {
    log.info('Searching for work item...');
    log.debug(config);
    log.trace('AzDO Url', config.ado_orgUrl);

    let conn = new azdo.WebApi(config.ado_orgUrl, azdo.getPersonalAccessTokenHandler(config.ado_token));
    let client = null;
    let result = null;
    let workItem = null;

    try {
        client = await conn.getWorkItemTrackingApi();
    } catch (exc) {
        log.error("Error: cannot connect to organization.");
        log.error(exc);
        core.setFailed(exc);
        return -1;
    }

    let context = { project: config.ado_project };
    let wiql = {
        query:
            "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
            "AND [System.Tags] CONTAINS 'GitHub Issue: " + config.issue.number + "' " +
            "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
    };

    log.debug("WIQL Query", wiql);

    try {
        result = await client.queryByWiql(wiql, context);
        log.debug("Query results", result);

        if (result == null) {
            log.error("Error: project name appears to be invalid.");
            core.setFailed("Error: project name appears to be invalid.");
            return -1;
        }
    } catch (exc) {
        log.error("Error: unknown error while searching for work item.");
        log.error(exc);
        core.setFailed(exc);
        return -1;
    }

    if (result.workItems.length > 1) {
        log.warn("More than one work item found. Taking the first one.");
        workItem = result.workItems[0];
    } else {
        workItem = result.workItems.length > 0 ? result.workItems[0] : null;
    }

    log.debug("Work item", workItem);

    if (workItem != null) {
        log.info("Work item found: ", workItem.id);
        try {
            return await client.getWorkItem(workItem.id, null, null, 4);
        } catch (exc) {
            log.error("Error: failure getting work item.");
            log.error(exc);
            core.setFailed(exc);
            return -1;
        }
    } else {
        log.info("Work item not found.");
        return null;
    }
}

async function createWorkItem() {

}

async function updateWorkItem() {

}

async function updateIssue() {

}