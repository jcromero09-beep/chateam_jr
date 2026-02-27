FROM alpine:3.20
RUN apk add --no-cache curl tzdata
ENV TZ=America/Guayaquil
WORKDIR /app
COPY cronjobs.txt /app/cronjobs.txt

# Supercronic para cron jobs
ADD https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 /usr/local/bin/supercronic
RUN chmod +x /usr/local/bin/supercronic

CMD ["/usr/local/bin/supercronic", "/app/cronjobs.txt"]