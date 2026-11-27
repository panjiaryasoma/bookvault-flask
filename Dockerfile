FROM node:22-bookworm-slim AS assets
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY scripts/vendor.mjs scripts/vendor.mjs
RUN npm run build
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=assets /build/static/vendor static/vendor
RUN useradd --create-home appuser && mkdir -p /app/instance && chown -R appuser:appuser /app/instance
USER appuser
CMD ["sh","-c","gunicorn --workers 2 --bind 0.0.0.0:${PORT:-8000} app:app"]
