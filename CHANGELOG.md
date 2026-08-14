# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-14

### Added

- Server-side routing correction for in-process Subagent, Subagent Fork, and Workflow children.
- Model-only child override resolution against user-configured third-party `llm-pi-ai` providers.
- Parent reasoning-effort inheritance for same-route children, with provider-default fallback.
- Unit and real Harness integration coverage for child request headers and adapter dispatch.

### Changed

- Expanded bilingual documentation for Subagent behavior and configuration switches.

## [0.1.0] - 2026-08-13

- Initial release: per-model reasoning effort settings page for custom `llm-pi-ai` providers in DeepSeek Harness Web.
