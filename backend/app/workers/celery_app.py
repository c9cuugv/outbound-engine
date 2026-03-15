from celery import Celery
from app.config import settings

celery_app = Celery(
    "outbound_engine",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={},  # populated by later stories (reply detection, scheduler)
)

# Auto-discover tasks from all worker modules
celery_app.autodiscover_tasks(["app.workers"])
