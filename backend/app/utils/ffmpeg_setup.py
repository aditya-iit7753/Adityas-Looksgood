import errno
import os
import shutil
import tempfile
from pathlib import Path


def ensure_ffmpeg() -> str | None:
    try:
        import imageio_ffmpeg  # type: ignore[import-not-found]
    except Exception:
        return None

    try:
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None

    if not ffmpeg_exe or not os.path.exists(ffmpeg_exe):
        return None

    os.environ.setdefault("FFMPEG_BINARY", ffmpeg_exe)

    ffmpeg_path = Path(ffmpeg_exe)
    ffmpeg_dir = ffmpeg_path.parent
    shim_dir = Path(tempfile.gettempdir()) / "looksbook-ffmpeg"
    shim_dir.mkdir(parents=True, exist_ok=True)
    shim_exe = shim_dir / "ffmpeg.exe"
    if not shim_exe.exists() and ffmpeg_path.exists():
        try:
            shutil.copy2(ffmpeg_path, shim_exe)
        except OSError as exc:
            if exc.errno != errno.ENOSPC:
                raise

    current_path = os.environ.get("PATH", "")
    for candidate in (shim_dir, ffmpeg_dir):
        if candidate and str(candidate) not in current_path.split(os.pathsep):
            current_path = str(candidate) + os.pathsep + current_path
    os.environ["PATH"] = current_path

    ffprobe_exe = Path(ffmpeg_exe).with_name("ffprobe.exe")
    if ffprobe_exe.exists():
        os.environ.setdefault("FFPROBE_BINARY", str(ffprobe_exe))

    try:
        from pydub import AudioSegment  # type: ignore[import-not-found]
    except Exception:
        AudioSegment = None

    if AudioSegment is not None:
        AudioSegment.converter = ffmpeg_exe
        if ffprobe_exe.exists():
            AudioSegment.ffprobe = str(ffprobe_exe)

    return ffmpeg_exe
