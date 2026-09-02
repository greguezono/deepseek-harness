# Agent Note: Canonical-repository guard on the Issue checks

Status: implemented

English | [中文](2026-09-01-canonical-repo-guard-issue-checks.zh.md)

## Problem

[Issue lifecycle](../../../../.github/workflows/issue-lifecycle.yml) and [Issue policy](../../../../.github/workflows/issue-policy.yml) both target `deepseek-harness/deepseek-harness` by name: the App token step names that owner/repository pair directly, and [`config.json`](../../../../.github/issue-management/config.json) names it as `organization`/`repository`. A personal fork or a plain clone still runs both workflows on every pull request, but neither has the fork-owner's own `DSH_ISSUE_APP_CLIENT_ID`/`DSH_ISSUE_APP_PRIVATE_KEY`, and the fork's pull request numbers do not line up with issues/pull requests of the same number in the canonical repository.

`Issue lifecycle` fails at token creation (`client-id` empty). `Issue policy` calls the GitHub API for `deepseek-harness/deepseek-harness`'s pull request N, which 404s, or worse, silently validates a same-numbered but unrelated canonical PR. Both report as a failing required-looking check on every fork PR for a reason with no fix available to the fork owner.

## Decision

Both jobs gain a job-level `if: github.repository == 'deepseek-harness/deepseek-harness'`. Elsewhere off that repository, the job is skipped and reports a plain success rather than a gray segment or a red failure, matching the skip-reports-success precedent already used for [`e2e.yml`](../../../../.github/workflows/e2e.yml)'s fork guard.

The comparison uses the literal owner/repository pair already hardcoded in the App token step and `config.json`, not `github.repository_owner` or `!fork`, because those two existing hardcodes are this automation's own definition of "the repository this runs for."

## Verification

[Workflow tests](../../../../scripts/ci-workflow.spec.ts) pin the exact `if:` expression on both jobs.

## Alternatives considered

**Guard on `github.event.pull_request.head.repo.fork`.** This is the `e2e.yml` pattern, but it only detects forked PRs, not a same-owner clone under a different repository name, and it does not address the deeper mismatch: even a same-repository-name PR on the canonical org's *other* forks would still validate the wrong PR number. Matching `github.repository` directly addresses the actual constraint (config and App token target one exact repository).

**Make `config.json`'s organization/repository dynamic (`github.repository_owner`/`github.event.repository.name`).** This would let the workflow run correctly on any fork, but Issue lifecycle also needs a working GitHub App installed on that fork with matching Project fields — infrastructure no fork reasonably provisions. The guard accepts that this automation is intentionally single-repository rather than trying to make it portable.

## Consequences

Both checks report a clean pass on any repository other than `deepseek-harness/deepseek-harness`, including personal forks and plain clones. On the canonical repository, behavior is unchanged.
