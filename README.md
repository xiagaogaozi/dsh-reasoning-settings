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

Run the following steps in PowerShell — copy and paste as-is.

1. Run `dsh web` once, confirm Harness opens, then stop it (this creates the Web profile directory).

2. Clone this repository to `D:\dsh-reasoning-settings`:

```powershell
git clone https://github.com/JuneLearn/dsh-reasoning-settings.git D:\dsh-reasoning-settings
```

3. Install the plugin into your DSH Web profile:

```powershell
dsh plugin --profile web add "D:\dsh-reasoning-settings"
```

4. Register the plugin in the profile's patch layer (skips if already present, safe to re-run):

```powershell
$patch = "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml"
if (-not (Select-String -Path $patch -Pattern 'dsh-reasoning-settings' -Quiet)) {
  Add-Content $patch "`n- insert:`n    - id: ui-settings-reasoning`n      name: dsh-reasoning-settings"
}
```

5. Run `dsh web` again and open **Settings > Reasoning effort**.

`dsh web` listens on `http://127.0.0.1:3080` by default. Ports are unrelated to this plugin; another port (e.g. `3081`) is only used when the default one is already taken or you explicitly pass `--port 3081`.

### Upgrade

To upgrade later, pull the latest code in the cloned directory and run the install command again — no uninstall is needed:

```powershell
git -C D:\dsh-reasoning-settings pull
dsh plugin --profile web add "D:\dsh-reasoning-settings"
```

pnpm overwrites the previous entry, and the step 4 registration command automatically skips an already-present entry.

### Uninstall

```powershell
# 1. Remove the plugin package from the DSH Web profile
dsh plugin --profile web remove dsh-reasoning-settings

# 2. Delete the mount entry from cordis.patch.yml (safe to re-run)
$patch = "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml"
$content = Get-Content $patch -Raw
if ($content -match '(?ms)\n?- insert:\n\s+- id: ui-settings-reasoning\n\s+name: dsh-reasoning-settings\s*') {
  Set-Content $patch -Value ($content -replace '(?ms)\n?- insert:\n\s+- id: ui-settings-reasoning\n\s+name: dsh-reasoning-settings\s*', '')
}

# 3. Delete the cloned directory (optional)
Remove-Item D:\dsh-reasoning-settings -Recurse -Force
```

Restart `dsh web`; the **Reasoning effort** settings page is removed.

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
