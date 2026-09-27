# Release Notes

Add user-facing release notes as Markdown files named by app version:

```text
src/content/release-notes/0.8.4.md
```

The update modal shows the highest bundled release note newer than the
persisted `whats_new_last_seen_version` and not newer than the running app
version.

Keep these files focused on headline user-facing changes. Release notes support
paragraphs, headings, lists, links, code, quotes, separators, hard line breaks,
and local images under `/release-notes/...`. Raw HTML is ignored before
rendering.

Place image assets in `public/release-notes/{version}/` and reference them from
Markdown with absolute paths:

```md
![Streaming transcription preview](/release-notes/0.9.0/streaming-transcription.webp)
```

A picture cut from a Retina screenshot goes in a file ending in `@2x`, like
`dock-talk@2x.png`. It then shows at its real size, half its pixel width.

Wrap lines that only make sense on one platform in marker comments. Lines
between `<!-- mac -->` and `<!-- /mac -->` show only on macOS; lines between
`<!-- windows -->` and `<!-- /windows -->` show everywhere else. The markers
themselves never show, and each one goes on its own line:

```md
<!-- mac -->

Click **Record screen** on Home.

<!-- /mac -->
<!-- windows -->

Screen recording is coming to Windows soon.

<!-- /windows -->
```
