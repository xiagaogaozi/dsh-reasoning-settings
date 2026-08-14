# DSH 推理强度设置插件

为 DeepSeek Harness 的自定义 `llm-pi-ai` Provider 增加独立的“推理强度”设置页。

## 功能

- 自动读取官方“模型”页面已经添加的自定义 Provider 和模型。
- 为每个模型声明 `off / minimal / low / medium / high / xhigh / max` 档位。
- 支持自定义每个档位实际发送给 API 的传输值。
- 设置 Provider 默认强度，并限制为其全部模型共同支持的档位。
- 为 `openai-completions` Provider 配置推理参数格式。
- 使用官方 `settings.mutate` 接口写回 `llm-pi-ai.providers.*`，不接触 API 密钥。
- 修正进程内 Subagent 只继承 Agent 创建时官方模型的问题，使其继承父会话当前实际选择的第三方 Provider 和模型。
- 子 Agent 优先继承父会话的显式思考强度；未显式选择时，自动使用目标 Provider 配置的默认强度。
- 当子 Agent 只指定模型名（例如 `grok-4.5`）时，优先在用户添加的第三方 Provider 模型中解析，而不是错误落到官方 Provider。

## 安装

### 一键安装（推荐）

1. 解压完整插件压缩包，不要只取其中某一个文件。
2. 先运行一次 `dsh web`，确认 Harness 能正常打开，然后停止它。
3. 双击解压目录中的 `install.cmd`。
4. 重新运行 `dsh web`，在“设置”中打开“推理强度”。

安装器会把插件复制到 `~/.dsh/plugins/dsh-reasoning-settings`，然后挂载到当前用户的 DSH Web profile。因此，安装完成后可以删除收到的压缩包和解压目录。

`dsh web` 默认使用 `http://127.0.0.1:3080`。端口与插件无关；只有默认端口已被占用，或者启动时显式传入 `--port 3081`，才会使用 3081 等其他端口。

### 手动安装

在 DSH Web profile 中安装本目录并加入插件树：

```powershell
pnpm --dir "$env:USERPROFILE\.dsh\profiles\web" add "C:\path\to\dsh-reasoning-settings"
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 中添加：

```yaml
- insert:
    - id: ui-settings-reasoning
      name: dsh-reasoning-settings
```

重启 `dsh web` 后，在“设置”中打开“推理强度”。

## 使用

1. 先在官方“模型”页面添加自定义 Provider 和模型。
2. 打开“设置” > “推理强度”。
3. 为每个模型选择支持的档位，并设置 Provider 默认强度。
4. 点击该 Provider 下方的“保存”。
5. 新建会话，在模型选择器中选择模型和推理强度。

插件只声明 Harness 可以选择和发送哪些推理档位。中转 API 是否真正支持对应值仍由中转服务决定；若请求返回 HTTP 400，请取消该模型不支持的档位或修改传输值。

## Subagent 路由与思考强度

插件的服务端入口会修正 Harness `0.1.0-rc.5` 中进程内 `subagent`、`subagent_fork` 和 Workflow 子 Agent 的模型继承：

1. 子 Agent 显式指定、且不同于父 Agent 创建时路由的 `provider + model` 时，保持显式路由不变。
2. 只指定模型名时，在官方“模型”页面中由用户配置的第三方 Provider 内查找；同名模型优先使用父会话当前 Provider。
3. 未指定子模型时，继承父会话当前实际使用的 Provider 和模型，而不是 Agent 创建时的官方默认模型。

当前 Harness 的 Subagent 请求不会记录“provider/model 是否显式传入”。因此，当显式路由恰好等于父 Agent 创建时路由时，插件无法区分它与默认继承，仍会按父会话当前路由处理。
4. 子 Agent 已有显式思考强度时保持不变；否则仅在目标路由和父会话相同时继承父会话强度。
5. 仍未获得显式强度时不强行注入参数，由 `llm-pi-ai` 使用该 Provider 的 `reasoning` 默认强度。

该修正仅作用于 Harness 内部进程内子 Agent。独立进程的 Codex、Claude Code、ACP 子 Agent 使用各自的模型配置，不经过此插件的 `agent/request` 路由。

可在插件挂载配置中关闭或细调服务端修正：

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

所有选项默认均为 `true`；设置 `subagentRouting: false` 可完全关闭 Subagent 修正。

## 兼容性

基于 DeepSeek Harness `0.1.0-rc.5` 的公开双端插件、设置槽、`settings.mutate` 和 `agent/request` waterfall 接口开发。Harness 仍处于 Developer Preview；升级后若插件未加载或子 Agent 路由异常，请先检查上述接口及 Subagent 会话元数据是否发生变化。
