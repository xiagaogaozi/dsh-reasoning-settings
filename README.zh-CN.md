# DSH 推理强度设置插件

为 DeepSeek Harness 的自定义 `llm-pi-ai` Provider 增加独立的“推理强度”设置页。

## 功能

- 自动读取官方“模型”页面已经添加的自定义 Provider 和模型。
- 为每个模型声明 `off / minimal / low / medium / high / xhigh / max` 档位。
- 支持自定义每个档位实际发送给 API 的传输值。
- 设置 Provider 默认强度，并限制为其全部模型共同支持的档位。
- 为 `openai-completions` Provider 配置推理参数格式。
- 使用官方 `settings.mutate` 接口写回 `llm-pi-ai.providers.*`，不接触 API 密钥。

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

## 兼容性

基于 DeepSeek Harness `0.1.0-rc.5` 的公开双端插件、设置槽和 `settings.mutate` 接口开发。Harness 仍处于 Developer Preview；升级后若插件未加载，请先检查上述接口是否发生变化。
