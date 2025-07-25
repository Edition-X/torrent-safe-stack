# Use the official ClamAV base (Debian)
FROM mkodockx/docker-clamav:alpine

USER root

# inotify so we can react instantly
RUN apk add --no-cache inotify-tools

# Copy our watch-and-scan script
COPY scan-and-watch.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/scan-and-watch.sh

# The script starts freshclam, clamd, then inotify
CMD ["/usr/local/bin/scan-and-watch.sh"]
