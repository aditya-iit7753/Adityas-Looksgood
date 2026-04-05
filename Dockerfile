FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.prod.txt ./requirements.prod.txt
RUN pip install --no-cache-dir -r requirements.prod.txt

COPY backend/app ./app

RUN mkdir -p /app/generated

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8100}"]

