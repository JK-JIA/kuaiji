FROM docker.m.daocloud.io/library/node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
ENV PORT=3005
EXPOSE 3005
CMD ["node", "server.mjs"]
