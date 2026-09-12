# Public API candidate evidence

These are immutable copies of the qualification records generated before the
source commit. Their original `build/` paths, working-tree base revisions and
no-publication statements describe those historical test runs. Archive bytes
remain local; this source push does not publish a release or deploy Pages.

The corrected archive SHA-256 is
`806b07a4c7fc7df8c96781cc69b0f0fa77984f062ec0a51bf8ab0caef700bc42`.
Its generated runtime matches the source committed with these records. The
pre-correction candidate and its failed Pages harness result remain recorded
separately. Test paths in the records are repository-relative; all referenced
result JSON files are included in this commit. Build/source archive paths identify
local retained artifacts, not files distributed by this source commit.

The new source commit is based on demo-source 8bb451b. The reviewed implementation
was developed in the main working directory with the newer baseline already
present as uncommitted files; those original files have been preserved. Manual
accessibility, broader browser, clean-engine and source-distribution release gates
remain open. See docs/PUBLIC-API-VALIDATION.md for scope and reproducible commands.
