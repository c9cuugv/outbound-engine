from pathlib import Path

import app.config as config
from app.config import Settings


def test_settings_env_file_uses_absolute_repo_root_path():
    env_file = Path(Settings.model_config["env_file"])

    assert env_file.is_absolute()
    assert env_file == Path(__file__).resolve().parents[2] / ".env"


def test_example_jwt_secret_placeholder_is_marked_insecure():
    assert "CHANGE_ME_generate_a_random_secret" in config._INSECURE_SECRETS
