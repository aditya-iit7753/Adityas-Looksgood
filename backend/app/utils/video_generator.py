from pathlib import Path
import math
import tempfile
import uuid
import wave

import ffmpeg

from app.utils.ffmpeg_setup import ensure_ffmpeg

ensure_ffmpeg()

SUPPORTED_SONG_KEYS = {"runway", "retro", "drift", "sunrise"}

_SONG_PROFILES = {
    "runway": {"tempo": 128, "root": 262, "alt": 392, "vibe": 0.95},
    "retro": {"tempo": 112, "root": 220, "alt": 330, "vibe": 0.72},
    "drift": {"tempo": 96, "root": 174, "alt": 261, "vibe": 0.58},
    "sunrise": {"tempo": 118, "root": 247, "alt": 370, "vibe": 0.82},
}


def create_short_video(image_path: str, output_path: str):
    (
        ffmpeg
        .input(image_path, loop=1, t=5)
        .filter("zoompan", z="zoom+0.001", d=125)
        .output(output_path, vcodec="libx264", pix_fmt="yuv420p")
        .run()
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, float(value)))


def _sanitize_song_key(song_key: str) -> str:
    key = str(song_key or "").strip().lower()
    if key not in SUPPORTED_SONG_KEYS:
        raise ValueError("Unsupported song_key")
    return key


def _synth_song_track(song_key: str, duration_seconds: float) -> Path:
    safe_key = _sanitize_song_key(song_key)
    profile = _SONG_PROFILES[safe_key]

    sample_rate = 44100
    duration = max(2.0, float(duration_seconds))
    total_samples = int(duration * sample_rate)
    beat_seconds = 60.0 / max(1.0, float(profile["tempo"]))
    beat_samples = max(1, int(beat_seconds * sample_rate))
    half_beat = max(1, beat_samples // 2)

    out_path = Path(tempfile.gettempdir()) / f"lsg-song-{safe_key}-{uuid.uuid4().hex}.wav"
    with wave.open(str(out_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        for i in range(total_samples):
            t = i / sample_rate
            step = (i // half_beat) % 8
            base_freq = float(profile["root"]) if step in {0, 1, 4, 5} else float(profile["alt"])
            mod = 1.0 + (0.015 * math.sin(2 * math.pi * 0.22 * t))
            tone = math.sin(2 * math.pi * base_freq * mod * t)
            harmonic = 0.34 * math.sin(2 * math.pi * (base_freq * 2.0) * t)

            pulse = (i % beat_samples) / beat_samples
            envelope = 0.3 + (0.7 * (1.0 - pulse))
            groove = 0.75 + (0.25 * math.sin(2 * math.pi * 0.12 * t))
            amplitude = float(profile["vibe"]) * envelope * groove
            sample = int(18000 * amplitude * (tone + harmonic))
            sample = max(-32767, min(32767, sample))
            wav_file.writeframesraw(int(sample).to_bytes(2, byteorder="little", signed=True))
    return out_path


def _probe_duration_seconds(video_path: str) -> float:
    try:
        data = ffmpeg.probe(video_path)
        raw_duration = data.get("format", {}).get("duration")
        return max(1.0, float(raw_duration))
    except Exception:
        return 12.0


def _video_has_audio(video_path: str) -> bool:
    try:
        data = ffmpeg.probe(video_path)
        streams = data.get("streams", [])
        return any(str(stream.get("codec_type", "")).lower() == "audio" for stream in streams)
    except Exception:
        return False


def mix_video_with_song(
    video_path: str,
    output_path: str,
    song_key: str,
    song_volume: float = 0.68,
    original_volume: float = 0.86,
) -> str:
    safe_key = _sanitize_song_key(song_key)
    clean_song_volume = _clamp(song_volume, 0.0, 2.0)
    clean_original_volume = _clamp(original_volume, 0.0, 2.0)
    duration = _probe_duration_seconds(video_path)
    song_track = _synth_song_track(safe_key, duration + 0.8)
    has_audio = _video_has_audio(video_path)

    try:
        video_input = ffmpeg.input(video_path)
        song_input = ffmpeg.input(str(song_track), stream_loop=-1)
        song_audio = song_input.audio.filter("volume", clean_song_volume)

        if has_audio:
            base_audio = video_input.audio.filter("volume", clean_original_volume)
            mixed_audio = ffmpeg.filter(
                [base_audio, song_audio],
                "amix",
                inputs=2,
                duration="first",
                dropout_transition=2,
            )
        else:
            mixed_audio = song_audio

        (
            ffmpeg
            .output(
                video_input.video,
                mixed_audio,
                output_path,
                vcodec="libx264",
                acodec="aac",
                pix_fmt="yuv420p",
                movflags="+faststart",
                shortest=None,
            )
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
        return output_path
    finally:
        try:
            song_track.unlink(missing_ok=True)
        except Exception:
            pass


def trim_video(
    video_path: str,
    output_path: str,
    start_seconds: float | None = None,
    end_seconds: float | None = None,
    max_duration: float | None = None,
) -> str:
    start = max(0.0, float(start_seconds or 0.0))
    duration = _probe_duration_seconds(video_path)
    end = None

    if end_seconds is not None:
        end = float(end_seconds)
    elif max_duration is not None:
        end = start + float(max_duration)

    if end is not None:
        end = max(0.0, min(end, duration))
        if end <= start:
            raise ValueError("Trim end must be after start.")
        clip_duration = max(0.1, end - start)
        stream = ffmpeg.input(video_path, ss=start, t=clip_duration)
    else:
        if start >= duration:
            raise ValueError("Trim start is beyond video length.")
        stream = ffmpeg.input(video_path, ss=start)

    (
        ffmpeg
        .output(
            stream,
            output_path,
            vcodec="libx264",
            acodec="aac",
            pix_fmt="yuv420p",
            movflags="+faststart",
        )
        .overwrite_output()
        .run(capture_stdout=True, capture_stderr=True)
    )
    return output_path
