# ECR Public mirrors Docker Hub when auth.docker.io times out (common on restricted networks)
FROM public.ecr.aws/docker/library/node:20-alpine

RUN apk add --no-cache \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev \
    python3 \
    make \
    g++ \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    && fc-cache -f

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY . .

RUN mkdir -p uploads reports charts logs

EXPOSE 4000

CMD ["sh", "-c", "node src/db/seed.js && node src/index.js"]
