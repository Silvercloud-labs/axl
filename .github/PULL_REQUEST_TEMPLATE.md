# What this changes

<!-- The problem, then the approach. Not a restatement of the diff. -->

# How it was verified

<!--
Real output, not intent. For anything behavioural — a status code, a build
result, a race — paste what you actually ran and what it printed. "Should work"
is not verification.
-->

```
```

# Checklist

- [ ] `npm run build` succeeds
- [ ] `npx vitest run --no-file-parallelism` passes in full
- [ ] New behaviour has a test
- [ ] Version bumped in lockstep across all six manifests (runtime, compiler or adapter changes only)
- [ ] `CHANGELOG.md` updated under the new version
- [ ] Docs updated — `SPECIFICATION.md` for language changes, `README.md` for surface changes
- [ ] The diff contains only the change described above

# Anything reviewers should push back on

<!--
Decisions you are unsure about, tradeoffs you took, or things you deliberately
left out of scope. Say so here rather than hoping nobody notices.
-->
