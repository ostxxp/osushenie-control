from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Osushenie Control"
    ENVIRONMENT: str = "local"

    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()