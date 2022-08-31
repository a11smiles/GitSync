# GitSync

GitSync is a workflow action that bidirectionally syncs GitHub and Azure DevOps activities.

## Features

* Bidirectional sync between Azure DevOps work items and GitHub issues.
* Assign default users in Azure DevOps for sync'ed issues.
* Assign default areas and iterations in Azure DevOps for sync'ed issues.
* Map states between GitHub and Azure DevOps.
* Map GitHub aliases to Azure DevOps users automatically.
* Assign tags in Azure DevOps based on GitHub labels.
* Autocreate Azure DevOps work items for pre-existing GitHub issues.
* Syncs public comments to Azure DevOps discussions, including code, images, etc.
* Internal teams can maintain private, internal discussions on work items, while allowing public users to contribute to the public discussion.

## Configuration

There are two configuration files that will need to be added - the workflow file and the action configuration file, itself. Below are samples of each followed by a description.

### ghsync.yml

You can name this file whatever you prefer. `ghsync.yml` is just an example.

```yaml
name: Sync with Azure DevOps

on:
  schedule:
    - cron: '*/15 * * * *'
  issues:
    types: [opened, closed, deleted, reopened, edited, labeled, unlabeled, assigned, unassigned]
  issue_comment:
    types: [created]

jobs:
  alert:
    runs-on: ubuntu-latest
    name: Sync workflow
    steps:       
    - uses: actions/checkout@v3
    - uses: a11smiles/GitSync@main
      env:     
        ado_token: '${{ secrets.ADO_PERSONAL_ACCESS_TOKEN }}'
        github_token: '${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}'
        config_file: './.github/workflows/sync_config.json'
```

This file instructs GitHub to execute this workflow on a number of conditions. The first condition schedules this workflow as a cron (automated) job to be ran every 15 minutes. You can change this to the schedule you prefer, but 5 minutes is the minimum that GitHub allows. Additionally, per GitHub, the schedule isn't completely accurate. While the workflow is scheduled to run every 15 minutes, a better interpretation is "it will _eventually_ run no less than 15 minutes apart."

The second and third conditions are when the issue changes or comments are added, respectfully.

The workflow requires two steps. The first step checks out the repo in order to download the configuration file that is used in the second step. The second step actually performs the synchronization. It requires the following three environment variables.

