try:
    from ultralytics import YOLO  # pyright: ignore[reportMissingImports]
except Exception:
    YOLO = None

_model = None
if YOLO is not None:
    try:
        _model = YOLO("yolov8n.pt")
    except Exception:
        _model = None


def detect_person(image_path: str) -> bool:
    # Fallback to True when detector dependencies are unavailable.
    if _model is None:
        return True

    try:
        results = _model(image_path)
        for r in results:
            for box in r.boxes:
                if int(box.cls) == 0:  # person
                    return True
        return False
    except Exception:
        return True
