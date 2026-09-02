# Agent Note: 为 Issue 检查加上规范仓库判定

Status: implemented

[English](2026-09-01-canonical-repo-guard-issue-checks.md) | 中文

## 问题

[Issue lifecycle](../../../../.github/workflows/issue-lifecycle.yml) 和 [Issue policy](../../../../.github/workflows/issue-policy.yml) 都以名称硬编码指向 `deepseek-harness/deepseek-harness`：App token 步骤直接写明该 owner/repository 组合，[`config.json`](../../../../.github/issue-management/config.json) 也将其记为 `organization`/`repository`。个人 fork 或普通克隆仍会在每个 pull request 上运行这两个工作流，但 fork 所有者没有自己的 `DSH_ISSUE_APP_CLIENT_ID`/`DSH_ISSUE_APP_PRIVATE_KEY`，且 fork 中的 pull request 编号与规范仓库中同编号的 issue/pull request 并不对应。

`Issue lifecycle` 会在创建 token 时失败（`client-id` 为空）。`Issue policy` 会调用 GitHub API 查询 `deepseek-harness/deepseek-harness` 编号为 N 的 pull request，结果要么 404，要么更糟——悄悄校验了编号相同但毫不相关的规范仓库 PR。这两者都会在每个 fork PR 上报告为一个看似必需的失败检查，而 fork 所有者对此毫无办法修复。

## 决策

两个 job 都加上 job 级别的 `if: github.repository == 'deepseek-harness/deepseek-harness'`。在该仓库之外，job 会被跳过并报告为纯粹的成功，而不是灰色分段或红色失败，这与 [`e2e.yml`](../../../../.github/workflows/e2e.yml) 现有的 fork 判定"跳过即成功"先例一致。

判定条件使用的是 App token 步骤和 `config.json` 中已经硬编码的那个字面 owner/repository 组合，而非 `github.repository_owner` 或 `!fork`，因为这两处既有硬编码本身就是这套自动化对"它服务于哪个仓库"的定义。

## 验证

[工作流测试](../../../../scripts/ci-workflow.spec.ts)固定了两个 job 上精确的 `if:` 表达式。

## 考虑过的替代方案

**改用 `github.event.pull_request.head.repo.fork` 判定。** 这是 `e2e.yml` 的模式，但它只能检测被 fork 出来的 PR，无法识别在不同仓库名下的同所有者克隆，也没有解决更深层的不匹配问题：即便是规范组织下*其他* fork 上同名仓库的 PR，也依然会校验错误的 PR 编号。直接匹配 `github.repository` 才对应到实际的约束（config 和 App token 只面向一个确定的仓库）。

**让 `config.json` 的 organization/repository 变为动态值（`github.repository_owner`/`github.event.repository.name`）。** 这能让工作流在任意 fork 上正确运行，但 Issue lifecycle 还需要该 fork 上安装了配置匹配的 GitHub App 与 Project 字段——这是任何 fork 都不会合理配置的基础设施。该判定接受这套自动化本就是刻意面向单一仓库设计的，而非追求可移植性。

## 后果

除 `deepseek-harness/deepseek-harness` 外的任何仓库（包括个人 fork 和普通克隆）上，这两项检查都会报告为干净通过。在规范仓库上，行为保持不变。
