from celery import Celery
from celery.signals import worker_process_init
from app.config import settings
import app.models

celery_app = Celery(
    "outbound_engine",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.tasks",
        "app.workers.research_tasks",
        "app.workers.email_gen_tasks",
        "app.workers.reply_tasks",
        "app.workers.send_tasks",
    ],
)

@worker_process_init.connect
def reset_db_pool(**kwargs):
    from sqlalchemy.pool import NullPool
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    import app.database as db_module
    from app.config import settings
    db_module.engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
    db_module.async_session = async_sessionmaker(
        db_module.engine, class_=AsyncSession, expire_on_commit=False
    )


celery_app.conf.update(
 task_serializer="json",
 accept_content=["json"],
 result_serializer="json",
 timezone="UTC",
 enable_utc=True,
 broker_connection_retry=False,
 broker_connection_retry_on_startup=True,
 beat_schedule={},
 result_expires=3600,
 worker_max_memory_per_child=90000,
)
