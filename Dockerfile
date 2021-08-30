FROM node:14-alpine
RUN mkdir -p /ably-postgres-connector/lib
WORKDIR /ably-postgres-connector/lib

COPY lib/package-lock.json lib/package.json lib/tsconfig.json ./
RUN npm install
RUN npm install -g typescript

COPY lib/src src/
RUN npm run build

WORKDIR /ably-postgres-connector
COPY examples examples/
COPY config config/
EXPOSE 3000
CMD ["node", "examples/basic.js"]