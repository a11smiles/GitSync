const fs = require('fs');
const log = require('loglevel');
const core = require('@actions/core');
const github = require('@actions/github');
const azdo = require('azure-devops-node-api');
const showdown = require('showdown');

main();

async function main() {
    try {
        const context = github.context;
        const env = process.env;

        let config = getConfig(context.payload, env);
        log.debug(config);

        let workItem = await performWork(config);
    } catch (exc) {
        log.error(exc);
    }
}

function getConfig(payload, env) {
    let configJSON = {};

    if (env.config_file) {
        try {
            let configFile = fs.readFileSync(env.config_file);
            configJSON = JSON.parse(configFile);    

            console.log("JSON configuration file loaded.");
        } catch {
            console.log("JSON configuration file not found.");
        };
    }    

    let config = {
        ...payload,
        ...configJSON,
        ...env
    };

    config.ado.orgUrl = `https://dev.azure.com/${config.ado.organization}`;

    if (!!config.ado_token && !!config.ado) { config.ado.token = config.ado_token; }
    if (!!config.github_token && !!config.github) { config.github.token = config.github_token; }

    if (config.log_level != undefined)
    {
        console.log(`Setting logLevel to ${config.log_level.toLowerCase()}...`);
        log.setLevel(config.log_level.toLowerCase(), true);
    } else {
        log.setLevel("debug", true);
    }

    return config;
}

function getConnection(config) {
    return new azdo.WebApi(config.ado.orgUrl, azdo.getPersonalAccessTokenHandler(config.ado.token));
}

function cleanUrl(url) {
    return url.replace("api.github.com/repos/", "github.com/");
}

function createLabels(seed, labelsObj) {
    let labels = seed;

    log.trace("Labels:", labelsObj);
    labelsObj.forEach(label => {
        labels += `GitHub Label: ${label.name};`
    });

    return labels;
}

function getAssignee(config, useDefault) {
    let assignee = null;

    if (!!config.assignee && !!config.ado.mappings && !!config.ado.mappings.handles) {
        log.trace("Found mappings...");
        log.trace(`Searching for mapping for handle '${config.assignee.login}'...`);
        if(!!config.ado.mappings.handles[config.assignee.login]) {
            assignee = config.ado.mappings.handles[config.assignee.login]
        }
    }

    if (!!assignee) {
        log.trace(`Found mapping for handle '${config.assignee.login}' as '${assignee}'...`);
        return assignee;
    } else {
        if (!!config.assignee) {
            log.trace(`No mapping found for handle '${config.assignee.login}'...`);
        }

        if (useDefault && !!config.ado.assignedTo) {
            log.trace(`Using default assignment of '${config.ado.assignedTo}'...`);
            return config.ado.assignedTo;
        }
    }

    return assignee;
}

async function performWork(config) {
    let workItem = null;
    switch (config.action) {
        case "opened":
            workItem = await createWorkItem(config);
            break;
        case "closed":
            workItem = await closeWorkItem(config);
            break;
        case "deleted":
            workItem = await deleteWorkItem(config);
            break;
        case "reopened":
            workItem = await reopenWorkItem(config);
            break;
        case "edited":
            break;
        case "labeled":
            workItem = await labelWorkItem(config);
            break;
        case "unlabeled":
            workItem = await unlabelWorkItem(config);
            break;
        case "assigned":
            workItem = await assignWorkItem(config);
            break;
        case "unassigned":
            workItem = await unassignWorkItem(config);
            break;
        case "create":
            workItem = await addComment(config);
            break;
    }

    return workItem;
}

