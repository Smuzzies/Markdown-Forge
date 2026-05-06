# Markdown Forge

A lightweight cross-platform Markdown viewer and editor built with Tauri, React, and Rust.

## Features

- Open local `.md`, `.markdown`, `.mdown`, and `.txt` files
- Edit Markdown source with live preview
- Switch between split, preview-only, and edit-only modes
- Save existing files or save new Markdown files
- GitHub-flavored tables, task lists, footnotes, links, raw HTML, and syntax-highlighted code blocks
- Responsive desktop/mobile-sized layout

## Development

```bash
npm install
npm run tauri -- dev
```

## Build

```bash
npm run build
npm run tauri -- build
```

The Linux release binary is written to:

```text
src-tauri/target/release/markdown-forge
```

The AppImage bundler also creates an AppDir under:

```text
src-tauri/target/release/bundle/appimage/
```

## Installers

Build the Linux Debian installer locally:

```bash
npm run build:linux
```

Output:

```text
src-tauri/target/release/bundle/deb/Markdown Forge_0.1.0_amd64.deb
```

Build a Linux AppImage on a machine with `patchelf` and Tauri Linux dependencies installed:

```bash
npm run build:linux:appimage
```

Build the Windows NSIS installer on Windows:

```powershell
npm run build:windows
```

Output:

```text
src-tauri/target/release/bundle/nsis/*.exe
```

The GitHub Actions workflow at `.github/workflows/release.yml` builds Linux `.deb`/`.AppImage` artifacts and a Windows `.exe` installer when run manually or when pushing a `v*` tag.
