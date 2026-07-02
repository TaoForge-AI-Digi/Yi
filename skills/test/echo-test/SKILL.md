---
name: echo-test
description: "Minimal test skill: echo inputs and confirm the skill system works."
version: 1.0.0
tags: [test, 调试]
author: yi-lin
license: MIT
---

# Echo Test

A minimal skill to verify the skill system is working end-to-end.

## Behavior

When asked to use this skill, echo the user's request back as a confirmation, then proceed.

## Verification Checklist

1. `skill_manager list` shows `echo-test` in output
2. `skill_manager view` with name `echo-test` returns this content
3. `## Available Skills` in system prompt includes `echo-test`
4. Attachment `references/example.md` appears in Skill Attachments
