# Language Packs

The active language packs are currently embedded in `web/app.js` as the `I18N` object so the app still works as a single-file bundled WebUI inside the exe.

To add a new language:

1. Copy the `zh-CN` object in `web/app.js`.
2. Rename it to a new locale code, such as `zh-TW`, `ja-JP`, or `fr-FR`.
3. Translate each value.
4. Add an `<option>` in `web/index.html` under `#languageSelect`.
5. Run tests and rebuild the exe.

Keeping translations as key-value packs makes the UI easier to maintain than scattering text across the code.
