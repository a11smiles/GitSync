const chai = require('chai');
var sinon = require('sinon');
const assert = chai.assert;
chai.use(require('sinon-chai'));

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

    });

    describe("createWorkItem", () => {

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

    xdescribe("unlabelWorkItem", () => {
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

    });

    describe("updateIssues", () => {

    });

    describe("updateIssue", () => {

    });
});