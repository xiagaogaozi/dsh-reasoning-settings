# DSH Reasoning Settings

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web settings plugin that adds an independent **reasoning effort** (thinking intensity) page for custom `llm-pi-ai` providers. The official UI only exposes effort selection for first-party DeepSeek models; this plugin makes it work for third-party / relay APIs too.

[中文说明](./README.zh-CN.md)

## Features

- Auto-reads the custom providers and models you already added on the official **Models** page.
- Declares a per-model effort level from `off / minimal / low / medium / high / xhigh / max`.
- Customizes the actual wire value sent to the API for each level.
- Sets a provider-wide default effort, restricted to the levels supported by every model in that provider.
- Configures the reasoning wire format for `openai-completions` providers.
- Writes back to `llm-pi-ai.providers.*` through the official `settings.mutate` API — API keys are never touched.
- Fixes in-process subagents inheriting the Agent's create-time official model instead of the parent's live third-party provider/model selection.
- Makes subagents inherit an explicit parent reasoning effort, or fall back to the target provider's configured default effort.
- Resolves model-only child overrides such as `grok-4.5` against user-configured third-party providers instead of an unrelated official provider.
- Extends the ordinary `subagent` and `subagent_fork` tools with per-call `provider`, `model`, and `reasoning_effort` fields, without replacing their official lifecycle, background, or result behavior.

## Installation

Install and enable the plugin from GitHub with one PowerShell command:

```powershell
npx -p @deepseek-ai/dsh dsh plugin --profile web add github:JuneLearn/dsh-reasoning-settings
```

The package's `dsh.bundle` declaration adds the plugin to the Web profile automatically; do not edit `cordis.patch.yml`. After installation, run `dsh web` and open **Settings > Reasoning effort**.

To install a local checkout, use its actual path instead:

```powershell
npx -p @deepseek-ai/dsh dsh plugin --profile web add "D:\dsh-reasoning-settings"
```

`dsh web` listens on `http://127.0.0.1:3080` by default. Ports are unrelated to this plugin; another port (e.g. `3081`) is only used when the default one is already taken or you explicitly pass `--port 3081`.

### Migrating from 0.3.0 or earlier

The old instructions manually appended `ui-settings-reasoning` to the profile's `cordis.patch.yml`. Before installing this version, remove this old mount entry from that file once; the bundle manages it afterward:

```yaml
- insert:
    - id: ui-settings-reasoning
      name: dsh-reasoning-settings
```

If no entries remain besides comments, replace the removed entry with `[]`.

### Upgrade

Run the install command again to update the GitHub version. No profile-patch maintenance or uninstall is required:

```powershell
npx -p @deepseek-ai/dsh dsh plugin --profile web add github:JuneLearn/dsh-reasoning-settings
```

### Uninstall

```powershell
npx -p @deepseek-ai/dsh dsh plugin --profile web remove dsh-reasoning-settings
```

DSH removes both the dependency and its bundle layer. Restart `dsh web`; the **Reasoning effort** settings page is removed.

## Usage

1. Add your custom provider and models on the official **Models** page first.
2. Open **Settings > Reasoning effort**.
3. Pick the supported levels for each model and set the provider default effort.
4. Click **Save** under that provider.
5. Start a new session and choose the model and reasoning effort in the model picker.

The plugin only declares which effort levels Harness may select and send. Whether the relay API actually honors a value is up to the relay: if a request comes back with HTTP 400, uncheck the levels that model does not support or adjust their wire values.

## Subagent routing and reasoning

The server entry fixes model inheritance for Harness `0.1.0-rc.5` in-process `subagent`, `subagent_fork`, and Workflow children:

1. An explicit child `provider + model` route remains authoritative when it differs from the parent's create-time route.
2. A model-only override is resolved against user-configured third-party providers; duplicate model ids prefer the parent's current provider.
3. With no child override, the child inherits the parent's live provider/model instead of its create-time official default.
4. An explicit child effort remains authoritative; otherwise the parent's effort is inherited only for the same target route.
5. With no explicit effort, the plugin leaves it absent so `llm-pi-ai` applies the target provider's `reasoning` default.

The plugin also augments the existing model-facing `subagent` and `subagent_fork` tools for each live Agent. Their original arguments remain available, with three optional fields added:

- `provider`: exact configured Provider id;
- `model`: exact model id owned by that Provider;
- `reasoning_effort`: optional `off / minimal / low / medium / high / xhigh / max` level.

`provider` and `model` must be supplied together. Omitting both preserves normal inheritance. Omitting `reasoning_effort` after selecting a different route uses that Provider/model's configured default. The tool descriptions enumerate exact configured pairs and instruct the parent model to delegate instead of answering directly when a user requests another Provider/model.

Do not use shorthand such as “the 5.6 model” when multiple exact ids exist. For example, if a Provider contains both `gpt-5.6-sol` and `gpt-5.6-terra`, ask for one exact pair:

```text
Use subagent with provider=wpironman-gpt, model=gpt-5.6-terra,
reasoning_effort=max to write a 100-character random essay.
```

If the requested pair equals the current route, the child still uses that same route, so the result will naturally look like the parent model. The structured tool-call arguments and the child's durable `request/header` are the reliable verification points.

Per-call targeting affects local in-process children only. Codex, Claude Code, and ACP subagents run in separate processes and retain their own model configuration. Workflow retains its own structured `provider`/`model` phase fields and still benefits from the inheritance correction when no phase target is supplied.

All switches default to `true` and may be changed in the plugin mount:

```yaml
- insert:
    - id: ui-settings-reasoning
      name: dsh-reasoning-settings
      config:
        subagentRouting: true
        inheritRoute: true
        resolveModelOnly: true
        inheritReasoning: true
```

Set `subagentRouting: false` to disable the entire server-side correction.

## Development

```powershell
pnpm test   # or: node tests/plugin.test.mjs
```

## Compatibility

Built against the public dual-end plugin, settings-slot, `settings.mutate`, agent-scoped tool shadowing, Agent lifecycle, and `agent/request` waterfall interfaces of DeepSeek Harness `0.1.0-rc.5`. Harness is still in Developer Preview; if the plugin stops loading or subagent routing changes after an upgrade, check those interfaces and the subagent session metadata.

## License

[MIT](./LICENSE)
