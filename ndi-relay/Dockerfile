# ---------------------------------------------
# Builder: FFmpeg + NDI
# ---------------------------------------------
FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates \
    yasm nasm autoconf automake libtool \
    libssl-dev libx264-dev \
 && rm -rf /var/lib/apt/lists/*

# Provide NDI SDK yourself (licensing)
# Expected:
#   ndi-sdk/include
#   ndi-sdk/lib
COPY ndi-sdk/ /opt/ndi/

RUN if [ ! -f /opt/ndi/include/Processing.NDI.Lib.h ]; then \
      echo "NDI SDK missing. Copy the SDK into ndi-relay/ndi-sdk before building." >&2; \
      exit 1; \
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
