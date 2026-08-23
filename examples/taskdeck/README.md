# TaskDeck

A small project and task tracker. This is roughly the shape a real codebase starts
at: a handful of actions, a couple of workflows, and permissions that are mostly
`AUTH` with one deliberate `PUBLIC` hole.

```bash
cd examples/taskdeck
axl compile
axl inspect ./build
```

```
TaskDeck v1.0.0
6 action(s), 0 resource(s), 3 workflow(s)
1 reachable without a session (PUBLIC)
```

## What it contains

| Action | Permission | Endpoint |
|---|---|---|
| `list_projects` | `AUTH` | `GET /projects` |
| `create_project` | `AUTH` | `POST /projects` |
| `list_tasks` | `PUBLIC`, `10/min` | `GET /projects/{project_id}/tasks` |
| `create_task` | `AUTH` | `POST /projects/{project_id}/tasks` |
| `update_task_status` | `AUTH` | `PATCH /tasks/{task_id}` |
| `delete_task` | `AUTH`, confirm-gated | `DELETE /tasks/{task_id}` |

Workflows: `ProjectCreation`, `TaskLifecycle`, `ProjectDeletion`.

## The one thing worth noticing

`list_tasks` is `PUBLIC`. That is a real decision with a real consequence — it
makes an unauthenticated proxy to the backend's task list, which is why it carries
a rate limit and nothing else here does.

Run `axl inspect` on any project and read the "reachable without a session" count
before deploying it. That number is the honest summary of a project's exposure.

For the full feature set — `RESOURCE`, `ROLE`/`OWNER`, `PARALLEL`, `SWITCH`,
`IRREVERSIBLE` — see [hotel-booking](../hotel-booking).
