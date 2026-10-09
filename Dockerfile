FROM node:24-alpine

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

ENV NODE_ENV=production PORT=80 DATA_DIR=/data
VOLUME /data
EXPOSE 80
CMD ["node", "server.js"]
