FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY privacy.html /usr/share/nginx/html/privacy.html
COPY app.js /usr/share/nginx/html/app.js
COPY styles.css /usr/share/nginx/html/styles.css
COPY config.js /usr/share/nginx/html/config.js
COPY config.template.js /usr/share/nginx/html/config.template.js
COPY manifest.webmanifest /usr/share/nginx/html/manifest.webmanifest
COPY icon.svg /usr/share/nginx/html/icon.svg
COPY service-worker.js /usr/share/nginx/html/service-worker.js
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/40-generate-runtime-config.sh /docker-entrypoint.d/40-generate-runtime-config.sh

RUN sed -i 's/\r$//' /docker-entrypoint.d/40-generate-runtime-config.sh \
    && chmod +x /docker-entrypoint.d/40-generate-runtime-config.sh
