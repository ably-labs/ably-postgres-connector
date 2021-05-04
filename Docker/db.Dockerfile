FROM postgres:13
COPY init.sql /docker-entrypoint-initdb.d/