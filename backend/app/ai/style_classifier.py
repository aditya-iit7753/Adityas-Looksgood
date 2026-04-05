try:
    import clip  # pyright: ignore[reportMissingImports]
    import torch  # pyright: ignore[reportMissingImports]
    from PIL import Image  # pyright: ignore[reportMissingImports]
except Exception:
    clip = None
    torch = None
    Image = None

styles = [
    "casual outfit",
    "formal outfit",
    "streetwear",
    "sportswear",
    "traditional wear",
]

_model = None
_preprocess = None
if clip is not None:
    try:
        _model, _preprocess = clip.load("ViT-B/32")
    except Exception:
        _model, _preprocess = None, None


def classify_style(image_path: str) -> str:
    if _model is None or _preprocess is None or clip is None or torch is None or Image is None:
        return "casual outfit"

    try:
        image = _preprocess(Image.open(image_path)).unsqueeze(0)
        text = clip.tokenize(styles)

        with torch.no_grad():
            image_features = _model.encode_image(image)
            text_features = _model.encode_text(text)
            similarity = (image_features @ text_features.T).softmax(dim=-1)

        return styles[int(similarity.argmax())]
    except Exception:
        return "casual outfit"
