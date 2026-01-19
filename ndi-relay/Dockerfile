# ---------------------------------------------
# Builder: FFmpeg + NDI
# ---------------------------------------------
FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates curl tar \
    yasm nasm autoconf automake libtool \
    libssl-dev libx264-dev \
 && rm -rf /var/lib/apt/lists/*

# Provide NDI SDK yourself (licensing)
# Expected:
#   ndi-sdk/include
#   ndi-sdk/lib
COPY ndi-sdk/ /opt/ndi/

ARG NDI_SDK_URL_X86_64="https://downloads.ndi.tv/SDK/NDI_SDK_Linux_x86_64.tar.gz"
ARG NDI_SDK_URL_AARCH64="https://downloads.ndi.tv/SDK/NDI_SDK_Linux_aarch64.tar.gz"

RUN if [ ! -f /opt/ndi/include/Processing.NDI.Lib.h ]; then \
      arch="$(uname -m)"; \
      case "${arch}" in \
        x86_64|amd64) sdk_url="${NDI_SDK_URL_X86_64}" ;; \
        aarch64|arm64) sdk_url="${NDI_SDK_URL_AARCH64}" ;; \
        *) echo "Unsupported architecture: ${arch}" >&2; exit 1 ;; \
      esac; \
      if [ -z "${sdk_url}" ]; then \
        echo "NDI SDK missing and no download URL configured for ${arch}." >&2; \
        exit 1; \
      fi; \
      echo "Downloading NDI SDK for ${arch}..." >&2; \
      curl -fsSL "${sdk_url}" -o /tmp/ndi-sdk.tgz; \
      mkdir -p /tmp/ndi-sdk; \
      tar -xzf /tmp/ndi-sdk.tgz -C /tmp/ndi-sdk; \
      sdk_root="$(find /tmp/ndi-sdk -type f -name Processing.NDI.Lib.h -print -quit | xargs -r dirname | xargs -r dirname)"; \
      if [ -z "${sdk_root}" ]; then \
        echo "NDI SDK download missing include/lib structure." >&2; \
        exit 1; \
      fi; \
      rm -rf /opt/ndi; \
      mkdir -p /opt/ndi; \
      cp -r "${sdk_root}/include" "${sdk_root}/lib" /opt/ndi/; \
      rm -rf /tmp/ndi-sdk /tmp/ndi-sdk.tgz; \
    fi

RUN git clone --depth 1 -b release/6.1 https://github.com/FFmpeg/FFmpeg.git /ffmpeg && \
    cd /ffmpeg && \
    ./configure \
      --prefix=/usr/local \
      --enable-gpl \
      --enable-nonfree \
      --enable-shared \
      --enable-libx264 \
      --enable-libndi_newtek \
      --extra-cflags="-I/opt/ndi/include" \
      --extra-ldflags="-L/opt/ndi/lib" \
      --extra-libs="-lpthread -lm" && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    rm -rf /ffmpeg

# ---------------------------------------------
# Runtime
# ---------------------------------------------
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/local/bin:$PATH"
ENV LD_LIBRARY_PATH="/opt/ndi/lib:/usr/local/lib"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates bash \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local /usr/local
COPY --from=builder /opt/ndi /opt/ndi
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
