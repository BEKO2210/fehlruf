FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 FEHLRUF_DB=/data/fehlruf.db
COPY server.mjs ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "server.mjs"]