| Variable | Description |
| ---      | ---         |
| `ado_token` | Your [personal access token](https://docs.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) (PAT) for Azure DevOps. It must have "**Read & Write**" permissions for Work Items. |
| `github_token` | Your [PAT](https://help.github.com/en/enterprise/2.17/user/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line) for GitHub. It must have "**repo**" permissions. |
| `config_file` | The path to your sync configuration file. This file can be located anywhere in the repo, but the path must be relative to the repo's base path. The example above shows the configuration file residing in the workflows folder. |

### sync_config.json

Once again, you can name this file whatever you prefer. However, the name must be reflected in the `config_file` setting of your workflow file.

```yaml
{
    "log_level": "debug",
    "ado": {
        "organization": "my_ado_organization",
        "project": "my project",
        "wit": "User Story",
        "states": {
            "new": "New",
            "closed": "Closed",
            "reopened": "New",
            "deleted": "Removed",
            "active": "Active"
        },
        "bypassRules": true,
        "autoCreate": true,
        "assignedTo": "default@myorganization.com",
        "areaPath": "my_project\\A Path",
        "iterationPath": "my_project\\Sprint 2",
        "mappings": {
            "handles": {
                "user_a": "user.a@myorganization.com",
                "user_b": "user.b@myorganization.com"
            }
        }
    }
}
```

Below are the settings contained in the config file. Note, besides the `log_level`, there are no defaults. Either the setting is required, or it isn't.

> **NOTE:** While some of the settings below are required, the use of a configuration file isn't. These settings can be provided as environment variables. Simply create environment variables `log_level` and/or `ado` and assign secrets to them with the following formats.

| Setting | Required | Description |
| ---     | :---:    | ---         |
| `log_level` | No | Determines how much information is shown from the workflow execution. The available options are `trace`, `debug`, `info`, `warn`, and `error`.<br /><br />Default: `info`|
| `ado.organization` | Yes | The name of your Azure DevOps organization. |
| `ado.project` | Yes | The name of your Azure Devops project. |
| `ado.wit` | Yes | The work item type to be associated with GitHub issues. |
| `ado.states` | Yes | Mapping GitHub issue states (left side, or keys) to Azure DevOps states (right side, or values). |
| `ado.bypassRules` | No | If true, uses the GitHub alias as the creator of the Azure DevOps work item. If false, uses the owner of the Azure DevOps PAT as creator of the Azure DevOps work item. |
| `ado.autoCreate` | No | If true, it will retroactively create Azure DevOps work items for pre-existing GitHub issues. If false, only _new_ GitHub issues will be tracked.<br /><br />**NOTE:** At this time, the full history of a pre-existing GitHub issue is not "replayed" into the work item if it's created. Instead, just the current and future events are reflected in the Azure DevOps work item. |
| `ado.assignedTo` | No | If provided, a default email address of an Azure DevOps user to assign new work items to. This is overridden by alias mappings (see below). This setting is helpful if work items should be assigned to a project manager or team lead for initial triage. If this is not provided, and not mapped to an alias (or alias mappings aren't provided), then the new Azure DevOps work item will remain unassigned. |
| `ado.areaPath` | No | The default area path to assign the new work item.<br /><br />**NOTE:** The area path must begin with the project name and you must use double (escaped) backslashes as separators. |
| `ado.iterationPath` | No | The default iteration path to assign the new work item.<br /><br />**NOTE:** The iteration path must begin with the project name and you must use double (escaped) backslashes as separators. |
| `ado.mappings.handles` | No | Allows you to map GitHub aliases (or handles) to Azure DevOps users. Simply provide a collection of mappings following the format of alias/handle to user email address. |

### GitHub Secrets Configuration

You are not required to use the configuration JSON file entirely. For example, you may wish keep the email addresses hidden. In that case, you would simply pass an environment variable named `ado` and/or `github` with your configurations.

> **NOTE:** Any configuration path provided in the environment variables will overwrite the corresponding paths in the configuration file.

For an alternative approach to storing GitHub alias mappings (again, this is just one example, but can be applied to any path), you would do the following (I'm also overriding the Area Path, to further illustrate the process):

1. Create a GitHub secret. I'll call it `ADO_CONFIG`. It should have the following content (notice that it's a copy of the `ado` object's structure in the JSON file):

   ```json
    {
        "ado": {
            "areaPath": "my_project\\Some Other Path",
            "mappings": {
                "handles": {
                    "user_a": "user.a@myorganization.com",
                    "user_b": "user.b@myorganization.com"
                }
            }
        }
    }
   ```

2. In your yaml file add the secret as a mapping to an `ado` environment variable (notice the last line):

    ```yaml
    - uses: a11smiles/GitSync@main
      env:     
        ado_token: '${{ secrets.ADO_PERSONAL_ACCESS_TOKEN }}'
        github_token: '${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}'
        config_file: './.github/workflows/sync_config.json'
      with:
        ado: '${{ secrets.ADO_CONFIG }}'
    ```

That's it! Now your mappings in the environment variable will _override_ any mappings provided in the JSON configuration file.

> **NOTE:** May sure you save the secret's content/configuration somewhere. As you know, if you needed to update the configuration later, you would need to re-type everything as the secret isn't exposed when editing.

> **IMPORTANT:** The default `log_level` is _info_. If you change this to _trace_ or _debug_, the action will print the configuration in the logs. Once you have completed your testing, change the `log_level` back to _info_ or higher in order to conceal whatever you have in your configuration.

## Synchronization

| Direction |  |
| --- | -- |
| GitHub to Azure DevOps | GitHub issues created or modified are reflected in the Azure DevOps backlog. Modifications include title, description, assignment, state, and labels. |
| Azure DevOps to GitHub | When the title, description, or state of any sync'ed issues change in Azure DevOps, the same is reflected in GitHub.<br /><br />**NOTE:** Azure DevOps discussions are not sync'ed back into GitHub. This allows teams to have internal discussions that aren't reflected publicly. |

As stated above, the Azure DevOps to GitHub synchronization operates on a schedule. When executed, the workflow queries all work items that have changed within the past 24 hours.
