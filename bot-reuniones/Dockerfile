#docker build -t bot-transcriptor-plus .

FROM node:22-bullseye

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    ffmpeg \
    python3 \
    pkg-config \
    libopus-dev \
    libsodium-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ================= WHISPER =================
RUN git clone https://github.com/ggerganov/whisper.cpp.git /app/whisper.cpp && \
    cd /app/whisper.cpp && \
    make -j$(nproc)

# ================= MODELO =================
RUN mkdir -p /app/whisper.cpp/models && \
    wget -O /app/whisper.cpp/models/ggml-base.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# ================= APP =================
COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]