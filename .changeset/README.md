# Changesets

Ce dossier contient les changesets de FocusMCP. Chaque PR introduisant un changement utilisateur doit ajouter un changeset via `pnpm changeset`.

- Format : Markdown avec frontmatter listant les packages affectés et le bump (patch/minor/major)
- À la release : `pnpm version` consomme les changesets et bump les versions, `pnpm release` publie

Référence : https://github.com/changesets/changesets
