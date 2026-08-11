# Claude Code Bridge Skill

## When to use
When the user asks for:
- Systematic debugging, root cause tracing
- Test-driven development (TDD)
- Code review (requesting or receiving)
- Subagent-driven development / parallel task dispatch
- Plan writing or plan execution
- Brainstorming design/architecture
- Git worktrees or branch finishing
- Any task that benefits from Superpowers skills

## How to use
Execute Claude Code with the user's request via CLI. This delegates the task to Claude Code which has Superpowers 6.1.1 installed with 22 skills.

### Command format
```
claude -p "Use the [specific-skill] skill to handle this: [user request]"
```

### Common patterns

**Systematic debugging:**
```
claude -p "Use the systematic-debugging skill to debug this issue: [describe the bug/error]"
```

**TDD:**
```
claude -p "Use the test-driven-development skill. First write tests, then implement: [describe the feature]"
```

**Code review:**
```
claude -p "Use the requesting-code-review skill. Here is my code: [paste code or describe what was changed]"
```

**Subagent-driven development:**
```
claude -p "Use the subagent-driven-development skill. Break down this task into subagent tasks: [describe the feature]"
```

**Brainstorming:**
```
claude -p "Use the brainstorming skill. Help me design: [describe the feature/component]"
```

**Writing plans:**
```
claude -p "Use the writing-plans skill. Create an implementation plan for: [describe the feature]"
```

**Parallel agents:**
```
claude -p "Use the dispatching-parallel-agents skill. Split these tasks into parallel subagents: [list tasks]"
```

**Executing plans:**
```
claude -p "Use the executing-plans skill. Execute this plan: [paste the plan]"
```

**Git worktrees:**
```
claude -p "Use the using-git-worktrees skill to create an isolated workspace for: [describe the feature]"
```

**Verification:**
```
claude -p "Use the verification-before-completion skill. Verify that: [describe what should be verified]"
```

## Model
Claude Code is configured to use MiniMax-M2.7 (MiniMax-CN provider).

## Working directory
Always run from the project root: `D:\work\telewave\ids\ids-gis-web`

## Important notes
- Claude Code is a CLI tool, not a network service. Use `claude -p` for non-interactive execution.
- Timeout: complex tasks may take 60-120 seconds. Set appropriate timeout.
- The `-p` flag runs in print mode (non-interactive), perfect for delegation.
- Superpowers skills are automatically loaded by Claude Code based on the task type.
- For very long or complex tasks, consider breaking them into smaller steps.
- Output will be returned as text. For file changes, Claude Code will write them directly to the workspace.

## Fallback
If Claude Code is not available or fails, inform the user and suggest using Hermes Agent via dashboard (http://localhost:9119) or Feishu bot as an alternative.
