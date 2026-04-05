import os
from pathlib import Path

from dotenv import dotenv_values

_BASE_DIR = Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _BASE_DIR.parent
_ORIGINAL_ENV_KEYS = set(os.environ)


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for key, value in dotenv_values(path).items():
        if value is None or key in _ORIGINAL_ENV_KEYS:
            continue
        os.environ[key] = value


for _env_file in (_PROJECT_ROOT / ".env", _BASE_DIR / ".env", _BASE_DIR / ".env.local"):
    _load_env_file(_env_file)


def _parse_csv(name: str, default: str = "") -> list[str]:
    raw = str(os.getenv(name, default) or "").strip()
    if not raw:
        return []
    if raw == "*":
        return ["*"]
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_path(name: str, default: Path) -> Path:
    raw = str(os.getenv(name, "") or "").strip()
    if not raw:
        return default
    return Path(raw).expanduser()


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./looksgood.db")
APP_ENV = str(os.getenv("APP_ENV", "development") or "development").strip().lower()
IS_PRODUCTION = APP_ENV in {"prod", "production"}
JWT_SECRET = os.getenv("JWT_SECRET", "looksgood-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8100")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_SUCCESS_URL = os.getenv("STRIPE_SUCCESS_URL", "")
STRIPE_CANCEL_URL = os.getenv("STRIPE_CANCEL_URL", "")
CORS_ORIGINS = _parse_csv("CORS_ORIGINS", "*")
CORS_ALLOW_CREDENTIALS = str(os.getenv("CORS_ALLOW_CREDENTIALS", "false")).strip().lower() in {"1", "true", "yes", "on"}
GENERATED_STORAGE_DIR = _parse_path("GENERATED_STORAGE_DIR", _BASE_DIR / "generated")
GENERATED_UPLOADS_DIR = GENERATED_STORAGE_DIR / "uploads"


def validate_runtime_config() -> None:
    if not IS_PRODUCTION:
        return

    if not JWT_SECRET or JWT_SECRET == "looksgood-secret" or len(JWT_SECRET) < 32:
        raise ValueError("JWT_SECRET must be set to a long random secret in production (>= 32 chars).")

    if CORS_ORIGINS == ["*"]:
        raise ValueError("CORS_ORIGINS must be set to your real domain(s) in production (not '*').")

    if PUBLIC_BASE_URL and not str(PUBLIC_BASE_URL).startswith("https://"):
        raise ValueError("PUBLIC_BASE_URL must be an https:// URL in production.")
