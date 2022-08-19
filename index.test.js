const assert = require('chai').assert;
const index = require('./index')._test;

describe("index", () => {
    describe("getConfig", () => {
        it("should load the config file", () => {
            var config = index.getConfig(null, {
                config_file: './mocks/config.json',
                log_level: 'silent'
            });
            
            let configJson = {
                ...require('./mocks/config.json'),
                github: {},
                config_file: './mocks/config.json',
                log_level: 'silent'
            }
            
            assert.notStrictEqual(configJson, config);
        });

        it("should not load the config file", () => {
            var config = index.getConfig(null, {
                config_file: './mocks/no_config.json',
                log_level: 'silent'
            });
            
            let configJson = {
                ado: { },
                github: {},
                config_file: './mocks/config.json',
                log_level: 'silent'
            }
            
            assert.notStrictEqual(configJson, config);
        });

        it("should set tokens", () => {
            var config = index.getConfig(null, {
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
            }
            
            assert.notStrictEqual(configJson, config);
        });
    });
});