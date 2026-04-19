from pathlib import Path
import time
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import DATABASE_URL


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg2" not in url.split("://", 1)[0]:
        return "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url

DATABASE_URL = _normalize_database_url(DATABASE_URL)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

if DATABASE_URL.startswith("sqlite"):
    url = make_url(DATABASE_URL)
    db_path = url.database
    if db_path and db_path not in {":memory:", ""}:
        Path(db_path).expanduser().parent.mkdir(parents=True, exist_ok=True)

if DATABASE_URL.startswith("sqlite") and ":memory:" in DATABASE_URL:
    # Keep a single shared in-memory database for the app lifetime.
    engine = create_engine(
        DATABASE_URL,
        connect_args={**connect_args, "uri": True},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_story_columns():
    inspector = inspect(engine)
    if "stories" not in inspector.get_table_names():
        return

    story_columns = {column["name"] for column in inspector.get_columns("stories")}

    with engine.begin() as conn:
        if "status_text" not in story_columns:
            conn.execute(text("ALTER TABLE stories ADD COLUMN status_text TEXT NOT NULL DEFAULT ''"))
        if "visibility" not in story_columns:
            conn.execute(text("ALTER TABLE stories ADD COLUMN visibility VARCHAR(32) NOT NULL DEFAULT 'public'"))

        # Backfill defensive defaults for databases created before these columns existed.
        conn.execute(text("UPDATE stories SET status_text = '' WHERE status_text IS NULL"))
        conn.execute(text("UPDATE stories SET visibility = 'public' WHERE visibility IS NULL OR visibility = ''"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_stories_visibility ON stories (visibility)"))


def _ensure_user_settings_columns():
    inspector = inspect(engine)
    if "user_settings" not in inspector.get_table_names():
        return

    settings_columns = {column["name"] for column in inspector.get_columns("user_settings")}

    # PostgreSQL requires boolean literals (true/false) instead of integer 0/1.
    bool_false = "0" if engine.dialect.name == "sqlite" else "false"
    bool_true = "1" if engine.dialect.name == "sqlite" else "true"

    with engine.begin() as conn:
        if "is_private_account" not in settings_columns:
            conn.execute(text(f"ALTER TABLE user_settings ADD COLUMN is_private_account BOOLEAN NOT NULL DEFAULT {bool_false}"))
        if "show_activity_status" not in settings_columns:
            conn.execute(text(f"ALTER TABLE user_settings ADD COLUMN show_activity_status BOOLEAN NOT NULL DEFAULT {bool_true}"))
        if "allow_message_requests" not in settings_columns:
            conn.execute(text(f"ALTER TABLE user_settings ADD COLUMN allow_message_requests BOOLEAN NOT NULL DEFAULT {bool_true}"))

        conn.execute(text(f"UPDATE user_settings SET is_private_account = {bool_false} WHERE is_private_account IS NULL"))
        conn.execute(text(f"UPDATE user_settings SET show_activity_status = {bool_true} WHERE show_activity_status IS NULL"))
        conn.execute(text(f"UPDATE user_settings SET allow_message_requests = {bool_true} WHERE allow_message_requests IS NULL"))


def _ensure_post_columns():
    inspector = inspect(engine)
    if "posts" not in inspector.get_table_names():
        return

    post_columns = {column["name"] for column in inspector.get_columns("posts")}

    with engine.begin() as conn:
        if "video_type" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN video_type VARCHAR(16) NOT NULL DEFAULT 'original'"))
        if "video_duration_seconds" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN video_duration_seconds INTEGER"))
        if "remix_post_id" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN remix_post_id INTEGER"))
        if "duet_post_id" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN duet_post_id INTEGER"))
        if "collab_handle" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN collab_handle VARCHAR(128)"))
        if "poll_question" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN poll_question TEXT"))
        if "poll_options" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN poll_options TEXT"))
        if "poll_votes" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN poll_votes TEXT"))
        if "poll_total_votes" not in post_columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN poll_total_votes INTEGER NOT NULL DEFAULT 0"))

        conn.execute(text("UPDATE posts SET video_type = 'original' WHERE video_type IS NULL OR video_type = ''"))
        conn.execute(text("UPDATE posts SET poll_total_votes = 0 WHERE poll_total_votes IS NULL"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_posts_remix_post_id ON posts (remix_post_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_posts_duet_post_id ON posts (duet_post_id)"))


def init_db():
    # Import models here so SQLAlchemy sees tables before create_all.
    from app import models  # noqa: F401

    attempts = 1 if DATABASE_URL.startswith("sqlite") else 8

    for attempt in range(1, attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            _ensure_post_columns()
            _ensure_story_columns()
            _ensure_user_settings_columns()
            return
        except Exception as exc:
            if attempt >= attempts:
                raise
            time.sleep(min(2 * attempt, 10))
