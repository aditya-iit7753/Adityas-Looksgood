try:
    from segment_anything import sam_model_registry, SamPredictor  # pyright: ignore[reportMissingImports]
except Exception:
    sam_model_registry = None
    SamPredictor = None

try:
    import cv2  # pyright: ignore[reportMissingImports]
except Exception:
    cv2 = None

sam = None
predictor = None
if sam_model_registry is not None and SamPredictor is not None:
    try:
        sam = sam_model_registry["vit_b"](checkpoint="sam_vit_b.pth")
        predictor = SamPredictor(sam)
    except Exception:
        sam = None
        predictor = None


def segment(image_path):
    if cv2 is None or predictor is None:
        raise RuntimeError("Segmentation dependencies are unavailable.")

    image = cv2.imread(image_path)
    predictor.set_image(image)
    masks, _, _ = predictor.predict()
    return masks[0]
