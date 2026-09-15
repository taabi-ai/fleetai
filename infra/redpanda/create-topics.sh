#!/bin/sh
# infra/redpanda/create-topics.sh — idempotent topic creation for Redpanda.
# Usage: pnpm infra:topics  (docker compose exec redpanda ...)
set -eu

BROKERS="${BROKERS:-redpanda:29092}"

# Read topics from topics.yaml (simple YAML subset parser via grep/sed).
# Each `name:` line is a topic; `partitions:` and `retention_ms:` follow.
topic_count=0
current=""
partitions=3
retention=604800000

while IFS= read -r line; do
  case "$line" in
    '  - name:'*)
      # finalize previous
      if [ -n "$current" ]; then
        rpk topic create "$current" --brokers "$BROKERS" \
          --partitions "$partitions" \
          --config "retention.ms=$retention" \
          --if-not-exists || true
        topic_count=$((topic_count + 1))
      fi
      current=$(echo "$line" | sed 's/.*name: *//' | tr -d ' ')
      partitions=3
      retention=604800000
      ;;
    '    partitions:'*)
      partitions=$(echo "$line" | sed 's/.*partitions: *//' | tr -d ' ')
      ;;
    '    retention_ms:'*)
      retention=$(echo "$line" | sed 's/.*retention_ms: *//' | tr -d ' ')
      ;;
  esac
done < /scripts/topics.yaml

# finalize last topic
if [ -n "$current" ]; then
  rpk topic create "$current" --brokers "$BROKERS" \
    --partitions "$partitions" \
    --config "retention.ms=$retention" \
    --if-not-exists || true
  topic_count=$((topic_count + 1))
fi

# DLQ topics for every consumer group
for group in audit-store notification-consumers engineering-consumers dashboard-consumers fleet-metrics-consumers ai-consumers training-consumers media-consumers; do
  rpk topic create "${group}.dlq" --brokers "$BROKERS" --partitions 3 --if-not-exists || true
  topic_count=$((topic_count + 1))
done

echo "infra:topics — ensured $topic_count topics"
