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

## Installation

### One-click (recommended)

1. Extract the full plugin archive — do not take a single file out of it.
2. Run `dsh web` once, confirm Harness opens, then stop it.
3. Double-click `install.cmd` in the extracted directory.
4. Run `dsh web` again and open **Settings > Reasoning effort**.

The installer copies the plugin to `~/.dsh/plugins/dsh-reasoning-settings` and mounts it into your current DSH Web profile, so the archive and extracted directory can be deleted afterwards.

`dsh web` listens on `http://127.0.0.1:3080` by default. Ports are unrelated to this plugin; another port (e.g. `3081`) is only used when the default one is already taken or you explicitly pass `--port 3081`.

### Manual installation

Install this directory into your DSH Web profile and add it to the plugin tree:

```powershell
pnpm --dir "$env:USERPROFILE\.dsh\profiles\web" add "C:\path\to\dsh-reasoning-settings"
```

Then add the following to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: ui-settings-reasoning
      name: dsh-reasoning-settings
```

Restart `dsh web`, then open **Settings > Reasoning effort**.

## Usage

1. Add your custom provider and models on the official **Models** page first.
2. Open **Settings > Reasoning effort**.
3. Pick the supported levels for each model and set the provider default effort.
4. Click **Save** under that provider.
5. Start a new session and choose the model and reasoning effort in the model picker.

The plugin only declares which effort levels Harness may select and send. Whether the relay API actually honors a value is up to the relay: if a request comes back with HTTP 400, uncheck the levels that model does not support or adjust their wire values.

## Development

```powershell
pnpm test   # or: node tests/plugin.test.mjs
```

## Compatibility

Built against the public dual-end plugin, settings-slot and `settings.mutate` interfaces of DeepSeek Harness `0.1.0-rc.5`. Harness is still in Developer Preview; if the plugin stops loading after an upgrade, check whether those interfaces changed.

## License

[MIT](./LICENSE)
