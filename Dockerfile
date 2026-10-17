# WinMend: zero-dependency Node server on :8080. State lives only in /data.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY . .
RUN node scripts/check.js
EXPOSE 8080
CMD ["node", "server.js"]
