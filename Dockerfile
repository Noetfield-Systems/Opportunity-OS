FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY action_engine.mjs ./
COPY public/ ./public/
RUN addgroup -S opportunity && adduser -S opportunity -G opportunity && chown -R opportunity:opportunity /app
USER opportunity
EXPOSE 8080
CMD ["node", "server.mjs"]
