const fs = require('fs');
const log = require('loglevel');
const core = require('@actions/core');
const github = require('@actions/github');
const azdo = require('azure-devops-node-api');
const showdown = require('showdown');

module.exports = class GitSync {
    constructor(level = "silent") {
        log.setLevel(level, true);
    }

    async run() {
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

    getConfig(payload, env) {
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
            ado: {},
            github: {},
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

    getConnection(config) {
        return new azdo.WebApi(config.ado.orgUrl, azdo.getPersonalAccessTokenHandler(config.ado.token));
    }

    cleanUrl(url) {
        return url.replace("api.github.com/repos/", "github.com/");
    }

    createLabels(seed, labelsObj) {
        let labels = seed;

        log.debug("Labels:", labelsObj);
        labelsObj.forEach(label => {
            labels += `GitHub Label: ${label.name};`
        });

        return labels;
    }

    getAssignee(config, useDefault) {
        let assignee = null;

        if (!!config.assignee && !!config.ado.mappings && !!config.ado.mappings.handles) {
            log.debug("Found mappings...");
            log.debug(`Searching for mapping for handle '${config.assignee.login}'...`);
            if(!!config.ado.mappings.handles[config.assignee.login]) {
                assignee = config.ado.mappings.handles[config.assignee.login]
            }
        }

        if (!!assignee) {
            log.debug(`Found mapping for handle '${config.assignee.login}' as '${assignee}'...`);
            return assignee;
        } else {
            if (!!config.assignee) {
                log.debug(`No mapping found for handle '${config.assignee.login}'...`);
            }

            if (useDefault && !!config.ado.assignedTo) {
                log.debug(`Using default assignment of '${config.ado.assignedTo}'...`);
                return config.ado.assignedTo;
            }
        }

        return assignee;
    }

    async performWork(config) {
        let workItem = null;
        switch (config.action) {
            case "opened":
                workItem = await this.createWorkItem(config);
                break;
            case "closed":
                workItem = await this.closeWorkItem(config);
                break;
            case "deleted":
                workItem = await this.deleteWorkItem(config);
                break;
            case "reopened":
                workItem = await this.reopenWorkItem(config);
                break;
            case "edited":
                workItem = await this.editWorkItem(config);
                break;
            case "labeled":
                workItem = await this.labelWorkItem(config);
                break;
            case "unlabeled":
                workItem = await this.unlabelWorkItem(config);
                break;
            case "assigned":
                workItem = await this.assignWorkItem(config);
                break;
            case "unassigned":
                workItem = await this.unassignWorkItem(config);
                break;
            case "created":
                workItem = await this.addComment(config);
                break;
        }

        if (!!config.schedule) {
            await this.updateIssues(config);
        }

        return workItem;
    }

    async getWorkItem(config) {
        log.info("Searching for work item...");
        log.debug("AzDO Url:", config.ado.orgUrl);

        let conn = this.getConnection(config);
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
                "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":' " +
                "AND [System.Tags] CONTAINS 'GitHub Issue' " +
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

    async createWorkItem(config) {
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

    async closeWorkItem(config) {
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
            value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> closed by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            });
        }
        
        return await this.updateWorkItem(config, patchDoc);
    }

    async deleteWorkItem(config) {
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
            value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> removed by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            }
        ];

        return await this.updateWorkItem(config, patchDoc);
    }

    async reopenWorkItem(config) {
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
            value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> reopened by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            }
        ];

        return await this.updateWorkItem(config, patchDoc);
    }

    async editWorkItem(config) {
        log.info("Editing work item...");

        var converter = new showdown.Converter();
        var html = converter.makeHtml(config.issue.body);
        
        converter = null;

        let patchDoc = [
            {
                op: "replace",
                path: "/fields/System.Title",
                value: `GH #${config.issue.number}: ${config.issue.title}`
            },
            {
                op: "replace",
                path: "/fields/System.Description",
                value: (!!html ? html : "")
            },
            {
                op: "replace",
                path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                value: (!!html ? html : "")
            },
            {
            op: "add",
            path: "/fields/System.History",
            value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> edited by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            }
        ];

        return await this.updateWorkItem(config, patchDoc);
    }

    async labelWorkItem(config) {
        log.info("Adding label to work item...");

        let patchDoc = [
            {
                op: "add",
                path: "/fields/System.Tags",
                value: this.createLabels("", [config.label])
            },
            {
            op: "add",
            path: "/fields/System.History",
            value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> addition of label '${config.label.name}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            }
        ];

        return await this.updateWorkItem(config, patchDoc);
    }

    async unlabelWorkItem(config) {
        log.info("Removing label from work item...");

        this.getWorkItem(config).then(async (workItem) => {
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
                    value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> removal of label '${config.label.name}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
                }
            ];

            return await this.updateWorkItem(config, patchDoc);
        });
    }

    async assignWorkItem(config) {
        log.info("Assigning work item...");
        let assignee = this.getAssignee(config, false);
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
            value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> assigned to '${config.assignee.login}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
        });

        return await this.updateWorkItem(config, patchDoc);
    }

    async unassignWorkItem(config) {
        log.info("Unassigning work item...");

        let patchDoc = [
            {
                op: "remove",
                path: "/fields/System.AssignedTo",
            },
            {
            op: "add",
            path: "/fields/System.History",
            value: `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> removal of assignment to '${config.assignee.login}' by <a href="${config.issue.user.html_url}" target="_blank">${config.issue.user.login}</a>`
            }
        ];

        return await this.updateWorkItem(config, patchDoc);
    }

    async addComment(config) {
        log.info("Adding comment to work item...");

        var converter = new showdown.Converter();
        var html = converter.makeHtml(config.comment.body);
        
        converter = null;

        let patchDoc = [
            {
            op: "add",
            path: "/fields/System.History",
            value: 
                `GitHub issue #${config.issue.number}: <a href="${this.cleanUrl(config.issue.url)}" target="_new">${config.issue.title}</a> in <a href="${this.cleanUrl(config.issue.repository_url)}" target="_blank">${config.repository.full_name}</a> comment added by <a href="${config.comment.user.html_url}" target="_blank">${config.comment.user.login}</a><br />` +
                `Comment #<a href="${config.comment.html_url}" target="_blank">${config.comment.id}</a>:<br /><br />${html}` 
            }
        ];

        return await this.updateWorkItem(config, patchDoc);
    }

    async updateWorkItem(config, patchDoc) {
        this.getWorkItem(config).then(async (workItem) => {
            if (!workItem) {
                log.warn(`Warning: cannot find work item (GitHub Issue #${config.issue.number}). Canceling update.`);
                return 0;
            }

            let conn = this.getConnection(config);
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

    async updateIssues(config) {
        log.info("Updating issues...");
        log.debug("AzDO Url:", config.ado.orgUrl);

        let conn = this.getConnection(config);
        let client = null;
        let result = null;
        let workItems = null;

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
                "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.GITHUB_REPOSITORY + "' " +
                "AND [System.ChangedDate] > @Today - 1"
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

        workItems = result.workItems;
        workItems.forEach(async (workItem) => { await this.updateIssue(config, client, workItem); });
    }

    async updateIssue(config, client, workItem) {
        log.info(`Updating issue for work item (${workItem.id})...`);
        const octokit = new github.getOctokit(config.github.token);
        const owner = config.GITHUB_REPOSITORY_OWNER;
        const repo = config.GITHUB_REPOSITORY.replace(owner + "/", "");

        log.debug(`[WORKITEM: ${workItem.Id}] Owner:`, owner);
        log.debug(`[WORKITEM: ${workItem.Id}] Repo:`, repo);

        client.getWorkItem(workItem.id, ["System.Title", "System.Description", "System.State", "System.ChangedDate"]).then(async (wiObj) => {
            let parsed = wiObj.fields["System.Title"].match(/^GH\s#(\d+):\s(.*)/);
            let issue_number = parsed[1];
            log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] Issue Number:`, issue_number);

            // Get issue
            var issue = (await octokit.rest.issues.get({
                owner,
                repo,
                issue_number
            })).data;

            log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] Issue:`, issue);

            // Check which is most recent
            // If WorkItem is more recent than Issue, update Issue
            // There is a case that WorkItem was updated by Issue, which is why it's more recent
            // Currently checks to see if title, description/body, and state are the same. If so (which means the WorkItem matches the Issue), no updates are necessary
            // Can later add check to see if last entry in history of WorkItem was indeed updated by GitHub
            if (new Date(wiObj.fields["System.ChangedDate"]) > new Date(issue.updated_at)) {
                log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] WorkItem.ChangedDate (${new Date(wiObj.fields["System.ChangedDate"])}) is more recent than Issue.UpdatedAt (${new Date(issue.updated_at)}). Updating issue...`);
                let title = parsed[2];
                let body = wiObj.fields["System.Description"];
                let states = config.ado.states;
                let state = Object.keys(states).find(k => states[k]==wiObj.fields["System.State"]);
                
                wiObj.fields["System.State"];

                log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] Title:`, title);
                log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] Body:`, body);
                log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] State:`, state);

                if (title != issue.title ||
                    body != issue.body ||
                    state != issue.state) {

                    let result = await octokit.rest.issues.update({
                        owner,
                        repo,
                        issue_number,
                        title,
                        body,
                        state 
                    })

                    log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] Update:`, result);
                    log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] Issue updated.`);

                    return result;
                } else {
                    log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] Nothing has changed, so skipping.`);
    
                    return null;
                }
            } else {
                log.debug(`[WORKITEM: ${workItem.Id} / ISSUE: ${issue_number}] WorkItem.ChangedDate (${new Date(wiObj.fields["System.ChangedDate"])}) is less recent than Issue.UpdatedAt (${new Date(issue.updated_at)}). Skipping issue update...`);
    
                return null;
            }
        });
    }
}
