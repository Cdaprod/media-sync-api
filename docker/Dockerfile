# media-sync-api container image
# Build with: docker build -t media-sync-api .

FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY public ./public
COPY README.md ./README.md

EXPOSE 8787
CMD ["python", "-m", "app.main"]
