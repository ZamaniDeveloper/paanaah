# Contributing to Paanaah

Thank you for your interest in improving Paanaah.

## Development setup

1. Fork and clone the repository.
2. Install Node.js 18 or newer.
3. Run `npm ci`.
4. Copy `.env.example` to `.env` and configure a unique `JWT_SECRET`.
5. Start the application with `npm start`.

## Before submitting a pull request

- Keep changes focused and avoid unrelated formatting edits.
- Run `npm run check` before committing.
- Do not commit `.env`, uploaded files, local data, credentials, or generated secrets.
- Update documentation when behavior or configuration changes.
- Describe how the change was tested.

## Commit messages

Use short, imperative messages, for example:

- `Fix duplicate message delivery`
- `Add upload size validation`
- `Document Redis configuration`

## Security reports

Do not open a public issue for a vulnerability that could expose user data or credentials. Report it privately to `info@zamandev.ir` with reproduction steps and the affected version.
