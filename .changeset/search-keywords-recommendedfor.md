---
"@focus-mcp/core": minor
---

feat(core): expose keywords and recommendedFor in bricks search

Extend CatalogBrick, BrickManifest and parseBrick to support two new
optional fields: keywords (free-form tags) and recommendedFor
(stack/framework hints). searchBricks now matches on both fields in
addition to name, description and tags.
