# Pulse — single-image build: the Mini App bundle is compiled first, then
# served by the FastAPI backend (backend/main.py mounts pulse-app/dist).

FROM node:20-slim AS web
WORKDIR /build
COPY pulse-app/package.json pulse-app/package-lock.json ./
RUN npm ci
COPY pulse-app/ ./
# Live mode: the app is served by the API on the same origin, so /api works.
RUN VITE_API_BASE_URL=/api npm run build

FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=web /build/dist ./pulse-app/dist

# SQLite lives on a volume so bookings survive container replacement.
ENV PULSE_DB_URL=sqlite:////data/pulse.db
VOLUME /data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
