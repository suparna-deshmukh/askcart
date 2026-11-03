#!/bin/zsh
# Retries the extractor production deploy every 30 min until the Vercel
# free-plan daily deployment limit (api-deployments-free-per-day) resets.
# Verifies the live URL and logs to logs/vercel_watch.log.
cd ~/askcart/extractor/deploy
LOG=~/askcart/logs/vercel_watch.log
echo "$(date -u +%FT%TZ) vercel watcher started" >> $LOG
attempt=0
while true;
do
  attempt=$((attempt+1))
  out=$(vercel --prod --yes 2>&1)
  if echo "$out" | grep -q "Production  https://"; then
    url=$(echo "$out" | grep "Production  https://" | awk '{print $2}')
    echo "$(date -u +%FT%TZ) DEPLOY OK (attempt $attempt): $url" >> $LOG
    sleep 20
    code=$(curl -s -o /tmp/askcart_probe.json -w '%{http_code}' "$url/funnel" --max-time 30)
    echo "$(date -u +%FT%TZ) /funnel -> HTTP $code: $(head -c 200 /tmp/askcart_probe.json)" >> $LOG
    break
  fi
  echo "$(date -u +%FT%TZ) attempt $attempt failed:" >> $LOG
  echo "$out" | tail -6 >> $LOG
  [ $attempt -ge 48 ] && { echo "$(date -u +%FT%TZ) giving up after 48 attempts" >> $LOG; break; }
  sleep 1800
done
