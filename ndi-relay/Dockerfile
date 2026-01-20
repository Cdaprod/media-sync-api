# ---------------------------------------------
# Builder: FFmpeg + NDI
# ---------------------------------------------
FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates curl tar \
    yasm nasm autoconf automake libtool file \
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
ARG FFMPEG_SOURCE_URL="https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/refs/tags/n5.1"
ARG FFMPEG_NDI_PATCH_URL="https://codeload.github.com/lplassman/FFMPEG-NDI/tar.gz/refs/heads/master"

RUN set -eux; \
    if [ ! -f /opt/ndi/include/Processing.NDI.Lib.h ]; then \
      arch="$(uname -m)"; \
      case "${arch}" in \
        x86_64|amd64) sdk_url="${NDI_SDK_URL_X86_64}" ; arch_pattern="x86-64" ;; \
        aarch64|arm64) sdk_url="${NDI_SDK_URL_AARCH64}" ; arch_pattern="aarch64" ;; \
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
        installer="$(find /tmp/ndi-sdk -maxdepth 2 -type f -name 'Install_NDI_SDK_*_Linux.sh' -print -quit)"; \
        if [ -z "${installer}" ]; then \
          echo "NDI SDK download missing Processing.NDI.Lib.h (unexpected layout)." >&2; \
          echo "Top-level extracted contents:" >&2; \
          ls -la /tmp/ndi-sdk >&2 || true; \
          exit 1; \
        fi; \
        chmod +x "${installer}"; \
        install_prefix="/tmp/ndi-install"; \
        rm -rf "${install_prefix}"; \
        mkdir -p "${install_prefix}"; \
        if "${installer}" --help 2>&1 | grep -qi -- '--prefix'; then \
          yes | "${installer}" --prefix="${install_prefix}" >/tmp/ndi-install.log 2>&1; \
        else \
          yes | (cd /tmp/ndi-sdk && "${installer}") >/tmp/ndi-install.log 2>&1 || true; \
        fi; \
        header_path="$(find "${install_prefix}" /tmp/ndi-sdk /usr/local /opt -type f -name Processing.NDI.Lib.h -print -quit || true)"; \
        if [ -z "${header_path}" ]; then \
          echo "NDI install ran but header not found. Installer log:" >&2; \
          tail -n 120 /tmp/ndi-install.log >&2 || true; \
          exit 1; \
        fi; \
      fi; \
      sdk_root="$(dirname "$(dirname "${header_path}")")"; \
      rm -rf /opt/ndi; \
      mkdir -p /opt/ndi/include /opt/ndi/lib; \
      cp -r "${sdk_root}/include/." /opt/ndi/include/; \
      lib_candidates="$(find "${sdk_root}" -type f \( -name 'libndi*.so*' -o -name 'libndi*.a' \) -print || true)"; \
      if [ -z "${lib_candidates}" ]; then \
        lib_candidates="$(find "$(dirname "${sdk_root}")" -type f \( -name 'libndi*.so*' -o -name 'libndi*.a' \) -print || true)"; \
      fi; \
      if [ -z "${lib_candidates}" ]; then \
        echo "NDI headers found but libs not found. Installer log:" >&2; \
        tail -n 120 /tmp/ndi-install.log >&2 || true; \
        exit 1; \
      fi; \
      old_ifs="${IFS}"; \
      IFS="$(printf '\n')"; \
      selected_lib_dir=""; \
      for lib_file in ${lib_candidates}; do \
        if [ -f "${lib_file}" ]; then \
          if echo "${lib_file}" | grep -q '\.a$'; then \
            selected_lib_dir="$(dirname "${lib_file}")"; \
            break; \
          fi; \
          if file -b "${lib_file}" | grep -qi "${arch_pattern}"; then \
            selected_lib_dir="$(dirname "${lib_file}")"; \
            break; \
          fi; \
        fi; \
      done; \
      IFS="${old_ifs}"; \
      if [ -z "${selected_lib_dir}" ]; then \
        echo "NDI libs found but none match architecture ${arch}." >&2; \
        IFS="$(printf '\n')"; \
        for lib_file in ${lib_candidates}; do \
          if [ -f "${lib_file}" ]; then \
            echo "${lib_file}: $(file -b "${lib_file}")" >&2; \
          fi; \
        done; \
        IFS="${old_ifs}"; \
        exit 1; \
      fi; \
      cp -r "${selected_lib_dir}/." /opt/ndi/lib/; \
      for lib_file in /opt/ndi/lib/libndi*.so*; do \
        if [ -e "${lib_file}" ]; then \
          if ! file -b "${lib_file}" | grep -qi "${arch_pattern}"; then \
            rm -f "${lib_file}"; \
          fi; \
        fi; \
      done; \
      rm -rf /tmp/ndi-sdk /tmp/ndi-sdk.tgz /tmp/ndi-install /tmp/ndi-install.log; \
    fi

RUN set -eux; \
    curl -fL --retry 3 --retry-delay 1 "${FFMPEG_SOURCE_URL}" -o /tmp/ffmpeg.tgz; \
    curl -fL --retry 3 --retry-delay 1 "${FFMPEG_NDI_PATCH_URL}" -o /tmp/ffmpeg-ndi.tgz; \
    mkdir -p /tmp/ffmpeg-src /tmp/ffmpeg-ndi; \
    tar -xzf /tmp/ffmpeg.tgz -C /tmp/ffmpeg-src; \
    tar -xzf /tmp/ffmpeg-ndi.tgz -C /tmp/ffmpeg-ndi; \
    ffmpeg_dir="$(find /tmp/ffmpeg-src -maxdepth 2 -type d -name 'FFmpeg-*' -print -quit)"; \
    ndi_dir="$(find /tmp/ffmpeg-ndi -maxdepth 2 -type d -name 'FFMPEG-NDI-*' -print -quit)"; \
    if [ -z "${ffmpeg_dir}" ] || [ -z "${ndi_dir}" ]; then \
      echo "FFmpeg source archive did not unpack as expected." >&2; \
      ls -la /tmp/ffmpeg-src >&2 || true; \
      ls -la /tmp/ffmpeg-ndi >&2 || true; \
      exit 1; \
    fi; \
    mv "${ffmpeg_dir}" /ffmpeg; \
    mv "${ndi_dir}" /tmp/ffmpeg-ndi-src; \
    rm -rf /tmp/ffmpeg-src /tmp/ffmpeg.tgz /tmp/ffmpeg-ndi /tmp/ffmpeg-ndi.tgz; \
    git init /ffmpeg; \
    git -C /ffmpeg apply /tmp/ffmpeg-ndi-src/libndi.patch; \
    cp /tmp/ffmpeg-ndi-src/libavdevice/libndi_newtek_* /ffmpeg/libavdevice/; \
    rm -rf /tmp/ffmpeg-ndi-src; \
    cd /ffmpeg && \
    ./configure --help | grep -i ndi || true && \
    ./configure \
      --prefix=/usr/local \
      --enable-gpl \
      --enable-nonfree \
      --enable-shared \
      --enable-libx264 \
      --disable-x86asm \
      --disable-asm \
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
