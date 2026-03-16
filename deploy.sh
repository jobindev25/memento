#!/bin/bash

# Memento Automated Deployment Script for Google Cloud Run
# This script automates building the container and deploying it to GCP

set -e # Exit immediately if a command exits with a non-zero status.

PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="memento"
REGION="us-central1"

echo "===================================================="
echo "🚀 Starting Automated Deployment for Memento"
echo "Project ID: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo "===================================================="

echo "[1/3] Building and deploying securely to Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --quiet

echo "[2/3] Verifying deployment health..."
DEPLOY_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)')

echo "[3/3] Deployment Successful! ✅"
echo "Live URL: $DEPLOY_URL"
