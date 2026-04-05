try:
    from diffusers import StableDiffusionXLPipeline  # pyright: ignore[reportMissingImports]
except Exception:
    StableDiffusionXLPipeline = None

try:
    import torch  # pyright: ignore[reportMissingImports]
except Exception:
    torch = None

try:
    import cv2  # pyright: ignore[reportMissingImports]
except Exception:
    cv2 = None

pipe = None
if StableDiffusionXLPipeline is not None and torch is not None:
    try:
        pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=torch.float16,
        ).to("cuda")
    except Exception:
        pipe = None


def generate_bg(prompt):
    if pipe is None:
        raise RuntimeError("Background generation dependencies are unavailable.")

    image = pipe(prompt).images[0]
    path = "/tmp/bg.png"
    image.save(path)
    return path


def merge(person, bg, mask):
    if cv2 is None:
        raise RuntimeError("opencv-python is not installed.")

    fg = cv2.bitwise_and(person, person, mask=mask)
    inv = cv2.bitwise_not(mask)
    bg_part = cv2.bitwise_and(bg, bg, mask=inv)
    return cv2.add(fg, bg_part)
