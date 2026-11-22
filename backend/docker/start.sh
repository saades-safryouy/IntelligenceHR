#!/bin/sh
# IntelligenceHR container entrypoint (modeled on the car_rental pattern).
set -e
cd /var/www/html

# Apache ships with several MPMs enabled; keep only prefork (mod_php).
a2dismod mpm_event mpm_worker 2>/dev/null || true
a2enmod mpm_prefork 2>/dev/null || true

php artisan storage:link || true

# Railway persistent volume mounts storage/app/public as root-owned;
# make it writable for Apache (www-data) so document uploads survive redeploys.
mkdir -p storage/app/public
chown -R www-data:www-data storage/app/public || true
chmod -R 775 storage/app/public || true
chown -R www-data:www-data storage bootstrap/cache || true
chmod -R 775 storage bootstrap/cache || true

php artisan migrate --force

exec apache2-foreground
