FROM node:14-alpine
RUN mkdir -p /ably-postgres-connector/ts-proj
WORKDIR /ably-postgres-connector/ts-proj

COPY ts-proj/package-lock.json ts-proj/package.json ts-proj/tsconfig.json ./
RUN npm install
RUN npm install -g typescript

COPY ts-proj/src src/
RUN npm run build

WORKDIR /ably-postgres-connector
COPY test-lib.js ./
COPY config config/
EXPOSE 3000
CMD ["node", "test-lib.js"]