FROM --platform=linux/arm64 ubuntu@sha256:8c71efb5d8170edf0965b2ac5e867cc70d3d8f73d1c9c0573d690d6203fc5866
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils python3 python3-pip cmake make gcc g++ git pkg-config \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir meson==1.7.2 ninja==1.11.1.4 jinja2==3.1.6 markupsafe==3.0.2
RUN curl -fL https://codeload.github.com/emscripten-core/emsdk/tar.gz/refs/tags/4.0.14 -o /tmp/emsdk.tar.gz \
    && echo '24142f5506a99dab75b18ccecf2e3a23b4e243fa6fac1b6c20b2081bb4fbc8c5  /tmp/emsdk.tar.gz' | sha256sum -c - \
    && mkdir /emsdk && tar -xzf /tmp/emsdk.tar.gz -C /emsdk --strip-components=1 \
    && EMSDK_KEEP_DOWNLOADS=1 /emsdk/emsdk install 4.0.14 && /emsdk/emsdk activate 4.0.14
ENV WEBMPV_SDK=/emsdk WEBMPV_JOBS=3
WORKDIR /work
RUN apt-get update && apt-get install -y --no-install-recommends patch=2.7.6-7build2 && rm -rf /var/lib/apt/lists/*
COPY toolchain.lock.json /toolchain.lock.json
COPY scripts/verify-toolchain.py /verify-toolchain.py
RUN python3 /verify-toolchain.py /toolchain.lock.json
