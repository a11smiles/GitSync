const chai = require('chai');
var sinon = require('sinon');
const assert = chai.assert;
chai.use(require('sinon-chai'));
const proxyquire = require('proxyquire').noPreserveCache();
const { DateTime } = require('luxon');
const decache = require('decache');

const GitSync = require('./gitsync');

describe("index", () => {
    const originalLogFunction = console.log;
    let output;

    beforeEach(function(done) {
      output = '';
      console.log = (msg) => {
        output += msg + '\n';
      };

      done();
    });

    afterEach(function() {
        console.log = originalLogFunction; // undo dummy log function
        if (this.currentTest.state === 'failed') {
            console.log(output);
        }
    });

    describe("getConfig", () => {
        it("should load the config file", () => {
            var sync = new GitSync();
            var config = sync.getConfig(null, {
                config_file: './mocks/config.json',
                log_level: 'silent'
            });
            
            let configJson = {
                ...require('./mocks/config.json'),
                github: {},
                config_file: './mocks/config.json',
                log_level: 'silent'
            };
            
            assert.notStrictEqual(configJson, config);
        });

        it("should not load the config file", () => {
            var sync = new GitSync();
            var config = sync.getConfig(null, {
                config_file: './mocks/no_config.json',
                log_level: 'silent'
            });
            
            let configJson = {
                ado: { },
                github: {},
                config_file: './mocks/config.json',
                log_level: 'silent'
            };
            
            assert.notStrictEqual(configJson, config);
        });

        it("should set tokens", () => {
            var sync = new GitSync();
            var config = sync.getConfig(null, {
                ado_token: 'adoToken',
                github_token: 'githubToken',
                config_file: './mocks/no_config.json',
                log_level: 'silent'
            });
            
            let configJson = {
                ...require('./mocks/config.json'),
                ado: { token: 'adoToken' },
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent'
            };
            
            assert.notStrictEqual(configJson, config);
        });

        it("should set log level to debug", () => {
            var sync = new GitSync();
            var config = sync.getConfig(null, {
                ado_token: 'adoToken',
                github_token: 'githubToken',
                config_file: './mocks/no_config.json',
                log_level: undefined
            });
            
            let configJson = {
                ...require('./mocks/config.json'),
                ado: { token: 'adoToken' },
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'debug'
            };
            
            assert.notStrictEqual(configJson, config);
        });

        it("should should merge env ado config", () => {
            var sync = new GitSync();
            var config = sync.getConfig(null, {
                ado_token: 'adoToken',
                github_token: 'githubToken',
                config_file: './mocks/config.json',
                ado: {
                    areaPath: "something\\else",
                    mappings: {
                        handles: {
                            foo1: 'bar1',
                            foo2: 'bar2'
                        }
                    }
                }
            });
            
            let configJson = {
                ado_token: 'adoToken',
                github_token: 'githubToken',
                config_file: './mocks/config.json',
                ado: { 
                    token: 'adoToken',
                    organization: "foo",
                    project: "bar",
                    orgUrl: "https://dev.azure.com/foo",
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                    bypassRules: true,
                    autoCreate: true,
                    assignedTo: "noone@nowhere.com",
                    areaPath: "something\\else",
                    iterationPath: "bar\\baz",
                    mappings: {
                        handles: {
                            foo1: 'bar1',
                            foo2: 'bar2'
                        }
                    }
                },
                github: { token: 'githubToken' }
            };
            console.log(config);
            assert.notStrictEqual(configJson, config);
        });
    });

    describe("cleanUrl", () => {
        it("should sanitize url", () => {
            var dirtyUrl = "https://api.github.com/repos/foo/bar";
            var cleanUrl = "https://github.com/foo/bar";

            var sync = new GitSync();
            var result = sync.cleanUrl(dirtyUrl);

            assert.equal(result, cleanUrl);
        });
    });

    describe("createLabels", () => {
        it("should return a label string", () => {
            var labelArray = [{ name: "alpha" }, { name: "beta" }, { name: "gamma" }];
            var labelString = "fuzzy;GitHub Label: alpha;GitHub Label: beta;GitHub Label: gamma;";

            var sync = new GitSync();
            var result = sync.createLabels("fuzzy;", labelArray);

            assert.equal(result, labelString);
        });
    });

    describe("getAssignee", () => {
        it("should return null for no assignee", () => {
            let config = {
                ...require('./mocks/config.json'),
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent'
            };

            config.ado = {
                ...config.ado,
                token: 'adoToken'
            }

            var sync = new GitSync();
            var result = sync.getAssignee(config, false);

            assert.isNull(result);
        });

        it("should return null for no assignee or mappings", () => {
            let config = {
                ...require('./mocks/config.json'),
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent',
                assignee: {
                    login: "foobar"
                }
            };

            config.ado = {
                ...config.ado,
                token: 'adoToken',
                mappings: undefined
            }

            var sync = new GitSync();
            var result = sync.getAssignee(config, false);

            assert.isNull(result);
        });

        it("should return null for no assignee or mapping handles", () => {
            let config = {
                ...require('./mocks/config.json'),
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent',
                assignee: {
                    login: "foobar"
                }
            };

            config.ado = {
                ...config.ado,
                token: 'adoToken',
                mappings: {
                    handles: undefined
                }
            }

            var sync = new GitSync();
            var result = sync.getAssignee(config, false);

            assert.isNull(result);
        });

        it("should return null for unmapped assignee and no default assignment", () => {
            let config = {
                ...require('./mocks/config.json'),
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent',
                assignee: {
                    login: "foobar"
                }
            };

            config.ado = {
                ...config.ado,
                token: 'adoToken',
                assignedTo: undefined,
                mappings: {
                    handles: undefined
                }
            }

            var sync = new GitSync();
            var result = sync.getAssignee(config, true);

            assert.isNull(result);
        });

        it("should return null for unmapped assignee and useDefault is false", () => {
            let config = {
                ...require('./mocks/config.json'),
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent',
                assignee: {
                    login: "foobar"
                }
            };

            config.ado = {
                ...config.ado,
                token: 'adoToken',
                assignedTo: undefined,
                mappings: {
                    handles: undefined
                }
            }

            var sync = new GitSync();
            var result = sync.getAssignee(config, false);

            assert.isNull(result);
        });

        it("should return default assignment for unmapped assignee", () => {
            let config = {
                ...require('./mocks/config.json'),
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent',
                assignee: {
                    login: "foobar"
                }
            };

            config.ado = {
                ...config.ado,
                token: 'adoToken',
                mappings: {
                    handles: undefined
                }
            }

            var sync = new GitSync();
            var result = sync.getAssignee(config, true);

            assert.equal(result, "noone@nowhere.com");
        });

        it("should return a mapped assignee", () => {
            let config = {
                ...require('./mocks/config.json'),
                github: { token: 'githubToken' },
                config_file: './mocks/config.json',
                log_level: 'silent',
                assignee: {
                    login: "someone"
                }
            };

            config.ado = {
                ...config.ado,
                token: 'adoToken'
            }

            var sync = new GitSync();
            var result = sync.getAssignee(config, true);

            assert.equal(result, "someone@somewhere.com");
        });
    });

    describe("performWork", () => {
        it("should call all cases", async () => {
            var sync = new GitSync();
            var createStub = sinon.stub(sync, "createWorkItem").resolves();
            var closeStub = sinon.stub(sync, "closeWorkItem").resolves();
            var deleteStub = sinon.stub(sync, "deleteWorkItem").resolves();
            var reopenStub = sinon.stub(sync, "reopenWorkItem").resolves();
            var editStub = sinon.stub(sync, "editWorkItem").resolves();
            var labelStub = sinon.stub(sync, "labelWorkItem").resolves();
            var unlabelStub = sinon.stub(sync, "unlabelWorkItem").resolves();
            var assignStub = sinon.stub(sync, "assignWorkItem").resolves();
            var unassignStub = sinon.stub(sync, "unassignWorkItem").resolves();
            var commentStub = sinon.stub(sync, "addComment").resolves();
            

            await sync.performWork({ action: "opened" });
            await sync.performWork({ action: "closed" });
            await sync.performWork({ action: "deleted" });
            await sync.performWork({ action: "reopened" });
            await sync.performWork({ action: "edited" });
            await sync.performWork({ action: "labeled" });
            await sync.performWork({ action: "unlabeled" });
            await sync.performWork({ action: "assigned" });
            await sync.performWork({ action: "unassigned" });
            await sync.performWork({ action: "created" });

            sinon.assert.calledOnce(createStub);
            sinon.assert.calledOnce(closeStub);
            sinon.assert.calledOnce(deleteStub);
            sinon.assert.calledOnce(reopenStub);
            sinon.assert.calledOnce(editStub);
            sinon.assert.calledOnce(labelStub);
            sinon.assert.calledOnce(unlabelStub);
            sinon.assert.calledOnce(assignStub);
            sinon.assert.calledOnce(unassignStub);
            sinon.assert.calledOnce(commentStub);
            sinon.restore();
        });

        it("should call schedule", async () => {
            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateIssues").resolves();
           
            await sync.performWork({ schedule: "foo" });

            sinon.assert.called(stub);
            sinon.restore();
        });
    });

    describe("getWorkItem", () => {
        it("should return null when skipping query", async () => {
            let sync = new GitSync();

            var result = await sync.getWorkItem(null, true);

            assert.isNull(result);
        });

        it("should return -1 when error thrown for api request", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().throwsException()
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });
            
            let config = {
                ado: {
                    orgUrl: "http://google.com",
                    project: "foobar",
                    wit: "User Story"
                },
                issue: {
                    number: 12
                },
                repository: {
                    full_name: "foo/bar"
                }
            }

            var sync = new proxiedGitSync();
            var result = await sync.getWorkItem(config);

            assert.equal(result, -1);
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });

        it("should return -1 for no results", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().resolves(null),
                getWorkItem: sinon.stub().resolves(null)
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });
            
            let config = {
                ado: {
                    orgUrl: "http://google.com",
                    project: "foobar",
                    wit: "User Story"
                },
                issue: {
                    number: 12
                },
                repository: {
                    full_name: "foo/bar"
                }
            }

            var sync = new proxiedGitSync();
            var result = await sync.getWorkItem(config);

            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query: "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                    "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":' " +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
                },
                { project: "foobar" }
            );

            assert.equal(result, -1);
            sinon.assert.calledWith(stubbedCore, "Error: project name appears to be invalid.");
            sinon.restore();
        });

        it("should return -1 for wiql failure", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().throwsException(),
                getWorkItem: sinon.stub().resolves(null)
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });
            
            let config = {
                ado: {
                    orgUrl: "http://google.com",
                    project: "foobar",
                    wit: "User Story"
                },
                issue: {
                    number: 12
                },
                repository: {
                    full_name: "foo/bar"
                }
            }

            var sync = new proxiedGitSync();
            var result = await sync.getWorkItem(config);

            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query: "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                    "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":' " +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
                },
                { project: "foobar" }
            );

            assert.equal(result, -1);
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });

        it("should return first of multiple work item", async () => {
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().resolves(require("./mocks/multipleWorkItems.json")),
                getWorkItem: sinon.stub().resolves(require("./mocks/workItem.json"))
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                }
            });
            
            let config = {
                ado: {
                    orgUrl: "http://google.com",
                    project: "foobar",
                    wit: "User Story"
                },
                issue: {
                    number: 12
                },
                repository: {
                    full_name: "foo/bar"
                }
            }

            var sync = new proxiedGitSync();
            var result = await sync.getWorkItem(config);

            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query: "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                    "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":' " +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
                },
                { project: "foobar" }
            );

            assert.equal(result, require("./mocks/workItem.json"));
            sinon.restore();
        });

        it("should return first work item", async () => {
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().resolves(require("./mocks/singleWorkItems.json")),
                getWorkItem: sinon.stub().resolves(require("./mocks/workItem.json"))
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                }
            });
            
            let config = {
                ado: {
                    orgUrl: "http://google.com",
                    project: "foobar",
                    wit: "User Story"
                },
                issue: {
                    number: 12
                },
                repository: {
                    full_name: "foo/bar"
                }
            }

            var sync = new proxiedGitSync();
            var result = await sync.getWorkItem(config);

            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query: "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                    "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":' " +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
                },
                { project: "foobar" }
            );

            assert.equal(result, require("./mocks/workItem.json"));
            sinon.restore();
        });

        it("should return -1 for no getWorkItem exception", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().resolves(require("./mocks/singleWorkItems.json")),
                getWorkItem: sinon.stub().throwsException()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });
            
            let config = {
                ado: {
                    orgUrl: "http://google.com",
                    project: "foobar",
                    wit: "User Story"
                },
                issue: {
                    number: 12
                },
                repository: {
                    full_name: "foo/bar"
                }
            }

            var sync = new proxiedGitSync();
            var result = await sync.getWorkItem(config);

            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query: "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                    "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":' " +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
                },
                { project: "foobar" }
            );

            assert.equal(result, -1);
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });

        it("should return null for no work item", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().resolves({"workItems": []}),
                getWorkItem: sinon.stub().resolves(null)
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });
            
            let config = {
                ado: {
                    orgUrl: "http://google.com",
                    project: "foobar",
                    wit: "User Story"
                },
                issue: {
                    number: 12
                },
                repository: {
                    full_name: "foo/bar"
                }
            }

            var sync = new proxiedGitSync();
            var result = await sync.getWorkItem(config);

            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query: "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = '" + config.ado.wit + "'" +
                    "AND [System.Title] CONTAINS 'GH #" + config.issue.number + ":' " +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: " + config.repository.full_name + "'"
                },
                { project: "foobar" }
            );

            assert.isNull(result);
            sinon.restore();
        });
    });

    describe("createWorkItem", () => {
        it("should return 0", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "ding"
                }
            };

            var sync = new GitSync();
            sinon.stub(sync, "getWorkItem").resolves(require("./mocks/workItem.json"));
            
            var result = await sync.createWorkItem(config);

            assert.equal(result, 0);
            sinon.restore();
        });

        it("should create a basic patch document", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                createWorkItem: sinon.stub().resolves(require("./mocks/workItem.json"))
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: false,
                    wit: "User Story"
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    body: "<h1>Test title</h1>",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    },
                    repository_url: "http://google.com"
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.Title",
                    value: "GH #100: foo"
                },
                {
                    op: "add",
                    path: "/fields/System.Description",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;"
                },
                {
                    op: "add",
                    path: "/relations/-",
                    value: {
                    rel: "Hyperlink",
                    url: "http://google.com"
                    }
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> created in <a href="http://google.com" target="_blank">foo/bar</a> by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new proxiedGitSync();
            sinon.stub(sync, "getWorkItem").resolves(null);

            var result = await sync.createWorkItem(config);

            assert.equal(result, require("./mocks/workItem.json"));
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.createWorkItem, [], patchDoc, config.ado.project, config.ado.wit, false, config.ado.bypassRules);
            sinon.restore();
        });

        it("should create a full patch document", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                createWorkItem: sinon.stub().resolves(require("./mocks/workItem.json"))
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    assignedTo: "noone@nowhere.com",
                    areaPath: "bar\\fuz",
                    iterationPath: "bar\\baz",
                    mappings: {
                        handles: {
                            someone: "someone@somewhere.com"
                        }
                    }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    body: "<h1>Test title</h1>",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    },
                    repository_url: "http://google.com"
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.Title",
                    value: "GH #100: foo"
                },
                {
                    op: "add",
                    path: "/fields/System.Description",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;"
                },
                {
                    op: "add",
                    path: "/relations/-",
                    value: {
                    rel: "Hyperlink",
                    url: "http://google.com"
                    }
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> created in <a href="http://google.com" target="_blank">foo/bar</a> by <a href="http://google.com" target="_blank">someone</a>'
                },
                {
                    op: "add",
                    path: "/fields/System.AssignedTo",
                    value: "noone@nowhere.com"
                },
                {
                    op: "add",
                    path: "/fields/System.AreaPath",
                    value: "bar\\fuz"
                },
                {
                    op: "add",
                    path: "/fields/System.IterationPath",
                    value: "bar\\baz"
                },
                {
                    op: "add",
                    path: "/fields/System.CreatedBy",
                    value: "someone"
                }
            ];

            var sync = new proxiedGitSync();
            sinon.stub(sync, "getWorkItem").resolves(null);

            var result = await sync.createWorkItem(config);

            assert.equal(result, require("./mocks/workItem.json"));
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.createWorkItem, [], patchDoc, config.ado.project, config.ado.wit, false, config.ado.bypassRules);
            sinon.restore();
        });

        it("should return -1 for creteWorkItem returning null", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                createWorkItem: sinon.stub().resolves(null)
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: false,
                    wit: "User Story"
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    body: "<h1>Test title</h1>",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    },
                    repository_url: "http://google.com"
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.Title",
                    value: "GH #100: foo"
                },
                {
                    op: "add",
                    path: "/fields/System.Description",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;"
                },
                {
                    op: "add",
                    path: "/relations/-",
                    value: {
                    rel: "Hyperlink",
                    url: "http://google.com"
                    }
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> created in <a href="http://google.com" target="_blank">foo/bar</a> by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new proxiedGitSync();
            sinon.stub(sync, "getWorkItem").resolves(null);

            var result = await sync.createWorkItem(config);

            assert.equal(result, -1);
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.createWorkItem, [], patchDoc, config.ado.project, config.ado.wit, false, config.ado.bypassRules);
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });

        it("should return -1 for failed creteWorkItem", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                createWorkItem: sinon.stub().throwsException()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: false,
                    wit: "User Story"
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    body: "<h1>Test title</h1>",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    },
                    repository_url: "http://google.com"
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.Title",
                    value: "GH #100: foo"
                },
                {
                    op: "add",
                    path: "/fields/System.Description",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                    value: "<h1>Test title</h1>"
                },
                {
                    op: "add",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;"
                },
                {
                    op: "add",
                    path: "/relations/-",
                    value: {
                    rel: "Hyperlink",
                    url: "http://google.com"
                    }
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> created in <a href="http://google.com" target="_blank">foo/bar</a> by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new proxiedGitSync();
            sinon.stub(sync, "getWorkItem").resolves(null);

            var result = await sync.createWorkItem(config);

            assert.equal(result, -1);
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.createWorkItem, [], patchDoc, config.ado.project, config.ado.wit, false, config.ado.bypassRules);
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });
    });

    describe("closeWorkItem", () => {
        it("should create a patch document", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { closed: "Closed" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.State",
                    value: "Closed"
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> closed by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.closeWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("deleteWorkItem", () => {
        it("should create a patch document", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { deleted: "Removed" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.State",
                    value: "Removed"
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> removed by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.deleteWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("reopenWorkItem", () => {
        it("should create a patch document", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.State",
                    value: "New"
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> reopened by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.reopenWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("editWorkItem", () => {
        it("should create a patch document with html", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { deleted: "Removed" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    body: "<h1>hello!</h1>",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                }
            };

            let patchDoc = [
                {
                    op: "replace",
                    path: "/fields/System.Title",
                    value: "GH #100: foo"
                },
                {
                    op: "replace",
                    path: "/fields/System.Description",
                    value: "<h1>hello!</h1>"
                },
                {
                    op: "replace",
                    path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                    value: "<h1>hello!</h1>"
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> edited by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.editWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });

        it("should create a patch document without html", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { deleted: "Removed" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    body: null,
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                }
            };

            let patchDoc = [
                {
                    op: "replace",
                    path: "/fields/System.Title",
                    value: "GH #100: foo"
                },
                {
                    op: "replace",
                    path: "/fields/System.Description",
                    value: ""
                },
                {
                    op: "replace",
                    path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
                    value: ""
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> edited by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.editWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("labelWorkItem", () => {
        it("should create a patch document", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "ding"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.Tags",
                    value: "GitHub Label: ding;"
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> addition of label \'ding\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.labelWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("unlabelWorkItem", () => {
        it("should return 0", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "ding"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.Tags",
                    value: "GitHub Label: ding;"
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> addition of label \'ding\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            sinon.stub(sync, "getWorkItem").resolves(null);
            
            var result = await sync.unlabelWorkItem(config);

            assert.equal(result, 0);
            sinon.restore();
        });

        it("should create a patch document", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "replace",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;GitHub Label: fiz;"
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> removal of label \'baz\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            sinon.stub(sync, "getWorkItem").resolves(require("./mocks/workItem.json"));
            var stub = sinon.stub(sync, "updateWorkItem").resolves();

            await sync.unlabelWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("assignWorkItem", () => {
        it("should create a patch document with assignee", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: { },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                assignee: {
                    login: "someone"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.AssignedTo",
                    value: "someone@somewhere.com"
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> assigned to \'someone\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            sinon.stub(sync, "getAssignee").callsFake(() => "someone@somewhere.com");
            
            await sync.assignWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });

        it("should create a patch document without assignee", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: { },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                assignee: {
                    login: "someone"
                }
            };

            let patchDoc = [
                {
                    op: "remove",
                    path: "/fields/System.AssignedTo"
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> assigned to \'someone\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            sinon.stub(sync, "getAssignee").callsFake(() => undefined);
            
            await sync.assignWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("unassignWorkItem", () => {
        it("should create a patch document", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: { },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                assignee: {
                    login: "someone"
                }
            };

            let patchDoc = [
                {
                    op: "remove",
                    path: "/fields/System.AssignedTo"
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> removal of assignment to \'someone\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.unassignWorkItem(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("addComment", () => {
        it("should create a patch document", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: { },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                comment: {
                    id: 1000,
                    body: "<h1>testing 1, 2, 3</h1>",
                    html_url: "http://google.com",
                    user: {
                        login: "someone",
                        html_url: "http://google.com"
                    }
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 
                        'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> comment added by <a href="http://google.com" target="_blank">someone</a><br />' +
                        'Comment #<a href="http://google.com" target="_blank">1000</a>:<br /><br /><h1>testing 1, 2, 3</h1>' 
                }
            ];

            var sync = new GitSync();
            var stub = sinon.stub(sync, "updateWorkItem").resolves();
            
            await sync.addComment(config);

            sinon.assert.calledWith(stub, config, patchDoc);
            sinon.restore();
        });
    });

    describe("updateWorkItem", () => {
        it("should return 0", async () => {
            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" }
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "ding"
                }
            };

            let patchDoc = [
                {
                    op: "add",
                    path: "/fields/System.Tags",
                    value: "GitHub Label: ding;"
                },
                {
                op: "add",
                path: "/fields/System.History",
                value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> addition of label \'ding\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new GitSync();
            sinon.stub(sync, "getWorkItem").resolves(null);
            
            var result = await sync.updateWorkItem(config);

            assert.equal(result, 0);
            sinon.restore();
        });

        it("should create workItem and create a patch document", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                updateWorkItem: sinon.stub().resolves(require("./mocks/workItem.json"))
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    autoCreate: true
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "replace",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;GitHub Label: fiz;"
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> removal of label \'baz\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new proxiedGitSync();
            sinon.stub(sync, "getWorkItem").resolves(null);
            var stub = sinon.stub(sync, "createWorkItem").resolves(require("./mocks/workItem.json"));

            var result = await sync.updateWorkItem(config, patchDoc);

            assert.equal(result, require("./mocks/workItem.json"));
            sinon.assert.calledWith(stub, config, true);
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.updateWorkItem, [], patchDoc, 1, config.ado.project, false, config.ado.bypassRules);
            sinon.restore();
        });

        it("should create a patch document", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                updateWorkItem: sinon.stub().resolves(require("./mocks/workItem.json"))
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "replace",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;GitHub Label: fiz;"
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> removal of label \'baz\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new proxiedGitSync();
            sinon.stub(sync, "getWorkItem").resolves(require("./mocks/workItem.json"));

            var result = await sync.updateWorkItem(config, patchDoc);

            assert.equal(result, require("./mocks/workItem.json"));
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.updateWorkItem, [], patchDoc, 1, config.ado.project, false, config.ado.bypassRules);
            sinon.restore();
        });

        it("should return -1 for updateWorkItem exception", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                updateWorkItem: sinon.stub().throwsException()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            let patchDoc = [
                {
                    op: "replace",
                    path: "/fields/System.Tags",
                    value: "GitHub Issue;GitHub Repo: foo/bar;GitHub Label: fiz;"
                },
                {
                    op: "add",
                    path: "/fields/System.History",
                    value: 'GitHub issue #100: <a href="http://google.com" target="_new">foo</a> in <a href="http://google.com" target="_blank">foo/bar</a> removal of label \'baz\' by <a href="http://google.com" target="_blank">someone</a>'
                }
            ];

            var sync = new proxiedGitSync();
            sinon.stub(sync, "getWorkItem").resolves(require("./mocks/workItem.json"));

            var result = await sync.updateWorkItem(config, patchDoc);

            assert.equal(result, -1);
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.updateWorkItem, [], patchDoc, 1, config.ado.project, false, config.ado.bypassRules);
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });
    });

    describe("updateIssues", () => {
        it("should create a patch document", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().resolves(require("./mocks/multipleWorkItems.json"))
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story"
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                GITHUB_REPOSITORY: "foo/bar"
            };

            var sync = new proxiedGitSync();
            var stub = sinon.stub(sync, "updateIssue").resolves(null);

            var result = await sync.updateIssues(config);

            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query:
                    "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = 'User Story'" +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: foo/bar' " +
                    "AND [System.ChangedDate] > @Today - 1"
                },
                { project: "foo" }
            );
            sinon.assert.calledTwice(stub);
            sinon.restore();
        });

        it("should return -1 for workItemTrackingApi error", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().throwsException()
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                }
            };

            var sync = new proxiedGitSync();

            var result = await sync.updateIssues(config);

            assert.equal(result, -1);
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });

        it("should return -1 for null result", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().resolves(null)
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story"
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                GITHUB_REPOSITORY: "foo/bar"
            };

            var sync = new proxiedGitSync();
            sinon.stub(sync, "updateIssue").resolves(null);

            var result = await sync.updateIssues(config);

            assert.equal(result, -1);
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query:
                    "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = 'User Story'" +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: foo/bar' " +
                    "AND [System.ChangedDate] > @Today - 1"
                },
                { project: "foo" }
            );
            sinon.assert.calledWith(stubbedCore, "Error: project name appears to be invalid.");
            sinon.restore();
        });

        it("should return -1 for failed queryByWiql", async () => {
            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                queryByWiql: sinon.stub().throwsException()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "azure-devops-node-api": {
                   WebApi: sinon.stub().callsFake(() => {
                    return {
                        getWorkItemTrackingApi: sinon.stub().resolves(stubbedWorkItemTrackingApi)
                    }
                   })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story"
                },
                closed_at: now,
                issue: {
                    number: 100, 
                    url: "http://google.com",
                    title: "foo",
                    repository_url: "http://google.com",
                    user: { 
                        login: "someone",
                        html_url: "http://google.com"
                    }
                },
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                GITHUB_REPOSITORY: "foo/bar"
            };

            var sync = new proxiedGitSync();
            sinon.stub(sync, "updateIssue").resolves(null);

            var result = await sync.updateIssues(config);

            assert.equal(result, -1);
            sinon.assert.calledWith(stubbedWorkItemTrackingApi.queryByWiql, 
                { query:
                    "SELECT [System.Id], [System.Description], [System.Title], [System.AssignedTo], [System.State], [System.Tags] FROM workitems WHERE [System.TeamProject] = @project " +
                    "AND [System.WorkItemType] = 'User Story'" +
                    "AND [System.Tags] CONTAINS 'GitHub Issue' " +
                    "AND [System.Tags] CONTAINS 'GitHub Repo: foo/bar' " +
                    "AND [System.ChangedDate] > @Today - 1"
                },
                { project: "foo" }
            );
            sinon.assert.called(stubbedCore);
            sinon.restore();
        });
    });

    describe("updateIssue", () => {
        it("should update github issue when AzDO change date is newer than github change date and title is different", async () => {
            let workItem = require("./mocks/workItem.json");
            let gitHubIssue = require("./mocks/githubIssue.json");
            gitHubIssue.data.updated_at = DateTime.fromJSDate(new Date(workItem.fields["System.ChangedDate"])).minus({ days: 5}).toJSDate();

            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                getWorkItem: sinon.stub().resolves(workItem)
            }
            const stubbedIssues = {
                get: sinon.stub().resolves(gitHubIssue),
                update: sinon.stub().resolves()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "@actions/github": {
                    getOctokit: sinon.stub().returns({
                        rest: {
                            issues: stubbedIssues
                        }
                    })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                },
                closed_at: now,
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                github: {
                    token: "blah blah"
                },
                GITHUB_REPOSITORY: "foo/bar",
                GITHUB_REPOSITORY_OWNER: "foo"
            };

            var sync = new proxiedGitSync();
            await sync.updateIssue(config, stubbedWorkItemTrackingApi, workItem);

            sinon.assert.calledWith(stubbedIssues.update, { 
                owner: "foo", 
                repo: "bar", 
                issue_number: '12', 
                title: "title 1", 
                body: "description 1", 
                state: "new" 
            });
            sinon.restore();
            decache("./mocks/workItem.json");
            decache("./mocks/githubIssue.json");
        });

        it("should update github issue when AzDO change date is newer than github change date and body is different", async () => {
            let workItem = require("./mocks/workItem.json");
            workItem.fields["System.Title"] = "GH #12: Testing title";
            let gitHubIssue = require("./mocks/githubIssue.json");
            gitHubIssue.data.updated_at = DateTime.fromJSDate(new Date(workItem.fields["System.ChangedDate"])).minus({ days: 5}).toJSDate();

            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                getWorkItem: sinon.stub().resolves(workItem)
            }
            const stubbedIssues = {
                get: sinon.stub().resolves(gitHubIssue),
                update: sinon.stub().resolves()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "@actions/github": {
                    getOctokit: sinon.stub().returns({
                        rest: {
                            issues: stubbedIssues
                        }
                    })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                },
                closed_at: now,
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                github: {
                    token: "blah blah"
                },
                GITHUB_REPOSITORY: "foo/bar",
                GITHUB_REPOSITORY_OWNER: "foo"
            };

            var sync = new proxiedGitSync();
            await sync.updateIssue(config, stubbedWorkItemTrackingApi, workItem);

            sinon.assert.calledWith(stubbedIssues.update, { 
                owner: "foo", 
                repo: "bar", 
                issue_number: '12', 
                title: "Testing title", 
                body: "description 1", 
                state: "new" 
            });
            sinon.restore();
            decache("./mocks/workItem.json");
            decache("./mocks/githubIssue.json");
        });

        it("should update github issue when AzDO change date is newer than github change date and state is different", async () => {
            let workItem = require("./mocks/workItem.json");
            workItem.fields["System.Title"] = "GH #12: Testing title";
            workItem.fields["System.Description"] = "Some body";
            workItem.fields["System.State"] = "Closed";
            let gitHubIssue = require("./mocks/githubIssue.json");
            gitHubIssue.data.updated_at = DateTime.fromJSDate(new Date(workItem.fields["System.ChangedDate"])).minus({ days: 5}).toJSDate();

            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                getWorkItem: sinon.stub().resolves(workItem)
            }
            const stubbedIssues = {
                get: sinon.stub().resolves(gitHubIssue),
                update: sinon.stub().resolves()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "@actions/github": {
                    getOctokit: sinon.stub().returns({
                        rest: {
                            issues: stubbedIssues
                        }
                    })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                },
                closed_at: now,
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                github: {
                    token: "blah blah"
                },
                GITHUB_REPOSITORY: "foo/bar",
                GITHUB_REPOSITORY_OWNER: "foo"
            };

            var sync = new proxiedGitSync();
            await sync.updateIssue(config, stubbedWorkItemTrackingApi, workItem);

            sinon.assert.calledWith(stubbedIssues.update, { 
                owner: "foo", 
                repo: "bar", 
                issue_number: '12', 
                title: "Testing title", 
                body: "Some body", 
                state: "closed" 
            });
            sinon.restore();
            decache("./mocks/workItem.json");
            decache("./mocks/githubIssue.json");
        });

        it("should successfully convert html code blocks back to markdown and not update github issue when equal", async () => {
            let workItem = require("./mocks/workItemCode.json");
            workItem.fields["System.Description"] = "testing<br />" + workItem.fields["System.Description"];
            workItem.fields["System.Title"] = "GH #12: Testing title";
            let gitHubIssue = require("./mocks/githubIssue.json");
            gitHubIssue.data.updated_at = DateTime.fromJSDate(new Date(workItem.fields["System.ChangedDate"])).minus({ days: 5}).toJSDate();
            gitHubIssue.data.body = "testing\n<pre>public class Foo() {\n    var number = 0;\n    var text = \"Hello World!\";\n    return 0;\n}</pre>";

            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                getWorkItem: sinon.stub().resolves(workItem)
            }
            const stubbedIssues = {
                get: sinon.stub().resolves(gitHubIssue),
                update: sinon.stub().resolves()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "@actions/github": {
                    getOctokit: sinon.stub().returns({
                        rest: {
                            issues: stubbedIssues
                        }
                    })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                },
                closed_at: now,
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                github: {
                    token: "blah blah"
                },
                GITHUB_REPOSITORY: "foo/bar",
                GITHUB_REPOSITORY_OWNER: "foo"
            };

            var sync = new proxiedGitSync();
            var result = await sync.updateIssue(config, stubbedWorkItemTrackingApi, workItem);

            assert.isNull(result);
            sinon.assert.notCalled(stubbedIssues.update);
            sinon.restore();
            decache("./mocks/workItemCode.json");
            decache("./mocks/githubIssue.json");
        });      
        
        it("should successfully convert html code blocks back to markdown and update github issue when not equal", async () => {
            let workItem = require("./mocks/workItemCode.json");
            workItem.fields["System.Description"] = "testing<br \>some more<br \>" + workItem.fields["System.Description"];
            workItem.fields["System.Title"] = "GH #12: Testing title";
            let gitHubIssue = require("./mocks/githubIssue.json");
            gitHubIssue.data.updated_at = DateTime.fromJSDate(new Date(workItem.fields["System.ChangedDate"])).minus({ days: 5}).toJSDate();
            gitHubIssue.data.body = "testing\n\n<pre>public class Foo() {\n    var number = 0;\n    var text = \"Hello World!\";\n    return 0;\n}</pre>";

            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                getWorkItem: sinon.stub().resolves(workItem)
            }
            const stubbedIssues = {
                get: sinon.stub().resolves(gitHubIssue),
                update: sinon.stub().resolves()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "@actions/github": {
                    getOctokit: sinon.stub().returns({
                        rest: {
                            issues: stubbedIssues
                        }
                    })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                },
                closed_at: now,
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                github: {
                    token: "blah blah"
                },
                GITHUB_REPOSITORY: "foo/bar",
                GITHUB_REPOSITORY_OWNER: "foo"
            };

            var sync = new proxiedGitSync();
            await sync.updateIssue(config, stubbedWorkItemTrackingApi, workItem);

            sinon.assert.calledWith(stubbedIssues.update, { 
                owner: "foo", 
                repo: "bar", 
                issue_number: '12', 
                title: "Testing title", 
                body: "testing\nsome more\n<pre>public class Foo() {\n    var number = 0;\n    var text = \"Hello World!\";\n    return 0;\n}</pre>", 
                state: "new" 
            });
            sinon.restore();
            decache("./mocks/workItemCode.json");
            decache("./mocks/githubIssue.json");
        });    

        it("should not update github issue when AzDO change date is newer than github change date but data is the same", async () => {
            let workItem = require("./mocks/workItem.json");
            workItem.fields["System.Title"] = "GH #14: Testing title";
            workItem.fields["System.Description"] = "Some body";
            workItem.fields["System.State"] = "New";
            let gitHubIssue = require("./mocks/githubIssue.json");
            gitHubIssue.data.updated_at = DateTime.fromJSDate(new Date(workItem.fields["System.ChangedDate"])).minus({ days: 5}).toJSDate();

            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                getWorkItem: sinon.stub().resolves(workItem)
            }
            const stubbedIssues = {
                get: sinon.stub().resolves(gitHubIssue),
                update: sinon.stub().resolves()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "@actions/github": {
                    getOctokit: sinon.stub().returns({
                        rest: {
                            issues: stubbedIssues
                        }
                    })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                },
                closed_at: now,
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                github: {
                    token: "blah blah"
                },
                GITHUB_REPOSITORY: "foo/bar",
                GITHUB_REPOSITORY_OWNER: "foo"
            };

            var sync = new proxiedGitSync();
            var result = await sync.updateIssue(config, stubbedWorkItemTrackingApi, workItem);

            assert.isNull(result);
            sinon.assert.notCalled(stubbedIssues.update);
            sinon.restore();
            decache("./mocks/workItem.json");
            decache("./mocks/githubIssue.json");
        });

        it("should not update github issue when AzDO change date is newer than github change date", async () => {
            let workItem = require("./mocks/workItem.json");
            let gitHubIssue = require("./mocks/githubIssue.json");
            gitHubIssue.data.updated_at = DateTime.fromJSDate(new Date(workItem.fields["System.ChangedDate"])).plus({ days: 5}).toJSDate();

            const stubbedCore = sinon.stub().callsFake();
            const stubbedWorkItemTrackingApi = {
                getWorkItem: sinon.stub().resolves(workItem)
            }
            const stubbedIssues = {
                get: sinon.stub().resolves(gitHubIssue),
                update: sinon.stub().resolves()
            }
            const proxiedGitSync = proxyquire('./gitsync', {
                "@actions/github": {
                    getOctokit: sinon.stub().returns({
                        rest: {
                            issues: stubbedIssues
                        }
                    })
                },
                "@actions/core": {
                    setFailed: stubbedCore
                }
            });

            let now = Date.now();
            let config = {
                log_level: 'silent',
                ado: {
                    states: { reopened: "New" },
                    project: "foo",
                    bypassRules: true,
                    wit: "User Story",
                    states: {
                        new: "New",
                        closed: "Closed",
                        reopened: "New",
                        deleted: "Removed",
                        active: "Active"
                    },
                },
                closed_at: now,
                repository: {
                    full_name: "foo/bar"
                },
                label: {
                    name: "baz"
                },
                github: {
                    token: "blah blah"
                },
                GITHUB_REPOSITORY: "foo/bar",
                GITHUB_REPOSITORY_OWNER: "foo"
            };

            var sync = new proxiedGitSync();
            var result = await sync.updateIssue(config, stubbedWorkItemTrackingApi, workItem);

            assert.isNull(result);
            sinon.restore();
            decache("./mocks/workItem.json");
            decache("./mocks/githubIssue.json");
        });
    });
});