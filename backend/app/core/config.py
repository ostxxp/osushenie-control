from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Osushenie Control"
    ENVIRONMENT: str = "local"

    SECRET_KEY: str = "change-this-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    
    POSTGRES_DB: str = "osushenie_control"
    POSTGRES_USER: str = "osushenie_app"
    POSTGRES_PASSWORD: str = "change_me"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = (
        "postgresql+asyncpg://osushenie_app:change_me"
        "@db:5432/osushenie_control"
    )
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()