# syntax=docker/dockerfile:1
#
# The TaskMint server image. Build from the repository root:
#
#   docker build -f apps/server/Dockerfile .
#
# Dockerfile.dockerignore (next to this file) limits the build context to
# what the server build needs.

FROM rust:1.93-slim-trixie AS chef
RUN cargo install --locked cargo-chef --version 0.1.77
WORKDIR /src

# A recipe of the workspace's dependencies, so they're rebuilt only when a
# manifest or the lock file changes.
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /src/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    cargo chef cook --release --locked -p taskmint-server --recipe-path recipe.json
# The sources only: the test stage's scripts don't rebuild the server
COPY Cargo.toml Cargo.lock ./
COPY .cargo .cargo
COPY crates crates
COPY apps apps
# Queries are checked against the committed apps/server/.sqlx data.
ENV SQLX_OFFLINE=true
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    cargo build --release --locked -p taskmint-server \
    && cp target/release/taskmint-server /usr/local/bin/taskmint-server

# The server's gates (scripts/check-server.sh) in Linux, for the compose
# `server-tests` service (profile `test`) and CI. Not the runtime image: the
# tests run when the container does, against the compose database, and the
# build goes to the service's volumes.
FROM chef AS test
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    rustup component add llvm-tools-preview \
    && cargo install --locked cargo-llvm-cov --version 0.9.1 \
    && cargo install --locked sqlx-cli --version 0.8.6 \
       --no-default-features --features rustls,postgres
# For the coverage policy (the image already has the libstdc++ it needs)
COPY --from=node:24-trixie-slim /usr/local/bin/node /usr/local/bin/node
COPY . .
CMD ["scripts/check-server.sh"]

# glibc to match the build image; TLS is rustls, so no libssl.
FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=builder /usr/local/bin/taskmint-server /usr/local/bin/taskmint-server
ENV TASKMINT_BIND=0.0.0.0:3000
EXPOSE 3000
# No shell or curl in the image: the binary checks itself.
HEALTHCHECK --interval=10s --timeout=6s --start-period=5s --retries=3 \
    CMD ["taskmint-server", "healthcheck"]
ENTRYPOINT ["taskmint-server"]
CMD ["serve"]
