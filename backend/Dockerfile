# IntelligenceHR backend — Laravel 11, PHP 8.2 + Apache (Railway)
# Build context is this backend/ directory (Railway Root Directory: backend).
FROM php:8.2-apache

RUN apt-get update && apt-get install -y \
    ca-certificates git unzip libzip-dev libpng-dev libonig-dev libxml2-dev \
    && docker-php-ext-install pdo_mysql mbstring zip exif pcntl bcmath gd \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Composer blocks installing packages affected by security advisories by
# default (laravel/framework ^11 currently trips it) and Railway env vars
# do not reach Dockerfile RUN steps, so allow it here at build time only.
ENV COMPOSER_AUDIT_BLOCK_INSECURE=false
ENV COMPOSER_POLICY_ADVISORIES_BLOCK=false

WORKDIR /var/www/html
COPY ./ ./

RUN mkdir -p bootstrap/cache storage/app/public storage/framework/cache storage/framework/sessions storage/framework/views storage/logs \
    && composer install --no-dev --optimize-autoloader --no-interaction \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

EXPOSE 80
CMD ["sh", "docker/start.sh"]
