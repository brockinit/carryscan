FROM python:3.11-slim

WORKDIR /app
COPY services/spy_lab /app/services/spy_lab
COPY services/trader_ai /app/services/trader_ai

RUN pip install --no-cache-dir -e /app/services/spy_lab -e /app/services/trader_ai

ENV PORT=8080
EXPOSE 8080
CMD ["uvicorn", "trader_ai.server:app", "--host", "0.0.0.0", "--port", "8080"]
