window.__ModuleLoader__.load({
  id: 'dsh-reasoning-settings',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useMemo, useRef, useState } = React

    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    const NON_OFF_LEVELS = LEVELS.filter(level => level !== 'off')
    const THINKING_FORMATS = [
      'openai', 'deepseek', 'openrouter', 'together', 'zai', 'qwen', 'string-thinking', 'ant-ling',
    ]

    const zh = {
      nav: '推理强度',
      cardDesc: '配置各模型/Provider 的推理强度档位与传输值，即时生效',
      expand: '展开',
      collapse: '折叠',
      title: '推理强度',
      refresh: '刷新',
      retry: '重试',
      loading: '正在读取模型配置...',
      noNamespace: '当前部署未提供 llm-pi-ai 设置。',
      noModels: '请先在“模型”页面添加自定义 Provider 和模型。',
      loadFailed: '读取失败',
      saveFailed: '保存失败',
      conflict: '配置已被其他页面修改，请刷新后重试。',
      saved: '已保存',
      save: '保存',
      saving: '保存中...',
      protocol: '协议',
      defaultEffort: '默认强度',
      unspecified: '不指定',
      mode: '推理能力',
      inherit: '保持未声明',
      disabled: '明确不支持',
      custom: '自定义档位',
      commonPreset: '常用三档',
      fullPreset: '完整档位',
      wireValue: '传输值',
      noWireValue: '留空表示不发送',
      thinkingFormat: '推理参数格式',
      autoDetect: '自动检测',
      validationNoLevel: '至少选择一个非 off 档位。',
      validationWire: '已启用档位必须填写传输值。',
      validationDefault: '默认强度必须被该 Provider 的全部模型支持。',
      live: '即时生效',
    }

    const en = {
      nav: 'Reasoning',
      cardDesc: 'Configure reasoning effort levels and wire values per model/provider; applies immediately',
      expand: 'Expand',
      collapse: 'Collapse',
      title: 'Reasoning effort',
      refresh: 'Refresh',
      retry: 'Retry',
      loading: 'Loading model configuration...',
      noNamespace: 'This deployment does not expose llm-pi-ai settings.',
      noModels: 'Add a custom provider and models on the Models page first.',
      loadFailed: 'Failed to load',
      saveFailed: 'Failed to save',
      conflict: 'Settings changed elsewhere. Refresh and try again.',
      saved: 'Saved',
      save: 'Save',
      saving: 'Saving...',
      protocol: 'Protocol',
      defaultEffort: 'Default effort',
      unspecified: 'Unspecified',
      mode: 'Reasoning capability',
      inherit: 'Leave undeclared',
      disabled: 'Explicitly unsupported',
      custom: 'Custom levels',
      commonPreset: 'Low / medium / high',
      fullPreset: 'All levels',
      wireValue: 'Wire value',
      noWireValue: 'Blank sends no value',
      thinkingFormat: 'Reasoning wire format',
      autoDetect: 'Auto-detect',
      validationNoLevel: 'Select at least one non-off level.',
      validationWire: 'Every enabled level needs a wire value.',
      validationDefault: 'The default effort must be supported by every model in this provider.',
      live: 'Applies immediately',
    }

    function objectOf(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
    }

    function clone(value) {
      return value === undefined ? undefined : structuredClone(value)
    }

    function modelState(raw) {
      const model = clone(objectOf(raw))
      const configured = model.reasoningEfforts
      let mode = 'inherit'
      let efforts = {}
      if (configured === false) {
        mode = 'disabled'
      } else if (configured !== null && typeof configured === 'object' && !Array.isArray(configured)) {
        mode = 'custom'
        efforts = Object.fromEntries(
          LEVELS.filter(level => Object.prototype.hasOwnProperty.call(configured, level))
            .map(level => [level, configured[level]]),
        )
      }
      return {
        id: typeof model.id === 'string' ? model.id : '',
        name: typeof model.name === 'string' && model.name.length > 0 ? model.name : undefined,
        raw: model,
        mode,
        efforts,
      }
    }

    function providerDrafts(view) {
      const effectiveProviders = objectOf(objectOf(view && view.value).providers)
      const userProviders = objectOf(objectOf(view && view.user).providers)
      const providers = []
      for (const [id, effectiveUnknown] of Object.entries(effectiveProviders)) {
        const effective = objectOf(effectiveUnknown)
        const user = objectOf(userProviders[id])
        // Only user-owned model arrays are safe to rewrite. A built-in catalog
        // route without one must use modelOverrides; materializing its entire
        // effective catalog as `models` would silently replace that catalog.
        const sourceModels = Array.isArray(user.models) ? user.models : []
        const models = sourceModels
          .filter(model => typeof objectOf(model).id === 'string')
          .map(modelState)
        if (models.length === 0) continue
        const defaultEffort = typeof user.reasoning === 'string'
          ? user.reasoning
          : typeof effective.reasoning === 'string' ? effective.reasoning : ''
        const userCompat = objectOf(user.compat)
        const effectiveCompat = objectOf(effective.compat)
        const thinkingFormat = typeof userCompat.thinkingFormat === 'string'
          ? userCompat.thinkingFormat
          : typeof effectiveCompat.thinkingFormat === 'string' ? effectiveCompat.thinkingFormat : ''
        providers.push({
          id,
          name: typeof effective.displayName === 'string' && effective.displayName.length > 0
            ? effective.displayName : id,
          api: typeof effective.api === 'string' ? effective.api : '',
          defaultEffort,
          thinkingFormat,
          models,
        })
      }
      return providers
    }

    function supportedLevels(model) {
      if (model.mode !== 'custom') return []
      return LEVELS.filter(level => Object.prototype.hasOwnProperty.call(model.efforts, level))
    }

    function commonLevels(provider) {
      if (provider.models.length === 0) return []
      let common = supportedLevels(provider.models[0])
      for (const model of provider.models.slice(1)) {
        const current = new Set(supportedLevels(model))
        common = common.filter(level => current.has(level))
      }
      return common
    }

    function validateProvider(provider) {
      for (const model of provider.models) {
        if (model.mode !== 'custom') continue
        const selected = supportedLevels(model)
        if (!selected.some(level => level !== 'off')) return { model: model.id, key: 'validationNoLevel' }
        for (const level of selected) {
          if (level === 'off') continue
          const wire = model.efforts[level]
          if (typeof wire !== 'string' || wire.trim().length === 0) {
            return { model: model.id, key: 'validationWire' }
          }
        }
      }
      if (provider.defaultEffort && !commonLevels(provider).includes(provider.defaultEffort)) {
        return { key: 'validationDefault' }
      }
      return undefined
    }

    function buildModels(provider) {
      return provider.models.map((model) => {
        const next = clone(model.raw)
        if (model.mode === 'inherit') {
          delete next.reasoningEfforts
        } else if (model.mode === 'disabled') {
          next.reasoningEfforts = false
        } else {
          next.reasoningEfforts = Object.fromEntries(
            LEVELS.filter(level => Object.prototype.hasOwnProperty.call(model.efforts, level))
              .map((level) => {
                const wire = model.efforts[level]
                return [level, level === 'off' && (wire === null || wire === '') ? null : String(wire).trim()]
              }),
          )
        }
        return next
      })
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    function patchProvider(list, providerId, update) {
      return list.map(provider => provider.id === providerId ? update(provider) : provider)
    }

    function patchModel(provider, modelId, update) {
      const next = {
        ...provider,
        models: provider.models.map(model => model.id === modelId ? update(model) : model),
      }
      const common = commonLevels(next)
      if (next.defaultEffort && !common.includes(next.defaultEffort)) next.defaultEffort = ''
      return next
    }

    function ModelEditor({ provider, model, t, writable, busy, updateProvider }) {
      const selected = new Set(supportedLevels(model))
      const updateModel = update => updateProvider(provider.id, current => patchModel(current, model.id, update))
      const setPreset = efforts => updateModel(item => ({ ...item, mode: 'custom', efforts }))
      return h('div', { className: 'dsh-rs-model' },
        h('div', { className: 'dsh-rs-model-head' },
          h('div', null,
            h('strong', null, model.name || model.id),
            model.name && model.name !== model.id ? h('code', null, model.id) : null),
          h('label', { className: 'dsh-rs-mode' },
            h('span', null, t('mode')),
            h('select', {
              value: model.mode,
              disabled: !writable || busy,
              onChange: event => updateModel((item) => {
                const mode = event.target.value
                return {
                  ...item,
                  mode,
                  efforts: mode === 'custom' && Object.keys(item.efforts).length === 0
                    ? { low: 'low', medium: 'medium', high: 'high' }
                    : item.efforts,
                }
              }),
            },
            h('option', { value: 'inherit' }, t('inherit')),
            h('option', { value: 'disabled' }, t('disabled')),
            h('option', { value: 'custom' }, t('custom'))))),
        model.mode !== 'custom' ? null : h(React.Fragment, null,
          h('div', { className: 'dsh-rs-presets' },
            h('button', {
              type: 'button', className: 'dsh-rs-secondary dsh-rs-compact',
              disabled: !writable || busy,
              onClick: () => setPreset({ low: 'low', medium: 'medium', high: 'high' }),
            }, t('commonPreset')),
            h('button', {
              type: 'button', className: 'dsh-rs-secondary dsh-rs-compact',
              disabled: !writable || busy,
              onClick: () => setPreset(Object.fromEntries(NON_OFF_LEVELS.map(level => [level, level]))),
            }, t('fullPreset'))),
          h('div', { className: 'dsh-rs-levels' }, LEVELS.map(level => h('div', {
            className: `dsh-rs-level${selected.has(level) ? ' dsh-rs-level-active' : ''}`,
            key: level,
          },
          h('label', { className: 'dsh-rs-check' },
            h('input', {
              type: 'checkbox', checked: selected.has(level),
              disabled: !writable || busy,
              onChange: event => updateModel((item) => {
                const efforts = { ...item.efforts }
                if (event.target.checked) efforts[level] = level === 'off' ? null : level
                else delete efforts[level]
                return { ...item, efforts }
              }),
            }),
            h('span', null, level)),
          selected.has(level) ? h('label', { className: 'dsh-rs-wire' },
            h('span', null, t('wireValue')),
            h('input', {
              type: 'text', value: model.efforts[level] ?? '',
              placeholder: level === 'off' ? t('noWireValue') : level,
              disabled: !writable || busy,
              onChange: event => updateModel(item => ({
                ...item, efforts: { ...item.efforts, [level]: event.target.value },
              })),
            })) : null))))
      )
    }

    function ReasoningSettings(props) {
      const { api, remote, t } = props
      const [status, setStatus] = useState('loading')
      const [writable, setWritable] = useState(false)
      const [view, setView] = useState(undefined)
      const [providers, setProviders] = useState([])
      const [failure, setFailure] = useState('')
      const [notice, setNotice] = useState('')
      const [busyProvider, setBusyProvider] = useState('')
      const [dirty, setDirty] = useState(() => new Set())
      const dirtyRef = useRef(dirty)
      useEffect(() => { dirtyRef.current = dirty }, [dirty])

      const load = useCallback(async () => {
        setStatus('loading')
        setFailure('')
        try {
          const response = await api.settings.describe({})
          if (!response.result.ok) throw new Error(response.result.error.message)
          const namespace = response.result.value.namespaces.find(entry => entry.ns === 'llm-pi-ai')
          if (namespace === undefined) {
            setView(undefined)
            setProviders([])
            setWritable(response.result.value.writable)
            setStatus('missing')
            return
          }
          setView(namespace)
          setProviders(providerDrafts(namespace))
          setWritable(response.result.value.writable)
          setDirty(new Set())
          setStatus('ready')
        } catch (error) {
          setFailure(messageOf(error))
          setStatus('error')
        }
      }, [api.settings])

      useEffect(() => {
        void load()
        const disposeSettings = remote.$on('settings/document-updated', (ns) => {
          if (ns === 'llm-pi-ai' && dirtyRef.current.size === 0) void load()
        })
        return () => { disposeSettings() }
      }, [load, remote])

      const updateProvider = (providerId, update) => {
        setProviders(current => patchProvider(current, providerId, update))
        setDirty(current => new Set(current).add(providerId))
        setNotice('')
      }

      const saveProvider = async (provider) => {
        const validation = validateProvider(provider)
        if (validation !== undefined) {
          setFailure(`${validation.model ? `${validation.model}: ` : ''}${t(validation.key)}`)
          return
        }
        if (view === undefined) return
        setBusyProvider(provider.id)
        setFailure('')
        setNotice('')
        const root = ['providers', provider.id]
        const ops = [
          { op: 'set', path: [...root, 'models'], value: buildModels(provider) },
          provider.defaultEffort
            ? { op: 'set', path: [...root, 'reasoning'], value: provider.defaultEffort }
            : { op: 'unset', path: [...root, 'reasoning'] },
        ]
        if (provider.api === 'openai-completions') {
          ops.push(provider.thinkingFormat
            ? { op: 'set', path: [...root, 'compat', 'thinkingFormat'], value: provider.thinkingFormat }
            : { op: 'unset', path: [...root, 'compat', 'thinkingFormat'] })
        }
        try {
          const response = await api.settings.mutate({
            ns: 'llm-pi-ai',
            ops,
            expectedRevision: view.revision,
          })
          if (!response.result.ok) {
            setFailure(response.result.error.code === 'settings-conflict'
              ? t('conflict') : response.result.error.message)
            return
          }
          const nextView = response.result.value
          const savedProvider = providerDrafts(nextView).find(item => item.id === provider.id)
          setView(nextView)
          setProviders(current => current.map(item => item.id === provider.id
            ? savedProvider ?? item
            : item))
          setDirty(current => {
            const next = new Set(current)
            next.delete(provider.id)
            return next
          })
          setNotice(`${t('saved')}: ${provider.name}`)
        } catch (error) {
          setFailure(messageOf(error))
        } finally {
          setBusyProvider('')
        }
      }

      if (status === 'loading') {
        return h('section', { className: 'dsh-rs-section' },
          h('p', { className: 'dsh-rs-muted' }, t('loading')))
      }
      if (status === 'missing') {
        return h('section', { className: 'dsh-rs-section' },
          h('p', { className: 'dsh-rs-error' }, t('noNamespace')))
      }
      if (status === 'error') {
        return h('section', { className: 'dsh-rs-section' },
          h('p', { className: 'dsh-rs-error' }, `${t('loadFailed')}: ${failure}`),
          h('button', { className: 'dsh-rs-secondary', type: 'button', onClick: () => void load() }, t('retry')))
      }

      return h('section', { className: 'dsh-rs-section' },
        h('div', { className: 'dsh-rs-page-head' },
          h('button', {
            className: 'dsh-rs-secondary dsh-rs-compact', type: 'button',
            disabled: busyProvider !== '', onClick: () => void load(),
          }, t('refresh'))),
        failure ? h('p', { className: 'dsh-rs-error', role: 'alert' }, failure) : null,
        notice ? h('p', { className: 'dsh-rs-success', role: 'status' }, notice) : null,
        providers.length === 0
          ? h('p', { className: 'dsh-rs-empty' }, t('noModels'))
          : h('div', { className: 'dsh-rs-providers' }, providers.map(provider => {
              const common = commonLevels(provider)
              const validation = validateProvider(provider)
              return h('section', { className: 'dsh-rs-provider', key: provider.id },
                h('header', { className: 'dsh-rs-provider-head' },
                  h('div', { className: 'dsh-rs-identity' },
                    h('strong', null, provider.name),
                    provider.name === provider.id ? null : h('code', null, provider.id),
                    provider.api ? h('span', { className: 'dsh-rs-tag' }, provider.api) : null),
                  h('span', { className: 'dsh-rs-live' }, t('live'))),
                h('div', { className: 'dsh-rs-route-fields' },
                  h('label', { className: 'dsh-rs-field' },
                    h('span', null, t('defaultEffort')),
                    h('select', {
                      value: provider.defaultEffort,
                      disabled: !writable || busyProvider !== '',
                      onChange: event => updateProvider(provider.id, current => ({
                        ...current, defaultEffort: event.target.value,
                      })),
                    },
                    h('option', { value: '' }, t('unspecified')),
                    common.map(level => h('option', { value: level, key: level }, level)))),
                  provider.api === 'openai-completions'
                    ? h('label', { className: 'dsh-rs-field' },
                        h('span', null, t('thinkingFormat')),
                        h('select', {
                          value: provider.thinkingFormat,
                          disabled: !writable || busyProvider !== '',
                          onChange: event => updateProvider(provider.id, current => ({
                            ...current, thinkingFormat: event.target.value,
                          })),
                        },
                        h('option', { value: '' }, t('autoDetect')),
                        THINKING_FORMATS.map(format => h('option', { value: format, key: format }, format))))
                    : null),
                h('div', { className: 'dsh-rs-models' }, provider.models.map(model => h(ModelEditor, {
                  key: model.id,
                  provider,
                  model,
                  t,
                  writable,
                  busy: busyProvider !== '',
                  updateProvider,
                }))),
                validation ? h('p', { className: 'dsh-rs-error' },
                  `${validation.model ? `${validation.model}: ` : ''}${t(validation.key)}`) : null,
                h('footer', { className: 'dsh-rs-actions' },
                  h('button', {
                    type: 'button', className: 'dsh-rs-primary',
                    disabled: !writable || busyProvider !== '' || !dirty.has(provider.id) || validation !== undefined,
                    onClick: () => void saveProvider(provider),
                  }, busyProvider === provider.id ? t('saving') : t('save'))))
            })))
    }

    /**
     * 插件配置页签里的卡片壳（与官方 PluginCard 同形态）：
     * 标题行可点击展开/折叠；折叠时表单保持挂载（hidden），草稿不丢。
     */
    function ReasoningCard(props) {
      const { t } = props
      const [open, setOpen] = useState(false)
      return h('li', { className: `dsh-rs-card${open ? ' dsh-rs-card-open' : ''}` },
        h('button', {
          type: 'button',
          className: 'dsh-rs-card-header',
          'aria-expanded': open,
          'aria-label': `${open ? t('collapse') : t('expand')}: ${t('nav')}`,
          onClick: () => setOpen(!open),
        },
          h('span', { className: 'dsh-rs-card-headtext' },
            h('span', { className: 'dsh-rs-card-name' }, t('nav')),
            h('span', { className: 'dsh-rs-card-desc' }, t('cardDesc'))),
          h('svg', {
            width: 14, height: 14,
            className: `dsh-rs-card-chevron${open ? ' dsh-rs-card-chevron-open' : ''}`,
            viewBox: '0 0 14 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
          },
            h('path', {
              d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z',
              fill: 'currentColor',
            }))),
        h('div', { className: 'dsh-rs-card-body', hidden: !open },
          h(ReasoningSettings, props)))
    }

    const style = document.createElement('style')
    style.textContent = `
      /* 卡片壳：值与官方 PluginCard.module.css 完全一致（类名改 dsh-rs- 前缀） */
      .dsh-rs-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}
      .dsh-rs-card:hover{border-color:var(--dsw-alias-label-dimmed)}
      .dsh-rs-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
      .dsh-rs-card-header{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}
      .dsh-rs-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .dsh-rs-card-headtext{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
      .dsh-rs-card-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
      .dsh-rs-card-desc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
      .dsh-rs-card-chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}
      .dsh-rs-card-chevron-open{transform:rotate(180deg)}
      .dsh-rs-card-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:14px 0 8px}
      .dsh-rs-card-body[hidden]{display:none}
      .dsh-rs-section{display:flex;flex-direction:column;gap:12px;max-width:760px;color:var(--dsw-alias-label-primary)}
      .dsh-rs-page-head,.dsh-rs-provider-head,.dsh-rs-model-head,.dsh-rs-actions{display:flex;align-items:center;gap:12px}
      .dsh-rs-provider-head,.dsh-rs-model-head{justify-content:space-between}
      .dsh-rs-page-head{justify-content:flex-end}
      .dsh-rs-title{margin:0;font-size:16px;line-height:24px;font-weight:500;letter-spacing:0}
      .dsh-rs-providers{display:flex;flex-direction:column;gap:10px;margin-top:8px}
      .dsh-rs-provider{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:14px}
      .dsh-rs-identity,.dsh-rs-model-head>div{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
      .dsh-rs-identity strong,.dsh-rs-model strong{font-size:14px;line-height:22px;font-weight:500}
      .dsh-rs-identity code,.dsh-rs-model code{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
      .dsh-rs-tag{padding:1px 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
      .dsh-rs-live{font-size:11px;line-height:16px;color:var(--dsw-alias-state-success-primary)}
      .dsh-rs-route-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
      .dsh-rs-field,.dsh-rs-mode,.dsh-rs-wire{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .dsh-rs-field select,.dsh-rs-mode select,.dsh-rs-wire input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;letter-spacing:0}
      .dsh-rs-field select:focus,.dsh-rs-mode select:focus,.dsh-rs-wire input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
      .dsh-rs-models{display:flex;flex-direction:column}
      .dsh-rs-model{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:10px}
      .dsh-rs-model:last-child{border-bottom:0}
      .dsh-rs-mode{width:min(220px,48%)}
      .dsh-rs-presets{display:flex;gap:6px;flex-wrap:wrap}
      .dsh-rs-levels{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:6px}
      .dsh-rs-level{min-height:34px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;display:flex;flex-direction:column;gap:6px}
      .dsh-rs-level-active{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}
      .dsh-rs-check{display:flex;align-items:center;gap:7px;font-size:12px;line-height:18px;font-weight:500}
      .dsh-rs-check input{margin:0;accent-color:var(--dsw-alias-brand-primary)}
      .dsh-rs-wire input{height:28px;font-family:var(--ds-font-family-code);font-size:12px}
      .dsh-rs-actions{justify-content:flex-end;padding-top:2px}
      .dsh-rs-primary,.dsh-rs-secondary{box-sizing:border-box;height:34px;padding:0 14px;border-radius:17px;font:inherit;font-size:13px;letter-spacing:0;cursor:pointer}
      .dsh-rs-primary{border:0;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
      .dsh-rs-secondary{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}
      .dsh-rs-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
      .dsh-rs-secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
      .dsh-rs-primary:disabled,.dsh-rs-secondary:disabled{opacity:.4;cursor:default}
      .dsh-rs-compact{height:28px;padding:0 10px;border-radius:14px;font-size:12px}
      .dsh-rs-error,.dsh-rs-success,.dsh-rs-muted,.dsh-rs-empty{margin:0;font-size:12px;line-height:18px}
      .dsh-rs-error{color:var(--dsw-alias-state-error-primary)}
      .dsh-rs-success{color:var(--dsw-alias-state-success-primary)}
      .dsh-rs-muted,.dsh-rs-empty{color:var(--dsw-alias-label-tertiary)}
      .dsh-rs-empty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:8px;text-align:center}
      @media(max-width:600px){.dsh-rs-model-head{align-items:flex-start;flex-direction:column}.dsh-rs-mode{width:100%}.dsh-rs-levels{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-rs-provider{padding:12px}}
    `
    style.dataset.plugin = 'dsh-reasoning-settings'
    document.head.appendChild(style)

    const inject = ['slots', 'locale', 'connection', 'remote']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register('settings.reasoning', { zh, en }), 'reasoning-settings: locale')
      const connection = ctx.get('connection')
      const t = ctx.locale.bind('settings.reasoning')
      // 注册到 设置 → 插件 → 插件配置（可配置插件页签）的卡片列表
      // （settings.plugin.item），与官方 bash/agent-loop/web-search 卡片同级。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: 'llm-pi-ai',
        id: 'reasoning',
        order: 20,
        locale: 'settings.reasoning',
        inject: () => ({ api: connection.api, remote: ctx.remote, t }),
      }, ReasoningCard))
    }

    exports.apply = apply
    exports.inject = inject
    exports.__test = { buildModels, commonLevels, modelState, providerDrafts, supportedLevels, validateProvider }
    return module.exports
  },
})
