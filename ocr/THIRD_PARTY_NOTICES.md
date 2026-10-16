# Third-party notices

- PP-OCRv6 small detection/recognition ONNX models: PaddlePaddle / PaddleOCR, Apache-2.0 as declared by the upstream model cards. Local postprocessing is an independent simplified implementation, not a complete upstream pipeline.
- `characters.json` is derived from the official recognition model configuration (`PostProcess.character_dict`), with original character order retained. Source revision and digest are in `assets-manifest.json`.
- ONNX Runtime Web 1.30.0: Microsoft Corporation, MIT.

License texts: [PaddleOCR Apache-2.0](licenses/PADDLE-LICENSE.txt), [ONNX Runtime MIT](licenses/ORT-LICENSE.txt).

Upstream models: https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx and https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx . Exact downloaded files, revisions and checksums are retained in `assets-manifest.json`; downloaded weights and runtime are excluded from source control. Distributions containing these assets must retain their license notices.
