#!/bin/bash
env=""

for arg in "$@"; do
    case "$arg" in
    env=*) env="${arg#env=}" ;;
    *) ;;
    esac
done

if [[ -f ".env.$env" ]]; then
export $(grep -v '^#' .env.$env | xargs)
else
    echo "Error: .env.$env file not found. env=<local|prod>"
    exit 1
fi
ts-node script/validate-db-subgraph.ts