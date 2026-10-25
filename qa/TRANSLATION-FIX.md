# Crew translation — 24 October 2026

The crew own-words translator failed because the NLLB model was not installed. The live endpoint returned `translation model not installed: npm run models -- translate`.

Installed all required tokenizer/configuration files and both quantized ONNX models in `apps/hub/.models/Xenova/nllb-200-distilled-600M`. Connection resets required resumable downloads. SHA-256 checksums match the publisher's linked ETags:

- Encoder: `5cde664eacba07a62f198857ec6c06e09572b1ebb77c8137f1fa99ac604a3a28`
- Decoder: `dd66608c2a4194e78f95548fa0e64f24302303698c5b09fa8e1f9e16ec00676b`

Normal demo setup now installs the translation model when required. The backend checks all required files rather than treating an empty `onnx` directory as an installed model. Explicit `--no-ai` setup still skips automatic model downloads.

Validation:

- Hub TypeScript checks and demo script syntax check passed.
- Hub suite: 13 tests passed, including machine-translation delivery to the intended seat.
- Live Japanese-to-Hindi translation: `お水をお持ちします。` → `मैं पानी लेकर आऊंगा।` (18.3 seconds including initial model load).
- Live crew UI Japanese-to-English preview: `I'll get you some water.` Screenshot: `crew-translation-working.png`.
- The running hub loaded the model without a restart, preserving current requests. The preview was not sent to a passenger.
