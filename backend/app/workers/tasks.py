from app.workers.celery_app import celery_app


@celery_app.task
def add(x: int, y: int) -> int:
    """Test task to verify Celery is working."""
    return x + y
