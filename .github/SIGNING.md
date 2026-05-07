# Code Signing & Updater Setup

This document describes how to configure secrets in the GitHub repository so that
release builds produced by `.github/workflows/release.yml` are signed (macOS) and
optionally publish updater signatures (Tauri updater).

> All secrets go in `Settings -> Secrets and variables -> Actions` of the GitHub
> repository. Never commit them.

## macOS — Apple Developer ID signing & notarization

You need a paid Apple Developer account ($99/year) and a "Developer ID Application"
certificate. Follow Apple's docs:

- <https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>
- <https://developer.apple.com/help/account/create-certificates/create-developer-id-certificates>

### 1. Export the certificate to `.p12`

In Keychain Access on a Mac that already has the certificate installed:

1. Find the "Developer ID Application: <your name> (TEAMID)" entry.
2. Right click -> Export -> save as `cert.p12` and set a strong password.
3. Convert it to base64 (so it can be stored as a GitHub secret):

   ```bash
   base64 -i cert.p12 | pbcopy
   ```

### 2. Configure secrets

| Secret name                 | Value                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`         | Base64 of `cert.p12` (the `pbcopy` output above)                      |
| `APPLE_CERTIFICATE_PASSWORD`| Password used when exporting the `.p12`                               |
| `APPLE_SIGNING_IDENTITY`    | e.g. `Developer ID Application: Your Name (TEAMID)`                   |
| `APPLE_ID`                  | Your Apple ID email                                                   |
| `APPLE_PASSWORD`            | App-specific password from <https://appleid.apple.com> (Sign-In & Security -> App-Specific Passwords) |
| `APPLE_TEAM_ID`             | 10-character team ID, visible in your Apple Developer account         |

When all six secrets are present, `tauri-action` will sign and notarize the
produced `.dmg` and `.app` automatically. If they are missing, the build still
runs but produces an unsigned bundle (users get Gatekeeper warnings).

## Tauri updater signing (optional)

If you plan to ship in-app updates via the Tauri updater plugin you need a
key pair to sign update artifacts. Generate one locally (do this once):

```bash
npm run tauri signer generate -- -w ~/.tauri/video-broll.key
```

You'll get two files:

- `~/.tauri/video-broll.key` (private — keep secret)
- `~/.tauri/video-broll.key.pub` (public — commit into `tauri.conf.json` under `plugins.updater.pubkey`)

Then add these GitHub secrets:

| Secret name                          | Value                                                  |
| ------------------------------------ | ------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of `~/.tauri/video-broll.key` (full file)     |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password chosen during `tauri signer generate`         |

If these are absent the updater step is skipped silently — code-signing for
notarization still works.

## Windows code signing (optional)

Windows code signing requires an OV or EV certificate from a CA (DigiCert,
Sectigo, etc.) — typically $200-$500/year. Without it, SmartScreen will
warn users on first launch but the installer still runs.

If you obtain one, the standard approach is:

1. Store the `.pfx` file as base64 in `WINDOWS_CERTIFICATE`.
2. Store its password in `WINDOWS_CERTIFICATE_PASSWORD`.
3. Wire those into a `signtool` step in `release.yml` (not currently set up — add
   when needed).

The current `release.yml` produces unsigned `.msi` / `.exe` artifacts on Windows.

## Quick checklist

- [ ] 6 Apple secrets set in repo (or accept unsigned macOS builds)
- [ ] Tauri updater key pair generated, public key in `tauri.conf.json`, private key in secrets (only if you ship updates)
- [ ] Windows cert configured (optional)
- [ ] Push a tag matching `v*.*.*` to trigger `release.yml`
