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

ARG NDI_SDK_URL_X86_64="https://get.ndi.video/e/1092312/nstall-NDI-SDK-v6-Linux-tar-gz/lygzhz/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk"
ARG NDI_SDK_URL_AARCH64=""
ARG NDI_SDK_URL_WINDOWS="https://get.ndi.video/e/1092312/SDK-NDI-SDK-NDI20620SDK-exe/lygzhs/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk"
ARG NDI_SDK_URL_MACOS="https://get.ndi.video/e/1092312/c-Install-NDI-SDK-v6-Apple-pkg/lygzhw/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk"
ARG NDI_SDK_URL_ANDROID_LINUX="https://get.ndi.video/e/1092312/tall-NDI-SDK-v6-Android-tar-gz/lygzj3/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk"
ARG NDI_SDK_URL_ANDROID_WINDOWS="https://get.ndi.video/e/1092312/d-NDI20620SDK2028Android29-exe/lygzj6/2106549604/h/OX6QWjGgRma6HDuCWaNY2n5rngnuziie97-dmNA1Blk"

RUN set -eux; \
    if [ ! -f /opt/ndi/include/Processing.NDI.Lib.h ]; then \
      arch="$(uname -m)"; \
      case "${arch}" in \
        x86_64|amd64) sdk_url="${NDI_SDK_URL_X86_64}" ;; \
        aarch64|arm64) sdk_url="${NDI_SDK_URL_AARCH64}" ;; \
        *) echo "Unsupported architecture: ${arch}" >&2; exit 1 ;; \
      esac; \
      if [ -z "${sdk_url}" ]; then \
        echo "NDI SDK missing. Provide ndi-relay/ndi-sdk or set NDI_SDK_URL_X86_64/NDI_SDK_URL_AARCH64 to download." >&2; \
        exit 1; \
      fi; \
      echo "Downloading NDI SDK for ${arch}..." >&2; \
      curl -fL --retry 3 --retry-delay 1 "${sdk_url}" -o /tmp/ndi-sdk.tgz; \
      mkdir -p /tmp/ndi-sdk; \
      tar -xzf /tmp/ndi-sdk.tgz -C /tmp/ndi-sdk; \
      header_path="$(find /tmp/ndi-sdk -type f -name Processing.NDI.Lib.h -print -quit)"; \
      if [ -z "${header_path}" ]; then \
        echo "NDI SDK download missing Processing.NDI.Lib.h (unexpected layout)." >&2; \
        echo "Top-level extracted contents:" >&2; \
        ls -la /tmp/ndi-sdk >&2 || true; \
        exit 1; \
      fi; \
      sdk_root="$(dirname "$(dirname "${header_path}")")"; \
      rm -rf /opt/ndi; \
      mkdir -p /opt/ndi/include /opt/ndi/lib; \
      cp -r "${sdk_root}/include/." /opt/ndi/include/; \
      lib_dir=""; \
      if [ -d "${sdk_root}/lib" ]; then \
        lib_dir="${sdk_root}/lib"; \
      else \
        lib_file="$(find "${sdk_root}" -type f \( -name 'libndi*.so*' -o -name 'libndi*.a' \) -print -quit)"; \
        if [ -n "${lib_file}" ]; then \
          lib_dir="$(dirname "${lib_file}")"; \
        else \
          lib_dir="$(find "${sdk_root}" -maxdepth 5 -type d -name lib -print -quit)"; \
        fi; \
      fi; \
      if [ -z "${lib_dir}" ]; then \
        echo "NDI SDK found headers but no lib directory." >&2; \
        exit 1; \
      fi; \
      cp -r "${lib_dir}/." /opt/ndi/lib/; \
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
