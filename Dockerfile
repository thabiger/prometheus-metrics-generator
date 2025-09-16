FROM python:3.11-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt update && apt install -y build-essential

ARG APP_DIR=/app
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_NO_MANAGED_PYTHON=1
ENV UV_PYTHON_DOWNLOADS=never

WORKDIR ${APP_DIR}

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

# Copy the project into the image
COPY . .

# Sync the project
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

## Final image
FROM python:3.11-slim

ARG APP_DIR=/app
WORKDIR ${APP_DIR}

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY --from=builder ${APP_DIR} ${APP_DIR}

ENTRYPOINT ["uv", "run", "/app/main.py"]