async function getWorkItem(config) {
    log.info("Searching for work item...");
    log.trace("AzDO Url:", config.ado.orgUrl);

    let conn = getConnection(config);
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

    let context = { project: config.ado.project };
    let wiql = {
        query:
            "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
            "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":'" +
            "AND [System.Tags] CONTAINS 'GitHub Issue'" +
            "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
    };

    log.debug("WIQL Query:", wiql);

    try {
        result = await client.queryByWiql(wiql, context);
        log.debug("Query results:", result);

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

    log.debug("Work item:", workItem);

    if (workItem != null) {
        log.info("Work item found:", workItem.id);
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

async function createWorkItem(config) {
    log.info("Creating work item...");

    getWorkItem(config).then(async (workItem) => {
        if (!!workItem) {
            log.warn(`Warning: work item (#${workItem.id}) already exists. Canceling creation.`);
            return 0;
        }

        var converter = new showdown.Converter();
        var html = converter.makeHtml(config.issue.body);
        
        converter = null;

        // create patch doc
        let patchDoc = [
            {
                op: "add",
                path: "/fields/System.Title",
                value: `GH #${config.issue.number}: ${config.issue.title}`
            },
            {
                op: "add",
                path: "/fields/System.Description",
                value: (!!html ? html : "")
            },
            {
                op: "add",
                path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                value: (!!html ? html : "")
            },
            {
                op: "add",
                path: "/fields/System.Tags",
                value: createLabels(`GitHub Issue;GitHub Repo: ${config.repository.full_name};`, config.issue.labels)
            },
            {
                op: "add",
                path: "/relations/-",
                value: {
                rel: "Hyperlink",
                url: cleanUrl(config.issue.url)
                }
            },
            {
                op: "add",
                path: "/fields/System.History",
                value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> created in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            }
        ]

        // set assigned to
        if (!!config.ado.assignedTo) {
            patchDoc.push({
                op: "add",
                path: "/fields/System.AssignedTo",
                value: getAssignee(config, true)
            });
        }

        // set area path if provided
        if (!!config.ado.areaPath) {
            patchDoc.push({
                op: "add",
                path: "/fields/System.AreaPath",
                value: config.ado.areaPath
            });
        }

        // set iteration path if provided
        if (!!config.ado.iterationPath) {
            patchDoc.push({
                op: "add",
                path: "/fields/System.IterationPath",
                value: config.ado.iterationPath
            });
        }

        // if bypass rules, set user name
        if (!!config.ado.bypassRules) {
            patchDoc.push({
                op: "add",
                path: "/fields/System.CreatedBy",
                value: config.issue.user.login
            });
        }

        log.debug("Patch document:", patchDoc);

        let conn = getConnection(config);
        let client = await conn.getWorkItemTrackingApi();
        let result = null;

        try {
            result = await client.createWorkItem(
                (customHeaders = []),
                (document = patchDoc),
                (project = config.ado.project),
                (type = config.ado.wit),
                (validateOnly = false),
                (bypassRules = config.ado.bypassRules)
            );

            if (result == null) {
                log.error("Error: failure creating work item.");
                log.error(`WIT may not be correct: ${config.ado.wit}`);
                core.setFailed();
                return -1;
            }

            log.debug(result);
            log.info("Successfully created work item:", result.id);

            return result;
        } catch (exc) {
            log.error("Error: failure creating work item.");
            log.error(exc);
            core.setFailed(exc);
            return -1;
        }
    });
}

async function closeWorkItem(config) {
    log.info("Closing work item...");

    let patchDoc = [
        {
            op: "add",
            path: "/fields/System.State",
            value: config.ado.states.closed
        }
    ];

    if (config.closed_at != "") {
        patchDoc.push({
          op: "add",
          path: "/fields/System.History",
          value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> closed by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
        });
      }
    
    return await updateWorkItem(config, patchDoc);
}

async function deleteWorkItem(config) {
    log.info("Deleting work item...");

    let patchDoc = [
        {
            op: "add",
            path: "/fields/System.State",
            value: config.ado.states.deleted
        },
        {
          op: "add",
          path: "/fields/System.History",
          value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> removed by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
        }
    ];

    return await updateWorkItem(config, patchDoc);
}

async function reopenWorkItem(config) {
    log.info("Reopening work item...");

    let patchDoc = [
        {
            op: "add",
            path: "/fields/System.State",
            value: config.ado.states.reopened
        },
        {
          op: "add",
          path: "/fields/System.History",
          value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> reopened by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
        }
    ];

    return await updateWorkItem(config, patchDoc);
}

async function labelWorkItem(config) {
    log.info("Adding label to work item...");

    let patchDoc = [
        {
            op: "add",
            path: "/fields/System.Tags",
            value: createLabels("", [config.label])
        },
        {
          op: "add",
          path: "/fields/System.History",
          value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> addition of label '${config.label.name}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
        }
    ];

    return await updateWorkItem(config, patchDoc);
}

async function unlabelWorkItem(config) {
    log.info("Removing label from work item...");

    getWorkItem(config).then(async (workItem) => {
        if (!workItem) {
            log.warn(`Warning: cannot find work item (GitHub Issue #${config.issue.number}). Canceling update.`);
            return 0;
        }

        let patchDoc = [
            {
                op: "replace",
                path: "/fields/System.Tags",
                value: workItem.fields["System.Tags"].replace(createLabels("", [config.label]), "")
            },
            {
                op: "add",
                path: "/fields/System.History",
                value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> removal of label '${config.label.name}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            }
        ];

        return await updateWorkItem(config, patchDoc);
    });
}

async function assignWorkItem(config) {
    log.info("Assigning work item...");
    let assignee = getAssignee(config, false);
    let patchDoc = [];

    if (!!assignee) {
        patchDoc.push({
            op: "add",
            path: "/fields/System.AssignedTo",
            value: assignee
        });
    } else {
        patchDoc.push({
            op: "remove",
            path: "/fields/System.AssignedTo"
        });
    }

    patchDoc.push({
        op: "add",
        path: "/fields/System.History",
        value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> assigned to '${config.assignee.login}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
    });

    return await updateWorkItem(config, patchDoc);
}

async function unassignWorkItem(config) {
    log.info("Unassigning work item...");

    let patchDoc = [
        {
            op: "remove",
            path: "/fields/System.AssignedTo",
        },
        {
          op: "add",
          path: "/fields/System.History",
          value: `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> removal of assignment to '${config.assignee.login}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
        }
    ];

    return await updateWorkItem(config, patchDoc);
}

async function addComment(config) {
    log.info("Adding comment to work item...");

    var converter = new showdown.Converter();
    var html = converter.makeHtml(config.comment.body);
    
    converter = null;

    let patchDoc = [
        {
          op: "add",
          path: "/fields/System.History",
          value: 
            `GitHub issue #${config.issue.number}: <a href="${cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> comment added by '${config.assignee.login}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a><br /><br />` +
            `Comment <a href="${config.comment.html_url}" target="_blank">${config.comment.id}</a>:<br />${html}` 
        }
    ];

    return await updateWorkItem(config, patchDoc);
}

async function updateWorkItem(config, patchDoc) {
    getWorkItem(config).then(async (workItem) => {
        if (!workItem) {
            log.warn(`Warning: cannot find work item (GitHub Issue #${config.issue.number}). Canceling update.`);
            return 0;
        }

        let conn = getConnection(config);
        let client = await conn.getWorkItemTrackingApi();
        let result = null;

        try {
            result = await client.updateWorkItem(
            (customHeaders = []),
            (document = patchDoc),
            (id = workItem.id),
            (project = config.ado.project),
            (validateOnly = false),
            (bypassRules = config.ado.bypassRules)
            );
        
            log.debug(result);
            log.info("Successfully updated work item:", result.id);
        
            return result;
        } catch (exc) {
            log.error("Error: failure updating work item.");
            log.error(exc);
            core.setFailed(exc);
            return -1;
        }
    });
}

async function updateIssue() {

}